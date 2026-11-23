import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { createApp } from '../src/index.ts';
import { createRepository } from '../src/repository/index.ts';

const TEST_DB = path.resolve(process.cwd(), 'data', 'api-test.db');

test('API endpoints: health, diagrams, reviews and error contracts', async () => {
  if (fs.existsSync(TEST_DB)) {
    fs.unlinkSync(TEST_DB);
  }

  const customRepo = createRepository(TEST_DB);
  const { app, repository } = await createApp(customRepo);

  const server = app.listen(0);
  const port = server.address().port;

  const request = async (method, path, body = null) => {
    const res = await fetch(`http://localhost:${port}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json };
  };

  try {
    // 1. GET /api/health
    const healthRes = await request('GET', '/api/health');
    assert.equal(healthRes.status, 200);
    assert.deepEqual(healthRes.body, { status: 'ok' });

    // 2. GET /api/diagrams (initially empty)
    const diagramsRes = await request('GET', '/api/diagrams');
    assert.equal(diagramsRes.status, 200);
    assert.deepEqual(diagramsRes.body, { results: [] });

    // 3. GET /api/reviews (initially empty)
    const reviewsRes = await request('GET', '/api/reviews');
    assert.equal(reviewsRes.status, 200);
    assert.deepEqual(reviewsRes.body, { reviews: [] });

    // 4. POST /api/diagrams/generate with invalid conceptId returns 400
    const invalidGenRes = await request('POST', '/api/diagrams/generate', { conceptId: 'invalid-concept' });
    assert.equal(invalidGenRes.status, 400);
    assert.equal(invalidGenRes.body.error.code, 'INVALID_REQUEST');

    // 5. PUT /api/diagrams/pythagoras/review when diagram does not exist returns 404
    const notFoundReview = await request('PUT', '/api/diagrams/pythagoras/review', { status: 'approved', note: 'test' });
    assert.equal(notFoundReview.status, 404);
    assert.equal(notFoundReview.body.error.code, 'DIAGRAM_NOT_FOUND');

    // 6. PUT with invalid status returns 400
    const badStatusReview = await request('PUT', '/api/diagrams/pythagoras/review', { status: 'invalid_status', note: 'test' });
    assert.equal(badStatusReview.status, 400);
    assert.equal(badStatusReview.body.error.code, 'INVALID_REQUEST');
  } finally {
    server.close();
    await repository.close();
    if (fs.existsSync(TEST_DB)) {
      try { fs.unlinkSync(TEST_DB); } catch {}
    }
  }
});
