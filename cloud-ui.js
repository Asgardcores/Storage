(function () {
  const $ = (q, r = document) => r.querySelector(q);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  // Inject compact styles + state colors (blue/green/yellow) and black borders
  (function injectStyles() {
    if ($('#cloudSyncStyles')) return;
    const css = `
    .btn.cloud-sync{ padding:.3rem .6rem; line-height:1; }
    @media (max-width:480px){ .btn.cloud-sync{ padding:.25rem .5rem; } }
    .btn.cloud-sync.icon{ width:2rem; min-width:2rem; padding:.25rem; text-align:center; }

    .sync-row{
      font-size:.85rem;
      padding:.03rem .4rem .10rem;   /* ultra-thin top, small bottom */
      margin:.05rem 0 .08rem;        /* snug to the header/buttons */
      color:#6c86a3;
      background:transparent;
      border-top:1px solid #000;     /* top divider */
      border-bottom:1px solid #000;  /* bottom divider */
      transition: background-color .25s ease, color .25s ease, opacity .35s ease;
    }
    .sync-row.syncing{ background:#3b82f6; color:#fff; }  /* blue */
    .sync-row.success{ background:#22c55e; color:#fff; }  /* green */
    .sync-row.error  { background:#facc15; color:#000; }  /* yellow */
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

  // ----- Status row placement (just above the carousel) -----
  function ensureStatusRow() {
    let row = $('#syncStatusRow');
    if (!row) {
      row = document.createElement('div');
      row.id = 'syncStatusRow';
      row.className = 'sync-row';
      row.setAttribute('aria-live', 'polite');
      document.body.appendChild(row); // temporary; place correctly below
    }
    placeRowBeforeCarousel(row);
    return row;
  }
  function placeRowBeforeCarousel(row) {
    const carousel = $('#carousel');
    if (carousel && carousel.parentNode) {
      if (row.nextSibling !== carousel) carousel.parentNode.insertBefore(row, carousel);
    } else {
      const header = document.querySelector('header');
      if (header && header.parentNode && row.previousSibling !== header) {
        header.parentNode.insertBefore(row, header.nextSibling);
      }
    }
  }
  function watchForCarousel(row) {
    let ticks = 0;
    const mo = new MutationObserver(() => placeRowBeforeCarousel(row));
    mo.observe(document.body, { childList: true, subtree: true });
    const iv = setInterval(() => {
      ticks++; placeRowBeforeCarousel(row);
      if ($('#carousel') || ticks > 40) { clearInterval(iv); mo.disconnect(); }
    }, 50);
  }

  function setStatusState(state){
    const row = ensureStatusRow();
    row.classList.remove('syncing','success','error');
    if (state) row.classList.add(state);
    if (state === 'success' || state === 'error') setTimeout(()=> row.classList.remove(state), 1500);
  }

  function updateStatus(){
    const s = window.CloudSync?.getStatus?.();
    const row = ensureStatusRow();
    if (row && s) row.textContent = `Last synced: ${fmt(s.lastSync)} • Pending: ${s.pending}`;
  }

  // ----- UI refresh hook (U2) -----
  function refreshAfterSync() {
    // Preserve the current unit if we can
    const prevUnit = (typeof window.currentUnit === 'function') ? window.currentUnit() : null;

    // If the visible set could have changed (e.g., overlocked filter), rebuild the carousel
    if (typeof window.buildCarousel === 'function') window.buildCarousel();

    // Try to keep selection and refresh details
    if (typeof window.getVisibleUnits === 'function' && typeof window.loadUnit === 'function') {
      const vis = window.getVisibleUnits();
      if (prevUnit != null && vis.includes(prevUnit)) {
        if (window.state && typeof window.state.idx === 'number') {
          window.state.idx = vis.indexOf(prevUnit);
        }
        window.loadUnit(prevUnit);
      } else if (vis.length) {
        if (window.state && typeof window.state.idx === 'number') window.state.idx = 0;
        window.loadUnit(vis[0]);
      }
    } else if (prevUnit != null && typeof window.loadUnit === 'function') {
      window.loadUnit(prevUnit);
    }

    // Refresh badges, highlights, report, and timestamps
    if (typeof window.reflectCarouselBadges === 'function') window.reflectCarouselBadges();
    if (typeof window.highlightActivePill === 'function') window.highlightActivePill();
    if (typeof window.centerActive === 'function') window.centerActive();
    if (typeof window.updateReport === 'function') window.updateReport();
    if (typeof window.updateLastUpdatedLabel === 'function') window.updateLastUpdatedLabel();
  }

  // ----- Debounced auto-sync on changes -----
  let syncTimer = null;
  let lastSyncAt = 0;
  const DEBOUNCE_MS = 5000;       // wait 5s after last change
  const MIN_INTERVAL_MS = 30000;  // at most once every 30s

  async function runSync() {
    if (!navigator.onLine) { setStatusState('error'); return; }
    setStatusState('syncing');
    try {
      await window.CloudSync.syncNow();
      // Immediately refresh UI from local storage (now merged with remote)
      refreshAfterSync();
      updateStatus();
      setStatusState('success');
      lastSyncAt = Date.now();
    } catch {
      setStatusState('error');
    } finally {
      syncTimer = null;
    }
  }

  function scheduleSync() {
    const now = Date.now();
    const wait = Math.max(DEBOUNCE_MS, MIN_INTERVAL_MS - (now - lastSyncAt));
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(runSync, Math.max(0, wait));
  }

  // Listen for explicit app saves (from app.js)
  window.addEventListener('sst:changed', scheduleSync);
  // Schedule one when returning to foreground
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleSync();
  });

  // ----- UI mount + “Sync on Report” -----
  function mountUI() {
    const bar = document.querySelector('header .toolbar') || document.querySelector('header');
    if (!bar) return;

    // Remove any legacy inline status
    const old = $('#syncStatus');
    if (old) old.remove();

    // Sync button
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

    // Sync when Report is opened (non-blocking)
    const reportBtn = $('#btnReport');
    if (reportBtn && !reportBtn.dataset.cloudSyncHook) {
      reportBtn.dataset.cloudSyncHook = '1';
      reportBtn.addEventListener('click', () => { scheduleSync(); });
    }

    const row = ensureStatusRow();
    watchForCarousel(row);  // make sure it ends up right above the carousel
    updateStatus();
  }

  async function autoSyncOnOpen(){
    if (!navigator.onLine) { updateStatus(); return; }
    setStatusState('syncing');
    try {
      await window.CloudSync.syncNow();
      refreshAfterSync();   // ensure UI matches freshly pulled data
      updateStatus();
      setStatusState('success');
      lastSyncAt = Date.now();
    } catch { setStatusState('error'); }
  }

  window.addEventListener('DOMContentLoaded', ()=>{
    mountUI();
    setTimeout(autoSyncOnOpen, 250);
  });

  window.addEventListener('online', ()=> updateStatus());
  window.addEventListener('offline', ()=> updateStatus());
})();
