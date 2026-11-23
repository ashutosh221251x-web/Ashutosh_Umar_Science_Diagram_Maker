import { normalizeDiagram, normalizeResults, normalizeReview } from './contracts.js';

// Same-origin by default. Use VITE_API_BASE_URL only for separate frontend/backend hosting.
const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function request(path, { timeoutMs = 15000, ...options } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base}${path}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message = body?.error?.message || (typeof body?.error === 'string' ? body.error : null) || `Request failed (HTTP ${response.status}).`;
      throw new Error(message);
    }
    if (!body) throw new Error('The server returned an empty or invalid JSON response.');
    return body;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The request timed out. Check the backend and try again.');
    if (error instanceof TypeError) throw new Error('Cannot reach the backend. Check its URL and CORS settings.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  health: () => request('/api/health'),
  results: async () => normalizeResults(await request('/api/diagrams')),
  generate: async (conceptId) => {
    const body = await request('/api/diagrams/generate', {
      method: 'POST', body: JSON.stringify({ conceptId }), timeoutMs: 120000
    });
    if (!body.result) throw new Error('Generation response has no result.');
    return { diagram: normalizeDiagram(body.result), review: body.review ? normalizeReview(body.review) : null };
  },
  reviews: async () => {
    const body = await request('/api/reviews');
    if (!Array.isArray(body.reviews)) throw new Error('The server did not return a reviews array.');
    return body.reviews.map(normalizeReview);
  },
  saveReview: async (conceptId, { status, note }) => {
    const body = await request(`/api/diagrams/${encodeURIComponent(conceptId)}/review`, {
      method: 'PUT', body: JSON.stringify({ status, note }), timeoutMs: 15000
    });
    return normalizeReview(body.review);
  }
};
