import { CHECKS, CONCEPT_IDS } from '../concepts.js';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonnegativeNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Never invent unavailable usage, costs, checks or SVGs. */
export function normalizeDiagram(value) {
  if (!isObject(value) || !CONCEPT_IDS.has(value.id)) throw new Error('The API returned an unknown diagram ID.');
  if (!isObject(value.checks)) throw new Error(`Missing validation results for ${value.id}.`);
  const checks = {};
  for (const check of CHECKS) {
    const reported = value.checks[check.id];
    if (!isObject(reported) || typeof reported.passed !== 'boolean') {
      throw new Error(`Missing ${check.id} validation status for ${value.id}.`);
    }
    checks[check.id] = { passed: reported.passed, reason: typeof reported.reason === 'string' ? reported.reason : '' };
  }
  if (value.svg != null && typeof value.svg !== 'string') throw new Error('SVG must be a string or null.');
  if (typeof value.svg === 'string' && value.svg.length > 250000) throw new Error('SVG exceeds the 250 KB frontend safety limit.');
  if (typeof value.svg === 'string' && !value.svg.includes('<svg')) throw new Error('API response is not an SVG.');
  if (value.usage != null && !isObject(value.usage)) throw new Error('Usage must be an object.');
  const usage = value.usage || {};
  for (const key of ['inputTokens', 'outputTokens', 'estimatedCostUsd']) {
    if (usage[key] != null && !nonnegativeNumber(usage[key])) throw new Error(`Invalid ${key} usage metric.`);
  }
  for (const key of ['retryCount', 'validationRetryCount', 'apiRetryCount']) {
    if (value[key] != null && (!Number.isInteger(value[key]) || value[key] < 0)) throw new Error(`Invalid ${key}.`);
  }
  return {
    id: value.id,
    svg: value.svg || null,
    checks,
    usage: {
      model: typeof usage.model === 'string' ? usage.model : null,
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      estimatedCostUsd: usage.estimatedCostUsd ?? null
    },
    retryCount: value.retryCount ?? null,
    validationRetryCount: value.validationRetryCount ?? null,
    apiRetryCount: value.apiRetryCount ?? null,
    generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : null,
    error: typeof value.error === 'string' ? value.error : null
  };
}

export function normalizeResults(payload) {
  const results = Array.isArray(payload) ? payload : payload?.results;
  if (!Array.isArray(results)) throw new Error('Results response must contain a results array.');
  const byId = new Map();
  for (const item of results) {
    const normalized = normalizeDiagram(item);
    if (byId.has(normalized.id)) throw new Error('Duplicate concept in results.');
    byId.set(normalized.id, normalized);
  }
  return [...byId.values()];
}

export function normalizeReview(value) {
  if (!isObject(value) || !CONCEPT_IDS.has(value.conceptId)) throw new Error('Invalid review response.');
  const status = value.status ?? 'pending';
  if (!['pending', 'approved', 'rejected'].includes(status)) throw new Error('Invalid review status.');
  if (value.note != null && typeof value.note !== 'string') throw new Error('Invalid review note.');
  return { conceptId: value.conceptId, status, note: value.note || '', updatedAt: value.updatedAt ?? null };
}

export function completedChecks(diagram) {
  return diagram ? CHECKS.filter((check) => diagram.checks[check.id].passed).length : 0;
}

export function checksPassed(diagram) {
  return diagram != null && completedChecks(diagram) === CHECKS.length;
}
