import express from 'express';
import { getDb } from '../db/schema.js';
import { config } from 'dotenv';
import { marked } from 'marked';
import { now } from '../utils/time.js';
import Anthropic from '@anthropic-ai/sdk';
import ibkr from '../ibkr/connection.js';
import { getAccountSnapshot } from '../ibkr/account.js';
import { submitOrder } from '../ibkr/orders.js';
config();

const app = express();
const PORT = 3000;
app.use(express.json());

ibkr.connect();
ibkr.on('disconnected', () =>
  console.log(`[${now()}] Web: IBKR disconnected — approval routes unavailable.`)
);
ibkr.on('killed', ({ reason }) =>
  console.error(`[${now()}] Web: Kill token fired — ${reason}`)
);

// ── Shared HTML helpers ──────────────────────────────────────────────────────

function annotationStyles() {
  return `
    .annotation-highlight {
      background: var(--highlight-bg);
      border-bottom: 2px solid var(--highlight-border);
      cursor: pointer;
      position: relative;
    }
    .annotation-highlight:hover { background: var(--highlight-hover); }

    #ann-float-btn {
      display: none;
      position: fixed;
      z-index: 100;
      background: var(--btn-bg);
      color: var(--btn-text);
      border: none;
      border-radius: 4px;
      padding: 5px 12px;
      font-size: 13px;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    }
    #ann-float-btn:hover { background: var(--btn-bg-hover); }

    #ann-panel {
      display: none;
      position: fixed;
      right: 24px;
      top: 80px;
      width: 360px;
      background: var(--surface);
      border: 1px solid var(--border-input);
      border-radius: 10px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.13);
      z-index: 200;
      padding: 20px;
      font-size: 14px;
    }
    #ann-panel h4 { margin: 0 0 10px 0; font-size: 15px; color: var(--text-strong); }
    #ann-quoted {
      background: var(--surface-inset);
      border-left: 3px solid var(--highlight-border);
      padding: 8px 12px;
      margin-bottom: 12px;
      font-size: 13px;
      color: var(--text-secondary);
      border-radius: 3px;
      max-height: 80px;
      overflow-y: auto;
      font-style: italic;
    }
    #ann-note {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--border-input);
      border-radius: 5px;
      padding: 8px;
      font-size: 14px;
      resize: vertical;
      min-height: 70px;
      font-family: inherit;
      background: var(--surface);
      color: var(--text);
    }
    #ann-note:focus { outline: none; border-color: var(--border-focus); }
    #ann-submit {
      margin-top: 10px;
      background: var(--btn-bg);
      color: var(--btn-text);
      border: none;
      border-radius: 5px;
      padding: 8px 18px;
      font-size: 14px;
      cursor: pointer;
      width: 100%;
    }
    #ann-submit:hover { background: var(--btn-bg-hover); }
    #ann-submit:disabled { background: #aaa; cursor: not-allowed; }
    #ann-close {
      position: absolute;
      top: 12px; right: 14px;
      background: none; border: none;
      font-size: 18px; cursor: pointer; color: var(--text-muted);
    }
    #ann-close:hover { color: var(--text-strong); }
    #ann-response {
      margin-top: 14px;
      background: var(--surface-ai);
      border-radius: 6px;
      padding: 12px;
      font-size: 13px;
      line-height: 1.6;
      color: var(--text);
      display: none;
      max-height: 260px;
      overflow-y: auto;
    }
    #ann-spinner {
      display: none;
      margin-top: 10px;
      text-align: center;
      color: var(--text-muted);
      font-size: 13px;
    }

    .ann-thread {
      margin-top: 32px;
      border-top: 1px solid var(--border);
      padding-top: 20px;
    }
    .ann-thread h3 { font-size: 15px; color: var(--text-secondary); margin-bottom: 16px; }
    .ann-item {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 14px;
    }
    .ann-item-quote {
      font-style: italic;
      color: var(--text-muted);
      font-size: 12px;
      border-left: 3px solid var(--highlight-border);
      padding-left: 8px;
      margin-bottom: 8px;
    }
    .ann-item-note { font-weight: 600; font-size: 14px; margin-bottom: 6px; }
    .ann-item-response { font-size: 13px; line-height: 1.6; color: var(--text); }
    .ann-item-meta { font-size: 11px; color: var(--text-faint); margin-top: 8px; }
  `;
}

function annotationScript(briefingDate, briefingText) {
  // briefingText passed as JSON-safe string for the Claude context call
  const safeDate = JSON.stringify(briefingDate);
  const safeText = JSON.stringify(briefingText);
  return `
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <div id="ann-float-btn-wrap">
    <button id="ann-float-btn">Annotate</button>
  </div>
  <div id="ann-panel">
    <button id="ann-close" title="Close">×</button>
    <h4>Add Annotation</h4>
    <div id="ann-quoted"></div>
    <textarea id="ann-note" placeholder="Your question or note…"></textarea>
    <button id="ann-submit">Submit</button>
    <div id="ann-spinner">Fane is thinking…</div>
    <div id="ann-response"></div>
  </div>

  <script>
    (function() {
      const briefingDate = ${safeDate};
      const briefingText = ${safeText};

      let selectedText = '';
      const floatBtn   = document.getElementById('ann-float-btn');
      const panel      = document.getElementById('ann-panel');
      const quotedEl   = document.getElementById('ann-quoted');
      const noteEl     = document.getElementById('ann-note');
      const submitBtn  = document.getElementById('ann-submit');
      const closeBtn   = document.getElementById('ann-close');
      const spinner    = document.getElementById('ann-spinner');
      const responseEl = document.getElementById('ann-response');

      // Shared logic: check selection and show/position float button
      function handleSelectionChange() {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) { floatBtn.style.display = 'none'; return; }
        const text = sel.toString().trim();
        if (!text || text.length < 5) { floatBtn.style.display = 'none'; return; }

        // Only trigger if selection is inside .briefing
        const briefingEl = document.querySelector('.briefing');
        if (!briefingEl) return;
        const anchorNode = sel.anchorNode;
        const container = anchorNode?.nodeType === 3 ? anchorNode.parentElement : anchorNode;
        if (!container?.closest('.briefing')) { floatBtn.style.display = 'none'; return; }

        selectedText = text;
        const range = sel.getRangeAt(0);
        const rect  = range.getBoundingClientRect();
        floatBtn.style.display = 'block';
        floatBtn.style.left = rect.left + 'px';
        floatBtn.style.top  = (rect.bottom + 6) + 'px';
      }

      // Desktop: mouseup fires once after selection ends
      document.addEventListener('mouseup', handleSelectionChange);

      // Mobile (iOS Safari): selectionchange fires continuously during drag,
      // so debounce to only act once the selection settles.
      let selectionChangeTimer = null;
      document.addEventListener('selectionchange', () => {
        clearTimeout(selectionChangeTimer);
        selectionChangeTimer = setTimeout(handleSelectionChange, 175);
      });

      floatBtn.addEventListener('click', () => {
        floatBtn.style.display = 'none';
        quotedEl.textContent = selectedText;
        noteEl.value = '';
        responseEl.style.display = 'none';
        responseEl.innerHTML = '';
        spinner.style.display = 'none';
        panel.style.display = 'block';
        noteEl.focus();
      });

      closeBtn.addEventListener('click', () => {
        panel.style.display = 'none';
        selectedText = '';
        noteEl.value = '';
        responseEl.style.display = 'none';
        responseEl.innerHTML = '';
        submitBtn.textContent = 'Submit';
        submitBtn.style.background = '';
        submitBtn.disabled = false;
        document.getElementById('ann-again')?.remove();
      });

      // Submit on Enter (without shift), allow shift+enter for newline
      noteEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          submitBtn.click();
        }
      });

      submitBtn.addEventListener('click', async () => {
        const note = noteEl.value.trim();
        if (!note || !selectedText) return;

        submitBtn.disabled = true;
        spinner.style.display = 'block';
        responseEl.style.display = 'none';

        try {
          const res = await fetch('/annotations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              briefing_date: briefingDate,
              selected_text: selectedText,
              note: note,
              briefing_text: briefingText
            })
          });
          const data = await res.json();
          if (data.ai_response) {
            responseEl.innerHTML = marked.parse(data.ai_response);
            responseEl.style.display = 'block';
            appendThread(selectedText, note, data.ai_response, 'just now');
            submitBtn.textContent = 'Saved ✓';
            submitBtn.style.background = '#1a7f3c';
            spinner.style.display = 'none';
            const againEl = document.createElement('div');
            againEl.id = 'ann-again';
            againEl.style.cssText = 'margin-top:10px;text-align:center;font-size:12px;';
            againEl.innerHTML = '<a href="#" style="color:#888;text-decoration:none;">Annotate another passage →</a>';
            againEl.addEventListener('click', (e) => {
              e.preventDefault();
              againEl.remove();
              noteEl.value = '';
              responseEl.style.display = 'none';
              responseEl.innerHTML = '';
              submitBtn.textContent = 'Submit';
              submitBtn.style.background = '';
              submitBtn.disabled = false;
              selectedText = '';
              quotedEl.textContent = '';
              panel.style.display = 'none';
            });
            responseEl.insertAdjacentElement('afterend', againEl);
            return;
          } else {
            responseEl.innerHTML = 'Error: ' + (data.error || 'Unknown error');
            responseEl.style.display = 'block';
          }
        } catch (err) {
          responseEl.innerHTML = 'Network error. Please try again.';
          responseEl.style.display = 'block';
        } finally {
          submitBtn.disabled = false;
          spinner.style.display = 'none';
        }
      });

      function appendThread(quote, note, response, meta) {
        let thread = document.querySelector('.ann-thread');
        if (!thread) {
          thread = document.createElement('div');
          thread.className = 'ann-thread';
          thread.innerHTML = '<h3>Annotations</h3>';
          document.querySelector('.briefing').insertAdjacentElement('afterend', thread);
        }
        const item = document.createElement('div');
        item.className = 'ann-item';
        item.innerHTML =
          '<div class="ann-item-quote">' + escHtml(quote) + '</div>' +
          '<div class="ann-item-note">' + escHtml(note) + '</div>' +
          '<div class="ann-item-response">' + escHtml(response) + '</div>' +
          '<div class="ann-item-meta">' + escHtml(meta) + '</div>';
        thread.appendChild(item);
      }

      function escHtml(s) {
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      }
    })();
  </script>
  `;
}

function renderAnnotationThread(annotations) {
  if (!annotations || annotations.length === 0) return '';
  const items = annotations.map(a => `
    <div class="ann-item">
      <div class="ann-item-quote">${escHtml(a.selected_text)}</div>
      <div class="ann-item-note">${escHtml(a.note)}</div>
      <div class="ann-item-response">${escHtml(a.ai_response || '')}</div>
      <div class="ann-item-meta">${a.created_at}</div>
    </div>
  `).join('');
  return `<div class="ann-thread"><h3>Annotations</h3>${items}</div>`;
}

function escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function navHtml(current = '') {
  const connected = ibkr.isConnected;
  const killed    = ibkr.isKilled;
  const dotColor  = (killed || !connected) ? '#e53e3e' : '#38a169';
  const dotLabel  = killed ? 'KILLED' : connected ? 'Connected' : 'Disconnected';
 
  const pages = [
    ['/',          'Briefing'],
    ['/signals',   'Signals'],
    ['/positions', 'Positions'],
    ['/trades',    'Trades'],
  ];
 
  const links = pages.map(([href, label]) =>
    `<a href="${href}" style="color:${current===href?'var(--text-strong)':'var(--text-dim)'};font-weight:${current===href?'600':'400'};text-decoration:none;">${label}</a>`
  ).join('');

  return `
    <nav style="display:flex;align-items:center;gap:20px;padding:12px 0;border-bottom:1px solid var(--border);margin-bottom:28px;">
      <span style="font-weight:700;color:var(--text-strong);">Fane</span>
      ${links}
      <span style="margin-left:auto;display:flex;align-items:center;gap:8px;">
        <span style="width:8px;height:8px;border-radius:50%;background:${dotColor};display:inline-block;"></span>
        <span style="font-size:12px;color:var(--text-muted);">IBKR: ${dotLabel}</span>
        ${!killed
          ? `<button onclick="confirmKill()" style="margin-left:8px;border:1px solid #e53e3e;color:#e53e3e;background:none;border-radius:4px;padding:3px 10px;font-size:12px;cursor:pointer;">Kill</button>`
          : `<strong style="margin-left:8px;font-size:12px;color:#e53e3e;">KILL ACTIVE — restart required</strong>`
        }
      </span>
    </nav>
    <script>
      function confirmKill() {
        const reason = prompt('Kill token reason (required):');
        if (!reason?.trim()) return;
        if (!confirm('This stops all IBKR activity for this session.\\nProcess restart required to reconnect.\\n\\nConfirm?')) return;
        fetch('/api/kill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reason.trim() })
        }).then(r => r.json()).then(() => location.reload());
      }
    </script>`;
}
 
// Shared page shell with base CSS used by all Stage 2 routes.
// The existing / and /briefing/:date routes keep their own styles — no changes needed there.
function pageShell(title, current, body) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Fane — ${title}</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    :root {
      --bg: #fafafa;
      --surface: #fff;
      --surface-inset: #f7f7f7;
      --surface-sunken: #f9f9f9;
      --surface-hover: #f5f5f5;
      --surface-ai: #f0f7ff;
      --border: #eee;
      --border-subtle: #f0f0f0;
      --border-input: #ddd;
      --border-focus: #aaa;
      --text-strong: #111;
      --text: #333;
      --text-secondary: #555;
      --text-dim: #666;
      --text-muted: #888;
      --text-subtle: #999;
      --text-xfaint: #aaa;
      --text-faint: #bbb;
      --highlight-bg: #fff3cd;
      --highlight-border: #f0a500;
      --highlight-hover: #ffe9a0;
      --btn-bg: #111;
      --btn-bg-hover: #333;
      --btn-text: #fff;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #111;
        --surface: #1a1a1a;
        --surface-inset: #222;
        --surface-sunken: #222;
        --surface-hover: #2a2a2a;
        --surface-ai: #0d1a2e;
        --border: #2a2a2a;
        --border-subtle: #222;
        --border-input: #333;
        --border-focus: #666;
        --text-strong: #f0f0f0;
        --text: #ccc;
        --text-secondary: #aaa;
        --text-dim: #888;
        --text-muted: #666;
        --text-subtle: #555;
        --text-xfaint: #555;
        --text-faint: #444;
        --highlight-bg: #2a2000;
        --highlight-border: #b87800;
        --highlight-hover: #3a2e00;
        --btn-bg: #e0e0e0;
        --btn-bg-hover: #c0c0c0;
        --btn-text: #111;
      }
    }
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: sans-serif; max-width: 820px; margin: 0 auto; padding: 20px 20px 60px; color: var(--text); background: var(--bg); }
    h1 { font-size: 22px; color: var(--text-strong); margin: 0 0 4px; }
    h2 { font-size: 17px; color: var(--text-strong); margin: 0 0 14px; }
    .meta { color: var(--text-muted); font-size: 13px; margin-bottom: 20px; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 20px 24px; margin-bottom: 16px; }
    .stat-row { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
    .stat { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 14px 18px; flex: 1; min-width: 110px; }
    .stat-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .stat-value { font-size: 20px; font-weight: 500; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { text-align: left; font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 10px; border-bottom: 2px solid var(--border); }
    td { padding: 10px; border-bottom: 1px solid var(--border-subtle); vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .badge-buy       { background: #e6f4ea; color: #1a7f3c; }
    .badge-sell      { background: #fdecea; color: #b91c1c; }
    .badge-pending   { background: #fff7e6; color: #b45309; }
    .badge-approved  { background: #e6f4ea; color: #1a7f3c; }
    .badge-passed    { background: #f3f4f6; color: #6b7280; }
    .badge-submitted { background: #eff6ff; color: #1d4ed8; }
    .badge-filled    { background: #e6f4ea; color: #1a7f3c; }
    .badge-cancelled { background: #f3f4f6; color: #6b7280; }
    .badge-error     { background: #fdecea; color: #b91c1c; }
    .badge-killed    { background: #fdecea; color: #b91c1c; }
    label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 5px; font-weight: 600; }
    textarea, input[type=number] {
      width: 100%; border: 1px solid var(--border-input); border-radius: 5px; padding: 8px 10px;
      font-size: 14px; font-family: inherit; resize: vertical; background: var(--surface); color: var(--text);
    }
    textarea:focus, input:focus { outline: none; border-color: var(--border-focus); }
    .btn { display: inline-block; padding: 9px 20px; border-radius: 5px; font-size: 14px; cursor: pointer; border: none; font-family: inherit; font-weight: 500; }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .btn-pass    { background: var(--btn-bg); color: var(--btn-text); }
    .btn-pass:not(:disabled):hover    { background: var(--btn-bg-hover); }
    .btn-approve { background: #1a7f3c; color: #fff; }
    .btn-approve:not(:disabled):hover { background: #15652f; }
    .conviction-group { display: flex; gap: 8px; flex-wrap: wrap; }
    .conviction-opt input[type=radio] { display: none; }
    .conviction-opt label {
      display: inline-block; padding: 6px 14px; border: 1px solid var(--border-input);
      border-radius: 4px; cursor: pointer; font-size: 13px; color: var(--text-dim); font-weight: 400;
    }
    .conviction-opt input[type=radio]:checked + label {
      border-color: var(--text-strong); color: var(--text-strong); font-weight: 600; background: var(--surface-hover);
    }
    .section-heading { font-size: 12px; color: var(--text-subtle); text-transform: uppercase; letter-spacing: 0.5px; margin: 28px 0 12px; border-top: 1px solid var(--border); padding-top: 20px; }
    .msg-ok  { background: #e6f4ea; border: 1px solid #a7d7b3; color: #1a7f3c; padding: 10px 14px; border-radius: 6px; font-size: 14px; margin-top: 12px; display: none; }
    .msg-err { background: #fdecea; border: 1px solid #f5c6c6; color: #b91c1c; padding: 10px 14px; border-radius: 6px; font-size: 14px; margin-top: 12px; display: none; }
    .empty-state { color: var(--text-muted); font-size: 14px; text-align: center; padding: 40px 0; line-height: 2; }
    .footer { margin-top: 40px; font-size: 12px; color: var(--text-faint); }
    .briefing { line-height: 1.7; background: var(--surface); padding: 24px; border-radius: 8px; border: 1px solid var(--border); }
    ${annotationStyles()}
  </style>
</head>
<body>
  ${navHtml(current)}
  ${body}
  <div class="footer">Default recommendation is no action. Action requires documented justification. — Fane</div>
</body>
</html>`;
}
 
// Persist a position + account snapshot to the DB.
// Called by GET /positions on each successful IBKR fetch.
function persistAccountSnapshot(snapshot) {
  const db = getDb();
  try {
    const s = snapshot.summary;
    db.prepare(`
      INSERT INTO account_snapshots
        (snapshot_at, net_liquidation, total_cash, buying_power, available_funds,
         unrealized_pnl, realized_pnl, gross_position_value, currency)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      snapshot.fetchedAt,
      s.NetLiquidation?.value     ?? null,
      s.TotalCashValue?.value     ?? null,
      s.BuyingPower?.value        ?? null,
      s.AvailableFunds?.value     ?? null,
      s.UnrealizedPnL?.value      ?? null,
      s.RealizedPnL?.value        ?? null,
      s.GrossPositionValue?.value ?? null,
      s.NetLiquidation?.currency  ?? 'USD'
    );
    for (const p of snapshot.positions) {
      db.prepare(`
        INSERT INTO positions
          (snapshot_at, account, symbol, sec_type, currency, exchange,
           con_id, position, avg_cost)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        snapshot.fetchedAt, p.account, p.symbol, p.secType,
        p.currency, p.exchange, p.conId, p.position, p.avgCost
      );
    }
  } finally {
    db.close();
  }
}
 

// ── Routes ───────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  const db = getDb();
  const snapshots = db.prepare(`
    SELECT date, sp500_close, tsx_close, vix, briefing_text, created_at
    FROM market_snapshots
    ORDER BY date DESC
    LIMIT 10
  `).all();
  const latest = snapshots[0];
  const annotations = latest ? db.prepare(`
    SELECT * FROM annotations WHERE briefing_date = ? ORDER BY created_at ASC
  `).all(latest.date) : [];
  db.close();

  const body = `
    <h1>Fane Market Intelligence</h1>
    ${latest ? `
      <p class="meta">Briefing for ${latest.date}</p>
      <div class="stat-row">
        <div class="stat"><div class="stat-label">S&amp;P 500</div><div class="stat-value">${latest.sp500_close?.toLocaleString()}</div></div>
        <div class="stat"><div class="stat-label">TSX</div><div class="stat-value">${latest.tsx_close?.toLocaleString()}</div></div>
        <div class="stat"><div class="stat-label">VIX</div><div class="stat-value">${latest.vix}</div></div>
      </div>
      <div class="briefing">${marked(latest.briefing_text || 'No briefing yet.')}</div>
      ${renderAnnotationThread(annotations)}
      ${annotationScript(latest.date, latest.briefing_text || '')}
    ` : '<p>No briefings yet. Check back after 9am ET on a weekday.</p>'}
    <div style="margin-top:32px;">
      <h3 style="font-size:15px;color:#555;margin-bottom:12px;">Recent Briefings</h3>
      ${snapshots.slice(1).map(s =>
        `<a href="/briefing/${s.date}" style="display:block;padding:8px 0;color:#555;text-decoration:none;border-bottom:1px solid #eee;">${s.date} — VIX ${s.vix}</a>`
      ).join('')}
    </div>`;

  res.send(pageShell('Market Intelligence', '/', body));
});

app.get('/briefing/:date', (req, res) => {
  const db = getDb();
  const snapshot = db.prepare(`
    SELECT * FROM market_snapshots WHERE date = ?
  `).get(req.params.date);
  const annotations = snapshot ? db.prepare(`
    SELECT * FROM annotations WHERE briefing_date = ? ORDER BY created_at ASC
  `).all(req.params.date) : [];
  db.close();

  if (!snapshot) {
    return res.status(404).send('Briefing not found.');
  }

  const body = `
    <h2>${snapshot.date}</h2>
    <div class="briefing">${marked(snapshot.briefing_text)}</div>
    ${renderAnnotationThread(annotations)}
    ${annotationScript(snapshot.date, snapshot.briefing_text || '')}`;

  res.send(pageShell(snapshot.date, '/', body));
});

// ── Annotation API ───────────────────────────────────────────────────────────

app.post('/annotations', async (req, res) => {
  const { briefing_date, selected_text, note, briefing_text } = req.body;

  if (!briefing_date || !selected_text || !note) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  // Pull historical market snapshots for context (last 30 days)
  const db = getDb();
  const history = db.prepare(`
    SELECT date, sp500_close, tsx_close, vix, briefing_text
    FROM market_snapshots
    ORDER BY date DESC
    LIMIT 30
  `).all();

  const historyText = history.map(h =>
    `Date: ${h.date} | S&P500: ${h.sp500_close} | TSX: ${h.tsx_close} | VIX: ${h.vix}`
  ).join('\n');

  const client = new Anthropic();

  let ai_response = null;
  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: `You are Fane, a market intelligence assistant. Your role is to help the human investor think clearly about markets.

Core principles:
- Default is no action. The null hypothesis is always inaction.
- Always present the counter-argument. A biased agent argues only for action.
- Ride the market, don't fight it. Micro gains compound. Ego trades blow up.
- The human decides. You surface. You do not push.

You are responding to a question or note the human has added to a specific passage in today's market briefing.
You have access to the last 30 days of market history for context.`,
      messages: [
        {
          role: 'user',
          content: `Today's briefing date: ${briefing_date}

--- TODAY'S FULL BRIEFING ---
${briefing_text}

--- LAST 30 DAYS MARKET HISTORY ---
${historyText}

--- HIGHLIGHTED PASSAGE ---
"${selected_text}"

--- HUMAN'S NOTE ---
${note}

Please respond to the human's note in the context of the highlighted passage and current market conditions. Be concise and direct. Always include the counter-argument if the note leans toward action.`
        }
      ]
    });

    ai_response = message.content[0]?.text || '';
  } catch (err) {
    console.error('Claude API error:', err);
    db.close();
    return res.status(500).json({ error: 'AI response failed.' });
  }

  // Save annotation — timestamp from time.js via now()
  const created_at = now();
  try {
    db.prepare(`
      INSERT INTO annotations (briefing_date, selected_text, note, ai_response, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(briefing_date, selected_text, note, ai_response, created_at);
  } catch (err) {
    console.error('DB insert error:', err);
    db.close();
    return res.status(500).json({ error: 'Failed to save annotation.' });
  }

  db.close();
  res.json({ ai_response, created_at });
});

app.get('/annotations/:date', (req, res) => {
  const db = getDb();
  const annotations = db.prepare(`
    SELECT * FROM annotations WHERE briefing_date = ? ORDER BY created_at ASC
  `).all(req.params.date);
  db.close();
  res.json(annotations);
});



// ── GET /signals ──────────────────────────────────────────────────────────────
//
// Main decision page. Pending signals require explicit Approve or Pass.
// Default is always Pass. Approve requires counter-argument, conviction,
// and quantity — no approval without all three documented.
 
app.get('/signals', (req, res) => {
  const db = getDb();
  const pending = db.prepare(`
    SELECT * FROM signals WHERE status = 'pending' ORDER BY fired_at DESC
  `).all();
  const recent = db.prepare(`
    SELECT * FROM signals WHERE status != 'pending'
    ORDER BY acted_on_at DESC LIMIT 20
  `).all();
 
  // Fetch market context for pending signals
  const contextMap = {};
  for (const sig of pending) {
    if (sig.market_snapshot_id) {
      const snap = db.prepare(
        `SELECT * FROM market_snapshots WHERE id = ?`
      ).get(sig.market_snapshot_id);
      if (snap) contextMap[sig.id] = snap;
    }
  }
  db.close();
 
  // ── Signal card (pending) ────────────────────────────────────────────────
  function signalCard(sig) {
    const snap      = contextMap[sig.id];
    const dirBadge  = `<span class="badge ${sig.direction === 'BUY' ? 'badge-buy' : 'badge-sell'}">${escHtml(sig.direction || '—')}</span>`;
 
    return `
      <div class="card" id="signal-${sig.id}">
 
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <span style="font-size:20px;font-weight:700;color:var(--text-strong);">${escHtml(sig.ticker)}</span>
          ${dirBadge}
          <span style="font-size:12px;color:var(--text-xfaint);">${escHtml(sig.signal_type || '')}</span>
          <span style="margin-left:auto;font-size:12px;color:var(--text-faint);">${escHtml(sig.fired_at)}</span>
        </div>

        ${sig.trigger_reason ? `
          <div style="font-size:13px;color:var(--text);margin-bottom:16px;padding:10px 12px;background:var(--surface-sunken);border-radius:5px;border-left:3px solid var(--border-input);">
            <span style="font-size:11px;color:var(--text-subtle);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:3px;">Why it fired</span>
            ${escHtml(sig.trigger_reason)}
          </div>` : ''}

        ${snap ? `
          <div style="font-size:12px;color:var(--text-subtle);margin-bottom:16px;">
            Market context at signal time:
            S&amp;P ${snap.sp500_close?.toLocaleString() ?? '—'} ·
            TSX ${snap.tsx_close?.toLocaleString() ?? '—'} ·
            VIX ${snap.vix ?? '—'} ·
            <a href="/briefing/${snap.date}" style="color:var(--text-dim);">see briefing →</a>
          </div>` : ''}

        <div style="border-top:1px solid var(--border-subtle);padding-top:16px;">
 
          <div style="margin-bottom:14px;">
            <label>Counter-argument — why this signal might be wrong <span style="color:#b91c1c;">*</span></label>
            <textarea id="ca-${sig.id}" rows="3"
              placeholder="What is the bear case? Why could this be a false positive?">${escHtml(sig.counter_argument || '')}</textarea>
          </div>
 
          <div style="margin-bottom:14px;">
            <label>Conviction <span style="color:#b91c1c;">*</span></label>
            <div class="conviction-group">
              ${['low', 'medium', 'high'].map(level => `
                <div class="conviction-opt">
                  <input type="radio" name="conv-${sig.id}" id="conv-${sig.id}-${level}" value="${level}">
                  <label for="conv-${sig.id}-${level}">${level[0].toUpperCase() + level.slice(1)}</label>
                </div>`).join('')}
            </div>
          </div>
 
          <div style="margin-bottom:14px;">
            <label>Shares <span style="color:#b91c1c;">*</span></label>
            <input type="number" id="qty-${sig.id}" min="1" step="1"
              placeholder="Number of shares" style="max-width:160px;">
          </div>
 
          <div style="margin-bottom:18px;">
            <label>Note <span style="color:var(--text-faint);font-weight:400;">(optional — what are you thinking?)</span></label>
            <textarea id="note-${sig.id}" rows="2"></textarea>
          </div>
 
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <button class="btn btn-pass" onclick="passSignal(${sig.id})">Pass — log inaction</button>
              <span style="font-size:12px;color:var(--text-faint);">← default</span>
            </div>
            <button class="btn btn-approve" onclick="approveSignal(${sig.id})">Approve →</button>
          </div>
 
          <div class="msg-ok"  id="ok-${sig.id}"></div>
          <div class="msg-err" id="err-${sig.id}"></div>
 
        </div>
      </div>`;
  }
 
  // ── Recent decisions table ───────────────────────────────────────────────
  function recentRow(sig) {
    const dir = sig.direction || '—';
    return `<tr>
      <td style="font-weight:600;">${escHtml(sig.ticker)}</td>
      <td><span class="badge ${dir === 'BUY' ? 'badge-buy' : 'badge-sell'}">${escHtml(dir)}</span></td>
      <td><span class="badge badge-${sig.status}">${escHtml(sig.status)}</span></td>
      <td style="font-size:12px;color:var(--text-subtle);">${escHtml(sig.acted_on_at || sig.fired_at || '—')}</td>
      <td style="font-size:12px;color:var(--text-dim);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${escHtml(sig.human_note || '—')}
      </td>
    </tr>`;
  }
 
  const pendingSection = pending.length > 0
    ? pending.map(signalCard).join('')
    : `<div class="empty-state">
         No pending signals.<br>
         <span style="font-size:12px;">The default is no action.</span>
       </div>`;
 
  const recentSection = recent.length > 0 ? `
    <p class="section-heading">Recent decisions</p>
    <div class="card" style="padding:0;overflow:hidden;">
      <table>
        <thead><tr>
          <th>Ticker</th><th>Dir</th><th>Status</th><th>Decided</th><th>Note</th>
        </tr></thead>
        <tbody>${recent.map(recentRow).join('')}</tbody>
      </table>
    </div>` : '';
 
  const body = `
    <h1>Signals</h1>
    <p class="meta">${pending.length} pending · default is no action</p>
    ${pendingSection}
    ${recentSection}
 
    <script>
      async function approveSignal(id) {
        const ca   = document.getElementById('ca-'   + id)?.value?.trim();
        const conv = document.querySelector('input[name="conv-' + id + '"]:checked')?.value;
        const qty  = parseFloat(document.getElementById('qty-'  + id)?.value);
        const note = document.getElementById('note-' + id)?.value?.trim();
 
        clearMsgs(id);
        if (!ca)           return showErr(id, 'Counter-argument is required before approving.');
        if (!conv)         return showErr(id, 'Conviction level is required.');
        if (!qty || qty < 1) return showErr(id, 'Enter a valid share quantity.');
 
        setLoading(id, true);
        try {
          const r = await fetch('/api/signals/' + id + '/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ counter_argument: ca, conviction_level: conv, quantity: qty, human_note: note })
          });
          const d = await r.json();
          if (d.error) return showErr(id, d.error);
          showOk(id, 'Approved. Order queued — check Trades for status.');
          document.getElementById('signal-' + id).style.opacity = '0.5';
          document.getElementById('signal-' + id).style.pointerEvents = 'none';
        } catch {
          showErr(id, 'Network error. Try again.');
        } finally {
          setLoading(id, false);
        }
      }
 
      async function passSignal(id) {
        const note = document.getElementById('note-' + id)?.value?.trim();
        clearMsgs(id);
        setLoading(id, true);
        try {
          const r = await fetch('/api/signals/' + id + '/pass', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ human_note: note })
          });
          const d = await r.json();
          if (d.error) return showErr(id, d.error);
          showOk(id, 'Passed. Inaction logged.');
          document.getElementById('signal-' + id).style.opacity = '0.5';
          document.getElementById('signal-' + id).style.pointerEvents = 'none';
        } catch {
          showErr(id, 'Network error. Try again.');
        } finally {
          setLoading(id, false);
        }
      }
 
      function setLoading(id, on) {
        document.querySelectorAll('#signal-' + id + ' .btn')
          .forEach(b => b.disabled = on);
      }
      function clearMsgs(id) {
        document.getElementById('ok-'  + id).style.display = 'none';
        document.getElementById('err-' + id).style.display = 'none';
      }
      function showOk(id, msg) {
        const el = document.getElementById('ok-' + id);
        el.textContent = msg;
        el.style.display = 'block';
      }
      function showErr(id, msg) {
        const el = document.getElementById('err-' + id);
        el.textContent = msg;
        el.style.display = 'block';
        setLoading(id, false);
      }
    </script>`;
 
  res.send(pageShell('Signals', '/signals', body));
});
 
 
// ── GET /positions ────────────────────────────────────────────────────────────
//
// Fetches live from IB Gateway and persists the snapshot to DB.
// Page blocks until IBKR responds (up to 15s timeout in account.js).
// If IBKR is disconnected, renders a clear disconnected state.
 
app.get('/positions', async (req, res) => {
  if (!ibkr.isConnected) {
    const body = `
      <h1>Positions</h1>
      <div class="card" style="text-align:center;padding:48px;">
        <div style="font-size:14px;color:#888;margin-bottom:12px;">
          IBKR not connected. IB Gateway may still be starting up.
        </div>
        <a href="/positions" style="font-size:13px;color:#555;">Refresh ↺</a>
      </div>`;
    return res.send(pageShell('Positions', '/positions', body));
  }
 
  let snapshot;
  try {
    snapshot = await getAccountSnapshot();
    persistAccountSnapshot(snapshot);
  } catch (err) {
    console.error(`[${now()}] /positions fetch error:`, err.message);
    const body = `
      <h1>Positions</h1>
      <div class="card" style="text-align:center;padding:48px;">
        <div style="color:#b91c1c;font-size:14px;margin-bottom:12px;">
          Failed to fetch from IB Gateway: ${escHtml(err.message)}
        </div>
        <a href="/positions" style="font-size:13px;color:#555;">Retry ↺</a>
      </div>`;
    return res.send(pageShell('Positions', '/positions', body));
  }
 
  const { positions, summary, fetchedAt } = snapshot;
  const s = summary;
 
  function fmt(val, dec = 2) {
    if (val == null) return '—';
    return Number(val).toLocaleString('en-US', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec
    });
  }
 
  function pnlStyle(val) {
    if (val == null) return '';
    return `color:${val >= 0 ? '#1a7f3c' : '#b91c1c'};font-weight:600;`;
  }
 
  const summaryRow = `
    <div class="stat-row">
      <div class="stat">
        <div class="stat-label">Net Liquidation</div>
        <div class="stat-value">$${fmt(s.NetLiquidation?.value)}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Cash</div>
        <div class="stat-value">$${fmt(s.TotalCashValue?.value)}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Buying Power</div>
        <div class="stat-value">$${fmt(s.BuyingPower?.value)}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Unrealized P&amp;L</div>
        <div class="stat-value" style="${pnlStyle(s.UnrealizedPnL?.value)}">
          $${fmt(s.UnrealizedPnL?.value)}
        </div>
      </div>
      <div class="stat">
        <div class="stat-label">Realized P&amp;L</div>
        <div class="stat-value" style="${pnlStyle(s.RealizedPnL?.value)}">
          $${fmt(s.RealizedPnL?.value)}
        </div>
      </div>
    </div>`;
 
  const positionRows = positions.length > 0
    ? positions.map(p => `
        <tr>
          <td style="font-weight:600;">${escHtml(p.symbol)}</td>
          <td style="color:#888;font-size:12px;">${escHtml(p.secType || '')}</td>
          <td>${p.position > 0 ? '+' : ''}${p.position}</td>
          <td>$${fmt(p.avgCost)}</td>
          <td style="font-size:12px;color:#888;">${escHtml(p.currency || '')}</td>
          <td style="font-size:12px;color:#aaa;">${escHtml(p.exchange || '')}</td>
        </tr>`).join('')
    : `<tr><td colspan="6" style="text-align:center;color:#999;padding:28px 0;">No open positions.</td></tr>`;
 
  const body = `
    <h1>Positions</h1>
    <p class="meta">Live from IB Gateway · fetched ${escHtml(fetchedAt)}</p>
    ${summaryRow}
    <div class="card" style="padding:0;overflow:hidden;">
      <table>
        <thead><tr>
          <th>Symbol</th><th>Type</th><th>Shares</th><th>Avg Cost</th><th>Currency</th><th>Exchange</th>
        </tr></thead>
        <tbody>${positionRows}</tbody>
      </table>
    </div>`;
 
  res.send(pageShell('Positions', '/positions', body));
});
 
 
// ── GET /trades ───────────────────────────────────────────────────────────────
//
// Orders lifecycle (submitted through IBKR) + closed trades.
// Read-only. Order submission is handled by orders.js (Step 5).
 
app.get('/trades', (req, res) => {
  const db = getDb();
  const orders = db.prepare(`
    SELECT o.* FROM orders o ORDER BY o.created_at DESC LIMIT 50
  `).all();
  const trades = db.prepare(`
    SELECT * FROM trades ORDER BY entry_date DESC LIMIT 50
  `).all();
  db.close();
 
  function orderRow(o) {
    const dir = o.direction || '—';
    return `<tr>
      <td style="font-weight:600;">${escHtml(o.ticker)}</td>
      <td><span class="badge ${dir === 'BUY' ? 'badge-buy' : 'badge-sell'}">${escHtml(dir)}</span></td>
      <td>${o.quantity ?? '—'}</td>
      <td style="font-size:12px;color:#888;">${escHtml(o.order_type || 'MKT')}</td>
      <td><span class="badge badge-${o.status}">${escHtml(o.status)}</span></td>
      <td>${o.filled_price != null ? '$' + Number(o.filled_price).toFixed(2) : '—'}</td>
      <td style="font-size:12px;color:#999;">${escHtml(o.approved_at || o.created_at)}</td>
    </tr>`;
  }
 
  function tradeRow(t) {
    const dir = t.direction || '—';
    return `<tr>
      <td style="font-weight:600;">${escHtml(t.ticker)}</td>
      <td><span class="badge ${dir === 'BUY' ? 'badge-buy' : 'badge-sell'}">${escHtml(dir)}</span></td>
      <td>${t.position_size ?? '—'}</td>
      <td>${t.entry_price != null ? '$' + Number(t.entry_price).toFixed(2) : '—'}</td>
      <td>${t.exit_price  != null ? '$' + Number(t.exit_price).toFixed(2)  : '—'}</td>
      <td style="${t.pnl != null ? (t.pnl >= 0 ? 'color:#1a7f3c;' : 'color:#b91c1c;') + 'font-weight:600;' : ''}">
        ${t.pnl != null ? '$' + Number(t.pnl).toFixed(2) : '—'}
      </td>
      <td style="font-size:12px;color:#999;">${escHtml(t.entry_date || '—')}</td>
    </tr>`;
  }
 
  const emptyRow = (cols, msg) =>
    `<tr><td colspan="${cols}" style="text-align:center;color:#999;padding:28px 0;">${msg}</td></tr>`;
 
  const body = `
    <h1>Trades</h1>
    <p class="meta">Orders and completed positions</p>
 
    <h2>Orders</h2>
    <div class="card" style="padding:0;overflow:hidden;">
      <table>
        <thead><tr>
          <th>Ticker</th><th>Dir</th><th>Qty</th><th>Type</th><th>Status</th><th>Fill Price</th><th>Approved</th>
        </tr></thead>
        <tbody>
          ${orders.length > 0 ? orders.map(orderRow).join('') : emptyRow(7, 'No orders yet.')}
        </tbody>
      </table>
    </div>
 
    <p class="section-heading">Closed trades</p>
    <div class="card" style="padding:0;overflow:hidden;">
      <table>
        <thead><tr>
          <th>Ticker</th><th>Dir</th><th>Size</th><th>Entry</th><th>Exit</th><th>P&amp;L</th><th>Date</th>
        </tr></thead>
        <tbody>
          ${trades.length > 0 ? trades.map(tradeRow).join('') : emptyRow(7, 'No closed trades yet.')}
        </tbody>
      </table>
    </div>`;
 
  res.send(pageShell('Trades', '/trades', body));
});
 
 
// ── POST /api/signals/:id/approve ─────────────────────────────────────────────
//
// Human approves a signal. Creates an order row (status: pending).
// Step 5 (orders.js) will pick up pending orders and submit them to IBKR.
// Counter-argument is required — approval without it is rejected at the API level.
 
app.post('/api/signals/:id/approve', (req, res) => {
  const { counter_argument, conviction_level, quantity, human_note } = req.body;
  const signalId = parseInt(req.params.id, 10);
 
  // Validate — these checks mirror the UI validation and enforce at the API level
  if (!counter_argument?.trim()) {
    return res.status(400).json({ error: 'Counter-argument is required.' });
  }
  if (!['low', 'medium', 'high'].includes(conviction_level)) {
    return res.status(400).json({ error: 'Conviction level must be low, medium, or high.' });
  }
  if (!quantity || Number(quantity) < 1) {
    return res.status(400).json({ error: 'Quantity must be a positive number.' });
  }
 
  const db = getDb();
  try {
    const signal = db.prepare('SELECT * FROM signals WHERE id = ?').get(signalId);
    if (!signal) {
      return res.status(404).json({ error: 'Signal not found.' });
    }
    if (signal.status !== 'pending') {
      return res.status(409).json({ error: `Signal is already ${signal.status}.` });
    }
 
    const approvedAt = now();
 
    // Update signal record
    db.prepare(`
      UPDATE signals
      SET status = 'approved', acted_on = 1, acted_on_at = ?,
          counter_argument = ?, conviction_level = ?, human_note = ?
      WHERE id = ?
    `).run(
      approvedAt,
      counter_argument.trim(),
      conviction_level,
      human_note?.trim() || null,
      signalId
    );
 
    // Create order record — status 'pending' until orders.js submits to IBKR
    // counter_argument NOT NULL constraint enforced at the schema level (schema.js)
    const result = db.prepare(`
      INSERT INTO orders
        (signal_id, ticker, direction, order_type, quantity,
         counter_argument, conviction_level, human_note,
         approved_at, status, created_at)
      VALUES (?, ?, ?, 'MKT', ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      signalId,
      signal.ticker,
      signal.direction,
      Number(quantity),
      counter_argument.trim(),
      conviction_level,
      human_note?.trim() || null,
      approvedAt,
      now()
    );
 
    const orderId = result.lastInsertRowid;
 
    // Inaction and action logged the same way — Principle 4
    db.prepare(`
      INSERT INTO agent_log (run_at, run_type, status, notes)
      VALUES (?, 'signal_approval', 'approved', ?)
    `).run(
      now(),
      `Signal ${signalId} approved — ${signal.ticker} ${signal.direction} x${quantity} — order ${orderId} queued`
    );
 
    // Submit to IBKR — non-blocking. The order row is already written.
    // If submission fails, the error is logged and the order stays visible
    // in /trades with status='error'. The human can investigate from there.
    submitOrder(orderId).catch(err => {
      console.error(`[${now()}] Approve: submitOrder failed for order ${orderId}:`, err.message);
    });
    
    res.json({ success: true, order_id: orderId });
  } catch (err) {
    console.error(`[${now()}] /api/signals/${signalId}/approve error:`, err.message);
    res.status(500).json({ error: 'Approval failed: ' + err.message });
  } finally {
    db.close();
  }
});
 
 
// ── POST /api/signals/:id/pass ────────────────────────────────────────────────
//
// Human explicitly passes on a signal. Logged the same as approval (Principle 4).
// No order is created. Inaction is a decision.
 
app.post('/api/signals/:id/pass', (req, res) => {
  const { human_note } = req.body;
  const signalId = parseInt(req.params.id, 10);
 
  const db = getDb();
  try {
    const signal = db.prepare('SELECT * FROM signals WHERE id = ?').get(signalId);
    if (!signal) {
      return res.status(404).json({ error: 'Signal not found.' });
    }
    if (signal.status !== 'pending') {
      return res.status(409).json({ error: `Signal is already ${signal.status}.` });
    }
 
    const passedAt = now();
 
    db.prepare(`
      UPDATE signals
      SET status = 'passed', acted_on = 0, acted_on_at = ?, human_note = ?
      WHERE id = ?
    `).run(passedAt, human_note?.trim() || null, signalId);
 
    // Inaction logged same as action — Principle 4
    db.prepare(`
      INSERT INTO agent_log (run_at, run_type, status, notes)
      VALUES (?, 'signal_approval', 'passed', ?)
    `).run(
      now(),
      `Signal ${signalId} passed — ${signal.ticker} ${signal.direction} — inaction logged`
    );
 
    res.json({ success: true });
  } catch (err) {
    console.error(`[${now()}] /api/signals/${signalId}/pass error:`, err.message);
    res.status(500).json({ error: 'Pass failed: ' + err.message });
  } finally {
    db.close();
  }
});
 
 
// ── POST /api/kill ────────────────────────────────────────────────────────────
//
// Kill token endpoint. Requires a reason. Fires ibkr.kill(), which:
//   - Disconnects from IB Gateway
//   - Sets the killed flag (no reconnect this session)
//   - Logs to agent_log
//   - Emits 'killed' event to all listeners
// Process restart required to restore connectivity.
 
app.post('/api/kill', (req, res) => {
  const { reason } = req.body;
  if (!reason?.trim()) {
    return res.status(400).json({ error: 'Kill reason is required.' });
  }
  ibkr.kill(reason.trim());
  res.json({ success: true, killed_at: now() });
});



// Binds to all interfaces by design. Network-level protection is provided
// by Hetzner Cloud Firewall, not by service-level interface binding.
// If Fane ever migrates to a host without a managed firewall, lock this
// down to 127.0.0.1 and use SSH tunneling or Tailscale serve for remote access.
app.listen(PORT, '0.0.0.0', () => {
  console.log('Fane web server running on port ' + PORT);
});