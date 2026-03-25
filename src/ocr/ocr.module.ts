import { Module } from '@nestjs/common';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';
import { FileStreamInterceptor } from './interceptors/file-stream.interceptor';

@Module({
  controllers: [OcrController],
  providers: [OcrService, FileStreamInterceptor],
  exports: [OcrService],
})
export class OcrModule {}
