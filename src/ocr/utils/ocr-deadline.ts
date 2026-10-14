import { GatewayTimeoutException } from '@nestjs/common';

export async function withOcrDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new GatewayTimeoutException(
          'El servicio OCR superó el tiempo máximo de procesamiento.',
        ),
      );
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([deadline, work(controller.signal)]);
  } finally {
    clearTimeout(timer);
  }
}
