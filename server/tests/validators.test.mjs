import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSvgParse,
  validateBounds,
  validateLabels,
  validateAnimation,
  validateSafety,
  validateSvg,
  areAllChecksPassed
} from '../src/validators/index.ts';

const VALID_SAMPLE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="100%" height="100%">
  <title>Pythagoras Theorem Proof</title>
  <style>
    @keyframes pulse { 0% { opacity: 0.8; } 50% { opacity: 1; } 100% { opacity: 0.8; } }
    .anim-pulse { animation: pulse 2s infinite ease-in-out; }
  </style>
  <rect x="50" y="50" width="200" height="150" fill="#e8f4f2" stroke="#244b54" stroke-width="2" />
  <circle cx="300" cy="200" r="40" fill="#4a7c59" class="anim-pulse" />
  <line x1="50" y1="200" x2="250" y2="50" stroke="#c05621" stroke-width="3" />
  <text x="70" y="80" font-size="14" fill="#1a202c">Side a = 3</text>
  <text x="180" y="160" font-size="14" fill="#1a202c">Side b = 4</text>
  <text x="280" y="120" font-size="14" fill="#1a202c">Hypotenuse c = 5</text>
</svg>
`;

test('Validator: valid SVG passes all 5 checks', () => {
  const checks = validateSvg(VALID_SAMPLE_SVG);
  assert.equal(checks.svg_parse.passed, true);
  assert.equal(checks.bounds.passed, true);
  assert.equal(checks.labels.passed, true);
  assert.equal(checks.animation.passed, true);
  assert.equal(checks.safety.passed, true);
  assert.equal(areAllChecksPassed(checks), true);
});

test('Validator: svg_parse rejects invalid XML and missing viewBox', () => {
  assert.equal(validateSvgParse('<svg>broken unclosed').passed, false);
  assert.equal(validateSvgParse('<svg xmlns="http://www.w3.org/2000/svg"><title>No viewBox</title></svg>').passed, false);
  assert.equal(validateSvgParse('<!DOCTYPE svg SYSTEM "http://evil.com"><svg></svg>').passed, false);
});

test('Validator: bounds catches out-of-bounds geometric elements', () => {
  const outOfBoundsSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
      <circle cx="500" cy="150" r="50" fill="red" />
    </svg>
  `;
  const res = validateBounds(outOfBoundsSvg);
  assert.equal(res.passed, false);
  assert.match(res.reason, /exceed viewBox/);
});

test('Validator: labels checks for non-empty title and at least 3 distinct labels', () => {
  const missingTitleSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
      <text x="10" y="20">Label 1</text>
      <text x="10" y="40">Label 2</text>
      <text x="10" y="60">Label 3</text>
    </svg>
  `;
  assert.equal(validateLabels(missingTitleSvg).passed, false);

  const fewLabelsSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
      <title>Valid Title</title>
      <text x="10" y="20">Label 1</text>
      <text x="10" y="40">Label 2</text>
    </svg>
  `;
  const fewRes = validateLabels(fewLabelsSvg);
  assert.equal(fewRes.passed, false);
  assert.match(fewRes.reason, /minimum 3 required/);
});

test('Validator: animation detects SMIL and CSS keyframes, rejects static SVGs', () => {
  const smilSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
      <circle cx="100" cy="100" r="20">
        <animate attributeName="r" values="20;30;20" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  `;
  assert.equal(validateAnimation(smilSvg).passed, true);

  const staticSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
      <circle cx="100" cy="100" r="20" fill="blue" />
    </svg>
  `;
  assert.equal(validateAnimation(staticSvg).passed, false);
});

test('Validator: safety rejects script tags, event handlers, foreignObject, and remote hrefs', () => {
  const scriptSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><script>alert(1)</script></svg>`;
  assert.equal(validateSafety(scriptSvg).passed, false);

  const onclickSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect x="0" y="0" width="10" height="10" onclick="alert(1)" /></svg>`;
  assert.equal(validateSafety(onclickSvg).passed, false);

  const foreignSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><foreignObject width="100" height="100"><iframe src="http://evil.com"></iframe></foreignObject></svg>`;
  assert.equal(validateSafety(foreignSvg).passed, false);

  const remoteImageSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><image href="http://evil.com/img.png" /></svg>`;
  assert.equal(validateSafety(remoteImageSvg).passed, false);
});
