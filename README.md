# Alvia OCR

Servicio NestJS para extraer datos de documentos/facturas usando Gemini.

## Endpoints principales

- `POST /ocr/process-daemon`
  - Entrada JSON para `alvia_daemon`.
  - Requiere `empresaId`, `prompt`, `documento`.
- `POST /ocr/process`
  - Entrada multipart (`file`) para carga manual.

Swagger disponible en `GET /api`.

## Variables de entorno

Usa `.env.example` como base.

Variables clave:

- `GEMINI_API_KEY`
- `GEMINI3_FLASH_API_KEY`
- `GEMINI_PRIMARY_MODEL`
- `GEMINI_FALLBACK_MODEL`
- `OCR_HTTP_BODY_LIMIT`
- `API_BASE_URL`
- `GEMINI_PRICE_INPUT_PER_1M_DEFAULT`
- `GEMINI_PRICE_OUTPUT_PER_1M_DEFAULT`
- `GEMINI_PRICE_CACHED_INPUT_PER_1M_DEFAULT`
- `GEMINI_PRICE_INPUT_PER_1M_<MODEL_KEY>`
- `GEMINI_PRICE_OUTPUT_PER_1M_<MODEL_KEY>`
- `GEMINI_PRICE_CACHED_INPUT_PER_1M_<MODEL_KEY>`

`<MODEL_KEY>` es el nombre del modelo en mayusculas y con `_`.
Ejemplo: `gemini-3-flash-preview` -> `GEMINI_3_FLASH_PREVIEW`.

Comportamiento OCR:

- Cada request intenta primero `GEMINI_PRIMARY_MODEL`.
- Si ese modelo falla o devuelve una respuesta imposible de parsear, reintenta automaticamente con `GEMINI_FALLBACK_MODEL`.
- El siguiente documento vuelve a comenzar por el modelo primario para contener el costo.

## Logs

El servicio escribe logs en `./logs`.

- `log_YYYY-MM.txt`
  - Logger funcional existente.
  - Incluye request y response del modelo.
  - El request guarda el prompt completo enviado a Gemini.
- `processing_times.log`
  - Tiempo de procesamiento por llamada a modelo.
- `gemini_usage_YYYY-MM.log`
  - Logger nuevo por procedimiento con:
  - modelo usado
  - tokens de entrada/salida/total
  - costo estimado por llamada
  - costo acumulado general y por modelo
- `gemini_usage_totals.json`
  - Acumulado persistente total y por modelo.

## Pricing por defecto en el codigo

Fecha de referencia: 2026-04-10.
Fuente oficial: https://ai.google.dev/gemini-api/docs/pricing

- `gemini-3-flash-preview` (standard paid):
  - input: USD 0.50 / 1M tokens
  - output: USD 3.00 / 1M tokens
  - cached input: USD 0.05 / 1M tokens
- `gemini-3.1-pro-preview` (standard paid, prompts <= 200k):
  - input: USD 2.00 / 1M tokens
  - output: USD 12.00 / 1M tokens
  - cached input: USD 0.20 / 1M tokens
- `gemini-2.5-flash` (standard paid):
  - input: USD 0.30 / 1M tokens
  - output: USD 2.50 / 1M tokens
  - cached input: USD 0.03 / 1M tokens

Puedes sobreescribir cualquier precio por `.env` sin cambiar codigo.

## Desarrollo

Instalacion:

```bash
npm install
```

Modo desarrollo:

```bash
npm run start:dev
```

Build:

```bash
npm run build
```
