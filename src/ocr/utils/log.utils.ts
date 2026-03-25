import * as fs from 'fs';
import * as path from 'path';

export class LogUtils {
  private static readonly LOGS_DIR = './logs';

  /**
   * Obtiene el nombre del archivo de log basado en el mes actual
   * Formato: log_YYYY-MM.txt
   */
  private static getMonthlyLogFileName(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `log_${year}-${month}.txt`;
  }

  /**
   * Obtiene el timestamp formateado como HH:mm:ss
   */
  private static getFormattedTimestamp(): string {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  /**
   * Obtiene la fecha formateada como YYYY-MM-DD
   */
  private static getFormattedDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Asegura que el directorio de logs exista
   */
  private static ensureLogDirectory(): void {
    if (!fs.existsSync(this.LOGS_DIR)) {
      fs.mkdirSync(this.LOGS_DIR, { recursive: true });
    }
  }

  /**
   * Escribe un log de Model Response en el archivo mensual
   * Formato: [YYYY-MM-DD HH:mm:ss] [dbName: XXX] Model response received: {response}
   * @param response La respuesta del modelo a registrar
   * @param dbName El nombre de la base de datos (opcional)
   */
  static logModelResponse(response: any, dbName?: string): void {
    try {
      this.ensureLogDirectory();

      const logFileName = this.getMonthlyLogFileName();
      const logFilePath = path.join(this.LOGS_DIR, logFileName);

      const date = this.getFormattedDate();
      const time = this.getFormattedTimestamp();
      const dbNamePart = dbName ? `[dbName: ${dbName}] ` : '';
      const responseString =
        typeof response === 'string' ? response : JSON.stringify(response);

      const logEntry = `[${date} ${time}] ${dbNamePart}Model response received: ${responseString}\n`;

      fs.appendFileSync(logFilePath, logEntry, 'utf8');
    } catch (error) {
      console.error('Error writing to log file:', error);
    }
  }

  /**
   * Escribe un log genérico con mensaje personalizado
   * @param message El mensaje a registrar
   * @param data Datos adicionales opcionales
   */
  static log(message: string, data?: any): void {
    try {
      this.ensureLogDirectory();

      const logFileName = this.getMonthlyLogFileName();
      const logFilePath = path.join(this.LOGS_DIR, logFileName);

      const date = this.getFormattedDate();
      const time = this.getFormattedTimestamp();
      const dataString = data ? `: ${JSON.stringify(data)}` : '';

      const logEntry = `[${date} ${time}] ${message}${dataString}\n`;

      fs.appendFileSync(logFilePath, logEntry, 'utf8');
    } catch (error) {
      console.error('Error writing to log file:', error);
    }
  }
}
