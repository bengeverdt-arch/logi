// ============================================================
// loading.js — "what's still loading" bar + print guard
// Every data fetch for a drawn unit is registered with track(). A bar
// pinned to the top of the plan names what is still loading and fills
// as each finishes; it disappears when everything is in. Printing while
// anything is still loading puts a warning banner at the top of the
// printout naming what's missing.
// ============================================================

let _run = 0;          // bumps per drawn unit — stale fetches are ignored
let _total = 0;
const _pending = new Set();

function bar() {
  let el = document.getElementById('loading-bar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading-bar';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.hidden = true;
    const plan = document.getElementById('burn-plan');
    plan?.parentNode.insertBefore(el, plan);
  }
  return el;
}

function render() {
  const el = bar();
  if (!_pending.size) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  const done = _total - _pending.size;
  const pct  = _total ? Math.round((done / _total) * 100) : 0;
  el.hidden = false;
  el.innerHTML = `
    <div class="loading-bar-text">
      <strong>Loading data ${done} of ${_total}</strong> &mdash; still waiting on:
      ${[..._pending].join(', ')}
    </div>
    <div class="loading-bar-track"><div class="loading-bar-fill" style="width:${pct}%"></div></div>`;
}

// Call when a new unit is drawn (or deleted) — forgets the previous run.
export function startRun() {
  _run++;
  _total = 0;
  _pending.clear();
  render();
}

// Register a fetch by a human-readable label. Resolves/rejects as the
// promise does; failures still count as "finished" (their own section
// shows the error).
export function track(label, promise) {
  const run = _run;
  _total++;
  _pending.add(label);
  render();
  const finish = () => {
    if (run !== _run) return;
    _pending.delete(label);
    render();
  };
  Promise.resolve(promise).then(finish, finish);
  return promise;
}

export function pendingLabels() {
  return [..._pending];
}

export function initLoading() {
  bar();
  let banner = null;
  window.addEventListener('beforeprint', () => {
    const still = pendingLabels();
    if (!still.length) return;
    banner = document.createElement('div');
    banner.className = 'print-loading-banner';
    banner.innerHTML = `&#9888; DATA STILL LOADING WHEN PRINTED &mdash; incomplete: ${still.join(', ')}.
      Reprint once loading finishes.`;
    document.getElementById('burn-plan')?.prepend(banner);
  });
  window.addEventListener('afterprint', () => {
    banner?.remove();
    banner = null;
  });
}
