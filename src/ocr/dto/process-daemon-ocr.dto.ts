import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class ProcessDaemonOcrDto {
  @ApiProperty({
    description:
      'Contenido original del documento (data URI base64, URL, path local o base64 puro).',
    example: 'data:application/pdf;base64,JVBERi0xLjQK...',
  })
  @IsString()
  @IsNotEmpty()
  documento!: string;

  @ApiProperty({
    description: 'ID de empresa obligatorio para contexto de OCR.',
    example: 26,
  })
  @IsInt()
  @Min(1)
  empresaId!: number;

  @ApiProperty({
    description: 'Prompt final que debe usar OCR para procesar el documento.',
  })
  @IsString()
  @IsNotEmpty()
  prompt!: string;

  @ApiPropertyOptional({
    description: 'ID del documento origen para trazabilidad en logs.',
    example: 75,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  documentId?: number;

  @ApiPropertyOptional({
    description:
      'Cuando true, OCR intenta primero el modelo fallback más preciso antes de volver al primario.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  useSlowModel?: boolean;
}
