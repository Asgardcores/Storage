(function () {
  const $ = (q, r = document) => r.querySelector(q);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  // Inject tiny styles (compact row, blue/green states, black bottom border)
  (function injectStyles() {
    if ($('#cloudSyncStyles')) return;
    const css = `
    .btn.cloud-sync{ padding:.3rem .6rem; line-height:1; }
    @media (max-width:480px){ .btn.cloud-sync{ padding:.25rem .5rem; } }
    .btn.cloud-sync.icon{ width:2rem; min-width:2rem; padding:.25rem; text-align:center; }

    .sync-row{
      font-size:.85rem;
      padding:.15rem .4rem;          /* minimal padding */
      margin:.20rem 0 .10rem;        /* tight spacing above carousel */
      color:#6c86a3;                 /* muted gray-blue */
      background:transparent;
      border-bottom:1px solid #000;  /* black divider so it doesn't run into the carousel */
      transition: background-color .25s ease, color .25s ease, opacity .35s ease;
    }
    .sync-row.syncing{
      background:#3b82f6; /* blue while syncing */
      color:#fff;
    }
    .sync-row.success{
      background:#22c55e; /* green on success */
      color:#fff;
    }
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

  // Ensure a status row exists just above the carousel
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

    // Auto-fade success back to idle gray after a moment
    if (state === 'success') {
      setTimeout(()=>{ row.classList.remove('success'); }, 1200);
    }
  }

  function updateStatus(){
    const s = window.CloudSync?.getStatus?.();
    const el = ensureStatusRow();
    if (el && s) el.textContent = `Last synced: ${fmt(s.lastSync)} • Pending: ${s.pending}`;
  }

  // Keep Sync button in toolbar, shrink it, icon-only on iOS
  function mountUI() {
    const bar = document.querySelector('header .toolbar') || document.querySelector('header');
    if (!bar) return;

    // Remove any old inline status span in the toolbar (we use the row now)
    const old = $('#syncStatus');
    if (old) old.remove();

    if (!$('#btnCloudSync')) {
      const btn = document.createElement('button');
      btn.id = 'btnCloudSync';
      btn.className = 'btn ghost cloud-sync';
      btn.title = 'Pull & push changes with cloud';
      btn.setAttribute('aria-label', 'Sync');

      if (isIOS) {
        btn.classList.add('icon');
        btn.textContent = '⟳';   // compact icon on iOS
      } else {
        btn.textContent = 'Sync'; // text elsewhere
      }

      btn.addEventListener('click', async ()=>{
        btn.disabled = true;
        const orig = btn.textContent;
        if (!isIOS) btn.textContent = 'Syncing...';
        try {
          setStatusState('syncing');
          await window.CloudSync.syncNow();
          updateStatus();
          setStatusState('success');
        } catch (e) {
          console.warn(e);
          alert('Sync failed. Check network and API settings.');
          setStatusState(); // back to idle gray
        } finally {
          btn.disabled = false;
          if (!isIOS) btn.textContent = orig;
        }
      });

      bar.appendChild(btn);
    }

    ensureStatusRow();
    updateStatus();
  }

  async function autoSyncOnOpen(){
    if (!navigator.onLine) { updateStatus(); return; }
    try {
      setStatusState('syncing');
      await window.CloudSync.syncNow();
      updateStatus();
      setStatusState('success');
    } catch (e) {
      // silent fail; remain gray
      setStatusState();
    }
  }

  window.addEventListener('DOMContentLoaded', ()=>{
    mountUI();
    setTimeout(autoSyncOnOpen, 250);
  });

  window.addEventListener('online', ()=> updateStatus());
  window.addEventListener('offline', ()=> updateStatus());
})();
