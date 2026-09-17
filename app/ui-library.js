// PAGE 1 — Task Library, plus the Create / Edit task drawer.
'use strict';

function libRows() {
  const L = ui.lib;
  return S.tasks.map(t => {
    const vs = C.versionsOf(S, t.id), latest = vs[vs.length - 1];
    let shown = C.primaryVersion(S, t.id);
    const inTab = {
      all: true,
      queue: vs.some(v => C.queueReason(S, v)),
      changes: latest.review_status === 'Changes Requested',
      blocked: vs.some(v => ['Blocked', 'Withdrawn'].includes(v.review_status)),
      ready: vs.some(v => C.eligibility(S, v).eligible)
    };
    if (L.tab === 'queue') shown = vs.slice().reverse().find(v => C.queueReason(S, v)) || shown;
    if (L.tab === 'blocked') shown = vs.slice().reverse().find(v => ['Blocked', 'Withdrawn'].includes(v.review_status)) || shown;
    if (L.tab === 'ready') shown = vs.slice().reverse().find(v => C.eligibility(S, v).eligible) || shown;
    return { t, vs, latest, shown, inTab };
  });
}

function libMatches(row) {
  const L = ui.lib, cands = L.scope === 'any' ? row.vs : [row.shown];
  const q = L.q.trim().toLowerCase();
  if (q) {
    const hay = [row.t.id, row.t.name, row.t.domain, ...row.vs.map(v => v.id + ' ' + v.goal + ' ' + v.constraints.map(c => c.text).join(' '))].join(' ').toLowerCase();
    const at = q.match(/^(.+)@v(\d+)$/);
    if (at ? !(row.t.id.toLowerCase() === at[1] && row.vs.some(v => v.n === Number(at[2]))) : !hay.includes(q)) return false;
  }
  return cands.some(v =>
    (L.review === 'all' || v.review_status === L.review) &&
    (L.grader === 'all' || C.graderHealth(S, v).state === L.grader) &&
    (L.solv === 'all' || (L.solv === 'Verified') === !!v.solvability) &&
    (L.elig === 'all' || C.eligibility(S, v).state === L.elig) &&
    (L.structure === 'all' || v.structure === L.structure));
}

function renderLibrary() {
  const L = ui.lib, rows = libRows(), c = C.summaryCounts(S);
  const tabs = [['all', 'All'], ['queue', 'Review Queue'], ['changes', 'Changes Requested'], ['blocked', 'Blocked'], ['ready', 'Ready for Delivery']];
  const visible = rows.filter(r => r.inTab[L.tab]).filter(libMatches);
  if (L.tab === 'queue') visible.sort((a, b) => C.queueReason(S, a.shown).priority - C.queueReason(S, b.shown).priority);
  const stat = (n, label, icon, bg, fg, act, title) =>
    `<div class="card stat" data-act="libStat" data-to="${act}" title="${esc(title)}"><div class="ic" style="background:${bg};color:${fg}">${icon}</div><div><b>${n}</b><span>${label}</span></div></div>`;
  const sel = (key, label, options) => `<select data-act-change="libFilter" data-key="${key}">${opt('all', label + ': all', L[key])}${options.map(o => opt(Array.isArray(o) ? o[0] : o, Array.isArray(o) ? o[1] : pretty(o), L[key])).join('')}</select>`;
  const active = ['review', 'grader', 'solv', 'elig', 'structure'].filter(k => L[k] !== 'all');

  const body = visible.map(({ t, latest, shown }) => {
    const m = C.metrics(S, shown), h = C.graderHealth(S, shown), e = C.eligibility(S, shown), q = C.queueReason(S, shown);
    const last = [shown.created_at, ...C.runsOf(S, shown.id).map(r => r.at), ...C.reviewsOf(S, shown.id).map(r => r.at)].sort().pop();
    return `<tr class="click" data-act="go" data-href="${taskHash(shown)}">
      <td class="mono">${esc(t.id)}</td>
      <td><div style="min-width:180px;font-weight:550">${esc(t.name)}</div><div class="faint small">${esc(pretty(shown.capability))} · Pool ${esc(t.pool)}</div>
        ${L.tab === 'queue' && q ? `<div class="small" style="color:var(--warn)">${esc(q.reason)}</div>` : ''}</td>
      <td><b>v${shown.n}</b>${shown.id !== latest.id ? `<div class="faint small">latest v${latest.n} · ${esc(latest.review_status)}</div>` : ''}</td>
      <td><span class="tag">${esc(pretty(shown.structure))}</span>
        ${(() => { const d = C.nearDuplicates(S, shown); return d.length ? `<div class="small" style="color:var(--warn)" title="Same expected paths, tools and structure">${d[0].twin ? '≡' : '~'} ${esc(d[0].version.task_id)}</div>` : ''; })()}</td>
      <td class="gl">${m.internal}${m.invalid ? ` <span class="faint small">(${m.invalid} invalid)</span>` : ''}${m.customer ? ` <span class="faint small">+${m.customer} cust.</span>` : ''}</td>
      <td style="white-space:nowrap">${frac(m.passes, m.valid)} ${strip(S, shown)}</td>
      <td class="gl">${reviewChip(shown)}</td>
      <td>${healthChip(h)}</td>
      <td>${auditCell(S, shown)}</td>
      <td>${solvChip(shown)}</td>
      <td title="${esc(e.reasons.join('\n'))}">${eligChip(e)}${C.deliveredIn(S, shown.id).length ? `<div class="faint small">in ${C.deliveredIn(S, shown.id).map(x => x.id).join(', ')}</div>` : ''}</td>
      <td class="faint small">${fmt(last)}</td>
    </tr>`;
  }).join('');

  return `<div class="page">
    <div class="phead"><div><h1>Task Library</h1><p>Every row is a task. Every status is about a specific version.</p>
      <p class="small" style="margin-top:2px"><span class="prefix">${esc(ROLES[ui.role].label)} view</span> · ${esc(ROLE_LENS[ui.role].line)}</p></div>
      ${btn('+ Create Task', 'openCreate', { cls: 'primary', need: ['author', 'engineer'] })}</div>
    <div class="stats">
      ${stat(c.needs_review, 'Needs Review', '◷', 'var(--warn-bg)', 'var(--warn)', 'queue', 'Versions in Ready for Review')}
      ${stat(c.grader_issues, 'Grader Issues', '▲', 'var(--bad-bg)', 'var(--bad)', 'grader', 'Versions with a potential or confirmed grader issue')}
      ${stat(c.approved, 'Approved', '✓', 'var(--ok-bg)', 'var(--ok)', 'approved', 'Approved versions')}
      ${stat(c.ready, 'Ready for Delivery', '◈', 'var(--accent-bg)', 'var(--accent)', 'ready', 'Eligible versions not yet in a delivered set')}
      ${stat(c.blocked, 'Blocked', '■', 'var(--neutral-bg)', 'var(--ink2)', 'blocked', 'Blocked versions')}
    </div>
    <div class="card">
      <div class="tabs">${tabs.map(([k, l]) => `<a class="${L.tab === k ? 'on' : ''}" data-act="libTab" data-tab="${k}">${l}<span class="n">${rows.filter(r => r.inTab[k]).length}</span></a>`).join('')}</div>
      <div class="filters">
        <input placeholder="Search task ID, name, keyword, or B01@v1" value="${esc(L.q)}" data-act-change="libSearch">
        ${sel('review', 'Review', C.REVIEW_STATUSES)}
        ${sel('grader', 'Grader', ['Healthy', 'Potential Issue', 'Confirmed Issue', 'Not Evaluated'])}
        ${sel('solv', 'Solvability', ['Verified', 'Missing'])}
        ${sel('elig', 'Eligibility', ['Eligible', 'Not eligible', 'Withdrawn'])}
        ${sel('structure', 'Structure', C.STRUCTURES)}
        <select data-act-change="libFilter" data-key="scope" title="Which version the status filters match">${opt('shown', 'Match: shown version', L.scope)}${opt('any', 'Match: any version', L.scope)}</select>
        ${active.length ? `<a data-act="libClear" class="small">Clear ${active.length} filter(s)</a>` : ''}
        <span class="faint small" style="margin-left:auto">${visible.length} of ${rows.length} tasks</span>
      </div>
      <div style="overflow-x:auto"><table class="tbl lib">
        <thead>
          <tr><th colspan="4"></th><th colspan="2" class="grp gl">Agent execution · about the model</th><th colspan="5" class="grp gl">Task quality · about this version</th><th></th></tr>
          <tr><th>Task ID</th><th>Task name</th><th>Version</th><th>Constraint structure</th><th class="gl">Runs</th><th>Agent pass</th>
            <th class="gl">Review</th><th>Grader health</th><th>Audited passes</th><th>Solvability</th><th>Delivery</th><th>Updated</th></tr>
        </thead>
        <tbody>${body || `<tr><td colspan="12"><div class="empty">${rows.length ? 'No tasks match these filters. <a data-act="libClear">Clear filters</a>' : 'No tasks yet. Tasks you create start as Draft v1.'}</div></td></tr>`}</tbody>
      </table></div>
    </div>
    <p class="faint small">Pass counts exclude invalid runs and customer traces. Status columns describe the version shown in the Version column: the highest eligible version, else the latest.</p>
  </div>`;
}

A.libTab = d => { ui.lib.tab = d.tab; };
A.libStat = d => {
  Object.assign(ui.lib, { review: 'all', grader: 'all', solv: 'all', elig: 'all', structure: 'all', tab: 'all' });
  if (d.to === 'queue') ui.lib.tab = 'queue';
  else if (d.to === 'ready') ui.lib.tab = 'ready';
  else if (d.to === 'blocked') ui.lib.tab = 'blocked';
  else if (d.to === 'approved') { ui.lib.review = 'Approved'; ui.lib.scope = 'any'; }
  else if (d.to === 'grader') { ui.lib.scope = 'any'; ui.lib.grader = 'Potential Issue'; }
};
A.libClear = () => Object.assign(ui.lib, { review: 'all', grader: 'all', solv: 'all', elig: 'all', structure: 'all', q: '' });
CH.libFilter = (value, d) => { ui.lib[d.key] = value; };
CH.libSearch = value => { ui.lib.q = value; };

// ---------- Create / Edit drawer ----------
const linesOf = txt => String(txt || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => l.split('|').map(x => x.trim()));
function defFromForm(f) {
  return {
    goal: f.goal, starting_state: f.starting_state,
    tools: String(f.tools || '').split(',').map(x => x.trim()).filter(Boolean),
    constraints: linesOf(f.constraints).map(([text, source]) => ({ text, source })),
    expected: linesOf(f.expected).map(([constraint, path, op, value]) => ({ constraint, path, op, value })),
    documents: linesOf(f.documents).map(([id, title, superseded_by]) => ({ id, title, superseded_by })),
    grader_type: f.grader_type,
    grader_checks: linesOf(f.grader_checks).map(([name, exp_id, weight, assertion]) => ({ name, exp_id: exp_id === '-' ? '' : exp_id, weight, assertion })),
    capability: f.capability, structure: f.structure, workflow: f.workflow, template_id: f.template_id
  };
}
function formFromVersion(v) {
  return {
    goal: v.goal, starting_state: v.starting_state, tools: v.tools.join(', '),
    constraints: v.constraints.map(c => [c.text, c.source].filter(Boolean).join(' | ')).join('\n'),
    expected: v.expected.map(e => [e.constraint, e.path, e.op, e.value].join(' | ')).join('\n'),
    documents: v.documents.map(d => [d.id, d.title, d.superseded_by].filter(Boolean).join(' | ')).join('\n'),
    grader_type: v.grader_type, grader_checks: v.grader_checks.map(k => [k.name, k.exp_id || '-', k.weight, k.assertion].filter(x => x !== '').join(' | ')).join('\n'),
    capability: v.capability, structure: v.structure, workflow: v.workflow, template_id: v.template_id, note: '', fixes: []
  };
}

A.openCreate = () => { ui.f['task:new'] = { pool: 'B', grader_type: 'state_assertion', structure: '', capability: '', workflow: '' }; ui.modal = { kind: 'taskForm', key: 'task:new', drawer: true }; };
A.openEdit = d => { const v = C.getVersion(S, d.vid); ui.f['task:edit'] = formFromVersion(v); ui.modal = { kind: 'taskForm', key: 'task:edit', vid: v.id, drawer: true }; };

function renderTaskForm(m) {
  const k = m.key, f = form(k), edit = !!m.vid;
  const v = edit ? C.getVersion(S, m.vid) : null, t = edit ? C.getTask(S, v.task_id) : null;
  const nextN = edit ? C.versionsOf(S, v.task_id).length + 1 : 1;
  const ta = (field, rows, ph) => `<textarea rows="${rows}" ${bind(k, field)} placeholder="${esc(ph)}">${val(k, field)}</textarea>`;
  const sameTpl = f.template_id ? S.versions.filter(x => x.template_id === f.template_id && x.review_status === 'Approved' && (!t || x.task_id !== t.id)).length : 0;
  const issues = edit ? C.versionsOf(S, v.task_id).flatMap(x => C.issuesOf(S, x.id)).filter(i => ['open', 'confirmed'].includes(i.status)) : [];
  return `<div class="modal">
    <div class="mh"><div><h2>${edit ? `Edit ${esc(t.id)} → creates v${nextN}` : 'Create task'}</h2>
      <div class="faint small">${edit ? `Editing v${v.n} creates v${nextN}. v${v.n} and its runs, audits and reviews stay unchanged.` : 'New tasks start as Draft v1. Add runs before submitting for review.'}</div></div>
      <button class="btn link" data-act="closeModal">✕</button></div>
    <div class="mb">
      ${edit ? `<div class="banner warn">Runs, audits, reviews and solvability evidence will not carry over to v${nextN}. It needs its own evidence.</div>` : ''}
      <fieldset><legend>1 · Identity</legend>
        ${edit ? '' : `<label class="f">Task name <span class="req">*</span></label><input ${bind(k, 'name')} value="${val(k, 'name')}" placeholder="Choose a supplier and prepare an order">
        <div class="grid2"><div><label class="f">Source pool</label>${selectF(k, 'pool', [['A', 'A — Support'], ['B', 'B — Procurement'], ['C', 'C — Incident response'], ['D', 'D — Project coordination'], ['New', 'New']])}</div>
        <div><label class="f">Domain</label><input ${bind(k, 'domain')} value="${val(k, 'domain')}"><div class="help">Metadata only. Not used for diversity.</div></div></div>`}
        <div class="grid2">
          <div><label class="f">Target capability <span class="req">*</span></label>${selectF(k, 'capability', C.CAPABILITIES, 'Select…')}</div>
          <div><label class="f">Constraint structure <span class="req">*</span></label>${selectF(k, 'structure', C.STRUCTURES, 'Select…')}</div>
          <div><label class="f">Workflow type <span class="req">*</span></label>${selectF(k, 'workflow', C.WORKFLOWS, 'Select…')}</div>
          <div><label class="f">Template ID <span class="req">*</span></label><input ${bind(k, 'template_id')} value="${val(k, 'template_id')}" placeholder="T-PROC-01">
            ${sameTpl ? `<div class="help" style="color:var(--warn)">${sameTpl} approved version(s) share this template.</div>` : ''}</div>
        </div>
      </fieldset>
      <fieldset><legend>2 · Task</legend>
        <label class="f">Goal <span class="req">*</span></label>${ta('goal', 3, 'What the agent must achieve')}
        <label class="f">Starting state (JSON) <span class="req">*</span></label>${ta('starting_state', 3, '{"order":{"id":"O-7"}}')}
        <label class="f">Available tools (comma separated)</label><input ${bind(k, 'tools')} value="${val(k, 'tools')}" placeholder="policy reader, quote search, order editor">
        <label class="f">Constraints — one per line: <span class="mono">text | source</span></label>${ta('constraints', 4, 'Total cost ≤ $5,000 including shipping | instruction')}
        <div class="help">IDs C1, C2… follow line order. At least 2 constraints to submit.</div>
        <label class="f">Documents / policies — <span class="mono">ID | title | superseded by</span></label>${ta('documents', 2, 'POL-44 v2 | Rebate policy | POL-44 v3')}
      </fieldset>
      <fieldset><legend>3 · Verification</legend>
        <label class="f">Expected final state — <span class="mono">constraint | path | op | value</span></label>${ta('expected', 4, 'C1 | order.O-7.total | = | $4,900')}
        <div class="help">IDs E1, E2… follow line order. Every constraint needs at least one assertion.</div>
        <label class="f">Grader type</label>
        <div class="opts row">${C.GRADER_TYPES.map(g => `<label><input type="radio" name="gt-${k}" value="${g}" ${bind(k, 'grader_type')} ${f.grader_type === g ? 'checked' : ''}> ${pretty(g)}</label>`).join('')}</div>
        ${f.grader_type === 'message_match' ? '<div class="banner bad">Checks the agent\'s words, not the world. Versions with this grader cannot be delivered.</div>' : ''}
        <label class="f">Grader checks — <span class="mono">name | expected id or - | weight | assertion</span></label>${ta('grader_checks', 3, 'Arrival by April 20 | E3 | 0.4 | order.supplier == "Cedar"')}
        <div class="help">Weights must sum to 1.0. Link each check to an expected-state row so Nexus can spot grader/state disagreement.</div>
      </fieldset>
      ${edit ? `<fieldset><legend>4 · Version note</legend>
        <label class="f">What changed and why <span class="req">*</span></label><input ${bind(k, 'note')} value="${val(k, 'note')}" placeholder="Grader: message_match → state_assertion">
        ${issues.length ? `<label class="f">This version fixes</label><div class="opts">${issues.map(i => `<label><input type="checkbox" value="${i.id}" ${bind(k, 'fixes')} ${(f.fixes || []).includes(i.id) ? 'checked' : ''}> ${esc(i.id)} · ${esc(pretty(i.type))} (${esc(i.status)}) — ${esc(i.note)}</label>`).join('')}</div>` : ''}
      </fieldset>` : ''}
    </div>
    <div class="mf">${m.err ? `<span class="err">${esc(m.err)}</span>` : ''}
      <button class="btn" data-act="closeModal">Cancel</button>
      ${edit ? `<button class="btn primary" data-act="saveEdit">Create v${nextN}</button>` : `<button class="btn" data-act="saveCreate">Save Draft</button><button class="btn primary" data-act="saveCreate" data-open="1">Save & Open</button>`}
    </div></div>`;
}

A.saveCreate = d => {
  const f = form('task:new');
  const v = C.createTask(S, { name: f.name, pool: f.pool, domain: f.domain }, defFromForm(f), me());
  ui.modal = null; delete ui.f['task:new'];
  toast(`Created ${v.task_id}@v1 (Draft). Add runs before submitting for review.`);
  if (d.open) go(taskHash(v));
};
A.saveEdit = () => {
  const m = ui.modal, f = form('task:edit');
  const v2 = C.editVersion(S, m.vid, defFromForm(f), { note: f.note, by: me(), fixes_issue_ids: f.fixes || [] });
  ui.modal = null; delete ui.f['task:edit'];
  toast(`Created ${shortRef(v2.id)}. The previous version is unchanged.`);
  go(taskHash(v2));
};
