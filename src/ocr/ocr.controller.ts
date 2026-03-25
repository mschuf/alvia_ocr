import {
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

@ApiTags('OCR')
@Controller('ocr')
export class OcrController {
  private readonly logger = new Logger(OcrController.name);

  constructor(private readonly ocrService: OcrService) {}

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
    name: 'dbName',
    required: false,
    type: 'string',
    description: 'Nombre de la base de datos para obtener prompt personalizado',
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
      this.logger.log(
        `Delegating processing to OCR service for file: ${file.path}`,
      );
      // Delegar el procesamiento al servicio
      const result = await this.ocrService.processInvoiceFromFile(
        file.path,
        dbName,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Error processing invoice: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
