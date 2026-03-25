import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'OCR Backend for Paraguayan Invoices is running!';
  }
}
