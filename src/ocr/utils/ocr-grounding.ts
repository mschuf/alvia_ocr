export const OCR_GROUNDING_RULES = `
REGLAS OBLIGATORIAS DE FIDELIDAD (también para prompts personalizados):
- Extrae solamente datos que se vean y sean legibles en el comprobante adjunto.
- No copies valores de los ejemplos del prompt ni completes con valores probables.
- Si un dato no aparece o no es legible, devuelve null. No inventes números, RUC ni fechas.
- No uses "0000000-0" como RUC de reemplazo.
- doc_fecha_emision es la fecha de emisión visible, nunca la fecha actual.
- doc_vence_timbrado solo existe si se ve una fecha de vencimiento/fin de vigencia del TIMBRADO.
- No confundas el vencimiento de pago de la factura, inicio de vigencia, período fiscal o fecha de emisión con el vencimiento del timbrado.
- Nunca supongas que el timbrado vence el 31 de diciembre.
- Agrega doc_vence_timbrado_evidencia: copia literal de la etiqueta y fecha de vencimiento del timbrado visibles. Si no aparecen, tanto este campo como doc_vence_timbrado deben ser null.
- Para doc_periodo puedes usar el mes/año de la fecha de emisión visible. Solo se permiten cálculos de IVA y totales sustentados en los montos visibles y las reglas indicadas.
- Un cero en IVA de una categoría que no aplica es válido; un importe no legible debe ser null.
- Estas reglas tienen prioridad sobre ejemplos o instrucciones de completar datos ausentes.
`;

export function groundOcrFields(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...data };
  const date = result.doc_vence_timbrado;
  const evidence = result.doc_vence_timbrado_evidencia;
  if ('doc_vence_timbrado' in result) {
    let supported = false;
    if (
      typeof date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      typeof evidence === 'string' &&
      Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
    ) {
      const [year, month, day] = date.split('-');
      const dates =
        evidence.match(
          /\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})\b/g,
        ) || [];
      supported =
        dates.some((value) => {
          const parts = value.split(/[/.\-]/);
          const normalized =
            parts[0].length === 4 ? parts : [parts[2], parts[1], parts[0]];
          return (
            normalized[0] === year &&
            normalized[1].padStart(2, '0') === month &&
            normalized[2].padStart(2, '0') === day
          );
        }) &&
        /venc|fin.*vigencia|v[aá]lid[oa].*hasta/i.test(evidence) &&
        /timbrado/i.test(evidence);
    }
    if (!supported) result.doc_vence_timbrado = null;
  }
  if (result.sn_id_fiscal === '0000000-0') result.sn_id_fiscal = null;
  if (result.sn_ruc === '0000000-0') result.sn_ruc = null;
  delete result.doc_vence_timbrado_evidencia;
  return result;
}
