import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Query,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OcrService } from './ocr.service';
import { OcrResponseDto } from './dto/ocr-response.dto';
import type { Express } from 'express';
import { multerConfig } from './ocr.config';
import { FileStreamInterceptor } from './interceptors/file-stream.interceptor';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { ProcessDaemonOcrDto } from './dto/process-daemon-ocr.dto';

@ApiTags('OCR')
@Controller('ocr')
export class OcrController {
  private readonly logger = new Logger(OcrController.name);

  constructor(private readonly ocrService: OcrService) {}

  @Post('process-daemon')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Procesar OCR para daemon (JSON)',
    description:
      'Endpoint para alvia_daemon. Requiere empresaId, prompt y documento original.',
  })
  @ApiBody({
    type: ProcessDaemonOcrDto,
  })
  @ApiResponse({
    status: 200,
    description: 'OCR procesado exitosamente para daemon.',
  })
  async processForDaemon(
    @Body() body: ProcessDaemonOcrDto,
  ): Promise<Record<string, unknown>> {
    this.logger.log(
      `Processing daemon OCR request. empresaId=${body.empresaId}, documentId=${body.documentId ?? 'N/A'}`,
    );

    return this.ocrService.processInvoiceFromDaemon({
      documentValue: body.documento,
      empresaId: body.empresaId,
      prompt: body.prompt,
      useSlowModel: body.useSlowModel ?? false,
      documentId: body.documentId,
    });
  }

  // Endpoint unificado que acepta archivos en ambos campos "file" o "image"
  @Post('process')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileStreamInterceptor, FileInterceptor('file', multerConfig))
  @ApiOperation({ summary: 'Procesar factura desde archivo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo de factura (imagen o PDF)',
        },
      },
    },
  })
  @ApiQuery({
    name: 'empresaId',
    required: false,
    type: 'string',
    description: 'ID de empresa para obtener prompt activo personalizado',
  })
  @ApiQuery({
    name: 'dbName',
    required: false,
    type: 'string',
    description:
      'Parametro legado. Si llega, se interpreta como empresaId para compatibilidad',
  })
  @ApiResponse({
    status: 200,
    description: 'Factura procesada exitosamente',
    type: OcrResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Archivo no proporcionado o tipo inválido',
  })
  async processInvoice(
    @UploadedFile() file: Express.Multer.File,
    @Query('empresaId') empresaId?: string,
    @Query('dbName') dbName?: string,
  ): Promise<OcrResponseDto> {
    this.logger.log('Processing invoice');
    this.logger.log(
      `Received file: ${file?.originalname} (${file?.size} bytes)`,
    );

    if (!file) {
      this.logger.warn('No file uploaded in "file" field');
      // Si no se encontró en 'file', intentar con 'image'
      // Nota: NestJS solo procesa un campo a la vez con FileInterceptor
      throw new BadRequestException(
        'No file uploaded. Please provide a file in "file" field.',
      );
    }

    try {
      const empresaIdParam = empresaId ?? dbName;
      let resolvedEmpresaId: number | undefined;

      if (empresaIdParam !== undefined) {
        const parsedEmpresaId = Number(empresaIdParam);
        if (
          !Number.isFinite(parsedEmpresaId) ||
          parsedEmpresaId <= 0 ||
          !Number.isInteger(parsedEmpresaId)
        ) {
          throw new BadRequestException(
            'empresaId debe ser un numero entero mayor a 0',
          );
        }
        resolvedEmpresaId = parsedEmpresaId;
      }

      this.logger.log(
        `Delegating processing to OCR service for file: ${file.path}`,
      );
      // Delegar el procesamiento al servicio
      const result = await this.ocrService.processInvoiceFromFile(
        file.path,
        resolvedEmpresaId,
        false,
        file.mimetype,
      );
      return result;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Error processing invoice: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }
}
