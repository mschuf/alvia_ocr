import { groundOcrFields } from './ocr-grounding';

describe('OCR field fidelity', () => {
  it('removes an invented expiration without a literal visible source and does not mutate the response', () => {
    const original = {
      doc_vence_timbrado: '2026-12-31',
      doc_numero: '001-002-0000042',
    };
    expect(groundOcrFields(original)).toEqual({
      ...original,
      doc_vence_timbrado: null,
    });
    expect(original.doc_vence_timbrado).toBe('2026-12-31');
  });
  it.each([
    'Timbrado válido hasta 31/12/2026',
    'Fin de vigencia del timbrado: 2026-12-31',
    'Vencimiento timbrado 31-12-2026',
  ])('keeps an expiration supported by %s', (evidence) => {
    expect(
      groundOcrFields({
        doc_vence_timbrado: '2026-12-31',
        doc_vence_timbrado_evidencia: evidence,
      }),
    ).toEqual({ doc_vence_timbrado: '2026-12-31' });
  });
  it.each([
    'Vencimiento de pago: 31/12/2026',
    'Timbrado fecha de inicio: 31/12/2026',
    'Timbrado válido hasta: 30/11/2026',
    '',
    null,
  ])(
    'discards absent, unrelated or conflicting expiration evidence: %s',
    (evidence) => {
      expect(
        groundOcrFields({
          doc_vence_timbrado: '2026-12-31',
          doc_vence_timbrado_evidencia: evidence,
        }).doc_vence_timbrado,
      ).toBeNull();
    },
  );
  it('rejects an invalid calendar date and placeholder RUC', () => {
    expect(
      groundOcrFields({
        doc_vence_timbrado: '2026-02-30',
        doc_vence_timbrado_evidencia: 'Timbrado válido hasta 30/02/2026',
        sn_id_fiscal: '0000000-0',
      }),
    ).toEqual({ doc_vence_timbrado: null, sn_id_fiscal: null });
  });
});
