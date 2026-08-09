/**
 * src/web/html-escape.js
 *
 * escHtml() escapes a string for safe interpolation into HTML — both
 * text-node content and double-quoted attribute values (e.g. title="...").
 * Extracted into its own module (out of server.js) so it can be unit
 * tested without pulling in server.js's top-level side effects
 * (app.listen(), ibkr.connect()).
 */

export function escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
