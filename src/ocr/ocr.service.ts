import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { constants } from 'node:fs';
import * as fs from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { OcrResponseDto } from './dto/ocr-response.dto';
import { FileUtils } from './utils/file.utils';
import { GeminiCostLogUtils } from './utils/gemini-cost-log.utils';
import { LogUtils } from './utils/log.utils';

interface DaemonProcessRequest {
  documentValue: string;
  empresaId: number;
  prompt: string;
  useSlowModel?: boolean;
  documentId?: number;
}

interface ResolvedDocumentInput {
  mimeType: string;
  buffer: Buffer;
  source: 'data_uri' | 'url' | 'file_path' | 'base64_text';
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly genAI: GoogleGenerativeAI;

  // Se mantienen modelos internos del OCR, no del daemon.
  private readonly geminiModel = 'gemini-3-flash-preview';
  private readonly geminiSlowModel = 'gemini-2.5-flash';
  private readonly maxFileSizeBytes = 50 * 1024 * 1024;

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

  async processInvoiceFromDaemon(
    request: DaemonProcessRequest,
  ): Promise<Record<string, unknown>> {
    const { documentValue, empresaId, prompt, documentId } = request;
    const useSlowModel = request.useSlowModel ?? false;
    const startTime = Date.now();

    if (!Number.isInteger(empresaId) || empresaId <= 0) {
      throw new BadRequestException(
        'empresaId es obligatorio y debe ser entero mayor a 0',
      );
    }

    if (!prompt.trim()) {
      throw new BadRequestException(
        'prompt es obligatorio para process-daemon',
      );
    }

    const resolvedInput = await this.resolveDocumentInput(documentValue);
    this.validateBufferSize(resolvedInput.buffer.length);

    const modelToUse = useSlowModel ? this.geminiSlowModel : this.geminiModel;
    const contextLabel = `daemon:empresaId:${empresaId},documentId:${documentId ?? 'N/A'},source:${resolvedInput.source}`;

    this.logger.log(
      `Processing daemon OCR request with ${resolvedInput.source}, mime=${resolvedInput.mimeType}, bytes=${resolvedInput.buffer.length}`,
    );

    const text = await this.processWithGemini(
      prompt,
      resolvedInput.buffer,
      resolvedInput.mimeType,
      modelToUse,
      contextLabel,
    );

    const extractedData = this.parseGeminiResponse(text);
    extractedData.timestamp = new Date().toISOString();
    extractedData.empresaId = empresaId;

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    this.logger.log(`Daemon OCR processed in ${duration}s`);

    return extractedData;
  }

  async processInvoiceFromFile(
    filePath: string,
    empresaId?: number,
    useSlowModel = false,
    uploadedMimeType?: string,
  ): Promise<OcrResponseDto> {
    const startTime = Date.now();

    try {
      this.logger.log(`Processing invoice from file: ${filePath}`);

      if (!FileUtils.fileExists(filePath)) {
        throw new BadRequestException('El archivo no existe');
      }

      const fileSize = await FileUtils.getFileSize(filePath);
      this.logger.log(`File size: ${(fileSize / 1024).toFixed(2)} KB`);
      this.validateBufferSize(fileSize);

      const fileBuffer = await FileUtils.readFileAsBuffer(filePath);
      const mimeType = this.resolveMimeTypeFromUpload(
        filePath,
        uploadedMimeType,
      );
      const prompt = await this.generatePrompt(empresaId);
      const modelToUse = useSlowModel ? this.geminiSlowModel : this.geminiModel;

      const text = await this.processWithGemini(
        prompt,
        fileBuffer,
        mimeType,
        modelToUse,
        empresaId ? `file:empresaId:${empresaId}` : 'file:empresaId:N/A',
      );

      const extractedData = this.parseGeminiResponse(text);
      extractedData.timestamp = new Date().toISOString();

      await FileUtils.deleteFile(filePath);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.log(`Total processing time: ${duration}s`);

      return this.toOcrResponseDto(extractedData);
    } catch (error) {
      if (FileUtils.fileExists(filePath)) {
        await FileUtils.deleteFile(filePath);
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error processing file: ${errorMessage}`);
      throw error;
    }
  }

  async processInvoiceImage(imageBuffer: Buffer): Promise<OcrResponseDto> {
    const startTime = Date.now();

    try {
      this.logger.log('Processing invoice image');
      this.validateBufferSize(imageBuffer.length);

      const prompt = await this.generatePrompt();
      const text = await this.processWithGemini(
        prompt,
        imageBuffer,
        'image/jpeg',
        this.geminiModel,
        'image:empresaId:N/A',
      );

      const extractedData = this.parseGeminiResponse(text);
      extractedData.timestamp = new Date().toISOString();

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.log(`Total time: ${duration}s`);

      return this.toOcrResponseDto(extractedData);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error processing invoice image: ${errorMessage}`);
      throw new InternalServerErrorException(
        `Error processing invoice: ${errorMessage}`,
      );
    }
  }

  private parseGeminiResponse(text: string): Record<string, unknown> {
    let jsonString = text.trim();

    if (jsonString.startsWith('```json')) {
      jsonString = jsonString.substring(7, jsonString.length - 3);
    } else if (jsonString.startsWith('```')) {
      jsonString = jsonString.substring(3, jsonString.length - 3);
    }

    try {
      return JSON.parse(jsonString) as Record<string, unknown>;
    } catch (parseError) {
      this.logger.warn('Initial parse failed, attempting cleanup');

      const cleanedJson = this.cleanJsonResponse(jsonString);
      try {
        return JSON.parse(cleanedJson) as Record<string, unknown>;
      } catch {
        this.logger.error('Parse failed after cleaning', {
          sample: cleanedJson.substring(0, 200),
        });

        const message =
          parseError instanceof Error ? parseError.message : 'Parse error';
        throw new InternalServerErrorException(
          `Error parsing OCR response: ${message}`,
        );
      }
    }
  }

  private async processWithGemini(
    prompt: string,
    buffer?: Buffer,
    mimeType?: string,
    modelName?: string,
    contextLabel?: string,
  ): Promise<string> {
    try {
      const model = modelName || this.geminiModel;
      this.logger.log(`Processing with model: ${model}`);

      LogUtils.logModelRequest(prompt, contextLabel, {
        model,
        mimeType: mimeType ?? null,
        hasInlineData: Boolean(buffer && mimeType),
        inlineDataBytes: buffer?.length ?? 0,
      });

      const genModel = this.genAI.getGenerativeModel({
        model,
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 15000,
          topP: 0.1,
          topK: 1,
          responseMimeType: 'application/json',
        },
      });

      const content =
        buffer && mimeType
          ? [
              { text: prompt },
              {
                inlineData: {
                  mimeType,
                  data: buffer.toString('base64'),
                },
              },
            ]
          : prompt;

      const startTime = Date.now();
      const result = await genModel.generateContentStream(content);
      const response = await result.response;
      const elapsedMs = Date.now() - startTime;
      const duration = (elapsedMs / 1000).toFixed(2);

      fs.appendFileSync(
        './logs/processing_times.log',
        `${new Date().toISOString()} - ${model}: ${duration}s\n`,
      );

      LogUtils.logModelResponse(response, contextLabel);

      const usageCost = GeminiCostLogUtils.logUsageAndCost({
        model,
        usageMetadata: response.usageMetadata,
        contextLabel,
        durationMs: elapsedMs,
      });

      if (usageCost) {
        this.logger.log(
          `Gemini usage/cost - model=${model}, promptTokens=${usageCost.promptTokens}, outputTokens=${usageCost.outputTokens}, totalTokens=${usageCost.totalTokens}, estimatedUsd=${usageCost.estimatedCostUsd}, totalUsd=${usageCost.totalEstimatedCostUsd}`,
        );
      } else {
        this.logger.warn('No se pudo registrar usage/cost de Gemini.');
      }

      const text = response.text();
      this.logger.log(`Model processing: ${duration}s`);
      return text;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Model failed: ${errorMessage}`);
      throw new InternalServerErrorException(
        `Failed to process with model: ${errorMessage}`,
      );
    }
  }

  private async fetchCustomPrompt(empresaId: number): Promise<string | null> {
    try {
      this.logger.log(`Fetching custom prompt for empresaId: ${empresaId}`);
      const baseUrl = process.env.API_BASE_URL || 'http://localhost:3003';

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(
        `${baseUrl}/prompts/active-by-empresa/${empresaId}`,
        { signal: controller.signal },
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.warn(`Custom prompt fetch failed: ${response.status}`);
        return null;
      }

      const data = (await response.json()) as Record<string, unknown>;
      return typeof data.prompt === 'string' ? data.prompt : null;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error fetching custom prompt: ${errorMessage}`);
      return null;
    }
  }

  private async generatePrompt(empresaId?: number): Promise<string> {
    let customPrompt: string | null = null;
    if (empresaId) {
      customPrompt = await this.fetchCustomPrompt(empresaId);
    }

    const basePrompt = `Analiza esta factura paraguaya y extrae datos en JSON valido.

CAMPOS REQUERIDOS:
- invoiceNumber
- establecimiento
- punto_emision
- supplierRuc
- supplierName
- CardCode
- CardName
- DocDate
- DocDueDate
- DocCurrency
- DocTotal
- TaxDate
- U_TIMB
- U_TimbradoStart
- U_TimbradoEnd
- U_TipoFactura
- PaymentGroupCode
- DocumentLines

RESPONDE SOLO JSON VALIDO.`;

    return customPrompt || basePrompt;
  }

  private cleanJsonResponse(jsonString: string): string {
    let cleaned = jsonString.substring(jsonString.indexOf('{'));
    const lastBraceIndex = cleaned.lastIndexOf('}');
    if (lastBraceIndex !== -1) {
      cleaned = cleaned.substring(0, lastBraceIndex + 1);
    }
    return cleaned;
  }

  private resolveMimeTypeFromUpload(
    filePath: string,
    uploadedMimeType?: string,
  ): string {
    const ext = path.extname(filePath).toLowerCase();
    const normalizedMimeType = (uploadedMimeType || '').toLowerCase();

    if (normalizedMimeType === 'application/pdf' || ext === '.pdf') {
      return 'application/pdf';
    }
    if (normalizedMimeType.startsWith('image/')) {
      return normalizedMimeType;
    }
    return 'image/jpeg';
  }

  private async resolveDocumentInput(
    documentValue: string,
  ): Promise<ResolvedDocumentInput> {
    const trimmed = documentValue.trim();
    if (!trimmed) {
      throw new BadRequestException('documento vacio');
    }

    const dataUriMatch = trimmed.match(/^data:([^;]+);base64,(.+)$/s);
    if (dataUriMatch) {
      const [, mimeType, data] = dataUriMatch;
      return {
        mimeType,
        buffer: Buffer.from(this.sanitizeBase64(data), 'base64'),
        source: 'data_uri',
      };
    }

    if (/^https?:\/\//i.test(trimmed)) {
      const response = await fetch(trimmed);
      if (!response.ok) {
        throw new BadRequestException(
          `No se pudo descargar documento URL (${response.status})`,
        );
      }

      const mimeType = (
        response.headers.get('content-type') ?? 'application/pdf'
      )
        .split(';')[0]
        .trim();

      return {
        mimeType,
        buffer: Buffer.from(await response.arrayBuffer()),
        source: 'url',
      };
    }

    if (await this.pathExists(trimmed)) {
      const buffer = await readFile(trimmed);
      return {
        mimeType: this.guessMimeTypeFromPath(trimmed),
        buffer,
        source: 'file_path',
      };
    }

    if (this.looksLikeBase64(trimmed)) {
      return {
        mimeType: 'application/pdf',
        buffer: Buffer.from(this.sanitizeBase64(trimmed), 'base64'),
        source: 'base64_text',
      };
    }

    throw new BadRequestException('Formato de documento no soportado');
  }

  private validateBufferSize(size: number): void {
    if (size > this.maxFileSizeBytes) {
      throw new BadRequestException(
        'El archivo es demasiado grande. El tamaño máximo permitido es 50MB.',
      );
    }
  }

  private async pathExists(pathValue: string): Promise<boolean> {
    try {
      await access(pathValue, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private sanitizeBase64(value: string): string {
    return value.replace(/\s/g, '');
  }

  private looksLikeBase64(value: string): boolean {
    if (value.length < 32) {
      return false;
    }
    return /^[A-Za-z0-9+/=\s]+$/.test(value);
  }

  private guessMimeTypeFromPath(pathValue: string): string {
    const extension = path.extname(pathValue).toLowerCase();
    if (extension === '.pdf') {
      return 'application/pdf';
    }
    if (extension === '.png') {
      return 'image/png';
    }
    if (extension === '.jpg' || extension === '.jpeg') {
      return 'image/jpeg';
    }
    return 'application/octet-stream';
  }

  private toOcrResponseDto(data: Record<string, unknown>): OcrResponseDto {
    const timestamp =
      typeof data.timestamp === 'string'
        ? data.timestamp
        : new Date().toISOString();

    return {
      ...(data as unknown as OcrResponseDto),
      timestamp,
    };
  }
}
