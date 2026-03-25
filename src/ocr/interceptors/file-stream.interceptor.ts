import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FileStreamInterceptor implements NestInterceptor {
  private readonly uploadDir: string;
  private readonly maxFileSize: number;

  constructor() {
    this.uploadDir = path.join(process.cwd(), 'temp');
    this.maxFileSize = 50 * 1024 * 1024; // 50MB

    // Crear directorio si no existe
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();

    // Verificar si es una solicitud multipart
    if (!request.headers['content-type']?.includes('multipart/form-data')) {
      return next.handle();
    }

    // Monitorear el tamaño del archivo durante la carga
    let fileSize = 0;

    // Interceptamos el stream para monitorear el tamaño
    if (request.pipe) {
      const originalPipe = request.pipe;
      request.pipe = function (...args) {
        const stream = originalPipe.apply(this, args);

        stream.on('data', (chunk) => {
          fileSize += chunk.length;
          if (fileSize > 50 * 1024 * 1024) {
            // 50MB
            stream.destroy(
              new BadRequestException(
                'El archivo excede el tamaño máximo permitido de 50MB',
              ),
            );
          }
        });

        return stream;
      };
    }

    return next.handle().pipe(
      tap(() => {
        // Limpiar archivos temporales después del procesamiento
        this.cleanupTempFiles();
      }),
    );
  }

  private cleanupTempFiles() {
    try {
      const files = fs.readdirSync(this.uploadDir);
      const now = Date.now();

      files.forEach((file) => {
        const filePath = path.join(this.uploadDir, file);
        const stats = fs.statSync(filePath);

        // Eliminar archivos temporales más antiguos que 1 hora
        if (now - stats.mtime.getTime() > 60 * 60 * 1000) {
          fs.unlinkSync(filePath);
        }
      });
    } catch (error) {
      console.error('Error limpiando archivos temporales:', error);
    }
  }
}
