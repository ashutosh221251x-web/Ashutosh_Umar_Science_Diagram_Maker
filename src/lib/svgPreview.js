/**
 * Render model-authored SVG in an origin-isolated, script-free iframe.
 * This is a defence-in-depth measure, NOT a substitute for server SVG validation.
 * SMIL animations and inline CSS animation remain available.
 */
export function svgFrameDocument(svg) {
  if (!svg) return '';
  const csp = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}body{display:flex;align-items:center;justify-content:center}svg{display:block;width:100%;height:100%;max-width:100%;max-height:100%}</style></head><body>${svg}</body></html>`;
}
