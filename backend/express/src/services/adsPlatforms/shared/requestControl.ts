import { logger } from '../../../config/logger';

type Task<T> = () => Promise<T>;

class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async run<T>(task: Task<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  private release() {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (next) next();
  }
}

const apiSemaphore = new Semaphore(3);
const tokenLastRequestAt = new Map<string, number>();
const MIN_INTERVAL_MS = 120;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enforceTokenSpacing(tokenKey: string) {
  const now = Date.now();
  const last = tokenLastRequestAt.get(tokenKey) || 0;
  const wait = Math.max(0, MIN_INTERVAL_MS - (now - last));
  if (wait > 0) await sleep(wait);
  tokenLastRequestAt.set(tokenKey, Date.now());
}

export function shouldRetryStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export async function withAdsApiRateControl<T>(
  tokenKey: string,
  platform: string,
  label: string,
  op: () => Promise<{ ok: boolean; status: number; data: T }>
): Promise<T> {
  const maxAttempts = 4;
  let attempt = 0;
  let lastStatus = 0;

  while (attempt < maxAttempts) {
    attempt++;
    const result = await apiSemaphore.run(async () => {
      await enforceTokenSpacing(tokenKey);
      return op();
    });

    if (result.ok) return result.data;
    lastStatus = result.status;

    if (!shouldRetryStatus(result.status) || attempt >= maxAttempts) {
      throw new Error(`${platform} API ${label} failed with status ${result.status}`);
    }

    const base = result.status === 429 ? 500 : 300;
    const delay = base * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200);
    logger.warn('Retrying ads platform API request', { platform, label, attempt, status: result.status, delay });
    await sleep(delay);
  }

  throw new Error(`${platform} API ${label} failed after retries (${lastStatus})`);
}
