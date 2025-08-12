(function () {
  const $ = (q, r = document) => r.querySelector(q);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  // --- minimal styles (unchanged from last version) ---
  (function injectStyles() {
    if ($('#cloudSyncStyles')) return;
    const css = `
    .btn.cloud-sync{ padding:.3rem .6rem; line-height:1; }
    @media (max-width:480px){ .btn.cloud-sync{ padding:.25rem .5rem; } }
    .btn.cloud-sync.icon{ width:2rem; min-width:2rem; padding:.25rem; text-align:center; }
    .sync-row{
      font-size:.85rem;
      padding:.15rem .4rem;
      margin:.20rem 0 .10rem;
      color:#6c86a3;
      background:transparent;
      border-top:1px solid #000;
      border-bottom:1px solid #000;
      transition: background-color .25s ease, color .25s ease, opacity .35s ease;
    }
    .sync-row.syncing{ background:#3b82f6; color:#fff; }
    .sync-row.success{ background:#22c55e; color:#fff; }
    `;
    const style = document.createElement('style');
    style.id = 'cloudSyncStyles';
    style.textContent = css;
    document.head.appendChild(style);
  })();

  function fmt(d){
    if (!d || d === '1970-01-01T00:00:00.000Z') return 'never';
    const dt = new Date(d);
    const mm = String(dt.getMonth()+1).padStart(2,'0');
    const dd = String(dt.getDate()).padStart(2,'0');
    const yy = String(dt.getFullYear()).toString().slice(-2);
    return `${mm}/${dd}/${yy} ${dt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
  }

  function ensureStatusRow() {
    let row = $('#syncStatusRow');
    if (row) return row;
    row = document.createElement('div');
    row.id = 'syncStatusRow';
    row.className = 'sync-row';
    row.setAttribute('aria-live', 'polite');
    const carousel = $('#carousel');
    if (carousel && carousel.parentNode) {
      carousel.parentNode.insertBefore(row, carousel);
    } else {
      const header = document.querySelector('header');
      if (header && header.parentNode) header.parentNode.insertBefore(row, header.nextSibling);
      else document.body.insertBefore(row, document.body.firstChild);
    }
    return row;
  }

  function setStatusState(state){
    const row = ensureStatusRow();
    row.classList.remove('syncing','success');
    if (state) row.classList.add(state);
    if (state === 'success') setTimeout(()=> row.classList.remove('success'), 1200);
  }

  function updateStatus(){
    const s = window.CloudSync?.getStatus?.();
    const el = ensureStatusRow();
    if (el && s) el.textContent = `Last synced: ${fmt(s.lastSync)} • Pending: ${s.pending}`;
  }

  // --- Debounced auto-sync on changes (B2) ---
  let syncTimer = null;
  let lastSyncAt = 0;
  const DEBOUNCE_MS = 5000;       // wait 5s after last change
  const MIN_INTERVAL_MS = 30000;  // don't sync more than once every 30s

  async function runSync() {
    if (!navigator.onLine) return;
    setStatusState('syncing');
    try {
      await window.CloudSync.syncNow();
      updateStatus();
      setStatusState('success');
      lastSyncAt = Date.now();
    } catch {
      setStatusState(); // back to idle gray (we’ll add yellow error later if you want)
    } finally {
      syncTimer = null;
    }
  }

  function scheduleSync(reason='change') {
    const now = Date.now();
    const wait = Math.max(DEBOUNCE_MS, MIN_INTERVAL_MS - (now - lastSyncAt));
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(runSync, Math.max(0, wait));
  }

  // Listen for explicit app saves
  window.addEventListener('sst:changed', () => scheduleSync('changed'));
  // Flush soon after app returns to foreground
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleSync('vis');
  });

  // --- UI mounts + “Sync on Report” ---
  function mountUI() {
    const bar = document.querySelector('header .toolbar') || document.querySelector('header');
    if (!bar) return;

    const old = $('#syncStatus'); // remove old inline status if present
    if (old) old.remove();

    if (!$('#btnCloudSync')) {
      const btn = document.createElement('button');
      btn.id = 'btnCloudSync';
      btn.className = 'btn ghost cloud-sync';
      btn.title = 'Pull & push changes with cloud';
      btn.setAttribute('aria-label', 'Sync');
      if (isIOS) { btn.classList.add('icon'); btn.textContent = '⟳'; }
      else { btn.textContent = 'Sync'; }
      btn.addEventListener('click', runSync);
      bar.appendChild(btn);
    }

    // A) Sync on Report (non-blocking)
    const reportBtn = $('#btnReport');
    if (reportBtn && !reportBtn.dataset.cloudSyncHook) {
      reportBtn.dataset.cloudSyncHook = '1';
      reportBtn.addEventListener('click', () => { scheduleSync('report'); });
    }

    ensureStatusRow();
    updateStatus();
  }

  async function autoSyncOnOpen(){
    if (!navigator.onLine) { updateStatus(); return; }
    setStatusState('syncing');
    try {
      await window.CloudSync.syncNow();
      updateStatus();
      setStatusState('success');
      lastSyncAt = Date.now();
    } catch { setStatusState(); }
  }

  window.addEventListener('DOMContentLoaded', ()=>{
    mountUI();
    setTimeout(autoSyncOnOpen, 250);
  });

  window.addEventListener('online', ()=> updateStatus());
  window.addEventListener('offline', ()=> updateStatus());
})();
