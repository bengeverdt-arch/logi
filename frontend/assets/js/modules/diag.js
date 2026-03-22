// ============================================================
// diag.js — diagnostics log for copy/paste debugging
// ============================================================

const _log = {};

export function diagSet(key, data) {
  _log[key] = data;
  _flush();
}

function _flush() {
  const el = document.getElementById('diag-output');
  if (el) el.value = JSON.stringify(_log, null, 2);
}

export function initDiag() {
  const copyBtn = document.getElementById('diag-copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const el = document.getElementById('diag-output');
      if (!el) return;
      navigator.clipboard.writeText(el.value).then(() => {
        copyBtn.textContent = 'Copied';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
      });
    });
  }
}
