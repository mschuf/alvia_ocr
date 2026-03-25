import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import { extname } from 'path';

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/webp',
  'application/pdf',
]);

const allowedExtensions = new Set([
  '.jpeg',
  '.jpg',
  '.png',
  '.gif',
  '.bmp',
  '.tiff',
  '.webp',
  '.pdf',
]);

const mimeToExtension: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

// Configuracion de Multer para manejo de archivos grandes
export const multerConfig: MulterOptions = {
  storage: diskStorage({
    destination: './temp',
    filename: (req, file, callback) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const originalExt = extname(file.originalname || '').toLowerCase();
      const fallbackExt = mimeToExtension[(file.mimetype || '').toLowerCase()] || '';
      const finalExt = originalExt || fallbackExt;

      callback(null, `${file.fieldname}-${uniqueSuffix}${finalExt}`);
    },
  }),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB en bytes
  },
  fileFilter: (req, file, callback) => {
    const normalizedExt = extname(file.originalname || '').toLowerCase();
    const normalizedMime = (file.mimetype || '').toLowerCase();

    const hasValidExtension = allowedExtensions.has(normalizedExt);
    const hasValidMimeType = allowedMimeTypes.has(normalizedMime);

    // Aceptar si al menos uno de los dos (mimetype o extension) es valido.
    // Esto evita rechazar blobs sin extension enviados desde el frontend.
    if (hasValidMimeType || hasValidExtension) {
      return callback(null, true);
    }

    return callback(
      new BadRequestException(
        'Solo se permiten archivos de imagen (jpeg, jpg, png, gif, bmp, tiff, webp) y PDF',
      ),
      false,
    );
  },
};

// Configuracion de limites del sistema
export const systemConfig = {
  maxFileSize: 50 * 1024 * 1024, // 50MB
  allowedFileTypes: Array.from(allowedMimeTypes),
  uploadDir: './temp',
  tempDir: './temp',
};
