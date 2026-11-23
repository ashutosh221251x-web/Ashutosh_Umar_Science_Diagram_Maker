import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { createRepository } from '../src/repository/index.ts';
import { validateSvg } from '../src/validators/index.ts';

const TEST_DB = path.resolve(process.cwd(), 'data', 'test-diagrams.db');

const SAMPLE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400">
  <title>Pythagoras Test</title>
  <style>
    @keyframes move { from { transform: translateX(0); } to { transform: translateX(10px); } }
    .moving { animation: move 1s infinite alternate; }
  </style>
  <rect x="10" y="10" width="100" height="100" class="moving" />
  <text x="20" y="30">Label A</text>
  <text x="20" y="50">Label B</text>
  <text x="20" y="70">Label C</text>
</svg>
`;

test('Repository: initialization, save diagram, review lifecycle and atomic reset', async () => {
  // Clean up any test db
  if (fs.existsSync(TEST_DB)) {
    fs.unlinkSync(TEST_DB);
  }

  process.env.SQLITE_PATH = TEST_DB;
  delete process.env.DATABASE_URL;

  const repo = createRepository(TEST_DB);
  await repo.init();


  const isHealthy = await repo.healthCheck();
  assert.equal(isHealthy, true, 'Health check should be true');

  // Verify empty diagrams initially
  const initialDiagrams = await repo.getAllDiagrams();
  assert.equal(initialDiagrams.length, 0);

  // 1. Save a diagram that passes checks
  const checks = validateSvg(SAMPLE_SVG);
  const diagram = {
    id: 'pythagoras',
    svg: SAMPLE_SVG,
    checks,
    usage: {
      model: 'gemini-3.5-flash-lite',
      inputTokens: 120,
      outputTokens: 450,
      estimatedCostUsd: 0.000144
    },
    retryCount: 0,
    validationRetryCount: 0,
    apiRetryCount: 0,
    generatedAt: new Date().toISOString(),
    error: null
  };

  const { result, review } = await repo.saveDiagramAndResetReview(diagram, [
    {
      conceptId: 'pythagoras',
      attemptNumber: 1,
      model: 'gemini-3.5-flash-lite',
      inputTokens: 120,
      outputTokens: 450,
      costUsd: 0.000144,
      passed: true,
      checks
    }
  ]);

  assert.equal(result.id, 'pythagoras');
  assert.equal(review.status, 'pending');

  // 2. Fetch diagram
  const fetched = await repo.getDiagram('pythagoras');
  assert.notEqual(fetched, null);
  assert.equal(fetched.id, 'pythagoras');
  assert.equal(fetched.usage.inputTokens, 120);

  // 3. Save review note and approve
  const approvedReview = await repo.saveReview('pythagoras', 'approved', 'Scientifically verified and clear.');
  assert.equal(approvedReview.status, 'approved');
  assert.equal(approvedReview.note, 'Scientifically verified and clear.');

  // 4. Save a failing diagram and verify approval is rejected
  const failingChecks = { ...checks, bounds: { passed: false, reason: 'Exceeded viewBox' } };
  const failingDiagram = {
    ...diagram,
    id: 'circle',
    checks: failingChecks,
    error: 'Validation failed'
  };

  await repo.saveDiagramAndResetReview(failingDiagram);
  await assert.rejects(
    async () => repo.saveReview('circle', 'approved', 'Should fail'),
    /all five validation checks must pass/
  );

  // But rejection is allowed even on failing diagram
  const rejectedReview = await repo.saveReview('circle', 'rejected', 'Failed bounds check');
  assert.equal(rejectedReview.status, 'rejected');

  // 5. Test atomic reset: re-saving pythagoras resets its review to pending
  await repo.saveDiagramAndResetReview(diagram);
  const resetReview = await repo.getReview('pythagoras');
  assert.equal(resetReview.status, 'pending', 'Review must reset to pending on regeneration');
  assert.equal(resetReview.note, 'Scientifically verified and clear.', 'Existing note should be preserved');

  // 6. Reviewing non-existent diagram returns 404
  await assert.rejects(
    async () => repo.saveReview('series', 'approved', 'Does not exist'),
    /no generated diagram exists/
  );

  await repo.close();
  if (fs.existsSync(TEST_DB)) {
    fs.unlinkSync(TEST_DB);
  }
});
