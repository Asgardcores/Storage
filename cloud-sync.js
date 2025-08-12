// ==== Cloud Sync (Cloudflare Worker) ====
// Update these with YOUR values:
(function(){
  const ENDPOINT = 'https://sst-sync.c66dvym747.workers.dev/sst/v1'; // your Worker URL
  const API_KEY  = '<<<PASTE-YOUR-API-KEY>>>'; // same secret you set in Cloudflare

  // LocalStorage keys (kept identical to your app; just not global)
  const K = {
    RANGES: 'sst_ranges_v1',
    META: 'sst_unit_meta_v1',
    FWD_FIELDS: 'sst_forward_v1',
    FWD_STATUS: 'sst_status_forward_v1',
    DATE_PREFIX: 'sst_date_',
    LAST_SYNC: 'sst_lastSync_cloud'
  };

  const store = {
    getRanges: () => JSON.parse(localStorage.getItem(K.RANGES) || '[]'),
    setRanges: v => localStorage.setItem(K.RANGES, JSON.stringify(v)),
    getMeta: () => JSON.parse(localStorage.getItem(K.META) || '{}'),
    setMeta: v => localStorage.setItem(K.META, JSON.stringify(v)),
    getFwdFields: () => JSON.parse(localStorage.getItem(K.FWD_FIELDS) || '{}'),
    setFwdFields: v => localStorage.setItem(K.FWD_FIELDS, JSON.stringify(v)),
    getFwdStatus: () => JSON.parse(localStorage.getItem(K.FWD_STATUS) || '{}'),
    setFwdStatus: v => localStorage.setItem(K.FWD_STATUS, JSON.stringify(v)),
    listDates: () => Object.keys(localStorage)
      .filter(k => k.startsWith(K.DATE_PREFIX))
      .map(k => k.slice(K.DATE_PREFIX.length)),
    getDate: iso => JSON.parse(localStorage.getItem(K.DATE_PREFIX + iso) || '{}'),
    setDate: (iso, data) => localStorage.setItem(K.DATE_PREFIX + iso, JSON.stringify(data)),
    getLastSync: () => localStorage.getItem(K.LAST_SYNC) || '1970-01-01T00:00:00.000Z',
    setLastSync: iso => localStorage.setItem(K.LAST_SYNC, iso),
  };

  const nowISO = () => new Date().toISOString();

  function bundleLocal() {
    const meta = {
      ranges: store.getRanges(),
      theme: store.getMeta(),
      forward: { fields: store.getFwdFields(), status: store.getFwdStatus() }
    };
    const dates = {};
    for (const iso of store.listDates()) dates[iso] = store.getDate(iso);
    return { version: 1, meta, dates };
  }

  // Merge remote snapshot into local; per {date,unit}: newer (by lastModified) wins
  function mergeRemote(remote) {
    if (!remote || typeof remote !== 'object') return;

    // meta: adopt remote only if local is empty (so we don't wipe your current setup)
    if (remote.meta) {
      if (Array.isArray(remote.meta.ranges) && store.getRanges().length === 0) {
        store.setRanges(remote.meta.ranges);
      }
      if (remote.meta.theme && Object.keys(store.getMeta()).length === 0) {
        store.setMeta(remote.meta.theme);
      }
      if (remote.meta.forward) {
        const f = remote.meta.forward.fields || {};
        const sf = remote.meta.forward.status || {};
        if (Object.keys(store.getFwdFields()).length === 0 && Object.keys(f).length) store.setFwdFields(f);
        if (Object.keys(store.getFwdStatus()).length === 0 && Object.keys(sf).length) store.setFwdStatus(sf);
      }
    }

    // dates/units merge
    if (remote.dates && typeof remote.dates === 'object') {
      for (const [iso, units] of Object.entries(remote.dates)) {
        const local = store.getDate(iso);
        const merged = { ...local };
        for (const [unit, rec] of Object.entries(units || {})) {
          const lrec = local[unit];
          const rlm = Date.parse(rec?.lastModified || 0);
          const llm = Date.parse(lrec?.lastModified || 0);
          merged[unit] = (rlm > llm) ? rec : (lrec ?? rec);
        }
        store.setDate(iso, merged);
      }
    }
  }

  function countPendingSince(tsIso) {
    const ts = Date.parse(tsIso);
    let n = 0;
    for (const iso of store.listDates()) {
      const data = store.getDate(iso);
      for (const rec of Object.values(data)) {
        const lm = Date.parse(rec?.lastModified || 0);
        if (lm > ts) n++;
      }
    }
    return n;
  }

  async function pull() {
    const res = await fetch(ENDPOINT, { method: 'GET', headers: { 'X-API-Key': API_KEY } });
    if (!res.ok) throw new Error('Pull failed: ' + res.status);
    return res.json();
  }

  async function push(snapshot) {
    const res = await fetch(ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify(snapshot)
    });
    if (!res.ok) throw new Error('Push failed: ' + res.status);
  }

  async function syncNow() {
    const startedAt = nowISO();

    // 1) Pull cloud snapshot
    const remote = await pull();

    // 2) Merge -> local
    mergeRemote(remote);

    // 3) Build local snapshot (local newer wins)
    const snapshot = bundleLocal();

    // 4) Push merged back to cloud
    await push(snapshot);

    // 5) Mark synced
    store.setLastSync(startedAt);
    return { lastSync: startedAt, pending: countPendingSince(startedAt) };
  }

  function getStatus() {
    const last = store.getLastSync();
    return { lastSync: last, pending: countPendingSince(last) };
  }

  // Expose ONLY this
  window.CloudSync = { syncNow, getStatus };
})();
