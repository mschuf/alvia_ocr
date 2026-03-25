import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter'; // Excepción global personalizada
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Configure global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 🔹 Habilitar CORS para todas las IPs
  app.enableCors({
    origin: '*', // Permite cualquier origen
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: '*',
    credentials: true, // Habilitar credenciales
  });

  // Configure Swagger
  const config = new DocumentBuilder()
    .setTitle('OCR Backend API')
    .setDescription('API para extracción de datos de facturas')
    .setVersion('1.0')
    .addTag('OCR')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // 🔹 Habilitar validaciones globales
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Elimina propiedades no definidas en los DTOs
      forbidNonWhitelisted: true, // Rechaza peticiones con propiedades no permitidas
      transform: true, // Convierte los valores de la petición en los tipos de los DTOs
    }),
  );

  // 🔹 Manejo de errores global con un filtro personalizado
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
