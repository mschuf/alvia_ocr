import * as fs from 'node:fs';
import * as path from 'node:path';

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
   * Convierte un objeto a string JSON de forma segura
   */
  private static safeStringify(data: unknown): string {
    if (typeof data === 'string') {
      return data;
    }

    try {
      return JSON.stringify(data);
    } catch {
      return '[unserializable_data]';
    }
  }

  /**
   * Escribe un log de Model Request en el archivo mensual.
   * Incluye el prompt completo enviado al modelo.
   */
  static logModelRequest(
    prompt: string,
    dbName?: string,
    metadata?: Record<string, unknown>,
  ): void {
    try {
      this.ensureLogDirectory();

      const logFileName = this.getMonthlyLogFileName();
      const logFilePath = path.join(this.LOGS_DIR, logFileName);

      const date = this.getFormattedDate();
      const time = this.getFormattedTimestamp();
      const dbNamePart = dbName ? `[dbName: ${dbName}] ` : '';
      const payload = {
        prompt,
        ...(metadata ?? {}),
      };

      const logEntry = `[${date} ${time}] ${dbNamePart}Model request sent: ${this.safeStringify(payload)}\n`;

      fs.appendFileSync(logFilePath, logEntry, 'utf8');
    } catch (error) {
      console.error('Error writing model request to log file:', error);
    }
  }

  /**
   * Escribe un log de Model Response en el archivo mensual
   * Formato: [YYYY-MM-DD HH:mm:ss] [dbName: XXX] Model response received: {response}
   */
  static logModelResponse(response: unknown, dbName?: string): void {
    try {
      this.ensureLogDirectory();

      const logFileName = this.getMonthlyLogFileName();
      const logFilePath = path.join(this.LOGS_DIR, logFileName);

      const date = this.getFormattedDate();
      const time = this.getFormattedTimestamp();
      const dbNamePart = dbName ? `[dbName: ${dbName}] ` : '';
      const responseString = this.safeStringify(response);

      const logEntry = `[${date} ${time}] ${dbNamePart}Model response received: ${responseString}\n`;

      fs.appendFileSync(logFilePath, logEntry, 'utf8');
    } catch (error) {
      console.error('Error writing to log file:', error);
    }
  }

  /**
   * Escribe un log generico con mensaje personalizado
   */
  static log(message: string, data?: unknown): void {
    try {
      this.ensureLogDirectory();

      const logFileName = this.getMonthlyLogFileName();
      const logFilePath = path.join(this.LOGS_DIR, logFileName);

      const date = this.getFormattedDate();
      const time = this.getFormattedTimestamp();
      const dataString = data ? `: ${this.safeStringify(data)}` : '';

      const logEntry = `[${date} ${time}] ${message}${dataString}\n`;

      fs.appendFileSync(logFilePath, logEntry, 'utf8');
    } catch (error) {
      console.error('Error writing to log file:', error);
    }
  }
}
