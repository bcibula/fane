import express from 'express';
import { getDb } from '../db/schema.js';
import { config } from 'dotenv';
import { marked } from 'marked';
import { now } from '../utils/time.js';
import Anthropic from '@anthropic-ai/sdk';
config();

const app = express();
const PORT = 3000;
app.use(express.json());

// ── Shared HTML helpers ──────────────────────────────────────────────────────

function annotationStyles() {
  return `
    .annotation-highlight {
      background: #fff3cd;
      border-bottom: 2px solid #f0a500;
      cursor: pointer;
      position: relative;
    }
    .annotation-highlight:hover { background: #ffe9a0; }

    #ann-float-btn {
      display: none;
      position: fixed;
      z-index: 100;
      background: #111;
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 5px 12px;
      font-size: 13px;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    }
    #ann-float-btn:hover { background: #333; }

    #ann-panel {
      display: none;
      position: fixed;
      right: 24px;
      top: 80px;
      width: 360px;
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 10px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.13);
      z-index: 200;
      padding: 20px;
      font-size: 14px;
    }
    #ann-panel h4 { margin: 0 0 10px 0; font-size: 15px; color: #111; }
    #ann-quoted {
      background: #f7f7f7;
      border-left: 3px solid #f0a500;
      padding: 8px 12px;
      margin-bottom: 12px;
      font-size: 13px;
      color: #555;
      border-radius: 3px;
      max-height: 80px;
      overflow-y: auto;
      font-style: italic;
    }
    #ann-note {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #ddd;
      border-radius: 5px;
      padding: 8px;
      font-size: 14px;
      resize: vertical;
      min-height: 70px;
      font-family: inherit;
    }
    #ann-note:focus { outline: none; border-color: #aaa; }
    #ann-submit {
      margin-top: 10px;
      background: #111;
      color: #fff;
      border: none;
      border-radius: 5px;
      padding: 8px 18px;
      font-size: 14px;
      cursor: pointer;
      width: 100%;
    }
    #ann-submit:hover { background: #333; }
    #ann-submit:disabled { background: #aaa; cursor: not-allowed; }
    #ann-close {
      position: absolute;
      top: 12px; right: 14px;
      background: none; border: none;
      font-size: 18px; cursor: pointer; color: #888;
    }
    #ann-close:hover { color: #111; }
    #ann-response {
      margin-top: 14px;
      background: #f0f7ff;
      border-radius: 6px;
      padding: 12px;
      font-size: 13px;
      line-height: 1.6;
      color: #222;
      display: none;
      max-height: 260px;
      overflow-y: auto;
    }
    #ann-spinner {
      display: none;
      margin-top: 10px;
      text-align: center;
      color: #888;
      font-size: 13px;
    }

    .ann-thread {
      margin-top: 32px;
      border-top: 1px solid #eee;
      padding-top: 20px;
    }
    .ann-thread h3 { font-size: 15px; color: #555; margin-bottom: 16px; }
    .ann-item {
      background: #fff;
      border: 1px solid #eee;
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 14px;
    }
    .ann-item-quote {
      font-style: italic;
      color: #888;
      font-size: 12px;
      border-left: 3px solid #f0a500;
      padding-left: 8px;
      margin-bottom: 8px;
    }
    .ann-item-note { font-weight: 600; font-size: 14px; margin-bottom: 6px; }
    .ann-item-response { font-size: 13px; line-height: 1.6; color: #333; }
    .ann-item-meta { font-size: 11px; color: #bbb; margin-top: 8px; }
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

      // Show float button on text selection inside .briefing
      document.addEventListener('mouseup', (e) => {
        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : '';
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
            // Append to thread on page without reload
            appendThread(selectedText, note, data.ai_response, 'just now');
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

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Fane — Market Intelligence</title>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <style>
        body { font-family: sans-serif; max-width: 780px; margin: 40px auto; padding: 0 20px; color: #333; background: #fafafa; }
        h1 { font-size: 24px; color: #111; }
        .meta { color: #888; font-size: 14px; margin-bottom: 24px; }
        .briefing { white-space: pre-wrap; line-height: 1.7; background: #fff; padding: 24px; border-radius: 8px; border: 1px solid #eee; }
        .stats { display: flex; gap: 16px; margin-bottom: 24px; }
        .stat { background: #fff; border: 1px solid #eee; border-radius: 8px; padding: 16px 20px; flex: 1; }
        .stat-label { font-size: 12px; color: #888; margin-bottom: 4px; }
        .stat-value { font-size: 22px; font-weight: 500; }
        .footer { margin-top: 32px; font-size: 12px; color: #aaa; }
        .history { margin-top: 32px; }
        .history a { display: block; padding: 8px 0; color: #555; text-decoration: none; border-bottom: 1px solid #eee; }
        .history a:hover { color: #111; }
        ${annotationStyles()}
      </style>
    </head>
    <body>
      <h1>Fane Market Intelligence</h1>
      ${latest ? `
        <div class="meta">Briefing for ${latest.date}</div>
        <div class="stats">
          <div class="stat">
            <div class="stat-label">S&amp;P 500</div>
            <div class="stat-value">${latest.sp500_close?.toLocaleString()}</div>
          </div>
          <div class="stat">
            <div class="stat-label">TSX</div>
            <div class="stat-value">${latest.tsx_close?.toLocaleString()}</div>
          </div>
          <div class="stat">
            <div class="stat-label">VIX</div>
            <div class="stat-value">${latest.vix}</div>
          </div>
        </div>
        <div class="briefing">${marked(latest.briefing_text || 'No briefing yet.')}</div>
        ${renderAnnotationThread(annotations)}
        ${annotationScript(latest.date, latest.briefing_text || '')}
      ` : '<p>No briefings yet. Check back after 9am ET on a weekday.</p>'}
      <div class="history">
        <h3>Recent Briefings</h3>
        ${snapshots.slice(1).map(s => `
          <a href="/briefing/${s.date}">${s.date} — VIX ${s.vix}</a>
        `).join('')}
      </div>
      <div class="footer">
        Default recommendation is no action. Action requires documented justification. — Fane
      </div>
    </body>
    </html>
  `;
  res.send(html);
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

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Fane — ${snapshot.date}</title>
      <meta charset="utf-8"/>
      <style>
        body { font-family: sans-serif; max-width: 780px; margin: 40px auto; padding: 0 20px; color: #333; background: #fafafa; }
        .briefing { line-height: 1.7; background: #fff; padding: 24px; border-radius: 8px; border: 1px solid #eee; }
        a { color: #555; }
        ${annotationStyles()}
      </style>
    </head>
    <body>
      <p><a href="/">← Back</a></p>
      <h2>${snapshot.date}</h2>
      <div class="briefing">${marked(snapshot.briefing_text)}</div>
      ${renderAnnotationThread(annotations)}
      ${annotationScript(snapshot.date, snapshot.briefing_text || '')}
    </body>
    </html>
  `);
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

app.listen(PORT, '0.0.0.0', () => {
  console.log('Fane web server running on port ' + PORT);
});