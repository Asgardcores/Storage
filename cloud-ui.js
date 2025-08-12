(function () {
  const $ = (q, r = document) => r.querySelector(q);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  // Inject tiny styles (R3A/R3B)
  (function injectStyles() {
    if ($('#cloudSyncStyles')) return;
    const css = `
    .btn.cloud-sync{ padding:.3rem .6rem; line-height:1; }
    @media (max-width:480px){ .btn.cloud-sync{ padding:.25rem .5rem; } }
    .btn.cloud-sync.icon{ width:2rem; min-width:2rem; padding:.25rem; text-align:center; }
    .sync-row{ font-size:.85rem; padding:.25rem .5rem; margin:.25rem 0; color:#6c86a3; }
    `;
    const style = document.createElement('style');
    style.id = 'cloudSyncStyles';
    style.textContent = css;
    document.head.appendChild(style);
  })();

  function fmt(d) {
    if (!d || d === '1970-01-01T00:00:00.000Z') return 'never';
    const dt = new Date(d);
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    const yy = String(dt.getFullYear()).toString().slice(-2);
    return `${mm}/${dd}/${yy} ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  // R1: ensure a status row exists just above the carousel
  function ensureStatusRow() {
    let row = $('#syncStatusRow');
    if (row) return row;

    row = document.createElement('div');
    row.id = 'syncStatusRow';
    row.className = 'sync-row';
    row.setAttribute('aria-live', 'polite');

    // Insert before the carousel if possible; fallback right after header
    const carousel = $('#carousel');
    if (carousel && carousel.parentNode) {
      carousel.parentNode.insertBefore(row, carousel);
    } else {
      const header = document.querySelector('header');
      if (header && header.parentNode) {
        header.parentNode.insertBefore(row, header.nextSibling);
      } else {
        document.body.insertBefore(row, document.body.firstChild);
      }
    }
    return row;
  }

  function updateStatus() {
    const s = window.CloudSync?.getStatus?.();
    const el = ensureStatusRow();
    if (el && s) el.textContent = `Last synced: ${fmt(s.lastSync)} • Pending: ${s.pending}`;
  }

  // R2/R3: keep Sync button in toolbar, shrink it, icon-only on iOS
  function mountUI() {
    const bar = document.querySelector('header .toolbar') || document.querySelector('header');
    if (!bar) return;

    // Remove any old inline status that might exist in the toolbar
    const old = $('#syncStatus');
    if (old) old.remove();

    // Create Sync button if missing
    if (!$('#btnCloudSync')) {
      const btn = document.createElement('button');
      btn.id = 'btnCloudSync';
      btn.className = 'btn ghost cloud-sync';
      btn.title = 'Pull & push changes with cloud';
      btn.setAttribute('aria-label', 'Sync');

      if (isIOS) {
        btn.classList.add('icon');
        btn.textContent = '⟳';       // icon-only on iOS
      } else {
        btn.textContent = 'Sync';     // text on desktop/other devices
      }

      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const orig = btn.textContent;
        if (!isIOS) btn.textContent = 'Syncing...';
        try { await window.CloudSync.syncNow(); }
        catch (e) { console.warn(e); alert('Sync failed. Check network and API settings.'); }
        finally { btn.disabled = false; if (!isIOS) btn.textContent = orig; updateStatus(); }
      });

      bar.appendChild(btn);
    }

    // Make sure the dedicated status row is in place
    ensureStatusRow();
    updateStatus();
  }

  async function autoSyncOnOpen() {
    if (!navigator.onLine) { updateStatus(); return; }
    try { await window.CloudSync.syncNow(); } catch (e) { /* transient errors are ok */ }
    updateStatus();
  }

  window.addEventListener('DOMContentLoaded', () => {
    mountUI();
    // Let your app render first; then auto-sync
    setTimeout(autoSyncOnOpen, 250);
  });

  window.addEventListener('online', () => updateStatus());
  window.addEventListener('offline', () => updateStatus());
})();
