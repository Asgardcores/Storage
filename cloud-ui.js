(function(){
  const $ = (q, r=document) => r.querySelector(q);
  function fmt(d){
    if (!d || d === '1970-01-01T00:00:00.000Z') return 'never';
    const dt = new Date(d);
    const mm = String(dt.getMonth()+1).padStart(2,'0');
    const dd = String(dt.getDate()).padStart(2,'0');
    const yy = String(dt.getFullYear()).toString().slice(-2);
    return `${mm}/${dd}/${yy} ${dt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
  }
  function updateStatus(){
    const s = window.CloudSync?.getStatus();
    const el = $('#syncStatus');
    if (el && s) el.textContent = `Last synced: ${fmt(s.lastSync)} • Pending: ${s.pending}`;
  }

  function mountUI(){
    // Try to find the toolbar; fall back to the header tag
    const bar = document.querySelector('header .toolbar') || document.querySelector('header');
    if (!bar || $('#btnCloudSync')) return;

    const btn = document.createElement('button');
    btn.id = 'btnCloudSync';
    btn.className = 'btn ghost';
    btn.textContent = 'Sync';
    btn.title = 'Pull & push changes with cloud';

    const status = document.createElement('span');
    status.id = 'syncStatus';
    status.className = 'muted';
    status.style.marginLeft = '8px';

    bar.appendChild(btn);
    bar.appendChild(status);

    btn.addEventListener('click', async ()=>{
      btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Syncing...';
      try { await window.CloudSync.syncNow(); }
      catch (e){ console.warn(e); alert('Sync failed. Check network and API settings.'); }
      finally { btn.disabled = false; btn.textContent = orig; updateStatus(); }
    });

    updateStatus();
  }

  async function autoSyncOnOpen(){
    if (!navigator.onLine) { updateStatus(); return; }
    try { await window.CloudSync.syncNow(); } catch (e) { /* ignore transient */ }
    updateStatus();
  }

  window.addEventListener('DOMContentLoaded', ()=>{
    mountUI();
    // Let your app render first; then auto-sync
    setTimeout(autoSyncOnOpen, 250);
  });

  window.addEventListener('online', ()=> updateStatus());
  window.addEventListener('offline', ()=> updateStatus());
})();
