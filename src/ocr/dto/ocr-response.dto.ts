import { ApiProperty } from '@nestjs/swagger';

export class DocumentLineDto {
  @ApiProperty({
    description: 'Descripción del producto o servicio',
    example: 'Consultoría en sistemas',
  })
  ItemDescription!: string;

  @ApiProperty({
    description: 'Cantidad',
    example: 2,
  })
  Quantity!: number;

  @ApiProperty({
    description: 'Precio unitario',
    example: 500000,
  })
  UnitPrice!: number;

  @ApiProperty({
    description: 'Total de la línea',
    example: 1000000,
  })
  LineTotal!: number;

  @ApiProperty({
    description: 'Código de impuesto',
    example: 'IVA_10',
    enum: ['IVA_10', 'IVA_5', 'IVA_Exe'],
  })
  TaxCode!: string;
}

export class OcrResponseDto {
  @ApiProperty({
    description: 'Número de factura',
    example: '001-002-0000001',
    required: false,
  })
  invoiceNumber?: string;

  @ApiProperty({
    description: 'RUC del proveedor',
    example: '80003232-2',
    required: false,
  })
  supplierRuc?: string;

  @ApiProperty({
    description: 'Establecimiento de la factura',
    example: '001',
    required: false,
  })
  establecimiento?: string;

  @ApiProperty({
    description: 'Punto de emisión de la factura',
    example: '002',
    required: false,
  })
  punto_emision?: string;

  @ApiProperty({
    description: 'Nombre del proveedor',
    example: 'FRIGORÍFICO GUARANÍ S.A.C.I.',
    required: false,
  })
  supplierName?: string;

  @ApiProperty({
    description:
      'Tipo de factura: 1=Estándar, 2=Comprobante Virtual, 3=Factura Electrónica',
    example: '1',
    enum: ['1', '2', '3'],
    enumName: 'TipoFactura',
    required: false,
  })
  U_TipoFactura?: string;

  @ApiProperty({
    description: 'Código del cliente (RUC)',
    example: '20001234-1',
    required: false,
  })
  CardCode?: string;

  @ApiProperty({
    description: 'Nombre del cliente',
    example: 'Supermercado Central S.A.',
    required: false,
  })
  CardName?: string;

  @ApiProperty({
    description: 'Fecha del documento (DD/MM/YYYY)',
    example: '15/12/2023',
    required: false,
  })
  DocDate?: string;

  @ApiProperty({
    description: 'Fecha de vencimiento (DD/MM/YYYY)',
    example: '15/01/2024',
    required: false,
  })
  DocDueDate?: string;

  @ApiProperty({
    description: 'Moneda del documento',
    example: 'PYG',
    enum: ['PYG', 'USD'],
    required: false,
  })
  DocCurrency?: string;

  @ApiProperty({
    description: 'Total del documento',
    example: 1100000,
    required: false,
  })
  DocTotal?: number;

  @ApiProperty({
    description: 'Fecha de impuesto (DD/MM/YYYY)',
    example: '15/12/2023',
    required: false,
  })
  TaxDate?: string;

  @ApiProperty({
    description: 'Número de timbrado',
    example: '12345678',
    required: false,
  })
  U_TIMB?: string;

  @ApiProperty({
    description: 'Fecha de inicio del timbrado (DD/MM/YYYY)',
    example: '01/10/2023',
    required: false,
  })
  U_TimbradoStart?: string;

  @ApiProperty({
    description: 'Fecha de fin del timbrado (DD/MM/YYYY)',
    example: '31/03/2024',
    required: false,
  })
  U_TimbradoEnd?: string;

  @ApiProperty({
    description: `Código del grupo de pago. Valores posibles:
    -1: Contado
    5: 30 DÍAS
    3: 90 DÍAS sin Intereses
    33: *70*
    16: Cheque DIF 150 DÍAS
    1: 30 DÍAS Precio Contado
    8: 15 DÍAS
    7: 90 DÍAS
    2: 60 DÍAS
    9: 50% contado, saldo a 30 DÍAS
    13: 30
    11: Cheque DIF 90 DÍAS
    12: 36 MESES
    6: 180 DÍAS
    14: 24 MESES
    15: 24 MESES
    18: Cheque DIF 60 DÍAS
    17: Cheque DIF 30 DÍAS
    10: Cheque DIF 120 DÍAS
    19: 47 CUOTAS
    20: 12 MESES
    21: 61 CUOTAS
    22: 9 CUOTAS
    23: 160 DÍAS
    24: 210 DÍAS
    25: 8 DÍAS
    26: 20 DÍAS
    27: 8 MESES
    28: 6 MESES
    29: 45 DÍAS
    30: CHEQUE DIF 180 DÍAS
    31: 150 DÍAS
    32: 70 DÍAS
    4: 30, 60, 90
    34: 48 MESES
    35: 75 DÍAS
    36: 65 DÍAS
    37: 10 CUOTAS
    38: 28 DÍAS
    39: 80 DÍAS
    40: 30, 60 DÍAS
    41: 4 MESES
    42: 30 MESES
    46: CHEQUE DIF 45 DÍAS
    47: 40 DÍAS
    48: CHEQUE DIF 125 DÍAS
    49: CHEQUE DIF 30/60 DÍAS
    50: 30/60 DÍAS
    51: 110 DÍAS
    52: 115 DÍAS
    53: CHEQUE DIF 130 DÍAS
    54: 120 DÍAS
    55: 28/56/84 DÍAS
    56: 2 DÍAS
    57: 13 MESES
    58: 56/84/112 DÍAS
    59: 28/56 DÍAS
    60: 30,60,90 DÍAS
    61: CRÉDITO
    62: CHEQUE DIF 160 DÍAS`,
    example: -1,
    enum: [
      -1, 5, 3, 33, 16, 1, 8, 7, 2, 9, 13, 11, 12, 6, 14, 15, 18, 17, 10, 19,
      20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 4, 34, 35, 36, 37, 38,
      39, 40, 41, 42, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59,
      60, 61, 62,
    ],
    enumName: 'PaymentGroupCode',
    required: false,
  })
  PaymentGroupCode?: number;

  @ApiProperty({
    description: 'Líneas del documento',
    type: [DocumentLineDto],
    required: false,
  })
  DocumentLines?: DocumentLineDto[];

  @ApiProperty({
    description: 'Marca de tiempo de procesamiento',
    example: '2023-12-01T10:30:00.000Z',
  })
  timestamp!: string;
}
