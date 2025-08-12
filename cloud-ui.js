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

  // Ensure a status row exists just above the carousel
  function ensu
