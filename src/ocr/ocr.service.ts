import {
  Injectable,
  InternalServerErrorException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { OcrResponseDto } from './dto/ocr-response.dto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { FileUtils } from './utils/file.utils';
import { LogUtils } from './utils/log.utils';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private genAI: GoogleGenerativeAI;

  // OPTIMIZACIÓN 1: Usar modelo más rápido por defecto
  private readonly geminiModel: string = 'gemini-3-flash-preview'; // Mucho más rápido
  //private readonly geminiModel: string = 'gemini-3-pro-preview'; // Mucho más rápido
  private readonly geminiSlowModel: string = 'gemini-2.5-flash'; // Para casos complejos

  constructor() {
    try {
      const apiKey = process.env.GEMINI3_FLASH_API_KEY || '';
      if (!apiKey) {
        throw new Error('GEMINI3_FLASH_API_KEY not configured');
      }

      this.genAI = new GoogleGenerativeAI(apiKey);

      FileUtils.createDirectoryIfNotExists('./temp');
      FileUtils.createDirectoryIfNotExists('./logs');

      this.logger.log('OCR Service initialized successfully');
      this.logger.log(`Fast Model: ${this.geminiModel}`);
      this.logger.log(`Slow Model: ${this.geminiSlowModel}`);
    } catch (error) {
      this.logger.error('Failed to initialize Google clients', error);
      throw new InternalServerErrorException(
        'Failed to initialize OCR service',
      );
    }
  }

  async processInvoiceFromFile(
    filePath: string,
    empresaId?: number,
    useSlowModel = false, // Permite elegir modelo lento si es necesario
  ): Promise<OcrResponseDto> {
    const startTime = Date.now();

    try {
      this.logger.log(`Processing invoice from file: ${filePath}`);

      if (!FileUtils.fileExists(filePath)) {
        throw new BadRequestException('El archivo no existe');
      }

      const fileSize = await FileUtils.getFileSize(filePath);
      this.logger.log(`File size: ${(fileSize / 1024).toFixed(2)} KB`);

      if (fileSize > 50 * 1024 * 1024) {
        throw new BadRequestException(
          'El archivo es demasiado grande. El tamaño máximo permitido es 50MB.',
        );
      }

      let fileBuffer = await FileUtils.readFileAsBuffer(filePath);
      const ext = path.extname(filePath).toLowerCase();
      let mimeType: string;

      if (ext === '.pdf') {
        mimeType = 'application/pdf';
        this.logger.log('Processing PDF file');
      } else {
        mimeType = 'image/jpeg';
        this.logger.log('Processing image file');
      }

      // OPTIMIZACIÓN 3: Obtener prompt
      const prompt = await this.generatePrompt(empresaId);

      this.logger.log(`Generated prompt 1: ${prompt}`);

      // OPTIMIZACIÓN 4: Usar modelo apropiado
      const modelToUse = useSlowModel ? this.geminiSlowModel : this.geminiModel;
      const text = await this.processWithGemini(
        prompt,
        fileBuffer,
        mimeType,
        modelToUse,
        empresaId ? `empresaId:${empresaId}` : undefined,
      );

      const extractedData = this.parseGeminiResponse(text);

      this.logger.log('Extracted data:', extractedData);

      extractedData.timestamp = new Date().toISOString();

      await FileUtils.deleteFile(filePath);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.log(`✅ Total processing time: ${duration}s`);

      return extractedData;
    } catch (error) {
      if (FileUtils.fileExists(filePath)) {
        await FileUtils.deleteFile(filePath);
      }

      this.logger.error(`Error processing file: ${error.message}`);
      throw error;
    }
  }

  /**
   * OPTIMIZACIÓN 5: Parse optimizado con manejo robusto
   */
  private parseGeminiResponse(text: string): OcrResponseDto {
    let jsonString = text.trim();

    // Limpieza rápida de markdown
    if (jsonString.startsWith('```json')) {
      jsonString = jsonString.substring(7, jsonString.length - 3);
    } else if (jsonString.startsWith('```')) {
      jsonString = jsonString.substring(3, jsonString.length - 3);
    }

    try {
      return JSON.parse(jsonString);
    } catch (parseError) {
      this.logger.warn('Initial parse failed, attempting cleanup');

      // Limpieza profunda solo si falla el parse inicial
      const cleanedJson = this.cleanJsonResponse(jsonString);
      try {
        return JSON.parse(cleanedJson);
      } catch (cleanedParseError) {
        this.logger.error('Parse failed after cleaning:', {
          sample: cleanedJson.substring(0, 200),
        });
        throw new InternalServerErrorException(
          'Error parsing OCR response: ' + parseError.message,
        );
      }
    }
  }

  /**
   * OPTIMIZACIÓN 7: Configuración de generación optimizada
   */
  private async processWithGemini(
    prompt: string,
    buffer?: Buffer,
    mimeType?: string,
    modelName?: string,
    contextLabel?: string,
  ): Promise<any> {
    try {
      const model = modelName || this.geminiModel;
      this.logger.log(`Processing with model: ${model}`);

      const genModel = this.genAI.getGenerativeModel({
        model,
        generationConfig: {
          temperature: 0, // Ligeramente más alto para mejor fluidez
          maxOutputTokens: 15000, // Limitar tokens para respuestas más rápidas
          topP: 0.1,
          topK: 1,
          responseMimeType: 'application/json', // Forzar respuesta JSON directa
        },
      });

      let content: any;
      if (buffer && mimeType) {
        content = [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: buffer.toString('base64'),
            },
          },
        ];
      } else {
        content = prompt;
      }

      const startTime = Date.now();

      // OPTIMIZACIÓN 8: Usar generateContentStream para obtener resultados más rápido
      const result = await genModel.generateContentStream(content);
      //const result = await genModel.generateContent(content);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      fs.appendFileSync(
        './logs/processing_times.log',
        `${new Date().toISOString()} - ${model}: ${duration}s\n`,
      );

      const response = await result.response;

      // Log del model response en archivo mensual con contexto
      LogUtils.logModelResponse(response, contextLabel);

      this.logger.log(`Model response received ${JSON.stringify(response)}`);

      const text = response.text();

      this.logger.log(`✅ Model processing: ${duration}s`);
      return text;
    } catch (error) {
      this.logger.error(`Model failed: ${error.message}`);
      throw new InternalServerErrorException(
        `Failed to process with model: ${error.message}`,
      );
    }
  }

  /**
   * Obtiene prompt personalizado con timeout
   */
  private async fetchCustomPrompt(empresaId: number): Promise<string | null> {
    try {
      this.logger.log(`Fetching custom prompt for empresaId: ${empresaId}`);
      const baseUrl = process.env.API_BASE_URL || 'http://localhost:3003';

      // OPTIMIZACIÓN 9: Agregar timeout al fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

      const response = await fetch(
        `${baseUrl}/prompts/active-by-empresa/${empresaId}`,
        { signal: controller.signal },
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.warn(`Custom prompt fetch failed: ${response.status}`);
        return null;
      }

      const data = await response.json();
      return data.prompt || null;
    } catch (error) {
      this.logger.error(`Error fetching custom prompt: ${error.message}`);
      return null;
    }
  }

  private async generatePrompt(empresaId?: number): Promise<string> {
    // Intentar obtener prompt personalizado solo si se especifica empresaId
    let customPrompt: string | null = null;
    if (empresaId) {
      customPrompt = await this.fetchCustomPrompt(empresaId);
    }

    // OPTIMIZACIÓN 10: Prompt más conciso y directo
    const basePrompt = `Analiza esta factura paraguaya y extrae datos en JSON válido.

      CAMPOS REQUERIDOS:
      - invoiceNumber: Número completo de factura (XXX-XXX-XXXXXXX)
      - establecimiento: Primer segmento del número de factura (3 dígitos)
      - punto_emision: Segundo segmento del número de factura (3 dígitos)
      - supplierRuc: RUC del proveedor
      - supplierName: Nombre del proveedor
      - CardCode: RUC del cliente
      - CardName: Nombre del cliente
      - DocDate: Fecha del documento (DD/MM/YYYY)
      - DocDueDate: Fecha de vencimiento (DD/MM/YYYY)
      - DocCurrency: Moneda (PYG/USD)
      - DocTotal: Total del documento
      - TaxDate: Fecha de impuesto
      - U_TIMB: Número de timbrado
      - U_TimbradoStart: Fecha inicio timbrado
      - U_TimbradoEnd: Fecha fin timbrado
      - U_TipoFactura: Tipo de factura
      - PaymentGroupCode: Código de grupo de pago
      - DocumentLines: Array de líneas del documento

      REGLAS CRÍTICAS:
      1. RUC: NNNNNNN-N (7-8 dígitos + guión + verificador)
      2. TipoFactura: "1"=estándar, "2"=virtual, "3"=electrónica
      3. IVA Paraguay: 10%, 5%, o exento
      4. supplierRuc ≠ CardCode
      5. DocTotal = Subtotal + IVA
      6. Montos PYG sin decimales

      RESPONDE SOLO JSON:`;

    return customPrompt || basePrompt;
  }

  async processInvoiceImage(imageBuffer: Buffer): Promise<OcrResponseDto> {
    const startTime = Date.now();

    try {
      this.logger.log('Processing invoice image');

      if (imageBuffer.length > 50 * 1024 * 1024) {
        throw new BadRequestException(
          'El archivo es demasiado grande. Max: 50MB',
        );
      }

      const prompt = await this.generatePrompt();

      this.logger.log(`Generated prompt 2: ${prompt}`);

      const text = await this.processWithGemini(
        prompt,
        imageBuffer,
        'image/jpeg',
      );

      const extractedData = this.parseGeminiResponse(text);
      extractedData.timestamp = new Date().toISOString();

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.log(`✅ Total time: ${duration}s`);

      return extractedData;
    } catch (error) {
      this.logger.error('Error processing invoice:', error);
      throw new InternalServerErrorException(
        'Error processing invoice: ' + (error.message || 'Unknown'),
      );
    }
  }

  // Mantener métodos de limpieza originales...
  private cleanJsonResponse(jsonString: string): string {
    // Tu implementación original aquí
    let cleaned = jsonString.substring(jsonString.indexOf('{'));
    const lastBraceIndex = cleaned.lastIndexOf('}');
    if (lastBraceIndex !== -1) {
      cleaned = cleaned.substring(0, lastBraceIndex + 1);
    }
    return cleaned;
  }
}
