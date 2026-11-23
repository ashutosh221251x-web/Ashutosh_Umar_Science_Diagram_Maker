import { CONCEPT_MAP, DiagramResult, Review } from '../concepts/index.js';
import { GeminiClient, ModelGenerationResult, cleanProviderErrorMessage } from '../geminiClient/index.js';
import { IRepository, GenerationAttemptLog } from '../repository/index.js';
import { validateSvg, areAllChecksPassed } from '../validators/index.js';
import { CONFIG, estimateCostUsd } from '../config/index.js';
import { generateFallbackSvg } from './fallbackGenerator.js';

export class GenerationService {
  constructor(
    private geminiClient: GeminiClient,
    private repository: IRepository
  ) {}

  async generate(conceptId: string): Promise<{ result: DiagramResult; review: Review }> {
    const concept = CONCEPT_MAP.get(conceptId);
    if (!concept) {
      const err: any = new Error(`Unknown concept ID: ${conceptId}`);
      err.statusCode = 400;
      err.code = 'INVALID_CONCEPT';
      throw err;
    }

    const attemptLogs: GenerationAttemptLog[] = [];
    let validationRetryCount = 0;
    let totalApiRetryCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let modelUsed = '';

    const useFallback = !CONFIG.hasValidApiKey || CONFIG.enableFallback;

    // Attempt 1: Initial Generation
    console.log(`[GenerationService] Starting attempt 1 for concept "${concept.name}" (${concept.id}) [mode: ${useFallback ? 'fallback' : 'gemini'}]`);
    let attempt1: ModelGenerationResult;
    try {
      if (useFallback) {
        attempt1 = generateFallbackSvg(concept.id);
      } else {
        attempt1 = await this.geminiClient.generateSvg(concept);
      }
    } catch (err: any) {
      console.warn(`[GenerationService] Gemini provider error: ${err.message}. Seamlessly falling back to curriculum generator.`);
      attempt1 = generateFallbackSvg(concept.id);
    }

    modelUsed = attempt1.model;
    totalApiRetryCount += attempt1.apiRetryCount;
    totalInputTokens += attempt1.inputTokens;
    totalOutputTokens += attempt1.outputTokens;

    const checks1 = validateSvg(attempt1.svg);
    const passed1 = areAllChecksPassed(checks1);

    attemptLogs.push({
      conceptId: concept.id,
      attemptNumber: 1,
      model: attempt1.model,
      inputTokens: attempt1.inputTokens,
      outputTokens: attempt1.outputTokens,
      costUsd: attempt1.estimatedCostUsd,
      passed: passed1,
      checks: checks1,
      error: passed1 ? null : 'Failed validation checks'
    });

    let finalSvg = attempt1.svg;
    let finalChecks = checks1;
    let finalError: string | null = null;

    // Validation retry: if any check failed, retry ONCE with feedback
    if (!passed1) {
      validationRetryCount = 1;
      const failedReasons = Object.entries(checks1)
        .filter(([_, res]) => !res.passed)
        .map(([id, res]) => `- ${id}: ${res.reason}`)
        .join('\n');

      console.warn(`[GenerationService] Attempt 1 failed checks for "${concept.name}". Retrying with feedback:\n${failedReasons}`);

      try {
        const attempt2 = useFallback
          ? generateFallbackSvg(concept.id)
          : await this.geminiClient.generateSvg(concept, failedReasons);
        totalApiRetryCount += attempt2.apiRetryCount;
        totalInputTokens += attempt2.inputTokens;
        totalOutputTokens += attempt2.outputTokens;

        const checks2 = validateSvg(attempt2.svg);
        const passed2 = areAllChecksPassed(checks2);

        attemptLogs.push({
          conceptId: concept.id,
          attemptNumber: 2,
          model: attempt2.model,
          inputTokens: attempt2.inputTokens,
          outputTokens: attempt2.outputTokens,
          costUsd: attempt2.estimatedCostUsd,
          passed: passed2,
          checks: checks2,
          error: passed2 ? null : 'Failed validation on retry'
        });

        if (passed2) {
          finalSvg = attempt2.svg;
          finalChecks = checks2;
          finalError = null;
        } else if (passed1) {
          finalSvg = attempt1.svg;
          finalChecks = checks1;
          finalError = null;
        } else {
          // If both failed, pick whichever had valid SVG and more passed checks
          const checks1Count = Object.values(checks1).filter(c => c.passed).length;
          const checks2Count = Object.values(checks2).filter(c => c.passed).length;
          if (checks2.svg_parse.passed && checks2Count >= checks1Count) {
            finalSvg = attempt2.svg;
            finalChecks = checks2;
          } else {
            finalSvg = attempt1.svg;
            finalChecks = checks1;
          }
          finalError = 'Validation failed after retry attempt';
        }

      } catch (retryErr: any) {
        console.error(`[GenerationService] Validation retry call failed:`, retryErr.message);
        finalError = `Retry failed: ${retryErr.message}`;
      }
    }

    // Safety fallback: if SVG fails safety check, never store unsafe SVG
    if (!finalChecks.safety.passed) {
      finalSvg = '';
      finalError = 'Unsafe SVG output rejected by server safety validator';
    }

    const totalRetries = validationRetryCount + totalApiRetryCount;
    const totalCost = estimateCostUsd(modelUsed, totalInputTokens, totalOutputTokens);

    const diagramResult: DiagramResult = {
      id: concept.id as any,
      svg: finalSvg || null,
      checks: finalChecks,
      usage: {
        model: modelUsed,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        estimatedCostUsd: totalCost
      },
      retryCount: totalRetries,
      validationRetryCount,
      apiRetryCount: totalApiRetryCount,
      generatedAt: new Date().toISOString(),
      error: finalError
    };

    // Save diagram and atomically reset review to pending
    const saved = await this.repository.saveDiagramAndResetReview(diagramResult, attemptLogs);
    console.log(`[GenerationService] Successfully completed generation for "${concept.name}" (passed: ${areAllChecksPassed(finalChecks)}, retries: ${totalRetries})`);
    return saved;
  }
}
