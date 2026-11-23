import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKS, CONCEPTS } from '../src/concepts.js';
import { checksPassed, normalizeDiagram, normalizeResults, normalizeReview } from '../src/lib/contracts.js';
import { svgFrameDocument } from '../src/lib/svgPreview.js';

// Test fixtures for contract validation
function fixture(id = 'pythagoras', passed = true) {

  return {
    id, svg: '<svg xmlns="http://www.w3.org/2000/svg"><title>Test</title></svg>',
    checks: Object.fromEntries(CHECKS.map(({ id: key }) => [key, { passed, reason: 'Test assertion' }])),
    usage: { model: 'test-only', inputTokens: 3, outputTokens: 5, estimatedCostUsd: 0 },
    retryCount: 0, validationRetryCount: 0, apiRetryCount: 0
  };
}

test('assignment defines exactly the five required concepts, with distinct IDs', () => {
  assert.deepEqual(CONCEPTS.map((c) => c.id), ['pythagoras', 'circle', 'series', 'photosynthesis', 'matter']);
  assert.equal(new Set(CONCEPTS.map((c) => c.id)).size, 5);
  assert.equal(CHECKS.length, 5);
});
test('accepts the specified real-result API object shape', () => {
  const result = normalizeDiagram(fixture());
  assert.equal(result.id, 'pythagoras');
  assert.equal(checksPassed(result), true);
  assert.equal(result.usage.outputTokens, 5);
});
test('fails closed when a validation check is omitted', () => {
  const entry = fixture();
  delete entry.checks.safety;
  assert.throws(() => normalizeDiagram(entry), /Missing safety/);
});
test('rejects unknown concept, duplicate IDs and invented negative cost', () => {
  assert.throws(() => normalizeDiagram(fixture('unknown')), /unknown diagram ID/);
  assert.throws(() => normalizeResults({ results: [fixture(), fixture()] }), /Duplicate concept/);
  const entry = fixture(); entry.usage.estimatedCostUsd = -1;
  assert.throws(() => normalizeDiagram(entry), /Invalid estimatedCostUsd/);
});
test('failed checks are not silently counted as passed', () => {
  const entry = fixture('circle'); entry.checks.bounds.passed = false;
  assert.equal(checksPassed(normalizeDiagram(entry)), false);
});
test('review status is constrained to pending, approved, rejected', () => {
  assert.equal(normalizeReview({ conceptId:'circle', status:'pending', note:'' }).status, 'pending');
  assert.throws(() => normalizeReview({ conceptId:'circle', status:'done', note:'' }), /Invalid review status/);
});
test('SVG display frame isolates execution and blocks network content', () => {
  const source = svgFrameDocument('<svg></svg>');
  assert.match(source, /script-src 'none'/);
  assert.match(source, /connect-src 'none'/);
  assert.match(source, /<svg><\/svg>/);
});
