import * as sharp from 'sharp';
import { Logger } from '@nestjs/common';

export class ImageOptimizer {
  private static readonly logger = new Logger(ImageOptimizer.name);

  // Configuración optimizada para OCR
  private static readonly MAX_WIDTH = 1920;
  private static readonly MAX_HEIGHT = 1920;
  private static readonly JPEG_QUALITY = 85;
  private static readonly TARGET_DPI = 150; // Suficiente para OCR

  /**
   * Optimiza una imagen para procesamiento OCR más rápido
   * @param buffer Buffer de la imagen original
   * @param mimeType Tipo MIME del archivo
   * @returns Buffer optimizado y mimeType
   */
  static async optimizeForOcr(
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    try {
      // Si es PDF, no optimizar (Gemini lo maneja directamente)
      if (mimeType === 'application/pdf') {
        return { buffer, mimeType };
      }

      const originalSize = buffer.length;
      this.logger.log(
        `Original image size: ${(originalSize / 1024).toFixed(2)} KB`,
      );

      // Procesar imagen con sharp
      const image = sharp(buffer);
      const metadata = await image.metadata();

      // Validar que los metadatos estén disponibles
      if (!metadata.width || !metadata.height) {
        this.logger.warn(
          'Could not read image metadata, skipping optimization',
        );
        return { buffer, mimeType };
      }

      this.logger.log(
        `Original dimensions: ${metadata.width}x${metadata.height}, format: ${metadata.format}`,
      );

      let optimized = image;

      // Redimensionar si es necesario
      if (
        metadata.width > this.MAX_WIDTH ||
        metadata.height > this.MAX_HEIGHT
      ) {
        optimized = optimized.resize(this.MAX_WIDTH, this.MAX_HEIGHT, {
          fit: 'inside',
          withoutEnlargement: true,
        });
        this.logger.log('Image resized for optimization');
      }

      // Convertir a JPEG optimizado (mejor compresión que PNG para OCR)
      const optimizedBuffer = await optimized
        .jpeg({
          quality: this.JPEG_QUALITY,
          mozjpeg: true, // Mejor compresión
        })
        .toBuffer();

      const optimizedSize = optimizedBuffer.length;
      const reduction = ((1 - optimizedSize / originalSize) * 100).toFixed(2);

      this.logger.log(
        `Optimized size: ${(optimizedSize / 1024).toFixed(2)} KB (${reduction}% reduction)`,
      );

      return {
        buffer: optimizedBuffer,
        mimeType: 'image/jpeg',
      };
    } catch (error) {
      this.logger.error('Error optimizing image:', error.message);
      // Si falla la optimización, devolver original
      return { buffer, mimeType };
    }
  }

  /**
   * Optimiza múltiples páginas de un PDF para OCR
   * @param pdfBuffer Buffer del PDF
   * @returns Buffer del PDF optimizado
   */
  static async optimizePdfForOcr(pdfBuffer: Buffer): Promise<Buffer> {
    try {
      // Para PDFs, podrías usar pdf-lib para reducir calidad de imágenes
      // Por ahora, retornamos el original
      // TODO: Implementar optimización de PDF si es necesario
      return pdfBuffer;
    } catch (error) {
      this.logger.error('Error optimizing PDF:', error.message);
      return pdfBuffer;
    }
  }
}
