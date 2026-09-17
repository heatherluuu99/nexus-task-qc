// UI shell: state, helpers, routing, event delegation. Rendering is string-based and fully re-derived from the store.
'use strict';
const C = NexusCore;
let S = NexusSeed.seed();
const ROLES = {
  author: { label: 'Author', name: NexusSeed.PEOPLE.AUTHOR },
  reviewer: { label: 'Reviewer', name: NexusSeed.PEOPLE.REVIEWER },
  engineer: { label: 'Engineer', name: NexusSeed.PEOPLE.ENGINEER },
  delivery: { label: 'Delivery Manager', name: NexusSeed.PEOPLE.DM }
};
const ui = {
  role: 'reviewer',
  lib: { tab: 'queue', q: '', review: 'all', grader: 'all', solv: 'all', elig: 'all', structure: 'all', scope: 'shown' },
  detail: { key: null, tab: 'runs', runId: null, open: {}, viewed: {}, auditing: null, agree: null, cmpFrom: null, cmpTo: null, gatesOpen: false, otherReviews: false },
  setTab: {}, f: {}, modal: null, toast: null
};
const me = () => ROLES[ui.role].name;
const roleIs = (...r) => r.includes(ui.role);

// ---------- html helpers ----------
const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pretty = x => String(x || '').replace(/_/g, ' ');
const fmt = iso => { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); };
const fmtDay = iso => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const shortRef = vid => { const [a, h] = vid.split('#'); return `${a}#${h}`; };
const vRef = vid => `<span class="mono">${esc(shortRef(vid))}</span>`;
const chip = (text, tone = 'neutral', extra = '') => `<span class="chip ${tone} ${extra}">${text}</span>`;
const frac = (a, b, lowN = true) => `${a}/${b}${lowN && b > 0 && b < 5 ? ' <span class="faint small">· low n</span>' : ''}`;

const REVIEW_TONE = { 'Draft': 'neutral', 'Ready for Review': 'info', 'Approved': 'ok', 'Changes Requested': 'warn', 'Blocked': 'bad', 'Withdrawn': 'bad strike', 'Deprecated': 'neutral strike' };
const reviewChip = v => chip(esc(v.review_status), REVIEW_TONE[v.review_status]);
function healthChip(h) {
  const m = { 'Healthy': ['ok', '●'], 'Potential Issue': ['warn', '▲'], 'Confirmed Issue': ['bad', '✖'], 'Not Evaluated': ['neutral', '○'] }[h.state];
  return chip(`${m[1]} ${esc(h.state)}${h.sub ? ' · ' + esc(h.sub) : ''}`, m[0]);
}
function eligChip(e) {
  if (e.eligible) return chip('✓ Eligible', 'ok');
  if (e.state === 'Withdrawn') return chip('Withdrawn', 'bad');
  return chip(`Not eligible (${e.reasons.length})`, 'outline');
}
const solvChip = v => v.solvability ? chip('✓ Verified', 'ok') : chip('Missing', 'warn');
function strip(s, v, big) {
  return `<span class="strip ${big ? 'big' : ''}">${C.runsOf(s, v.id).map(r => {
    const valid = C.isValidRun(s, r), a = C.auditOf(s, r.id);
    const cls = [r.result === 'pass' && valid ? 'p' : '', !valid ? 'x' : '', a ? (a.verdict === 'valid' ? 'av' : 'ai') : '', r.source === 'customer' ? 'cust' : '', big && ui.detail.runId === r.id ? 'sel' : ''].join(' ');
    const mark = big && a ? (a.verdict === 'valid' ? '✓' : '✗') : '';
    return `<i class="${cls}" title="${esc(r.label)} · ${esc(r.result)}${a ? ' · audited ' + a.verdict : ''}" ${big ? `data-act="selRun" data-run="${r.id}"` : ''}>${mark}</i>`;
  }).join('')}</span>`;
}
function auditCell(s, v) {
  const st = C.auditStatus(s, v);
  const other = s.audits.filter(a => a.version_id === v.id && a.sampled_by !== 'random');
  const otherBad = other.filter(a => a.verdict === 'invalid').length;
  const extra = other.length ? `<div class="small ${otherBad ? 'cell-bad' : 'faint'}">${other.length - otherBad}/${other.length} valid in customer/ad hoc</div>` : '';
  if (!st.passes && !st.required) return `<span class="faint" style="white-space:nowrap">no passes</span>${extra}`;
  if (!st.complete) return chip(`${st.audited}/${st.required} audited`, 'warn') + extra;
  const low = st.audited < 5 ? ' <span class="faint small">· low n</span>' : '';
  return `<span class="${st.invalid ? 'cell-bad' : ''}">${st.valid}/${st.audited} valid</span>${low}${extra}`;
}
function btn(label, act, o = {}) {
  const need = o.need && !roleIs(...o.need);
  const disabled = o.disabled || need;
  const title = need ? `Switch "Viewing as" to ${o.need.map(r => ROLES[r].label).join(' or ')}` : (o.title || '');
  const data = Object.entries(o.data || {}).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
  return `<button class="btn ${o.cls || ''}" data-act="${act}" ${data} ${disabled ? 'disabled' : ''} title="${esc(title)}">${label}</button>`;
}

// ---------- form state ----------
const form = (key, init) => { if (!ui.f[key]) ui.f[key] = typeof init === 'function' ? init() : (init || {}); return ui.f[key]; };
const bind = (key, field) => `data-bind="${esc(key)}" data-field="${esc(field)}"`;
const val = (key, field) => esc((ui.f[key] || {})[field] == null ? '' : ui.f[key][field]);
const opt = (value, label, cur) => `<option value="${esc(value)}" ${String(cur) === String(value) ? 'selected' : ''}>${esc(label)}</option>`;
const selectF = (key, field, options, placeholder) => `<select ${bind(key, field)}>${placeholder ? opt('', placeholder, val(key, field)) : ''}${options.map(o => Array.isArray(o) ? opt(o[0], o[1], (ui.f[key] || {})[field]) : opt(o, pretty(o), (ui.f[key] || {})[field])).join('')}</select>`;

// ---------- routing ----------
function route() {
  const h = location.hash.replace(/^#\/?/, '').split('/');
  if (h[0] === 'task' && h[1]) {
    const t = S.tasks.find(x => x.id === decodeURIComponent(h[1]));
    if (!t) return { page: 'missing', what: h[1] };
    if (h[2] !== 'v') { const v = C.defaultVersion(S, t.id); location.replace(`#/task/${t.id}/v/${v.n}`); return null; }
    const v = C.versionByN(S, t.id, h[3]);
    if (!v) return { page: 'missing', what: `${t.id} has no v${h[3]} (v1–v${C.versionsOf(S, t.id).length})`, task: t.id };
    return { page: 'task', t, v };
  }
  if (h[0] === 'sets') return { page: 'sets' };
  if (h[0] === 'set' && h[1]) { const set = S.sets.find(x => x.id === h[1]); return set ? { page: 'set', set } : { page: 'missing', what: h[1] }; }
  return { page: 'tasks' };
}
const go = hash => { location.hash = hash; };
const taskHash = v => `#/task/${v.task_id}/v/${v.n}`;

// ---------- render loop ----------
function render() {
  const r = route();
  if (!r) return;
  const keep = {};
  document.querySelectorAll('[data-keep]').forEach(el => keep[el.dataset.keep] = el.scrollTop);
  const page = r.page === 'tasks' ? renderLibrary() : r.page === 'task' ? renderTask(r.t, r.v) : r.page === 'sets' ? renderSets()
    : r.page === 'set' ? renderSet(r.set) : `<div class="page"><div class="card empty">Not found: ${esc(r.what)}. <a href="#/tasks">Back to Task Library</a></div></div>`;
  const onTasks = r.page === 'tasks' || r.page === 'task';
  document.getElementById('app').innerHTML = `
    <aside class="side">
      <div class="brand">Nexus<small>Aster Frontier · Pilot</small></div>
      <nav class="nav">
        <a href="#/tasks" class="${onTasks ? 'on' : ''}">▤ Tasks</a>
        <a href="#/sets" class="${onTasks ? '' : 'on'}">◈ Delivery Sets</a>
      </nav>
      <div class="side-foot">
        <label>Viewing as</label>
        <select data-act-change="role">${Object.entries(ROLES).map(([k, x]) => opt(k, x.label, ui.role)).join('')}</select>
        <div class="who"><span class="avatar">${esc(me().split(' ').map(x => x[0]).join(''))}</span><div>${esc(me())}<div class="faint small">${esc(ROLES[ui.role].label)}</div></div></div>
        <div class="demo"><b>Demo data</b> · in memory. Reload resets to the 4 starter records.<br>Role switch shows buttons; it is not a security boundary.</div>
        <div class="demo"><a data-act="reset">Reset demo data</a></div>
      </div>
    </aside>
    <main class="main" data-keep="main">${page}</main>`;
  document.getElementById('overlay').innerHTML = ui.modal ? renderModal() : '';
  document.getElementById('toast').innerHTML = ui.toast ? `<div class="toast ${ui.toast.err ? 'err' : ''}">${esc(ui.toast.msg)}</div>` : '';
  document.querySelectorAll('[data-keep]').forEach(el => { if (keep[el.dataset.keep] != null) el.scrollTop = keep[el.dataset.keep]; });
}

let toastTimer = null;
function toast(msg, err) {
  ui.toast = { msg, err }; clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast = null; document.getElementById('toast').innerHTML = ''; }, err ? 6000 : 3500);
}

// ---------- events ----------
const A = {};      // click actions
const REFRESH = {}; // partial updates while typing (no full re-render, so focus is kept)
const CH = {};     // change actions
function runAction(fn, ...args) {
  try { const out = fn(...args); if (ui.modal) ui.modal.err = null; render(); return out; }
  catch (e) { if (ui.modal) { ui.modal.err = e.message; render(); } else { toast(e.message, true); render(); } }
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  if (el.tagName === 'SELECT') return;
  if (el.dataset.act === 'overlayClick') { if (e.target === el) runAction(A.closeModal); return; }
  e.preventDefault();
  const fn = A[el.dataset.act];
  if (!fn) { console.warn('no action', el.dataset.act); return; }
  runAction(fn, el.dataset, el);
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset && el.dataset.bind) {
    const f = form(el.dataset.bind);
    if (el.type === 'checkbox') {
      const arr = Array.isArray(f[el.dataset.field]) ? f[el.dataset.field] : (f[el.dataset.field] = []);
      if (el.checked && !arr.includes(el.value)) arr.push(el.value);
      if (!el.checked) f[el.dataset.field] = arr.filter(x => x !== el.value);
    } else f[el.dataset.field] = el.value;
    if (el.dataset.refresh && REFRESH[el.dataset.refresh]) REFRESH[el.dataset.refresh]();
  }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset && el.dataset.bind && (el.tagName === 'SELECT' || el.type === 'radio' || el.type === 'checkbox')) {
    const f = form(el.dataset.bind);
    if (el.type !== 'checkbox') f[el.dataset.field] = el.value;
    runAction(() => {});
  }
  if (el.dataset && el.dataset.actChange) runAction(CH[el.dataset.actChange], el.value, el.dataset, el);
});
window.addEventListener('hashchange', () => { ui.modal = null; if (ui.pending) { const f = ui.pending; ui.pending = null; runAction(f); } else render(); });

// A role is a lens, not a permission boundary: it changes the default question, where you land,
// and which panel is expanded — never what the data says.
const ROLE_LENS = {
  reviewer: { tab: 'queue', line: 'Queued by information value: grader risk first, then evidence gaps, then new structures.' },
  author: { tab: 'changes', line: 'Versions returned to you. Changes Requested is terminal for a version — edit to create the next one.' },
  engineer: { tab: 'all', grader: 'Potential Issue', scope: 'any', line: 'Versions whose grader or environment needs work.' },
  delivery: { tab: 'ready', line: 'Versions that pass every delivery gate and are not in a delivered set yet.' }
};
CH.role = v => {
  ui.role = v; ui.nextUp = null;
  const lens = ROLE_LENS[v];
  Object.assign(ui.lib, { tab: lens.tab, grader: lens.grader || 'all', scope: lens.scope || 'shown', review: 'all', solv: 'all', elig: 'all', structure: 'all' });
  ui.detail.tab = v === 'delivery' ? 'versions' : 'runs';
  if (v === 'delivery' && route() && route().page === 'tasks') go('#/sets');
};
A.reset = () => { S = NexusSeed.seed(); ui.f = {}; ui.modal = null; ui.detail.key = null; toast('Demo data reset to the 4 starter records.'); go('#/tasks'); };
A.go = d => go(d.href);
A.closeModal = () => { ui.modal = null; };
A.noop = () => {};
