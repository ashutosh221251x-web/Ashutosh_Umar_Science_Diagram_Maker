import bundledResults from '../../results.json';
import { normalizeResults } from './contracts.js';

const KEY = 'udhi-real-generated-results-v1';

export function loadSavedResults() {
  let bundled = [];
  try { bundled = normalizeResults(bundledResults); }
  catch (error) { console.error('Invalid committed results.json', error); }

  // Only cache diagrams that were returned by the real API, never demo/sample data.
  let local = [];
  try { local = normalizeResults(JSON.parse(localStorage.getItem(KEY) || '{"results":[]}')); }
  catch { localStorage.removeItem(KEY); }

  const merged = new Map(bundled.map((item) => [item.id, item]));
  for (const item of local) {
    const old = merged.get(item.id);
    if (!old || (Date.parse(item.generatedAt || 0) > Date.parse(old.generatedAt || 0))) merged.set(item.id, item);
  }
  return Array.from(merged.values());
}

export function cacheRealResults(results) {
  try { localStorage.setItem(KEY, JSON.stringify({ schemaVersion: 1, results })); }
  catch (error) { console.warn('Local results cache unavailable', error); }
}
