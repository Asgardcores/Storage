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

// Build units list from ranges
const unitsFromRanges = (ranges) => {
  const arr = [];
  for (const r of ranges){
    const s = Number(r.start), e = Number(r.end);
    if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
    if (e < s) continue;
    for (let n=s; n<=e; n++) arr.push(n);
  }
  return arr;
};

// Status helpers
const STATUS = ['Locked','Vacant','Overlocked','Issue'];
const statusPriority = (set) => {
  if (set.has('Issue')) return 'Issue';
  if (set.has('Overlocked')) return 'Overlocked';
  if (set.has('Locked')) return 'Locked';
  return 'Vacant';
};

// Map statuses to report blocks (simple)
function statusBlocksHTML(statuses){
  const order = ['Issue','Overlocked','Locked','Vacant'];
  const cls   = { Issue:'issue', Overlocked:'overlocked', Locked:'locked', Vacant:'vacant' };
  const have = order.filter(k => statuses.has(k));
  if (!have.length) return '<span class="muted">—</span>';
  return '<div class="status-cell">' +
         have.map(k => `<span class="status-block ${cls[k]}" title="${k}" aria-label="${k}"></span>`).join('') +
         '</div>';
}

// Effective statuses (current date or forward fallback)
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
 * Initialization *
 ***************/
function init(){
  // default ranges
  if (getRanges().length === 0) setRanges([{start:1,end:80}]);

  const dp = $('#datePicker'); if (dp) dp.value = state.dateISO;

  bindInputs(); // bind first so buttons work even if something below fails

  rebuildUnits();

  try { buildCarousel(); } catch(e){ console.warn('buildCarousel failed:', e); }
  try { wireStatusLegend(); } catch(e){ console.warn('legend failed:', e); }

  if (getVisibleUnits().length>0){
    try { loadUnit(currentUnit()); } catch(e){ console.warn('loadUnit failed:', e); }
  }else{
    const h = $('#history'); if (h) h.textContent = 'No history yet.';
  }

  try { updateReport(); } catch(e){ console.warn('updateReport failed:', e); }
  try { updateLastUpdatedLabel(); } catch(e){}

  try { setupPWA?.(); } catch(e){}
}

function rebuildUnits(){
  state.units = unitsFromRanges(getRanges());
  if (state.idx >= state.units.length) state.idx = 0;
}

/*********************
 * Edit Flush Utility *
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
 * Carousel UI   *
 ***************/
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
 * Data Binding  *
 ***************/
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

  // Reflect status buttons
  $$('.status-btn').forEach(btn=> { btn.dataset.active = statuses.has(btn.dataset.key); });

  // Comment + contact (use forward as placeholder)
  const forward = getForward()[unit] || {};
  $('#comment').value = data.comment ?? '';
  $('#comment').placeholder = forward.comment ? `(from previous) ${forward.comment}` : 'Comment (persists forward to future dates)';
  $('#contactName').value = data.name ?? forward.name ?? '';
  $('#contactPhone').value = data.phone ?? forward.phone ?? '';
  $('#contactNote').value = data.note ?? forward.note ?? '';

  // Mini box
  $('#miniNum').textContent = unit;
  $('#miniMulti').hidden = !((data.statuses||[]).length > 1);
  $('#miniNote').hidden = !((data.comment||forward.comment||'').trim().length>0);
  $('#miniDot').hidden = !wasModifiedToday(data.lastModified);

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

    // persist-forward statuses
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
 * Status / Inputs
 ***************/
function onToggleStatus(key){
  const unit = currentUnit();
  saveUnitChange(unit, rec => {
    const set = new Set(rec.statuses||[]);
    if (set.has(key)) set.delete(key); else set.add(key);
    rec.statuses = [...set];
  });
  loadUnit(unit);
  if (state.overlockedOnly){
    const vis = getVisibleUnits();
    if (!vis.includes(unit)) state.idx = Math.min(state.idx, Math.max(0, vis.length-1));
    buildCarousel();
  }
  updateReport();
}

let commentTimer;
function bindInputs(){
  // statuses
  $$('.status-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>onToggleStatus(btn.dataset.key));
  });

  // comment (debounce + blur)
  const cmt = $('#comment');
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

  // contacts
  ['contactName','contactPhone','contactNote'].forEach(id=>{
    const el = $('#'+id);
    el?.addEventListener('blur', ()=>{
      const unit = currentUnit(); if (unit==null) return;
      saveUnitChange(unit, rec => {
        rec.name  = $('#contactName')?.value || '';
        rec.phone = $('#contactPhone')?.value || '';
        rec.note  = $('#contactNote')?.value || '';
      });
      updateReport();
    });
  });

  // meta
  $$('.meta-size').forEach(ch=> ch.addEventListener('change', saveMeta));
  $$('.meta-type').forEach(ch=> ch.addEventListener('change', saveMeta));

  // nav
  $('#btnNext').addEventListener('click', nextUnit);
  $('#btnPrev').addEventListener('click', prevUnit);

  // date
  $('#datePicker').addEventListener('change', ()=>{
    flushCurrentEdits?.();
    state.dateISO = $('#datePicker').value || todayISO();
    buildCarousel();
    const vis = getVisibleUnits();
    if (vis.length>0){
      if (state.idx >= vis.length) state.idx = 0;
      loadUnit(currentUnit());
    } else {
      const h = $('#history'); if (h) h.textContent = 'No history yet.';
      const mn = $('#miniNum'); if (mn) mn.textContent = '—';
      $('#miniMulti')?.setAttribute('hidden','');
      $('#miniNote')?.setAttribute('hidden','');
      $('#miniDot')?.setAttribute('hidden','');
    }
    updateReport();
    updateLastUpdatedLabel();
  });

  // report toggle
  $('#btnReport').addEventListener('click', ()=>{
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
  $('#btnRanges').addEventListener('click', openRanges);
  $$('#rangesDrawer [data-close]').forEach(el=> el.addEventListener('click', closeRanges));
  $('#addRange').addEventListener('click', addRangeRow);
  $('#clearAllData').addEventListener('click', ()=>{
    if (confirm('This will remove ALL saved data, ranges, meta, and forward fields. Continue?')){
      localStorage.clear(); location.reload();
    }
  });

  // overlocked filter
  const filtBtn = $('#toggleOverlockedFilter');
  filtBtn.addEventListener('click', ()=>{
    flushCurrentEdits?.();
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
      const h = $('#history'); if (h) h.textContent = 'No history yet.';
      const mn = $('#miniNum'); if (mn) mn.textContent = '—';
      $('#miniMulti')?.setAttribute('hidden','');
      $('#miniNote')?.setAttribute('hidden','');
      $('#miniDot')?.setAttribute('hidden','');
    }
    highlightActivePill();
    centerActive();
  });

  // history
  $('#btnViewHistory').addEventListener('click', ()=>{
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

  $('#btnClearCommentFuture').addEventListener('click', ()=>{
    const unit = currentUnit(); if (unit==null) return;
    const fwd = getForward();
    if (fwd[unit]){ fwd[unit].comment = ''; setForward(fwd); }
    const rec = ensureUnitRecord(state.dateISO, unit);
    if (!rec.comment){ const c = $('#comment'); if (c) c.placeholder = 'Comment (persists forward to future dates)'; }
    reflectCarouselBadges(); updateReport();
  });

  // blueprint/report sheet
  $('#btnBlueprintImport').addEventListener('click', ()=> $('#blueprintFile')?.click());
  $('#blueprintFile').addEventListener('change', (e)=>{
    const f=e.target.files?.[0];
    if (f) importBlueprintFile(f, $('#optIncludeUnitsSheet')?.checked ?? true);
    e.target.value='';
  });
  $('#btnApplyStatusesSheet').addEventListener('click', applyStatusesToSheet);
  $('#btnSaveSheet').addEventListener('click', saveSheetXLSX);
  $('#btnPrintSheet').addEventListener('click', printSheet);
}

/***********
 * Report (fallback table)
 **********/
function updateReport(){
  const tbody = $('#reportTable tbody');
  tbody.innerHTML = '';

  const filters = new Set($$('#reportPage .toggle')
    .filter(t=>t.dataset.key && t.dataset.on==='true')
    .map(t=>t.dataset.key));

  const onlyModifiedToday = $('#toggleModifiedToday').dataset.on === 'true';

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
      <td>${statusBlocksHTML(statuses)}</td>
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
 * Ranges Drawer *
 ***************/
function openRanges(){ renderRangeList(); $('#rangesDrawer').setAttribute('open',''); }
function closeRanges(){ $('#rangesDrawer').removeAttribute('open'); }

function renderRangeList(){
  const list = $('#rangeList');
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
 * PWA: SW + Manifest
 ***************/
function setupPWA(){
  // Safe no-op if file:// or no sw.js
  if ('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
}

/* ========= Spreadsheet (Blueprint) integration ========= */
const sheetState = {
  rows: null,     // 2D array (AOA)
  hasHeader: true,
  name: null,
  pairs: []       // [{unitCol, statusCol}]
};

// Parse a unit number from any cell
function parseUnitNumber(v){
  const m = String(v ?? '').match(/\d+/);
  return m ? Number(m[0]) : NaN;
}

// Find all (Unit, Status) column PAIRS across the sheet
function detectPairs(rows){
  const hdr = rows[0] || [];
  const lower = hdr.map(v => String(v ?? '').toLowerCase().trim());
  const unitNames = ['unit','#','unit #','unit number','unitno','unit id','numbers','number'];
  const statusNames = ['status','statuses','state'];

  let hasHeader = lower.some(h => unitNames.includes(h) || statusNames.includes(h));
  const pairs = [];

  // Header-driven pairs (Unit followed by Status)
  if (hasHeader){
    for (let i=0; i<lower.length; i++){
      if (unitNames.includes(lower[i])){
        pairs.push({ unitCol: i, statusCol: i + 1 });
      }
    }
  }

  // Heuristic if none found
  if (pairs.length === 0){
    hasHeader = false;
    const rowsToScan = rows.slice(0, Math.min(rows.length, 50));
    const ncols = Math.max(0, ...rowsToScan.map(r => r.length));
    const unitScore = new Array(ncols).fill(0);
    for (const r of rowsToScan){
      for (let c=0; c<ncols; c++){
        if (Number.isFinite(parseUnitNumber(r[c]))) unitScore[c]++;
      }
    }
    for (let c=0; c<ncols; c++){
      if (unitScore[c] >= Math.max(3, rowsToScan.length * 0.5)){
        pairs.push({ unitCol: c, statusCol: c + 1 });
      }
    }
  }

  // Normalize (status immediately to the right)
  for (const p of pairs){ p.statusCol = p.unitCol + 1; }
  return { hasHeader, pairs };
}

// Ensure each pair has a writable Status column
function ensureStatusColumns(rows, pairs, hasHeader){
  const ensureLen = (row, len) => { while (row.length < len) row.push(''); };
  if (rows.length === 0) rows.push([]);

  for (const p of pairs){
    const need = p.unitCol + 2;
    ensureLen(rows[0], need);
    if (hasHeader){
      rows[0][p.unitCol]   = rows[0][p.unitCol]   || 'Unit';
      rows[0][p.unitCol+1] = rows[0][p.unitCol+1] || 'S'; // one-letter marks
    }
    for (let r = hasHeader ? 1 : 0; r < rows.length; r++){
      ensureLen(rows[r], need);
    }
    p.statusCol = p.unitCol + 1;
  }
}

// One-letter mark for sheet: I > O > V > '' (Locked/none)
function statusesToSheetMark(statuses){
  if (statuses.has('Issue')) return 'I';
  if (statuses.has('Overlocked')) return 'O';
  if (statuses.has('Vacant')) return 'V';
  return '';
}

// Apply effective statuses to EVERY Status column
function applyStatusesToSheet(){
  if (!sheetState.rows) return;
  ensureStatusColumns(sheetState.rows, sheetState.pairs, sheetState.hasHeader);

  const start = sheetState.hasHeader ? 1 : 0;
  for (let r = start; r < sheetState.rows.length; r++){
    for (const p of sheetState.pairs){
      const unit = parseUnitNumber(sheetState.rows[r][p.unitCol]);
      if (!Number.isFinite(unit)) continue;
      ensureUnitRecord(state.dateISO, unit);
      const statuses = effectiveStatusesForUnit(unit);
      sheetState.rows[r][p.statusCol] = statusesToSheetMark(statuses);
    }
  }
  renderSheet();
  $('#sheetStatus').textContent = 'Statuses applied.';
}

// Render sheet with highlights for unit/status columns
function renderSheet(){
  const host = $('#sheetHost');
  host.innerHTML = '';
  if (!sheetState.rows) return;

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  sheetState.rows.forEach((row, ri)=>{
    const tr = document.createElement('tr');
    row.forEach((cell, ci)=>{
      const el = (sheetState.hasHeader && ri===0) ? document.createElement('th') : document.createElement('td');
      if (sheetState.pairs.some(p=>p.unitCol===ci))   el.style.background = '#f6fbff'; // units
      if (sheetState.pairs.some(p=>p.statusCol===ci)) el.style.background = '#f9fff6'; // statuses
      el.textContent = (cell == null ? '' : String(cell));
      tr.appendChild(el);
    });
    if (sheetState.hasHeader && ri===0) thead.appendChild(tr); else tbody.appendChild(tr);
  });

  if (thead.children.length) table.appendChild(thead);
  table.appendChild(tbody);
  host.appendChild(table);

  $('#sheetMeta').textContent =
    `${sheetState.name||'Sheet'} — ${sheetState.rows.length} rows; pairs: ` +
    sheetState.pairs.map(p=>`[${p.unitCol+1}/${p.statusCol+1}]`).join(', ');
}

// Save the sheet to .xlsx
function saveSheetXLSX(){
  if (!sheetState.rows) return;
  const ws = XLSX.utils.aoa_to_sheet(sheetState.rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetState.name || 'Report');
  const fname = `report_${state.dateISO}.xlsx`;
  XLSX.writeFile(wb, fname);
}

// Print the sheet view (no scaling feature)
function printSheet(){
  if (!sheetState.rows){ alert('Load a blueprint first.'); return; }
  document.getElementById('sheetWrap').style.display = '';
  window.print();
}

// Compact contiguous units into ranges
function compactUnitsToRanges(units){
  const u = [...new Set(units)].map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  const out = []; let s=null, prev=null;
  for (const n of u){
    if (s===null){ s=n; prev=n; continue; }
    if (n === prev+1){ prev=n; continue; }
    out.push({start:s, end:prev}); s=n; prev=n;
  }
  if (s!==null) out.push({start:s, end:prev});
  return out;
}

// Simple CSV parser (quote-aware)
function parseCSV(text){
  const rows = []; let i=0, field='', row=[], q=false;
  const pushField = ()=>{ row.push(field); field=''; };
  const pushRow = ()=>{ rows.push(row); row=[]; };
  while(i<text.length){
    const c = text[i];
    if (q){
      if (c === '"'){
        if (text[i+1] === '"'){ field+='"'; i++; }
        else { q=false; }
      } else field += c;
    } else {
      if (c === '"') q=true;
      else if (c === ',') pushField();
      else if (c === '\n'){ pushField(); pushRow(); }
      else if (c === '\r'){ /* skip */ }
      else field += c;
    }
    i++;
  }
  pushField(); pushRow();
  while (rows.length && rows[rows.length-1].every(v=>String(v||'').trim()==='')) rows.pop();
  return rows;
}

// Import .xlsx/.csv blueprint, render, and optionally update carousel ranges
function importBlueprintFile(file, includeUnits){
  const name = (file?.name||'').toLowerCase();
  const finish = (rows, sheetName) => {
    rows = (rows||[]).map(r => Array.isArray(r) ? r : Array.from(r));
    while (rows.length && rows[rows.length-1].every(c => String(c??'').trim()==='')) rows.pop();

    const det = detectPairs(rows);
    sheetState.rows = rows;
    sheetState.hasHeader = det.hasHeader;
    sheetState.pairs = det.pairs;
    sheetState.name = sheetName || 'Sheet';

    ensureStatusColumns(sheetState.rows, sheetState.pairs, sheetState.hasHeader);

    if (includeUnits){
      const start = sheetState.hasHeader ? 1 : 0;
      const units = [];
      for (let r=start; r<rows.length; r++){
        for (const p of sheetState.pairs){
          const n = parseUnitNumber(rows[r][p.unitCol]);
          if (Number.isFinite(n)) units.push(n);
        }
      }
      if (units.length){
        const newRanges = compactUnitsToRanges(units);
        setRanges(newRanges);
        rebuildUnits();
        buildCarousel();
        if (getVisibleUnits().length>0) loadUnit(currentUnit());
      }
    }

    renderSheet();
    $('#sheetWrap').style.display = '';
    $('#sheetStatus').textContent = `Loaded: ${file.name}`;
    $('#btnApplyStatusesSheet').disabled = false;
    $('#btnSaveSheet').disabled = false;
    $('#btnPrintSheet').disabled = false;
  };

  if (name.endsWith('.csv')){
    const reader = new FileReader();
    reader.onload = () => { finish(parseCSV(reader.result), 'CSV'); };
    reader.readAsText(file);
    return;
  }

  // XLSX/XLS
  if (!window.XLSX){ alert('XLSX library not loaded.'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const wb = XLSX.read(reader.result, {type:'array'});
    const sn = wb.SheetNames[0];
    const ws = wb.Sheets[sn];
    const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
    finish(rows, sn);
  };
  reader.readAsArrayBuffer(file);
}

/* ========= end Spreadsheet integration ========= */

// Save META (sizes/types) per current unit
function saveMeta(){
  const unit = currentUnit();
  const meta = getMeta();
  meta[unit] = {
    sizes: $$('.meta-size').filter(x=>x.checked).map(x=>x.value),
    types: $$('.meta-type').filter(x=>x.checked).map(x=>x.value),
  };
  setMeta(meta);
}

// Boot
document.addEventListener('DOMContentLoaded', init);
