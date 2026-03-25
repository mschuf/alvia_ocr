import * as fs from 'fs';
import * as path from 'path';

export class FileUtils {
  /**
   * Lee un archivo de forma segura y devuelve su contenido como Buffer
   * @param filePath Ruta del archivo a leer
   * @returns Promise<Buffer> con el contenido del archivo
   */
  static async readFileAsBuffer(filePath: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  }

  /**
   * Elimina un archivo de forma segura
   * @param filePath Ruta del archivo a eliminar
   * @returns Promise<boolean> indicando si se eliminó correctamente
   */
  static async deleteFile(filePath: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!fs.existsSync(filePath)) {
        resolve(false);
        return;
      }

      fs.unlink(filePath, (err) => {
        if (err) {
          console.error(`Error eliminando archivo ${filePath}:`, err);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * Verifica si un archivo existe
   * @param filePath Ruta del archivo a verificar
   * @returns boolean indicando si el archivo existe
   */
  static fileExists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  /**
   * Obtiene el tamaño de un archivo
   * @param filePath Ruta del archivo
   * @returns Promise<number> con el tamaño en bytes
   */
  static async getFileSize(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      fs.stat(filePath, (err, stats) => {
        if (err) {
          reject(err);
        } else {
          resolve(stats.size);
        }
      });
    });
  }

  /**
   * Crea un directorio si no existe
   * @param dirPath Ruta del directorio a crear
   * @returns boolean indicando si se creó o ya existía
   */
  static createDirectoryIfNotExists(dirPath: string): boolean {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Error creando directorio ${dirPath}:`, error);
      return false;
    }
  }

  /**
   * Limpia archivos temporales antiguos
   * @param dirPath Directorio a limpiar
   * @param maxAgeMs Edad máxima en milisegundos (por defecto 1 hora)
   */
  static async cleanupOldFiles(
    dirPath: string,
    maxAgeMs: number = 60 * 60 * 1000,
  ): Promise<void> {
    try {
      if (!fs.existsSync(dirPath)) {
        return;
      }

      const files = fs.readdirSync(dirPath);
      const now = Date.now();

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);

        if (now - stats.mtime.getTime() > maxAgeMs) {
          await this.deleteFile(filePath);
        }
      }
    } catch (error) {
      console.error(`Error limpiando directorio ${dirPath}:`, error);
    }
  }
}
