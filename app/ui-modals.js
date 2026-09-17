// Modals and drawers. Every write goes through a core function; its error text is shown in the footer.
'use strict';

function shell(m, title, sub, body, footer, wide) {
  return `<div class="modal ${wide ? 'wide' : ''}">
    <div class="mh"><div><h2>${title}</h2>${sub ? `<div class="faint small">${sub}</div>` : ''}</div><button class="btn link" data-act="closeModal">✕</button></div>
    <div class="mb">${body}</div>
    <div class="mf">${m.err ? `<span class="err">${esc(m.err)}</span>` : ''}<button class="btn" data-act="closeModal">Cancel</button>${footer}</div></div>`;
}

function renderModal() {
  const m = ui.modal;
  const html = { taskForm: renderTaskForm, solv: mSolv, reason: mReason, run: mRun, newSet: mNewSet, add: mAdd, deliver: mDeliver, result: mResult, flag: mFlag, notify: mNotify, manifest: mManifest }[m.kind](m);
  return `<div class="overlay ${m.drawer ? 'drawer' : ''}" data-act="overlayClick">${html}</div>`;
}

// ---------- solvability ----------
function mSolv(m) {
  const k = 'solv', v = C.getVersion(S, m.vid);
  return shell(m, 'Add solvability evidence', `On ${esc(shortRef(v.id))}. Recorded once; it does not carry to later versions.`,
    `<label class="f">Evidence type <span class="req">*</span></label>${selectF(k, 'type', C.SOLV_TYPES)}
     <div class="grid2"><div><label class="f">Expert <span class="req">*</span></label><input ${bind(k, 'expert')} value="${val(k, 'expert')}"></div>
       <div><label class="f">Date <span class="req">*</span></label><input type="date" ${bind(k, 'date')} value="${val(k, 'date')}"></div>
       <div><label class="f">Time used / budget</label><input ${bind(k, 'budget')} value="${val(k, 'budget')}" placeholder="38 / 45 min"></div>
       <div><label class="f">Evidence reference <span class="req">*</span></label><input ${bind(k, 'evidence_ref')} value="${val(k, 'evidence_ref')}" placeholder="Reference trajectory R12"></div></div>`,
    `<button class="btn primary" data-act="saveSolv">Save evidence</button>`);
}
A.saveSolv = () => { C.addSolvability(S, ui.modal.vid, form('solv'), me()); ui.modal = null; toast('Solvability evidence recorded.'); };

// ---------- reason prompts ----------
const REASON = {
  deprecate: { title: 'Deprecate version', sub: 'Permanently not deliverable. Past snapshots keep it.', btn: 'Deprecate', run: (m, r) => C.deprecate(S, m.vid, { reason: r }, me()) },
  withdraw: { title: 'Withdraw approved version', sub: 'Requires a confirmed grader issue or a post-delivery issue.', btn: 'Withdraw', run: (m, r) => C.withdraw(S, m.vid, { reason: r }, me()) },
  unblock: { title: 'Unblock version', sub: 'Needs a run recorded after the block. Returns the version to Ready for Review.', btn: 'Unblock', run: (m, r) => C.unblock(S, m.vid, { reason: r }, me()) },
  dismiss: { title: 'Dismiss grader issue', sub: 'A second reviewer must dismiss.', btn: 'Dismiss', run: (m, r) => C.dismissIssue(S, m.id, { reason: r }, me()) }
};
function mReason(m) {
  const x = REASON[m.action];
  return shell(m, x.title, x.sub, `<label class="f">Reason <span class="req">*</span></label><textarea rows="3" ${bind('reason', 'reason')}>${val('reason', 'reason')}</textarea>`,
    `<button class="btn primary" data-act="saveReason">${x.btn}</button>`);
}
A.saveReason = () => { const m = ui.modal; REASON[m.action].run(m, form('reason').reason); ui.modal = null; toast(REASON[m.action].title + ': done.'); };

// ---------- record run / import customer trace ----------
A.openRun = d => {
  const v = C.getVersion(S, d.vid), customer = !!d.customer, k = `run:${v.id}:${customer ? 'c' : 'i'}`;
  const f = { result: customer ? 'pass' : 'fail', model: customer ? 'customer policy' : 'agent-m4', budget: customer ? 'customer budget' : '45 min', trace: '', final_response: '', selection: 'convenience', set_id: (C.deliveredIn(S, v.id)[0] || {}).id || '' };
  v.expected.forEach(e => { f['holds_' + e.id] = 'holds'; f['actual_' + e.id] = ''; f['claimed_' + e.id] = ''; });
  v.grader_checks.forEach(g => f['check_' + g.id] = 'pass');
  ui.f[k] = f; ui.modal = { kind: 'run', vid: v.id, key: k, customer, wide: true };
};
function mRun(m) {
  const v = C.getVersion(S, m.vid), k = m.key, f = form(k), captured = f.result === 'pass' || f.result === 'fail';
  const sets = C.deliveredIn(S, v.id);
  return shell(m, m.customer ? 'Import customer trace' : 'Record run', `${esc(shortRef(v.id))} · ${m.customer ? 'customer traces are audited like any pass but never count toward the pass rate' : 'from the existing runner export — Nexus does not execute agents'}`,
    `${m.customer ? `<div class="grid2"><div><label class="f">Delivered set <span class="req">*</span></label>${selectF(k, 'set_id', sets.map(x => [x.id, x.id + ' · ' + x.name]))}</div>
      <div><label class="f">Customer's selection method <span class="req">*</span></label>${selectF(k, 'selection', C.SELECTIONS)}</div></div>` : ''}
    <div class="grid3"><div><label class="f">Grader result <span class="req">*</span></label>${selectF(k, 'result', C.RESULTS)}</div>
      <div><label class="f">Model / policy</label><input ${bind(k, 'model')} value="${val(k, 'model')}"></div>
      <div><label class="f">Budget</label><input ${bind(k, 'budget')} value="${val(k, 'budget')}"></div></div>
    ${captured ? `<h3 style="margin-top:12px">Actual final state (from the environment)</h3>
      <table class="tbl"><thead><tr><th>Expected</th><th>Actual value *</th><th>Holds?</th><th>Agent claimed (optional)</th></tr></thead><tbody>
      ${v.expected.map(e => `<tr><td class="mono small">${esc(e.id)} ${esc(e.path)} ${esc(e.op)} ${esc(e.value)}</td>
        <td><input ${bind(k, 'actual_' + e.id)} value="${val(k, 'actual_' + e.id)}" placeholder="value or not captured"></td>
        <td style="width:120px">${selectF(k, 'holds_' + e.id, [['holds', '✓ holds'], ['fails', '✗ fails'], ['unknown', '? not captured']])}</td>
        <td><input ${bind(k, 'claimed_' + e.id)} value="${val(k, 'claimed_' + e.id)}"></td></tr>`).join('')}</tbody></table>
      <h3 style="margin-top:12px">Grader check results</h3>
      <div class="grid3">${v.grader_checks.map(g => `<div><label class="f">${esc(g.name)} (${g.weight})</label>${selectF(k, 'check_' + g.id, [['pass', 'pass'], ['fail', 'fail'], ['unknown', 'unknown']])}</div>`).join('')}</div>`
      : '<div class="banner info">Invalid and environment-error runs capture no final state and are excluded from the pass rate.</div>'}
    <label class="f">Trace <span class="req">*</span> — one step per line, e.g. <span class="mono">TOOL CALL: quote search → Cedar, Vale</span></label>
    <textarea rows="5" ${bind(k, 'trace')} placeholder="${C.STEP_TYPES.join(': …\n')}: …">${val(k, 'trace')}</textarea>
    <label class="f">Final response</label><input ${bind(k, 'final_response')} value="${val(k, 'final_response')}">
    <div class="help">No audit field here: whether a pass is valid is decided later in Pass Audit.</div>`,
    `<button class="btn primary" data-act="saveRun">${m.customer ? 'Import trace' : 'Record run'}</button>`, true);
}
A.saveRun = () => {
  const m = ui.modal, v = C.getVersion(S, m.vid), f = form(m.key);
  const r = { result: f.result, model: f.model, budget: f.budget, trace: f.trace, final_response: f.final_response };
  if (m.customer) Object.assign(r, { source: 'customer', set_id: f.set_id, selection: f.selection });
  if (f.result === 'pass' || f.result === 'fail') {
    r.state = v.expected.map(e => ({ exp_id: e.id, actual: f['actual_' + e.id], holds: f['holds_' + e.id] === 'holds' ? true : f['holds_' + e.id] === 'fails' ? false : null, claimed: f['claimed_' + e.id] }));
    r.checks = {}; v.grader_checks.forEach(g => r.checks[g.id] = f['check_' + g.id]);
  }
  const run = C.addRun(S, v.id, r, me());
  ui.modal = null; delete ui.f[m.key]; ui.detail.runId = run.id; ui.detail.tab = 'runs';
  toast(`${run.label} recorded on ${shortRef(v.id)}.${run.result === 'pass' ? ' It needs an audit before delivery.' : ''}`);
};

// ---------- delivery sets ----------
A.openNewSet = () => { ui.f.newSet = { name: '', customer: 'Aster Frontier', purpose: 'training', min_structures: 4, max_template_share: 0.2 }; ui.modal = { kind: 'newSet' }; };
function mNewSet(m) {
  const k = 'newSet';
  return shell(m, 'New delivery set', 'A set references exact versions and is frozen when delivered.',
    `<label class="f">Name <span class="req">*</span></label><input ${bind(k, 'name')} value="${val(k, 'name')}" placeholder="Aster Pilot Batch 02">
     <div class="grid2"><div><label class="f">Customer</label><input ${bind(k, 'customer')} value="${val(k, 'customer')}"></div>
       <div><label class="f">Purpose</label>${selectF(k, 'purpose', ['training', 'evaluation'])}<div class="help">Evaluation sets must exclude tasks delivered for training (V9).</div></div>
       <div><label class="f">Min constraint structures</label><input type="number" ${bind(k, 'min_structures')} value="${val(k, 'min_structures')}"></div>
       <div><label class="f">Max share per template</label><input type="number" step="0.05" ${bind(k, 'max_template_share')} value="${val(k, 'max_template_share')}"></div></div>`,
    `<button class="btn primary" data-act="saveNewSet">Create set</button>`);
}
A.saveNewSet = () => { const set = C.createSet(S, form('newSet'), me()); ui.modal = null; go('#/set/' + set.id); };

A.openAdd = d => { ui.f.add = { picked: [], eligibleOnly: 'yes' }; ui.modal = { kind: 'add', set: d.set, wide: true }; };
function mAdd(m) {
  const set = C.getSet(S, m.set), f = form('add');
  const all = S.tasks.flatMap(t => C.versionsOf(S, t.id).slice().reverse());
  const rows = all.map(v => ({ v, b: C.addBlockers(S, set, v.id) })).filter(x => f.eligibleOnly !== 'yes' || !x.b.length);
  const picked = f.picked.map(id => C.getVersion(S, id));
  const conflict = picked.filter((v, i) => picked.findIndex(x => x.task_id === v.task_id) !== i);
  const after = set.items.map(i => C.getVersion(S, i.version_id)).concat(picked);
  const tpl = {}; after.forEach(v => tpl[v.template_id] = (tpl[v.template_id] || 0) + 1);
  const top = Math.max(0, ...Object.values(tpl));
  return shell(m, `Add versions to ${esc(set.id)}`, 'Only approved versions that pass every delivery gate can be added. Each row is a version, not a task.',
    `<div class="row" style="margin:8px 0"><label class="row small"><input type="checkbox" value="yes" data-act="toggleEligibleOnly" ${f.eligibleOnly === 'yes' ? 'checked' : ''} style="width:auto"> Eligible only</label></div>
     <table class="tbl"><thead><tr><th></th><th>Ref</th><th>Task</th><th>Quality</th><th>Grader</th><th>Why not</th></tr></thead><tbody>
     ${rows.map(({ v, b }) => `<tr class="${b.length ? 'dis' : ''}"><td><input type="checkbox" value="${v.id}" ${bind('add', 'picked')} ${f.picked.includes(v.id) ? 'checked' : ''} ${b.length ? 'disabled' : ''} style="width:auto"></td>
       <td>${vRef(v.id)}</td><td class="small">${esc(C.getTask(S, v.task_id).name)}</td><td>${reviewChip(v)}</td><td>${healthChip(C.graderHealth(S, v))}</td>
       <td class="small">${b.length ? esc(b.join(' ')) : '<span class="cell-ok">eligible</span>'}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">No eligible versions. Approve and audit versions first, or untick "Eligible only" to see why.</div></td></tr>'}
     </tbody></table>
     <div class="small" style="margin-top:8px">Adding ${picked.length} · set would have ${after.length} versions · ${new Set(after.map(v => v.structure)).size} structures ·
       <span style="${after.length && top / after.length > set.targets.max_template_share ? 'color:var(--warn)' : ''}">largest template share ${after.length ? Math.round(100 * top / after.length) : 0}%</span></div>
     ${conflict.length ? `<div class="banner bad">One version per task per set: ${conflict.map(v => esc(v.task_id)).join(', ')} picked twice.</div>` : ''}`,
    `<button class="btn primary" data-act="saveAdd" ${!picked.length || conflict.length ? 'disabled' : ''}>Add ${picked.length} version(s)</button>`, true);
}
A.toggleEligibleOnly = () => { const f = form('add'); f.eligibleOnly = f.eligibleOnly === 'yes' ? 'no' : 'yes'; };
A.saveAdd = () => { const m = ui.modal, f = form('add'); f.picked.forEach(id => C.addToSet(S, m.set, id, me())); ui.modal = null; toast(`Added ${f.picked.length} version(s).`); };

A.openDeliver = d => { ui.f.deliver = { ack: '' }; ui.modal = { kind: 'deliver', set: d.set }; };
function mDeliver(m) {
  const set = C.getSet(S, m.set), val2 = C.validateSet(S, set), warn = val2.checks.filter(c => c.level === 'warning' && !c.pass);
  return shell(m, `Deliver ${esc(set.name)}?`, `${set.items.length} versions · ${Object.keys(C.composition(S, set).structure).length} constraint structures · ${val2.blocking} blocking`,
    `<div class="banner info" style="margin-top:8px">This creates an immutable snapshot. Later versions will not change it.</div>
     <ul class="small">${set.items.map(i => `<li>${vRef(i.version_id)}</li>`).join('')}</ul>
     ${warn.length ? `<h3>Acknowledge ${warn.length} warning(s)</h3><ul class="small">${warn.map(c => `<li>${esc(c.id)} ${esc(c.label)} — ${esc(c.detail)}</li>`).join('')}</ul>
       <label class="f">Reason <span class="req">*</span></label><textarea rows="2" ${bind('deliver', 'ack')}>${val('deliver', 'ack')}</textarea>` : ''}`,
    `<button class="btn primary" data-act="saveDeliver">Deliver & freeze</button>`);
}
A.saveDeliver = () => { const m = ui.modal, set = C.deliver(S, m.set, { ack_reason: form('deliver').ack }, me()); ui.modal = null; toast(`Delivered · snapshot #${set.snapshot_hash}`); };

A.openResult = d => { ui.f.result = { date: localDate(), train_before: '', train_after: '', n_train: '', heldout_before: '', heldout_after: '', n_heldout: '', eval_budget_unchanged: '', matched_control: '', repeats: 1, t_count: '', t_selection: '', t_summary: '', notes: '' }; ui.modal = { kind: 'result', set: d.set }; };
function mResult(m) {
  const k = 'result', set = C.getSet(S, m.set), num = (field, ph) => `<input type="number" ${bind(k, field)} value="${val(k, field)}" placeholder="${ph}">`;
  return shell(m, 'Record customer results', `Linked to ${esc(set.id)} #${esc(set.snapshot_hash)}. Held-out tasks are the customer's and stay private.`,
    `<div class="grid3"><div><label class="f">Result date <span class="req">*</span></label><input type="date" ${bind(k, 'date')} value="${val(k, 'date')}"></div></div>
     <fieldset><legend>Training set</legend><div class="grid3"><div><label class="f">Baseline %</label>${num('train_before', '40')}</div><div><label class="f">After %</label>${num('train_after', '82')}</div><div><label class="f">n tasks</label>${num('n_train', '100')}</div></div></fieldset>
     <fieldset><legend>Held-out set (aggregate only)</legend><div class="grid3"><div><label class="f">Baseline %</label>${num('heldout_before', '34')}</div><div><label class="f">After %</label>${num('heldout_after', '35')}</div><div><label class="f">n tasks</label>${num('n_heldout', '100')}</div></div></fieldset>
     <fieldset><legend>Experiment design</legend><div class="grid3">
       <div><label class="f">Eval budget unchanged? <span class="req">*</span></label>${selectF(k, 'eval_budget_unchanged', ['yes', 'no', 'unknown'], 'Select…')}</div>
       <div><label class="f">Matched training comparison? <span class="req">*</span></label>${selectF(k, 'matched_control', ['yes', 'no', 'unknown'], 'Select…')}</div>
       <div><label class="f">Repeat runs (n)</label>${num('repeats', '1')}</div></div></fieldset>
     <fieldset><legend>Selected traces</legend><div class="grid3">
       <div><label class="f">Count</label>${num('t_count', '10')}</div><div><label class="f">Selection</label>${selectF(k, 't_selection', C.SELECTIONS, 'Select…')}</div>
       <div><label class="f">Summary</label><input ${bind(k, 't_summary')} value="${val(k, 't_summary')}" placeholder="3 of 10 wrong final state"></div></div></fieldset>
     <label class="f">Customer notes</label><textarea rows="2" ${bind(k, 'notes')}>${val(k, 'notes')}</textarea>`,
    `<button class="btn primary" data-act="saveResult">Save results</button>`, true);
}
A.saveResult = () => {
  const m = ui.modal, f = form('result');
  C.addResult(S, m.set, Object.assign({}, f, { traces: { count: f.t_count, selection: f.t_selection, summary: f.t_summary } }), me());
  ui.modal = null; ui.setTab[m.set] = 'results'; toast('Customer result recorded.');
};

const localDate = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
A.openFlag = d => { ui.f.flag = { version_ids: d.vid ? [d.vid] : [], type: '', date: localDate(), evidence: '', impact: '', replacement: '', notify: 'yes', not_required_reason: '' }; ui.modal = { kind: 'flag', set: d.set }; };
function mFlag(m) {
  const k = 'flag', set = C.getSet(S, m.set), f = form(k);
  const tasks = new Set(f.version_ids.map(id => C.getVersion(S, id).task_id));
  const repl = tasks.size === 1 ? C.versionsOf(S, [...tasks][0]).filter(v => C.eligibility(S, v).eligible && !f.version_ids.includes(v.id)) : [];
  return shell(m, 'Flag post-delivery issue', 'The snapshot stays unchanged. Affected approved versions become Withdrawn.',
    `<label class="f">Affected versions <span class="req">*</span></label><div class="opts">${set.items.map(i => `<label><input type="checkbox" value="${i.version_id}" ${bind(k, 'version_ids')} ${f.version_ids.includes(i.version_id) ? 'checked' : ''} style="width:auto"> ${vRef(i.version_id)} · ${healthChip(C.graderHealth(S, C.getVersion(S, i.version_id)))}</label>`).join('')}</div>
     <div class="grid2"><div><label class="f">Issue type <span class="req">*</span></label>${selectF(k, 'type', C.PDI_TYPES, 'Select…')}</div>
       <div><label class="f">Discovered</label><input type="date" ${bind(k, 'date')} value="${val(k, 'date')}"></div></div>
     <label class="f">Evidence <span class="req">*</span></label><input ${bind(k, 'evidence')} value="${val(k, 'evidence')}" placeholder="CT-01 audited as invalid pass">
     <label class="f">Impact estimate</label><input ${bind(k, 'impact')} value="${val(k, 'impact')}">
     <label class="f">Replacement version</label>${tasks.size === 1 ? selectF(k, 'replacement', repl.map(v => [v.id, shortRef(v.id)]), repl.length ? 'None yet' : 'No eligible version of this task yet') : '<div class="faint small">Pick versions of one task to choose a replacement.</div>'}
     <label class="f">Customer notification <span class="req">*</span></label>${selectF(k, 'notify', [['yes', 'Required'], ['no', 'Not required']])}
     ${f.notify === 'no' ? `<label class="f">Why not <span class="req">*</span></label><input ${bind(k, 'not_required_reason')} value="${val(k, 'not_required_reason')}">` : ''}
     <div class="help">Nexus records the notification as a to-do; it does not send anything.</div>`,
    `<button class="btn primary danger" data-act="saveFlag">Flag issue</button>`);
}
A.saveFlag = () => {
  const m = ui.modal, f = form('flag');
  const p = C.flagPostDelivery(S, m.set, { version_ids: f.version_ids, type: f.type, date: f.date, evidence: f.evidence, impact: f.impact, replacement_version_id: f.replacement || null,
    notification_required: f.notify === 'yes', not_required_reason: f.not_required_reason }, me());
  ui.modal = null; ui.setTab[m.set] = 'results'; toast(`${p.id} flagged. Affected versions withdrawn; snapshot unchanged.`, true);
};

A.openNotify = d => { ui.f.notify = { channel: '' }; ui.modal = { kind: 'notify', set: d.set, id: d.id }; };
function mNotify(m) {
  return shell(m, 'Mark customer notified', 'Record how the customer was told. Nothing is sent.',
    `<label class="f">Channel <span class="req">*</span></label><input ${bind('notify', 'channel')} value="${val('notify', 'channel')}" placeholder="Weekly research call, Sep 30">`,
    `<button class="btn primary" data-act="saveNotify">Mark notified</button>`);
}
A.saveNotify = () => { const m = ui.modal; C.markNotified(S, m.set, m.id, form('notify'), me()); ui.modal = null; toast('Notification recorded.'); };

A.openManifest = d => { ui.modal = { kind: 'manifest', set: d.set, wide: true }; };
// The buyer has to be able to re-derive every claim, so the manifest carries the definitions,
// the evidence and the audit trail — not just a list of version ids.
function manifestOf(set) {
  return {
    set: set.id, name: set.name, customer: set.customer, purpose: set.purpose, snapshot_hash: set.snapshot_hash,
    delivered_at: set.delivered_at, delivered_by: set.delivered_by,
    audit_rule: C.AUDIT_RULE,
    versions: set.items.map(i => {
      const v = C.getVersion(S, i.version_id), t = C.getTask(S, v.task_id);
      const runs = C.runsOf(S, v.id);
      return {
        ref: v.id, task: v.task_id, task_name: t.name, version: v.n, content_hash: v.content_hash,
        definition: Object.fromEntries(C.DEF_FIELDS.map(f => [f, v[f]])),
        solvability: v.solvability, review_status: v.review_status,
        metrics: C.metrics(S, v), audit_status: C.auditStatus(S, v), grader_health: C.graderHealth(S, v),
        samples: S.samples.filter(x => x.version_id === v.id),
        runs: runs.map(r => ({ id: r.label, source: r.source, selection: r.selection, result: r.result, score: r.score, checks: r.checks,
          final_state: r.state, final_response: r.final_response, trace: r.trace, model: r.model, budget: r.budget,
          recorded_by: r.recorded_by, at: r.at, annotations: C.annotationsOf(S, r.id) })),
        audits: S.audits.filter(a => a.version_id === v.id),
        reviews: C.reviewsOf(S, v.id), grader_issues: C.issuesOf(S, v.id)
      };
    }),
    validation_at_delivery: set.validation_at_delivery, acknowledged_warnings: set.acknowledged,
    customer_results: set.results, post_delivery_issues: set.pdis, sweeps: set.sweeps || [],
    not_included: ['environment image / reset manifest', 'executable grader code', 'runner attempt ids']
  };
}
function mManifest(m) {
  const set = C.getSet(S, m.set);
  return shell(m, 'Manifest', `${esc(set.id)} #${esc(set.snapshot_hash)} · shown for inspection; not sent anywhere`, `<pre class="json" style="max-height:60vh;overflow:auto">${esc(JSON.stringify(manifestOf(set), null, 2))}</pre>`,
    `<button class="btn primary" data-act="downloadManifest">Download JSON</button>`, true);
}
A.downloadManifest = () => {
  const set = C.getSet(S, ui.modal.set), a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(manifestOf(set), null, 2)], { type: 'application/json' }));
  a.download = `${set.id}-${set.snapshot_hash}.json`; a.click(); URL.revokeObjectURL(a.href);
};
