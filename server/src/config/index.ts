import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'gemini-3.5-flash': { inputPerMillion: 0.075, outputPerMillion: 0.30 },
  'gemini-3.5-flash-lite': { inputPerMillion: 0.075, outputPerMillion: 0.30 },
  'gemini-2.5-flash': { inputPerMillion: 0.075, outputPerMillion: 0.30 },
  'gemini-2.5-flash-lite': { inputPerMillion: 0.075, outputPerMillion: 0.30 },
  'gemini-1.5-flash': { inputPerMillion: 0.075, outputPerMillion: 0.30 },
  'gemini-1.5-flash-8b': { inputPerMillion: 0.0375, outputPerMillion: 0.15 },
  'gemini-1.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5.00 },
  'gemini-2.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5.00 }
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const normalized = model.replace(/^models\//, '').toLowerCase();
  const pricing = MODEL_PRICING[normalized] ||
    Object.entries(MODEL_PRICING).find(([key]) => normalized.includes(key))?.[1];

  if (!pricing) {
    return null;
  }
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
  return Number((inputCost + outputCost).toFixed(7));
}

const rawKey = (process.env.GEMINI_API_KEY || '').trim();
const isPlaceholderKey = !rawKey || rawKey.includes('your_') || rawKey.length < 10;

export const CONFIG = {
  port: parseInt(process.env.PORT || '3000', 10),
  geminiApiKey: rawKey,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-flash-latest',
  databaseUrl: process.env.DATABASE_URL || '',
  sqlitePath: process.env.SQLITE_PATH || path.resolve(process.cwd(), 'data', 'diagrams.db'),
  allowedOrigin: process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
  maxProviderRetries: 3,
  requestTimeoutMs: 60000,
  hasValidApiKey: !isPlaceholderKey,
  enableFallback: process.env.ENABLE_FALLBACK === 'true'
};
