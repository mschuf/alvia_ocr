import { GatewayTimeoutException, Logger } from '@nestjs/common';
import { OcrService } from './ocr.service';
import { FileUtils } from './utils/file.utils';
import { OCR_GROUNDING_RULES } from './utils/ocr-grounding';

jest.mock('./utils/file.utils', () => ({
  FileUtils: { createDirectoryIfNotExists: jest.fn() },
}));
jest.mock('./utils/log.utils', () => ({
  LogUtils: { logModelRequest: jest.fn(), logModelResponse: jest.fn() },
}));
jest.mock('./utils/gemini-cost-log.utils', () => ({
  GeminiCostLogUtils: { logUsageAndCost: jest.fn() },
}));
jest.mock('@google/generative-ai', () => ({ GoogleGenerativeAI: jest.fn() }));

describe('OCR processing regressions (no Gemini or database calls)', () => {
  let service: any;
  const originalKey = process.env.GEMINI_API_KEY;
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'synthetic-test-key';
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    service = new OcrService();
    service.geminiPrimaryModel = 'primary';
    service.geminiFallbackModel = 'fallback';
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });
  it('applies grounding to company/daemon prompts and discards unsupported expiration', async () => {
    const model = jest
      .spyOn(service, 'processWithGemini')
      .mockResolvedValue(
        JSON.stringify({ doc_numero: '42', doc_vence_timbrado: '2026-12-31' }),
      );
    const result = await service.processWithModelFallback({
      prompt: 'COMPANY CUSTOM PROMPT',
      buffer: Buffer.from('synthetic'),
      mimeType: 'image/jpeg',
    });
    expect(model.mock.calls[0][0]).toBe(
      `COMPANY CUSTOM PROMPT\n${OCR_GROUNDING_RULES}`,
    );
    expect(model.mock.calls[0][5]).toBeLessThanOrEqual(40_000);
    expect(result.doc_numero).toBe('42');
    expect(result.doc_vence_timbrado).toBeNull();
  });
  it('falls back for malformed JSON without removing the grounding rules', async () => {
    const model = jest
      .spyOn(service, 'processWithGemini')
      .mockResolvedValueOnce('invalid json')
      .mockResolvedValueOnce('{"doc_numero":"42"}');
    expect(
      (await service.processWithModelFallback({ prompt: 'company prompt' }))
        .doc_numero,
    ).toBe('42');
    expect(model).toHaveBeenCalledTimes(2);
    expect(model.mock.calls[1][0]).toContain(OCR_GROUNDING_RULES);
  });
  it.each(['headers', 'body'])(
    'aborts a stalled Gemini %s response and returns a timeout',
    async (phase) => {
      jest.useFakeTimers();
      let signal: AbortSignal | undefined;
      const generateContentStream = jest.fn((_content, options) => {
        signal = options.signal;
        return phase === 'headers'
          ? new Promise(() => {})
          : Promise.resolve({ response: new Promise(() => {}) });
      });
      service.genAI = { getGenerativeModel: () => ({ generateContentStream }) };
      const request = service.processWithGemini(
        'prompt',
        Buffer.from('test'),
        'image/jpeg',
        'primary',
        'test',
        40_000,
      );
      const rejected = expect(request).rejects.toBeInstanceOf(
        GatewayTimeoutException,
      );
      await jest.advanceTimersByTimeAsync(40_000);
      await rejected;
      expect(signal?.aborted).toBe(true);
    },
  );
  it('times out both attempts and returns HTTP 504 after a bounded fallback', async () => {
    jest.useFakeTimers();
    const signals: AbortSignal[] = [];
    service.genAI = {
      getGenerativeModel: () => ({
        generateContentStream: (_content, options) => {
          signals.push(options.signal);
          return new Promise(() => {});
        },
      }),
    };
    const request = service.processWithModelFallback({ prompt: 'prompt' });
    const rejected = expect(request).rejects.toBeInstanceOf(
      GatewayTimeoutException,
    );
    await jest.advanceTimersByTimeAsync(80_000);
    await rejected;
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
  it('the prompt download deadline covers stalled response JSON', async () => {
    jest.useFakeTimers();
    const mock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({
        ok: true,
        json: () => new Promise(() => {}),
      } as any);
    const result = service.fetchCustomPrompt(30);
    await jest.advanceTimersByTimeAsync(3_000);
    expect(await result).toBeNull();
    expect((mock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
    expect(FileUtils.createDirectoryIfNotExists).toBeDefined();
  });
});
