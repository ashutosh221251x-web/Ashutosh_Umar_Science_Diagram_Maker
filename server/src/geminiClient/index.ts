import { GoogleGenerativeAI } from '@google/generative-ai';
import { CONFIG, estimateCostUsd } from '../config/index.js';
import { ConceptSpec } from '../concepts/index.js';

export interface ModelGenerationResult {
  svg: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number | null;
  apiRetryCount: number;
}

export class GeminiClient {
  private genAI: GoogleGenerativeAI;
  private primaryModel: string;

  constructor() {
    this.genAI = new GoogleGenerativeAI(CONFIG.geminiApiKey || 'dummy_key');
    this.primaryModel = CONFIG.geminiModel;
  }

  /** Read model availability using the account/provider rather than assuming a model name works */
  async resolveAvailableModel(): Promise<string> {
    if (CONFIG.geminiModel && !CONFIG.geminiModel.includes('3.5')) {
      return CONFIG.geminiModel;
    }
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${CONFIG.geminiApiKey}`);
      if (response.ok) {
        const data: any = await response.json();
        const available: string[] = (data.models || []).map((m: any) => m.name.replace(/^models\//, ''));

        // Suggested free models in priority order
        const candidates = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];
        for (const candidate of candidates) {
          if (available.includes(candidate)) {
            console.log(`[GeminiClient] Selected available model: ${candidate}`);
            return candidate;
          }
        }
      }
    } catch (e: any) {
      console.warn('[GeminiClient] Could not fetch models list, using default model:', e.message);
    }
    return this.primaryModel || 'gemini-2.5-flash';
  }


  /** Generate diagram SVG with bounded provider retries (429/503) */
  async generateSvg(
    concept: ConceptSpec,
    feedbackPrompt?: string
  ): Promise<ModelGenerationResult> {
    const modelName = await this.resolveAvailableModel();
    const model = this.genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 8192
      }
    });

    const systemPrompt = `You are an expert scientific diagram illustrator creating accessible, animated SVG diagrams for UK GCSE students.
Generate ONE standalone, clean, valid animated SVG diagram.

STRICT TECHNICAL RULES:
1. Output ONLY the raw SVG code starting with <svg> and ending with </svg>.
2. Do NOT wrap in markdown codeblocks (no \`\`\` or \`\`\`xml or \`\`\`svg). No HTML wrapper tags.
3. Root tag MUST include: xmlns="http://www.w3.org/2000/svg" and viewBox="0 0 600 400" (or suitable dimensions).
4. ALL visible elements, shapes, text labels, and animated elements MUST fit completely inside the viewBox boundaries.
5. REQUIRED: Exactly one descriptive, non-empty <title> tag inside the SVG.
6. REQUIRED: At least 3 distinct, visible, non-empty <text> elements with clear labels, legible font-size (12px-16px) and high contrast colors.
7. REQUIRED: At least one active, smooth animation using SMIL (<animate>, <animateTransform>, or <animateMotion>) OR CSS @keyframes with animation applied to elements. Keep animations looping (repeatCount="indefinite" or animation: ... infinite).
8. STRICT SAFETY: NO <script> tags, NO inline event handlers (no onload, onclick, onmouseover), NO <foreignObject>, NO external URLs (no http, https, data: or external hrefs). Only internal anchor/gradient IDs allowed.

SCIENTIFIC CONTENT REQUIREMENT:
Subject: ${concept.subject}
Concept: ${concept.name}
Instruction: ${concept.prompt}`;

    const userPrompt = feedbackPrompt
      ? `${concept.prompt}\n\nIMPORTANT CORRECTION: Your previous diagram failed automated validation with these errors:\n${feedbackPrompt}\nPlease fix these exact issues and ensure every element is inside the viewBox, at least 3 distinct visible text labels are present, a <title> is included, and animations run smoothly.`
      : `Draw an animated GCSE scientific diagram demonstrating: "${concept.prompt}". Output only valid SVG.`;

    let apiRetryCount = 0;
    let lastError: any = null;

    for (let attempt = 0; attempt <= CONFIG.maxProviderRetries; attempt++) {
      try {
        const response = await model.generateContent([
          { text: systemPrompt },
          { text: userPrompt }
        ]);

        const rawText = response.response.text();
        const cleanedSvg = this.cleanSvgResponse(rawText);

        const usage = response.response.usageMetadata;
        const inputTokens = usage?.promptTokenCount || 0;
        const outputTokens = usage?.candidatesTokenCount || 0;
        const estimatedCost = estimateCostUsd(modelName, inputTokens, outputTokens);

        return {
          svg: cleanedSvg,
          model: modelName,
          inputTokens,
          outputTokens,
          estimatedCostUsd: estimatedCost,
          apiRetryCount
        };
      } catch (err: any) {
        lastError = err;
        const status = err.status || err.statusCode || (err.message?.includes('429') ? 429 : err.message?.includes('503') ? 503 : 500);

        if ((status === 429 || status === 503) && attempt < CONFIG.maxProviderRetries) {
          apiRetryCount++;
          // Parse retry-after header if present or use exponential backoff + jitter
          const retryAfterSec = this.extractRetryAfter(err);
          const baseDelay = retryAfterSec ? retryAfterSec * 1000 : Math.pow(2, attempt) * 1000;
          const jitter = Math.random() * 500;
          const delay = Math.min(baseDelay + jitter, 10000);

          console.warn(`[GeminiClient] Provider error (${status}). Retrying attempt ${attempt + 1}/${CONFIG.maxProviderRetries} after ${Math.round(delay)}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        break;
      }
    }

    throw lastError || new Error('Provider failed after maximum retry attempts');
  }

  private cleanSvgResponse(text: string): string {
    let cleaned = text.trim();

    // Strip markdown code fences if present
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:xml|svg)?\s*/i, '');
      cleaned = cleaned.replace(/\s*```$/i, '');
      cleaned = cleaned.trim();
    }

    // Extract from first <svg to last </svg> if extra prose was returned
    const svgStart = cleaned.indexOf('<svg');
    const svgEnd = cleaned.lastIndexOf('</svg>');
    if (svgStart !== -1 && svgEnd !== -1 && svgEnd > svgStart) {
      cleaned = cleaned.substring(svgStart, svgEnd + 6);
    }

    return cleaned;
  }

  private extractRetryAfter(err: any): number | null {
    if (err.response?.headers?.get) {
      const header = err.response.headers.get('retry-after');
      if (header) {
        const val = parseInt(header, 10);
        if (!isNaN(val)) return val;
      }
    }
    // Check error message string for "retry after X s"
    const match = err.message?.match(/retry\s+after\s+(\d+)\s*(?:s|seconds)?/i);
    if (match) {
      return parseInt(match[1], 10);
    }
    return null;
  }
}

export function cleanProviderErrorMessage(err: any, modelName?: string): string {
  const msg = err?.message || '';
  if (msg.includes('403') || msg.includes('ACCESS_DENIED') || msg.includes('Permission denied')) {
    return 'Gemini API authentication failed (403 Forbidden). Please check your GEMINI_API_KEY in server/.env (Google AI Studio keys start with "AIzaSy") and ensure the Generative Language API is enabled.';
  }
  if (msg.includes('404') || msg.includes('not found') || msg.includes('is not found')) {
    return `Gemini model "${modelName || 'requested'}" was not found or is unavailable for this API key. Try setting GEMINI_MODEL=gemini-2.5-flash or gemini-1.5-flash in server/.env.`;
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return 'Gemini API rate limit or quota exceeded (429). Please retry in a few moments.';
  }
  if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
    return 'Gemini service is temporarily unavailable (503). Retries were exhausted. Please retry later.';
  }
  if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
    return 'Invalid Google Gemini API key. Please check your GEMINI_API_KEY in server/.env.';
  }
  return msg.replace(/\[GoogleGenerativeAI Error\]:\s*/g, '').trim() || 'Gemini generation failed';
}
