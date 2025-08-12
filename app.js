/********************
 * Utility & Storage *
 ********************/
const $ = (q, root=document) => root.querySelector(q);
const $$ = (q, root=document) => Array.from(root.querySelectorAll(q));
const todayISO = () => new Date().toISOString().slice(0,10);
const fmtUS = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  const mm = String(dt.getMonth()+1).padStart(2,'0');
  const dd = String(dt.getDate()).padStart(2,'0');
  const yy = String(dt.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy} ${dt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
};

// LocalStorage keys
const LS = {
  RANGES: 'sst_ranges_v1',
  META: 'sst_unit_meta_v1',
  FORWARD: 'sst_forward_v1',
  STATUS_FWD: 'sst_status_forward_v1',
  DATE_DATA_PREFIX: 'sst_date_',
};

const getRanges = () => JSON.parse(localStorage.getItem(LS.RANGES) || '[]');
const setRanges = (arr) => localStorage.setItem(LS.RANGES, JSON.stringify(arr));
const getMeta = () => JSON.parse(localStorage.getItem(LS.META) || '{}');
const setMeta = (obj) => localStorage.setItem(LS.META, JSON.stringify(obj));
const getForward = () => JSON.parse(localStorage.getItem(LS.FORWARD) || '{}');
const setForward = (obj) => localStorage.setItem(LS.FORWARD, JSON.stringify(obj));
const getStatusForward = () => JSON.parse(localStorage.getItem(LS.STATUS_FWD) || '{}');
const setStatusForward = (obj) => localStorage.setItem(LS.STATUS_FWD, JSON.stringify(obj));
const dateKey = (iso) => LS.DATE_DATA_PREFIX + iso;
const getDateData = (iso) => JSON.parse(localStorage.getItem(dateKey(iso)) || '{}');
const setDateData = (iso, data) => localStorage.setItem(dateKey(iso), JSON.stringify(data));

// Units from ranges
const unitsFromRanges = (ranges) => {
  const out = [];
  for (const r of ranges){
    const s = Number(r.start), e = Number(r.end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) continue;
    for (let n=s; n<=e; n++) out.push(n);
  }
  return out;
};

// Status helpers
const STATUS = ['Locked','Vacant','Overlocked','Issue'];
const statusPriority = (set) => {
  if (set.has('Issue')) return 'Issue';
  if (set.has('Overlocked')) return 'Overlocked';
  if (set.has('Locked')) return 'Locked';
  return 'Vacant';
};

function effectiveStatusesForUnit(n){
  const data = getDateData(state.dateISO);
  const rec = data[n] || {};
  const fromDate = new Set(rec.statuses || []);
  if (fromDate.size > 0) return fromDate;
  const fwd = getStatusForward();
  return new Set(fwd[n] || []);
}

// Global state
const state = {
  dateISO: todayISO(),
  units: [],
  idx: 0,
  overlockedOnly: false,
};

/****************
 * Init
 ****************/
function init(){
  if (getRanges().length === 0) setRanges([{start:1,end:80}]);

  const dp = $('#datePicker'); if (dp) dp.value = state.dateISO;

  rebuildUnits();
  buildCarousel();
  wireStatusLegend();

  const vis = getVisibleUnits();
  if (vis.length) loadUnit(currentUnit());
  updateReport();
  updateLastUpdatedLabel();

  bindInputs();
  setupPWA();
}

function rebuildUnits(){
  state.units = unitsFromRanges(getRanges());
  if (state.idx >= state.units.length) state.idx = 0;
}

/*********************
 * Edit flush
 *********************/
function flushCurrentEdits(){
  clearTimeout(commentTimer);
  const unit = currentUnit();
  if (unit == null) return;
  const nameEl = $('#contactName'), phoneEl = $('#contactPhone'), noteEl = $('#contactNote');
  const commentEl = $('#comment');
  saveUnitChange(unit, rec => {
    if (commentEl) rec.comment = commentEl.value;
    if (nameEl) rec.name = nameEl.value;
    if (phoneEl) rec.phone = phoneEl.value;
    if (noteEl) rec.note = noteEl.value;
  });
}

/****************
 * Carousel
 ****************/
function getVisibleUnits(){
  const base = state.units || [];
  if (!state.overlockedOnly) return base;
  return base.filter(n => effectiveStatusesForUnit(n).has('Overlocked'));
}

function buildCarousel(){
  const car = $('#carousel');
  const arr = getVisibleUnits();
  car.innerHTML = '';
  if (arr.length === 0){
    car.innerHTML = '<div class="muted" style="padding:.35rem .5rem">No Overlocked units for this date.</div>';
    return;
  }
  for (const n of arr){
    const pill = document.createElement('button');
    pill.className = 'unit-pill';
    pill.type = 'button';
    pill.dataset.unit = n;
    pill.innerHTML = `
      <span class="badge dot" hidden></span>
      <span class="badge multi" hidden>†</span>
      <span class="badge note" hidden>*</span>
      <span>${n}</span>`;
    pill.addEventListener('click', ()=>gotoUnitByNumber(n));
    car.appendChild(pill);
  }
  reflectCarouselBadges();
  setTimeout(centerActive, 30);
}

function reflectCarouselBadges(){
  const data = getDateData(state.dateISO);
  const forward = getForward();
  $$('#carousel .unit-pill').forEach(p=>{
    const n = Number(p.dataset.unit);
    const statuses = effectiveStatusesForUnit(n);
    const hasMulti = statuses.size > 1;
    const rec = data[n] || {};
    const hasComment = (rec.comment ?? forward[n]?.comment ?? '').trim().length > 0;
    p.querySelector('.badge.multi').hidden = !hasMulti;
    p.querySelector('.badge.note').hidden = !hasComment;
    const key = statusPriority(statuses);
    const doc = document.documentElement;
    const colorVar = key==='Locked'?'--ok':key==='Overlocked'?'--overlocked':key==='Issue'?'--issue':'--vacant';
    const bg = getComputedStyle(doc).getPropertyValue(colorVar);
    p.style.background = key === 'Vacant' ? '#ffffff' : bg;
    p.style.color = key === 'Vacant' ? '#234a73' : '#fff';
  });
  highlightActivePill();
}

function highlightActivePill(){
  $$('#carousel .unit-pill').forEach(p=>p.classList.toggle('active', Number(p.dataset.unit)===currentUnit()));
}

function centerActive(){
  const car = $('#carousel');
  const n = currentUnit();
  const pill = car.querySelector(`.unit-pill[data-unit="${n}"]`);
  if (pill){ pill.scrollIntoView({block:'nearest', inline:'center'}); }
}

function currentUnit(){
  const vis = getVisibleUnits();
  return vis[state.idx];
}

function gotoUnitByNumber(n){
  flushCurrentEdits();
  const vis = getVisibleUnits();
  const i = vis.indexOf(Number(n));
  if (i >= 0){ state.idx = i; loadUnit(currentUnit()); highlightActivePill(); centerActive(); }
}

function nextUnit(){
  flushCurrentEdits();
  const vis = getVisibleUnits();
  if (state.idx < vis.length-1){ state.idx++; loadUnit(currentUnit()); highlightActivePill(); centerActive(); }
}
function prevUnit(){
  flushCurrentEdits();
  const vis = getVisibleUnits();
  if (state.idx > 0){ state.idx--; loadUnit(currentUnit()); highlightActivePill(); centerActive(); }
}

/****************
 * Data binding
 ****************/
function ensureUnitRecord(iso, unit){
  const data = getDateData(iso);
  if (!data[unit]){
    const fwd = getForward()[unit] || {};
    const statusFwd = getStatusForward()[unit] || [];
    data[unit] = { statuses: [...statusFwd], comment: fwd.comment || '', name: fwd.name||'', phone: fwd.phone||'', note: fwd.note||'', lastModified: null, history: [] };
    setDateData(iso, data);
  }
  return getDateData(iso)[unit];
}

function loadUnit(unit){
  if (unit == null) return;
  ensureUnitRecord(state.dateISO, unit);
  const data = getDateData(state.dateISO)[unit];
  const statuses = new Set(data.statuses||[]);

  // Status buttons
  $$('.status-btn').forEach(btn=> { btn.dataset.active = statuses.has(btn.dataset.key); });

  // Comment + contact (show forward as placeholders if blank)
  const forward = getForward()[unit] || {};
  $('#comment').value = data.comment ?? '';
  $('#comment').placeholder = forward.comment ? `(from previous) ${forward.comment}` : 'Comment (persists forward to future dates)';
  $('#contactName').value = data.name ?? forward.name ?? '';
  $('#contactPhone').value = data.phone ?? forward.phone ?? '';
  $('#contactNote').value = data.note ?? forward.note ?? '';

  // Mini
  $('#miniNum')?.textContent = unit;
  $('#miniMulti')?.toggleAttribute('hidden', !((data.statuses||[]).length > 1));
  $('#miniNote')?.toggleAttribute('hidden', !((data.comment||forward.comment||'').trim().length>0));
  $('#miniDot')?.toggleAttribute('hidden', !wasModifiedToday(data.lastModified));

  renderHistoryPreview(data.history||[]);
  reflectCarouselBadges();
}

function wasModifiedToday(ts){
  if (!ts) return false;
  const d = new Date(ts);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function saveUnitChange(unit, updater){
  const iso = state.dateISO;
  const all = getDateData(iso);
  const rec = all[unit] || {statuses:[], comment:'', name:'', phone:'', note:'', lastModified:null, history:[]};
  const before = JSON.stringify(rec);
  updater(rec);
  const after = JSON.stringify(rec);
  if (before !== after){
    rec.lastModified = new Date().toISOString();
    rec.history = rec.history || [];
    rec.history.push({ t: rec.lastModified, data: { statuses:[...new Set(rec.statuses||[])], comment:rec.comment||'', name:rec.name||'', phone:rec.phone||'', note:rec.note||'' } });
    all[unit] = rec;
    setDateData(iso, all);

    // persist-forward statuses + fields
    const sf = getStatusForward();
    sf[unit] = [...new Set(rec.statuses||[])];
    setStatusForward(sf);
    updateForwardFrom(rec, unit);

    updateLastUpdatedLabel();
  }
}

function updateForwardFrom(rec, unit){
  const fwd = getForward();
  const prev = fwd[unit] || {};
  fwd[unit] = { comment: rec.comment || prev.comment || '', name: rec.name || prev.name || '', phone: rec.phone || prev.phone || '', note: rec.note || prev.note || '' };
  setForward(fwd);
}

function renderHistoryPreview(history){
  const h = $('#history');
  if (!history || history.length===0){ h.textContent = 'No history yet.'; return; }
  const last = history[history.length-1];
  h.innerHTML = `<div>Last change: <strong>${fmtUS(last.t)}</strong></div>`;
}

function updateLastUpdatedLabel(){
  const data = getDateData(state.dateISO);
  const latest = Object.values(data).map(v=>v.lastModified).filter(Boolean).sort().pop();
  $('#lastUpdatedLabel').textContent = latest ? fmtUS(latest) : '';
}

/****************
 * Inputs
 ****************/
let commentTimer;
function bindInputs(){
  // statuses
  $$('.status-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>onToggleStatus(btn.dataset.key));
  });

  // comment (debounce + blur)
  const cmt = $('#comment');
  if (cmt){
    cmt.addEventListener('input', ()=>{
      clearTimeout(commentTimer);
      commentTimer = setTimeout(()=>{
        const unit = currentUnit(); if (unit==null) return;
        saveUnitChange(unit, rec => { rec.comment = $('#comment').value; });
        reflectCarouselBadges(); updateReport();
        if (state.overlockedOnly) buildCarousel();
      }, 800);
    });
    cmt.addEventListener('blur', ()=>{
      const unit = currentUnit(); if (unit==null) return;
      saveUnitChange(unit, rec => { rec.comment = $('#comment').value; });
      reflectCarouselBadges(); updateReport();
      if (state.overlockedOnly) buildCarousel();
    });
  }

  // contacts
  ['contactName','contactPhone','contactNote'].forEach(id=>{
    const el = $('#'+id);
    if (!el) return;
    el.addEventListener('blur', ()=>{
      const unit = currentUnit(); if (unit==null) return;
      saveUnitChange(unit, rec => {
        rec.name  = $('#contactName')?.value || '';
        rec.phone = $('#contactPhone')?.value || '';
        rec.note  = $('#contactNote')?.value || '';
      });
      updateReport();
    });
  });

  // nav
  $('#btnNext')?.addEventListener('click', nextUnit);
  $('#btnPrev')?.addEventListener('click', prevUnit);

  // date
  $('#datePicker')?.addEventListener('change', ()=>{
    flushCurrentEdits();
    state.dateISO = $('#datePicker').value || todayISO();
    buildCarousel();
    const vis = getVisibleUnits();
    if (vis.length>0){
      if (state.idx >= vis.length) state.idx = 0;
      loadUnit(currentUnit());
    } else {
      $('#history').textContent = 'No history yet.';
      $('#miniNum').textContent = '—';
      $('#miniMulti').setAttribute('hidden','');
      $('#miniNote').setAttribute('hidden','');
      $('#miniDot').setAttribute('hidden','');
    }
    updateReport();
    updateLastUpdatedLabel();
  });

  // report toggle
  $('#btnReport')?.addEventListener('click', ()=>{
    const page = $('#reportPage'); if (!page) return;
    page.toggleAttribute('active');
    if (page.hasAttribute('active')){ updateReport(); page.scrollIntoView({behavior:'smooth'}); }
  });

  // report filter toggles
  $$('#reportPage .toggle').forEach(t=>{
    t.addEventListener('click', ()=>{
      t.dataset.on = (t.dataset.on === 'true') ? 'false' : 'true';
      updateReport();
    });
  });

  // ranges
  $('#btnRanges')?.addEventListener('click', openRanges);
  $$('#rangesDrawer [data-close]').forEach(el=> el.addEventListener('click', closeRanges));
  // Also close on ESC anywhere:
  document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeRanges(); });

  $('#addRange')?.addEventListener('click', addRangeRow);
  $('#clearAllData')?.addEventListener('click', ()=>{
    if (confirm('This will remove ALL saved data, ranges, meta, and forward fields. Continue?')){
      localStorage.clear(); location.reload();
    }
  });

  // history helpers
  $('#btnViewHistory')?.addEventListener('click', ()=>{
    const unit = currentUnit(); if (unit==null) return;
    const rec = ensureUnitRecord(state.dateISO, unit);
    const lines = (rec.history||[]).map(h=>{
      const st = (h.data?.statuses||[]).join(', ') || '—';
      const cm = (h.data?.comment||'').trim();
      return `${fmtUS(h.t)} — [${st}]${cm?` — ${cm}`:''}`;
    });
    alert(lines.length
      ? `History for unit ${unit}\n\n• ${lines.join('\n• ')}`
      : 'No history yet.');
  });

  $('#btnClearCommentFuture')?.addEventListener('click', ()=>{
    const unit = currentUnit(); if (unit==null) return;
    const fwd = getForward();
    if (fwd[unit]){ fwd[unit].comment = ''; setForward(fwd); }
    const rec = ensureUnitRecord(state.dateISO, unit);
    if (!rec.comment){ const c = $('#comment'); if (c) c.placeholder = 'Comment (persists forward to future dates)'; }
    reflectCarouselBadges(); updateReport();
  });

  // overlocked filter
  const filtBtn = $('#toggleOverlockedFilter');
  filtBtn?.addEventListener('click', ()=>{
    flushCurrentEdits();
    const curr = currentUnit();
    state.overlockedOnly = !state.overlockedOnly;
    filtBtn.dataset.on = String(state.overlockedOnly);
    filtBtn.setAttribute('aria-pressed', state.overlockedOnly ? 'true' : 'false');
    const vis = getVisibleUnits();
    state.idx = Math.max(0, vis.indexOf(curr));
    buildCarousel();
    if (vis.length > 0){
      if (state.idx < 0) state.idx = 0;
      loadUnit(currentUnit());
    } else {
      $('#history').textContent = 'No history yet.';
      $('#miniNum').textContent = '—';
      $('#miniMulti').setAttribute('hidden','');
      $('#miniNote').setAttribute('hidden','');
      $('#miniDot').setAttribute('hidden','');
    }
    highlightActivePill();
    centerActive();
  });
}

/***********
 * Report
 **********/
function updateReport(){
  const tbody = $('#reportTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filters = new Set($$('#reportPage .toggle')
    .filter(t=>t.dataset.key && t.dataset.on==='true')
    .map(t=>t.dataset.key));

  const onlyModifiedToday = $('#toggleModifiedToday')?.dataset.on === 'true';

  const data = getDateData(state.dateISO);
  const forward = getForward();

  for (const n of state.units){
    const statuses = effectiveStatusesForUnit(n);
    const rec = data[n] || {};
    const comment = (rec.comment ?? forward[n]?.comment ?? '').trim();

    if (statuses.size===1 && statuses.has('Locked') && !comment) continue;

    if (filters.size>0){
      const hasAny = [...statuses].some(s=>filters.has(s));
      if (!hasAny) continue;
    }

    if (onlyModifiedToday && !wasModifiedToday(rec.lastModified)) continue;

    const namePhone = [(rec.name||forward[n]?.name||''), (rec.phone||forward[n]?.phone||'')]
      .filter(Boolean).join(' / ');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${n}</strong>${ (statuses.size>1) ? ' <span title="Multiple statuses">†</span>':'' }${ comment ? ' <span title="Has comment">*</span>':'' }</td>
      <td>${[...statuses].join(', ') || '<span class="muted">—</span>'}</td>
      <td>${comment || '<span class="muted">—</span>'}</td>
      <td>${namePhone || '<span class="muted">—</span>'}</td>
      <td>${rec.lastModified ? fmtUS(rec.lastModified) : '<span class="muted">—</span>'}</td>`;
    tbody.appendChild(tr);
  }
}

function wireStatusLegend(){
  const legend = $('#statusLegend');
  legend.innerHTML = '';
  const items = [ ['Locked','ok'], ['Vacant','vacant'], ['Overlocked','overlocked'], ['Issue','issue'] ];
  for (const [label, key] of items){
    const div = document.createElement('div');
    div.className = 'legend-pill';
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = getComputedStyle(document.documentElement).getPropertyValue(`--${key}`);
    div.appendChild(sw);
    div.appendChild(document.createTextNode(label));
    legend.appendChild(div);
  }
}

/****************
 * Ranges Drawer
 ****************/
function openRanges(){ renderRangeList(); $('#rangesDrawer')?.setAttribute('open',''); }
function closeRanges(){ $('#rangesDrawer')?.removeAttribute('open'); }

function renderRangeList(){
  const list = $('#rangeList');
  if (!list) return;
  list.innerHTML = '';
  const ranges = getRanges();
  ranges.forEach((r, idx)=>{
    const row = document.createElement('div');
    row.className = 'range-item';
    row.innerHTML = `
      <input inputmode="numeric" pattern="[0-9]*" value="${r.start}" aria-label="Start" />
      <input inputmode="numeric" pattern="[0-9]*" value="${r.end}" aria-label="End" />
      <button class="icon-btn" data-act="up">▲</button>
      <button class="icon-btn" data-act="down">▼</button>
      <button class="icon-btn" data-act="del">✕</button>
    `;
    const [s,e,up,down,del] = row.children;
    s.addEventListener('change', ()=>{ r.start = Number(s.value||0); saveRanges(); });
    e.addEventListener('change', ()=>{ r.end = Number(e.value||0); saveRanges(); });
    up.addEventListener('click', ()=>{ if (idx>0){ const a=ranges[idx-1]; ranges[idx-1]=r; ranges[idx]=a; saveRanges(); } });
    down.addEventListener('click', ()=>{ if (idx<ranges.length-1){ const a=ranges[idx+1]; ranges[idx+1]=r; ranges[idx]=a; saveRanges(); } });
    del.addEventListener('click', ()=>{ ranges.splice(idx,1); saveRanges(); });
    list.appendChild(row);
  });
}

function saveRanges(){
  const list = $('#rangeList');
  if (!list) return;
  const rows = Array.from(list.children);
  const ranges = rows.map(r=>({ start:Number(r.children[0].value||0), end:Number(r.children[1].value||0) }))
                     .filter(x=>Number.isFinite(x.start) && Number.isFinite(x.end));
  setRanges(ranges);
  rebuildUnits();
  buildCarousel();
  if (getVisibleUnits().length>0) loadUnit(currentUnit());
  updateReport();
}

function addRangeRow(){
  const ranges = getRanges();
  const last = ranges[ranges.length-1];
  const start = last ? Number(last.end)+1 : 1;
  ranges.push({start, end:start+9});
  setRanges(ranges);
  renderRangeList();
  rebuildUnits();
  buildCarousel();
  if (getVisibleUnits().length>0) loadUnit(currentUnit());
  updateReport();
}

/****************
 * PWA
 ****************/
function setupPWA(){
  if ('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
}

// Boot
document.addEventListener('DOMContentLoaded', init);
