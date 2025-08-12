// ==== Cloud Sync (Cloudflare Worker) ====
// Fill these with YOUR values:
const CLOUD_ENDPOINT = 'https://sst-sync.c66dvym747.workers.dev/sst/v1'; // your Worker URL
const CLOUD_API_KEY  = 'z4k8S2xL-1yNfA7q-b93vV0W-ptR1mQ6'; // use the same secret you set in Cloudflare

// Your existing localStorage keys (do not change names)
const LS_KEYS = {
  RANGES: 'sst_ranges_v1',
  META: 'sst_unit_meta_v1',
  FORWARD: 'sst_forward_v1',
  STATUS_FWD: 'sst_status_forward_v1',
  DATE_PREFIX: 'sst_date_',
  LAST_SYNC: 'sst_lastSync_cloud'
};

const LS = {
  getRanges: () => JSON.parse(localStorage.getItem(LS_KEYS.RANGES) || '[]'),
  setRanges: (arr) => localStorage.setItem(LS_KEYS.RANGES, JSON.stringify(arr)),
  getMeta: () => JSON.parse(localStorage.getItem(LS_KEYS.META) || '{}'),
  setMeta: (obj) => localStorage.setItem(LS_KEYS.META, JSON.stringify(obj)),
  getFwd: () => JSON.parse(localStorage.getItem(LS_KEYS.FORWARD) || '{}'),
  setFwd: (obj) => localStorage.setItem(LS_KEYS.FORWARD, JSON.stringify(obj)),
  getStatusFwd: () => JSON.parse(localStorage.getItem(LS_KEYS.STATUS_FWD) || '{}'),
  setStatusFwd: (obj) => localStorage.setItem(LS_KEYS.STATUS_FWD, JSON.stringify(obj)),
  listDates: () => Object.keys(localStorage)
    .filter(k => k.startsWith(LS_KEYS.DATE_PREFIX))
    .map(k => k.replace(LS_KEYS.DATE_PREFIX,'')),
  getDate: (iso) => JSON.parse(localStorage.getItem(LS_KEYS.DATE_PREFIX + iso) || '{}'),
  setDate: (iso, data) => localStorage.setItem(LS_KEYS.DATE_PREFIX + iso, JSON.stringify(data)),
  getLastSync: () => localStorage.getItem(LS_KEYS.LAST_SYNC) || '1970-01-01T00:00:00.000Z',
  setLastSync: (iso) => localStorage.setItem(LS_KEYS.LAST_SYNC, iso)
};

const CloudSync = (() => {
  const nowISO = () => new Date().toISOString();

  function bundleLocal() {
    const meta = {
      ranges: LS.getRanges(),
      theme: LS.getMeta(),
      forward: { fields: LS.getFwd(), status: LS.getStatusFwd() }
    };
    const dates = {};
    for (const iso of LS.listDates()) dates[iso] = LS.getDate(iso);
    return { version: 1, meta, dates };
  }

  // Merge remote snapshot into local. Per {date,unit}, "newer wins" by lastModified
  function mergeRemote(remote) {
    if (!remote || typeof remote !== 'object') return;

    // meta: adopt remote only if we don't have anything locally
    if (remote.meta) {
      if (Array.isArray(remote.meta.ranges) && LS.getRanges().length === 0) {
        LS.setRanges(remote.meta.ranges);
      }
      if (remote.meta.theme && Object.keys(LS.getMeta()).length === 0) {
        LS.setMeta(remote.meta.theme);
      }
      if (remote.meta.forward) {
        const f = remote.meta.forward.fields || {};
        const sf = remote.meta.forward.status || {};
        if (Object.keys(LS.getFwd()).length === 0 && Object.keys(f).length) LS.setFwd(f);
        if (Object.keys(LS.getStatusFwd()).length === 0 && Object.keys(sf).length) LS.setStatusFwd(sf);
      }
    }

    // dates/units: record-level merge
    if (remote.dates && typeof remote.dates === 'object') {
      for (const [iso, units] of Object.entries(remote.dates)) {
        const local = LS.getDate(iso);
        const merged = { ...local };
        for (const [unit, rec] of Object.entries(units || {})) {
          const lrec = local[unit];
          const rlm = Date.parse(rec?.lastModified || 0);
          const llm = Date.parse(lrec?.lastModified || 0);
          merged[unit] = (rlm > llm) ? rec : (lrec ?? rec);
        }
        LS.setDate(iso, merged);
      }
    }
  }

  function countPendingSince(tsIso) {
    const ts = Date.parse(tsIso);
    let n = 0;
    for (const iso of LS.listDates()) {
      const data = LS.getDate(iso);
      for (const rec of Object.values(data)) {
        const lm = Date.parse(rec?.lastModified || 0);
        if (lm > ts) n++;
      }
    }
    return n;
  }

  async function pull() {
    const res = await fetch(CLOUD_ENDPOINT, {
      method: 'GET',
      headers: { 'X-API-Key': CLOUD_API_KEY }
    });
    if (!res.ok) throw new Error('Pull failed: ' + res.status);
    return res.json();
  }

  async function push(snapshot) {
    const res = await fetch(CLOUD_ENDPOINT, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': CLOUD_API_KEY
      },
      body: JSON.stringify(snapshot)
    });
    if (!res.ok) throw new Error('Push failed: ' + res.status);
  }

  async function syncNow() {
    const startedAt = nowISO();

    // 1) Pull
    const remote = await pull();

    // 2) Merge remote -> local
    mergeRemote(remote);

    // 3) Build merged snapshot to push (local has priority where newer)
    const snapshot = bundleLocal();

    // 4) Push back
    await push(snapshot);

    // 5) Mark synced
    LS.setLastSync(startedAt);
    return { lastSync: startedAt, pending: countPendingSince(startedAt) };
  }

  function getStatus() {
    const last = LS.getLastSync();
    return { lastSync: last, pending: countPendingSince(last) };
  }

  return { syncNow, getStatus };
})();

window.CloudSync = CloudSync;
