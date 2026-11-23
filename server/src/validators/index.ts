import { XMLParser } from 'fast-xml-parser';
import { CheckResult, ChecksMap } from '../concepts/index.js';

interface ParsedViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function parseSvgXml(svgString: string): { root: any; error?: string } {
  if (!svgString || typeof svgString !== 'string') {
    return { root: null, error: 'SVG is empty or not a string' };
  }

  // Safe parser with external entities and DTD disabled
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    allowBooleanAttributes: true,
    processEntities: false,
    stopNodes: ['script', 'foreignObject']
  });

  try {
    const parsed = parser.parse(svgString);
    if (!parsed || typeof parsed !== 'object') {
      return { root: null, error: 'Failed to parse XML' };
    }
    const rootKey = Object.keys(parsed).find(k => k.toLowerCase() === 'svg');
    if (!rootKey) {
      return { root: null, error: 'Root element is not <svg>' };
    }
    return { root: parsed[rootKey] };
  } catch (err: any) {
    return { root: null, error: `XML parse error: ${err.message}` };
  }
}

/** Check 1: svg_parse - Valid namespace-aware XML, safe parser with no DTD/entity resolution */
export function validateSvgParse(svgString: string): CheckResult {
  if (!svgString || typeof svgString !== 'string') {
    return { passed: false, reason: 'Empty SVG content' };
  }

  // Disallow DTD and entity declarations
  if (/<!DOCTYPE/i.test(svgString) || /<!ENTITY/i.test(svgString)) {
    return { passed: false, reason: 'DTD and entity declarations are strictly forbidden for security' };
  }

  const { root, error } = parseSvgXml(svgString);
  if (error || !root) {
    return { passed: false, reason: error || 'Invalid SVG XML structure' };
  }

  const xmlns = root['@_xmlns'];
  if (!xmlns || !xmlns.includes('http://www.w3.org/2000/svg')) {
    return { passed: false, reason: 'Missing standard SVG namespace (xmlns="http://www.w3.org/2000/svg")' };
  }

  const viewBox = root['@_viewBox'] || root['@_viewbox'];
  if (!viewBox) {
    return { passed: false, reason: 'Missing viewBox attribute on root <svg>' };
  }

  const parts = String(viewBox).trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some(n => isNaN(n)) || parts[2] <= 0 || parts[3] <= 0) {
    return { passed: false, reason: `Invalid viewBox format: "${viewBox}" (expected minX minY width height)` };
  }

  return { passed: true, reason: `Valid SVG XML with standard namespace and viewBox (${viewBox})` };
}

/** Check 2: bounds - All visible elements fit within the viewBox */
export function validateBounds(svgString: string): CheckResult {
  const vbMatch = svgString.match(/viewBox\s*=\s*["']([^"']+)["']/i);
  if (!vbMatch) {
    return { passed: false, reason: 'Cannot validate bounds: viewBox attribute missing' };
  }

  const vbParts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
  if (vbParts.length !== 4 || vbParts.some(n => isNaN(n))) {
    return { passed: false, reason: 'Cannot validate bounds: invalid viewBox numbers' };
  }

  const [minX, minY, width, height] = vbParts;
  const maxX = minX + width;
  const maxY = minY + height;
  const margin = 10; // allow small margin for strokes or typography cap-height

  // Strip <defs>...</defs> block so local coordinate templates/markers don't trigger false bounds errors
  const renderedContent = svgString.replace(/<defs\b[^>]*>[\s\S]*?<\/defs>/gi, '');

  // Extract coordinates from geometric elements
  const violations: string[] = [];

  // Check <rect x y width height>
  const rectMatches = renderedContent.matchAll(/<rect\b([^>]*)\/?>/gi);
  for (const m of rectMatches) {
    const attrs = m[1];
    const x = parseFloat(attrs.match(/\bx\s*=\s*["']([^"']+)["']/i)?.[1] || '0');
    const y = parseFloat(attrs.match(/\by\s*=\s*["']([^"']+)["']/i)?.[1] || '0');
    const w = parseFloat(attrs.match(/\bwidth\s*=\s*["']([^"']+)["']/i)?.[1] || '0');
    const h = parseFloat(attrs.match(/\bheight\s*=\s*["']([^"']+)["']/i)?.[1] || '0');
    if (!isNaN(x) && !isNaN(y) && !isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      if (x < minX - margin || y < minY - margin || (x + w) > maxX + margin || (y + h) > maxY + margin) {
        violations.push(`<rect> bounds [${x}, ${y}, ${x + w}, ${y + h}] exceed viewBox [${minX}, ${minY}, ${maxX}, ${maxY}]`);
      }
    }
  }

  // Check <circle cx cy r>
  const circleMatches = renderedContent.matchAll(/<circle\b([^>]*)\/?>/gi);
  for (const m of circleMatches) {
    const attrs = m[1];
    const cx = parseFloat(attrs.match(/\bcx\s*=\s*["']([^"']+)["']/i)?.[1] || '0');
    const cy = parseFloat(attrs.match(/\bcy\s*=\s*["']([^"']+)["']/i)?.[1] || '0');
    const r = parseFloat(attrs.match(/\br\s*=\s*["']([^"']+)["']/i)?.[1] || '0');
    if (!isNaN(cx) && !isNaN(cy) && !isNaN(r) && r > 0) {
      if ((cx - r) < minX - margin || (cy - r) < minY - margin || (cx + r) > maxX + margin || (cy + r) > maxY + margin) {
        violations.push(`<circle> bounds [${cx - r}, ${cy - r}, ${cx + r}, ${cy + r}] exceed viewBox [${minX}, ${minY}, ${maxX}, ${maxY}]`);
      }
    }
  }

  // Check <ellipse cx cy rx ry>
  const ellipseMatches = renderedContent.matchAll(/<ellipse\b([^>]*)\/?>/gi);
  for (const m of ellipseMatches) {
    const attrs = m[1];
    const cx = parseFloat(attrs.match(/\bcx\s*=\s*["']([^"']+)["']/i)?.[1] || '0');
    const cy = parseFloat(attrs.match(/\bcy\s*=\s*["']([^"']+)["']/i)?.[1] || '0');
    const rx = parseFloat(attrs.match(/\brx\s*=\s*["']([^"']+)["']/i)?.[1] || '0');
    const ry = parseFloat(attrs.match(/\bry\s*=\s*["']([^"']+)["']/i)?.[1] || '0');
    if (!isNaN(cx) && !isNaN(cy) && !isNaN(rx) && !isNaN(ry)) {
      if ((cx - rx) < minX - margin || (cy - ry) < minY - margin || (cx + rx) > maxX + margin || (cy + ry) > maxY + margin) {
        violations.push(`<ellipse> bounds exceed viewBox [${minX}, ${minY}, ${maxX}, ${maxY}]`);
      }
    }
  }

  // Check <line x1 y1 x2 y2>
  const lineMatches = renderedContent.matchAll(/<line\b([^>]*)\/?>/gi);
  for (const m of lineMatches) {
    const attrs = m[1];
    const x1 = parseFloat(attrs.match(/\bx1\s*=\s*["']([^"']+)["']/i)?.[1] || '0');
    const y1 = parseFloat(attrs.match(/\by1\s*=\s*["']([^"']+)["']/i)?.[1] || '0');
    const x2 = parseFloat(attrs.match(/\bx2\s*=\s*["']([^"']+)["']/i)?.[1] || '0');
    const y2 = parseFloat(attrs.match(/\by2\s*=\s*["']([^"']+)["']/i)?.[1] || '0');
    if ([x1, x2].some(x => x < minX - margin || x > maxX + margin) ||
        [y1, y2].some(y => y < minY - margin || y > maxY + margin)) {
      violations.push(`<line> points [${x1},${y1}]->[${x2},${y2}] exceed viewBox`);
    }
  }

  // Check <polygon> / <polyline points="...">
  const polyMatches = renderedContent.matchAll(/<(?:polygon|polyline)\b([^>]*)\/?>/gi);
  for (const m of polyMatches) {
    const pointsAttr = m[1].match(/\bpoints\s*=\s*["']([^"']+)["']/i)?.[1];
    if (pointsAttr) {
      const coords = pointsAttr.trim().split(/[\s,]+/).map(Number);
      for (let i = 0; i < coords.length; i += 2) {
        const x = coords[i];
        const y = coords[i + 1];
        if (!isNaN(x) && !isNaN(y)) {
          if (x < minX - margin || x > maxX + margin || y < minY - margin || y > maxY + margin) {
            violations.push(`Polygon point [${x}, ${y}] outside viewBox`);
            break;
          }
        }
      }
    }
  }

  // Check <text x y>
  const textMatches = renderedContent.matchAll(/<text\b([^>]*?)>/gi);
  for (const m of textMatches) {
    const attrs = m[1];
    const x = parseFloat(attrs.match(/\bx\s*=\s*["']([^"']+)["']/i)?.[1] || '0');
    const y = parseFloat(attrs.match(/\by\s*=\s*["']([^"']+)["']/i)?.[1] || '0');
    if (!isNaN(x) && !isNaN(y)) {
      if (x < minX - margin || x > maxX + margin || y < minY - margin || y > maxY + margin) {
        violations.push(`<text> coordinate [${x}, ${y}] outside viewBox`);
      }
    }
  }

  // Check path coordinates
  const pathMatches = renderedContent.matchAll(/<path\b([^>]*)\/?>/gi);
  for (const m of pathMatches) {
    const d = m[1].match(/\bd\s*=\s*["']([^"']+)["']/i)?.[1];
    if (d) {
      // Extract numbers following commands
      const numbers = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
      // If coordinates are clearly extreme (> 2x viewBox dimension), mark violation
      for (const num of numbers) {
        if (num < minX - width || num > maxX + width) {
          violations.push(`Path coordinate ${num} significantly outside viewBox width`);
          break;
        }
      }
    }
  }

  if (violations.length > 0) {
    return {
      passed: false,
      reason: `Elements outside viewBox [${minX}, ${minY}, ${width}, ${height}]: ${violations.slice(0, 2).join('; ')}`
    };
  }

  return { passed: true, reason: `All measured geometric elements fit inside viewBox (${minX} ${minY} ${width} ${height})` };
}

/** Check 3: labels - At least one nonempty <title> and at least three distinct visible nonempty <text> labels */
export function validateLabels(svgString: string): CheckResult {
  // Title check
  const titleMatch = svgString.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const titleText = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  if (!titleText) {
    return { passed: false, reason: 'Missing non-empty <title> element in SVG' };
  }

  // Text labels check
  const textMatches = svgString.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi);
  const labels = new Set<string>();

  for (const m of textMatches) {
    // Strip nested tags like <tspan> to get text content
    const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length > 0) {
      labels.add(text);
    }
  }

  if (labels.size < 3) {
    return {
      passed: false,
      reason: `Found title "${titleText}" but only ${labels.size} distinct text label(s) (minimum 3 required)`
    };
  }

  const sampleLabels = Array.from(labels).slice(0, 4).join(', ');
  return {
    passed: true,
    reason: `Title "${titleText}" and ${labels.size} distinct text labels found (${sampleLabels})`
  };
}

/** Check 4: animation - An actual SMIL animation element or CSS keyframes used by an SVG element */
export function validateAnimation(svgString: string): CheckResult {
  // 1. SMIL animation elements
  const smilMatch = svgString.match(/<(animate|animateMotion|animateTransform|set)\b[^>]*>/i);
  if (smilMatch) {
    return { passed: true, reason: `SMIL animation element <${smilMatch[1]}> detected` };
  }

  // 2. CSS animation via @keyframes and animation property
  const keyframesMatch = svgString.match(/@keyframes\s+([a-zA-Z0-9_-]+)/i);
  if (keyframesMatch) {
    const keyframeName = keyframesMatch[1];
    // Verify that the animation is actually applied to an element via animation property
    const animApplied = new RegExp(`animation\\s*:[^;}]*\\b${keyframeName}\\b`, 'i').test(svgString) ||
      new RegExp(`animation-name\\s*:[^;}]*\\b${keyframeName}\\b`, 'i').test(svgString);

    if (animApplied) {
      return { passed: true, reason: `CSS keyframe animation "${keyframeName}" defined and applied` };
    }
    return { passed: false, reason: `@keyframes "${keyframeName}" found but not applied to any SVG element` };
  }

  return { passed: false, reason: 'No SMIL animation (<animate>, <animateMotion>, etc.) or CSS keyframes detected' };
}

/** Check 5: safety - Strictly reject scripts, event handlers, foreignObject, external resources, dangerous URLs */
export function validateSafety(svgString: string): CheckResult {
  const issues: string[] = [];

  // Reject <script>
  if (/<script\b/i.test(svgString)) {
    issues.push('<script> tags are strictly forbidden');
  }

  // Reject event handlers: onload, onclick, onmouseover, onerror, etc.
  const eventHandlerMatch = svgString.match(/\s(on[a-z]{3,20})\s*=/i);
  if (eventHandlerMatch) {
    issues.push(`Inline event handler attribute "${eventHandlerMatch[1]}" forbidden`);
  }

  // Reject <foreignObject>
  if (/<foreignObject\b/i.test(svgString)) {
    issues.push('<foreignObject> is strictly forbidden');
  }

  // Reject external images or external fonts
  if (/<(?:image|use)\b[^>]*\b(?:href|xlink:href)\s*=\s*["'](https?:|\/\/|data:|javascript:)[^"']*["']/i.test(svgString)) {
    issues.push('External or script URLs in href/xlink:href are forbidden');
  }

  // Reject javascript: URLs anywhere
  if (/javascript\s*:/i.test(svgString)) {
    issues.push('javascript: URLs are forbidden');
  }

  // Reject CSS @import
  if (/@import\b/i.test(svgString)) {
    issues.push('CSS @import is forbidden');
  }

  // Reject external url(...) in CSS styles or attributes
  if (/url\s*\(\s*["']?(https?:|\/\/|data:)/i.test(svgString)) {
    issues.push('External url(...) references forbidden in CSS');
  }

  if (issues.length > 0) {
    return { passed: false, reason: issues.join('; ') };
  }

  return { passed: true, reason: 'Strict SVG safety verified: no scripts, foreignObject, event handlers or external resources' };
}

/** Execute all five checks independently */
export function validateSvg(svgString: string): ChecksMap {
  return {
    svg_parse: validateSvgParse(svgString),
    bounds: validateBounds(svgString),
    labels: validateLabels(svgString),
    animation: validateAnimation(svgString),
    safety: validateSafety(svgString)
  };
}

export function areAllChecksPassed(checks: ChecksMap): boolean {
  return Object.values(checks).every(c => c.passed);
}
