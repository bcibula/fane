/**
 * test/html-escape.test.js
 *
 * Focused coverage for escHtml() (src/web/html-escape.js), extracted from
 * server.js so it can be tested without triggering server.js's top-level
 * side effects (app.listen(), ibkr.connect()).
 *
 * Added because the Recent Decisions "Note" cell on /signals interpolates
 * a human-authored note into a double-quoted title="" attribute. escHtml()
 * previously escaped only &, <, > — safe for text nodes, but a note
 * containing a literal double quote could break out of the attribute.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escHtml } from '../src/web/html-escape.js';

test('escapes double quotes so attribute-context interpolation cannot break out', () => {
  const note = `He said "this might be wrong" and it's worth checking.`;
  const escaped = escHtml(note);

  assert.ok(!escaped.includes('"'), 'no raw double quote must survive escaping');
  assert.equal(
    escaped,
    'He said &quot;this might be wrong&quot; and it&#39;s worth checking.'
  );

  // Simulate the exact server-side usage: interpolated into a
  // double-quoted title attribute.
  const html = `<td class="note-cell" title="${escaped}">${escaped}</td>`;
  assert.equal(
    (html.match(/title="/g) || []).length, 1,
    'the note must not introduce a second title=" and break the attribute boundary'
  );
});

test('still escapes &, <, > as before (text-node safety unchanged)', () => {
  assert.equal(escHtml('<script>alert(1)</script> & co'), '&lt;script&gt;alert(1)&lt;/script&gt; &amp; co');
});

test('empty/falsy input returns empty string', () => {
  assert.equal(escHtml(''), '');
  assert.equal(escHtml(null), '');
  assert.equal(escHtml(undefined), '');
});
