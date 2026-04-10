import * as fs from 'node:fs';
import * as path from 'node:path';

interface UsageMetadataLike {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  cachedContentTokenCount?: number;
}

interface CostLogInput {
  model: string;
  usageMetadata?: UsageMetadataLike | null;
  contextLabel?: string;
  durationMs?: number;
}

interface PricingConfig {
  inputUsdPer1M: number;
  outputUsdPer1M: number;
  cachedInputUsdPer1M: number;
}

interface TotalsBucket {
  procedures: number;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedPromptTokens: number;
  estimatedCostUsd: number;
}

interface CostTotalsFile {
  updatedAt: string;
  currency: 'USD';
  overall: TotalsBucket;
  byModel: Record<string, TotalsBucket>;
}

interface CostBreakdown {
  inputUsd: number;
  cachedInputUsd: number;
  outputUsd: number;
  totalUsd: number;
}

const TOKENS_BASE = 1_000_000;

const MODEL_DEFAULT_PRICING: Record<string, PricingConfig> = {
  // Fuente (2026-04-07): https://ai.google.dev/pricing (Standard paid tier)
  'gemini-3-flash-preview': {
    inputUsdPer1M: 0.5,
    outputUsdPer1M: 3,
    cachedInputUsdPer1M: 0.05,
  },
  // Fuente (2026-04-10): https://ai.google.dev/gemini-api/docs/pricing (Standard paid tier, prompts <= 200k)
  'gemini-3.1-pro-preview': {
    inputUsdPer1M: 2,
    outputUsdPer1M: 12,
    cachedInputUsdPer1M: 0.2,
  },
  // Fuente (2026-04-07): https://ai.google.dev/pricing (Standard paid tier)
  'gemini-2.5-flash': {
    inputUsdPer1M: 0.3,
    outputUsdPer1M: 2.5,
    cachedInputUsdPer1M: 0.03,
  },
};

const FALLBACK_PRICING: PricingConfig = {
  inputUsdPer1M: 0.5,
  outputUsdPer1M: 3,
  cachedInputUsdPer1M: 0.05,
};

export interface GeminiCostLogResult {
  estimatedCostUsd: number;
  totalEstimatedCostUsd: number;
  modelEstimatedCostUsd: number;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedPromptTokens: number;
}

export class GeminiCostLogUtils {
  private static readonly LOGS_DIR = './logs';

  private static getMonthlyUsageLogFilePath(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return path.join(this.LOGS_DIR, `gemini_usage_${year}-${month}.log`);
  }

  private static getTotalsFilePath(): string {
    return path.join(this.LOGS_DIR, 'gemini_usage_totals.json');
  }

  private static ensureLogDirectory(): void {
    if (!fs.existsSync(this.LOGS_DIR)) {
      fs.mkdirSync(this.LOGS_DIR, { recursive: true });
    }
  }

  static logUsageAndCost(input: CostLogInput): GeminiCostLogResult | null {
    try {
      this.ensureLogDirectory();

      const normalizedUsage = this.normalizeUsage(input.usageMetadata);
      const pricing = this.resolvePricing(input.model);
      const breakdown = this.calculateCost(normalizedUsage, pricing);

      const totals = this.readTotalsFile();
      this.incrementTotals(totals.overall, normalizedUsage, breakdown.totalUsd);

      if (!totals.byModel[input.model]) {
        totals.byModel[input.model] = this.createEmptyBucket();
      }

      this.incrementTotals(
        totals.byModel[input.model],
        normalizedUsage,
        breakdown.totalUsd,
      );
      totals.updatedAt = new Date().toISOString();

      this.writeTotalsFile(totals);

      const monthlyLogPath = this.getMonthlyUsageLogFilePath();
      const entry = {
        timestamp: new Date().toISOString(),
        model: input.model,
        contextLabel: input.contextLabel,
        durationMs: input.durationMs,
        usage: normalizedUsage,
        pricingUsdPer1M: pricing,
        estimatedCostUsd: this.roundCurrency(breakdown.totalUsd),
        estimatedCostBreakdownUsd: {
          input: this.roundCurrency(breakdown.inputUsd),
          cachedInput: this.roundCurrency(breakdown.cachedInputUsd),
          output: this.roundCurrency(breakdown.outputUsd),
        },
        totalEstimatedCostUsd: this.roundCurrency(totals.overall.estimatedCostUsd),
        modelEstimatedCostUsd: this.roundCurrency(
          totals.byModel[input.model].estimatedCostUsd,
        ),
      };

      fs.appendFileSync(monthlyLogPath, `${JSON.stringify(entry)}\n`, 'utf8');

      return {
        estimatedCostUsd: entry.estimatedCostUsd,
        totalEstimatedCostUsd: entry.totalEstimatedCostUsd,
        modelEstimatedCostUsd: entry.modelEstimatedCostUsd,
        promptTokens: normalizedUsage.promptTokenCount,
        outputTokens: normalizedUsage.candidatesTokenCount,
        totalTokens: normalizedUsage.totalTokenCount,
        cachedPromptTokens: normalizedUsage.cachedContentTokenCount,
      };
    } catch (error) {
      console.error('Error writing Gemini usage/cost log:', error);
      return null;
    }
  }

  private static normalizeUsage(
    usage?: UsageMetadataLike | null,
  ): Required<UsageMetadataLike> {
    const promptTokenCount = this.normalizeTokenValue(usage?.promptTokenCount);
    const candidatesTokenCount = this.normalizeTokenValue(
      usage?.candidatesTokenCount,
    );
    const cachedContentTokenCount = Math.min(
      this.normalizeTokenValue(usage?.cachedContentTokenCount),
      promptTokenCount,
    );

    const totalTokenCount =
      this.normalizeTokenValue(usage?.totalTokenCount) ||
      promptTokenCount + candidatesTokenCount;

    return {
      promptTokenCount,
      candidatesTokenCount,
      totalTokenCount,
      cachedContentTokenCount,
    };
  }

  private static normalizeTokenValue(value?: number): number {
    if (!Number.isFinite(value) || value === undefined || value === null) {
      return 0;
    }

    return Math.max(0, Math.round(value));
  }

  private static calculateCost(
    usage: Required<UsageMetadataLike>,
    pricing: PricingConfig,
  ): CostBreakdown {
    const cachedPromptTokens = Math.min(
      usage.cachedContentTokenCount,
      usage.promptTokenCount,
    );
    const nonCachedPromptTokens = Math.max(
      usage.promptTokenCount - cachedPromptTokens,
      0,
    );

    const inputUsd =
      (nonCachedPromptTokens * pricing.inputUsdPer1M) / TOKENS_BASE;
    const cachedInputUsd =
      (cachedPromptTokens * pricing.cachedInputUsdPer1M) / TOKENS_BASE;
    const outputUsd =
      (usage.candidatesTokenCount * pricing.outputUsdPer1M) / TOKENS_BASE;

    return {
      inputUsd,
      cachedInputUsd,
      outputUsd,
      totalUsd: inputUsd + cachedInputUsd + outputUsd,
    };
  }

  private static resolvePricing(model: string): PricingConfig {
    const modelKey = this.toModelEnvKey(model);
    const modelDefaults = MODEL_DEFAULT_PRICING[model] ?? FALLBACK_PRICING;

    const defaultInput =
      this.getEnvNumber('GEMINI_PRICE_INPUT_PER_1M_DEFAULT') ??
      modelDefaults.inputUsdPer1M;
    const defaultOutput =
      this.getEnvNumber('GEMINI_PRICE_OUTPUT_PER_1M_DEFAULT') ??
      modelDefaults.outputUsdPer1M;
    const defaultCachedInput =
      this.getEnvNumber('GEMINI_PRICE_CACHED_INPUT_PER_1M_DEFAULT') ??
      modelDefaults.cachedInputUsdPer1M;

    return {
      inputUsdPer1M:
        this.getEnvNumber(`GEMINI_PRICE_INPUT_PER_1M_${modelKey}`) ??
        defaultInput,
      outputUsdPer1M:
        this.getEnvNumber(`GEMINI_PRICE_OUTPUT_PER_1M_${modelKey}`) ??
        defaultOutput,
      cachedInputUsdPer1M:
        this.getEnvNumber(`GEMINI_PRICE_CACHED_INPUT_PER_1M_${modelKey}`) ??
        defaultCachedInput,
    };
  }

  private static getEnvNumber(key: string): number | undefined {
    const rawValue = process.env[key];
    if (!rawValue) {
      return undefined;
    }

    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) {
      return undefined;
    }

    return value;
  }

  private static toModelEnvKey(model: string): string {
    return model.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  }

  private static readTotalsFile(): CostTotalsFile {
    const totalsPath = this.getTotalsFilePath();

    if (!fs.existsSync(totalsPath)) {
      return this.createEmptyTotalsFile();
    }

    try {
      const raw = fs.readFileSync(totalsPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<CostTotalsFile>;

      const byModel: Record<string, TotalsBucket> = {};
      if (parsed.byModel && typeof parsed.byModel === 'object') {
        for (const [model, bucket] of Object.entries(parsed.byModel)) {
          byModel[model] = this.normalizeBucket(bucket);
        }
      }

      return {
        updatedAt:
          typeof parsed.updatedAt === 'string'
            ? parsed.updatedAt
            : new Date().toISOString(),
        currency: 'USD',
        overall: this.normalizeBucket(parsed.overall),
        byModel,
      };
    } catch {
      return this.createEmptyTotalsFile();
    }
  }

  private static writeTotalsFile(totals: CostTotalsFile): void {
    fs.writeFileSync(
      this.getTotalsFilePath(),
      JSON.stringify(totals, null, 2),
      'utf8',
    );
  }

  private static createEmptyTotalsFile(): CostTotalsFile {
    return {
      updatedAt: new Date().toISOString(),
      currency: 'USD',
      overall: this.createEmptyBucket(),
      byModel: {},
    };
  }

  private static createEmptyBucket(): TotalsBucket {
    return {
      procedures: 0,
      promptTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedPromptTokens: 0,
      estimatedCostUsd: 0,
    };
  }

  private static normalizeBucket(bucket: unknown): TotalsBucket {
    const candidate = (bucket ?? {}) as Partial<TotalsBucket>;

    return {
      procedures: this.normalizeCounter(candidate.procedures),
      promptTokens: this.normalizeCounter(candidate.promptTokens),
      outputTokens: this.normalizeCounter(candidate.outputTokens),
      totalTokens: this.normalizeCounter(candidate.totalTokens),
      cachedPromptTokens: this.normalizeCounter(candidate.cachedPromptTokens),
      estimatedCostUsd: this.normalizeCurrency(candidate.estimatedCostUsd),
    };
  }

  private static incrementTotals(
    bucket: TotalsBucket,
    usage: Required<UsageMetadataLike>,
    estimatedCostUsd: number,
  ): void {
    bucket.procedures += 1;
    bucket.promptTokens += usage.promptTokenCount;
    bucket.outputTokens += usage.candidatesTokenCount;
    bucket.totalTokens += usage.totalTokenCount;
    bucket.cachedPromptTokens += usage.cachedContentTokenCount;
    bucket.estimatedCostUsd = this.roundCurrency(
      bucket.estimatedCostUsd + estimatedCostUsd,
    );
  }

  private static normalizeCounter(value?: number): number {
    if (!Number.isFinite(value) || value === undefined || value === null) {
      return 0;
    }

    return Math.max(0, Math.round(value));
  }

  private static normalizeCurrency(value?: number): number {
    if (!Number.isFinite(value) || value === undefined || value === null) {
      return 0;
    }

    return this.roundCurrency(Math.max(0, value));
  }

  private static roundCurrency(value: number): number {
    return Number(value.toFixed(8));
  }
}
