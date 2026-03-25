import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import { extname } from 'path';

// Configuración de Multer para manejo de archivos grandes
export const multerConfig: MulterOptions = {
  storage: diskStorage({
    destination: './temp',
    filename: (req, file, callback) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = extname(file.originalname);
      callback(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
    },
  }),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB en bytes
  },
  fileFilter: (req, file, callback) => {
    // Validar tipos de archivo permitidos (incluyendo PDF)
    const allowedTypes = /jpeg|jpg|png|gif|bmp|tiff|webp|pdf/;
    const extnameMatch = allowedTypes.test(
      extname(file.originalname).toLowerCase(),
    );
    const mimetypeMatch = allowedTypes.test(file.mimetype);

    if (extnameMatch && mimetypeMatch) {
      return callback(null, true);
    }

    callback(
      new Error(
        'Solo se permiten archivos de imagen (jpeg, jpg, png, gif, bmp, tiff, webp) y PDF',
      ),
      false,
    );
  },
};

// Configuración de límites del sistema
export const systemConfig = {
  maxFileSize: 50 * 1024 * 1024, // 50MB
  allowedFileTypes: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/bmp',
    'image/tiff',
    'image/webp',
    'application/pdf',
  ],
  uploadDir: './temp',
  tempDir: './temp',
};
