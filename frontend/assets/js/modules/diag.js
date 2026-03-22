// ============================================================
// diag.js — structured diagnostics log + floating panel
// ============================================================

export const DIAG = {
  entries: [],

  log(level, source, message, detail = '') {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.entries.push({ ts, level, source, message, detail });
    this._render();
  },

  ok(src, msg, detail = '')   { this.log('OK',   src, msg, detail); },
  err(src, msg, detail = '')  { this.log('ERR',  src, msg, detail); },
  warn(src, msg, detail = '') { this.log('WARN', src, msg, detail); },
  info(src, msg, detail = '') { this.log('INFO', src, msg, detail); },

  _render() {
    const el = document.getElementById('diag-log');
    if (!el) return;
    const colorMap = { OK: 'diag-ok', ERR: 'diag-err', WARN: 'diag-warn', INFO: 'diag-info' };
    el.innerHTML = this.entries.map(e => {
      const cls = colorMap[e.level] || 'diag-info';
      const det = e.detail ? `\n          ${e.detail.substring(0, 300)}` : '';
      return `<span class="${cls}">[${e.ts}] [${e.level.padEnd(4)}] [${e.source.padEnd(12)}] ${e.message}${det}</span>`;
    }).join('\n');
    el.scrollTop = el.scrollHeight;
    this._renderSummary();
  },

  _renderSummary() {
    const el = document.getElementById('diag-summary');
    if (!el) return;
    const oks   = this.entries.filter(e => e.level === 'OK').length;
    const errs  = this.entries.filter(e => e.level === 'ERR').length;
    const warns = this.entries.filter(e => e.level === 'WARN').length;
    const last  = this.entries[this.entries.length - 1];
    el.innerHTML = `
      <strong>Status:</strong> ${oks} OK &middot; ${errs} errors &middot; ${warns} warnings<br>
      <strong>Last:</strong> ${last ? `[${last.level}] [${last.source}] ${last.message}` : 'none'}<br>
      <span class="diag-muted">Paste this log to diagnose issues.</span>
    `;
  },

  toText() {
    return 'LOGI — DIAGNOSTICS LOG\n' +
           '======================\n' +
           `Generated: ${new Date().toISOString()}\n\n` +
           this.entries.map(e =>
             `[${e.ts}] [${e.level}] [${e.source}] ${e.message}${e.detail ? '\n  DETAIL: ' + e.detail : ''}`
           ).join('\n');
  },
};

export function initDiag() {
  // Open button in header
  document.getElementById('btn-diag')?.addEventListener('click', openDiag);

  // Close + copy inside panel
  document.getElementById('diag-close')?.addEventListener('click', closeDiag);
  document.getElementById('diag-copy')?.addEventListener('click', () => {
    navigator.clipboard.writeText(DIAG.toText()).then(() => {
      const btn = document.getElementById('diag-copy');
      btn.textContent = 'COPIED';
      setTimeout(() => { btn.textContent = 'COPY LOG'; }, 2000);
    }).catch(() => alert('Copy failed — select the log text manually.'));
  });

  // Click backdrop to close
  document.getElementById('diag-panel')?.addEventListener('click', (e) => {
    if (e.target.id === 'diag-panel') closeDiag();
  });
}

function openDiag() {
  document.getElementById('diag-panel')?.classList.remove('hidden');
  DIAG._render();
}

function closeDiag() {
  document.getElementById('diag-panel')?.classList.add('hidden');
}
