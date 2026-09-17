// PAGE 3 — Delivery Sets: program progress, set list, set detail (versions, validation, customer results, history).
'use strict';

function programCard() {
  const p = C.programProgress(S);
  return `<div class="card pad" style="margin-bottom:14px">
    <div class="row sp wrap"><div><span class="prefix">Aster program</span> <b style="margin-left:6px">Target ${p.target}</b> · ${esc(p.stage_label)} ·
      Delivered ${p.delivered}${p.withdrawn ? ` <span class="cell-bad">(${p.withdrawn} withdrawn)</span>` : ''} · In draft ${p.in_draft}</div>
      <div class="faint small">${p.good} / ${p.target} delivered versions in good standing</div></div>
    <div class="prog" style="margin:8px 0"><i style="width:${Math.min(100, 100 * p.good / p.target)}%"></i></div>
    <div class="small"><span class="faint">Stage 2 gate:</span> ${p.gate.map(g => `<span style="margin-right:14px"><span class="${g.pass ? 'cell-ok' : 'cell-bad'}">${g.pass ? '✓' : '✗'}</span> ${esc(g.label)}${g.detail ? ` <span class="faint">(${esc(g.detail)})</span>` : ''}</span>`).join('')}</div>
    <div class="faint small" style="margin-top:4px">Moving to the next stage is a PM decision. Nexus shows whether the conditions hold; it does not recommend scaling.</div>
  </div>`;
}

function renderSets() {
  const rows = S.sets.slice().reverse().map(set => {
    const val = C.validateSet(S, set), comp = C.composition(S, set), last = set.results[set.results.length - 1];
    const sig = last ? C.signal(last) : null;
    return `<tr class="click" data-act="go" data-href="#/set/${set.id}">
      <td class="mono">${esc(set.id)}</td><td><b>${esc(set.name)}</b><div class="faint small">${esc(set.customer)} · ${esc(set.purpose)}</div></td>
      <td>${set.status === 'delivered' ? chip('Delivered 🔒', 'ok') : chip('Draft', 'neutral')}</td>
      <td>${set.items.length}</td><td>${Object.keys(comp.structure).length}</td>
      <td>${set.status === 'draft' ? (val.blocking ? chip(val.blocking + ' blocking', 'bad') : chip('0 blocking', 'ok')) : '—'}</td>
      <td class="small">${set.delivered_at ? fmtDay(set.delivered_at) : '—'}</td>
      <td class="small">${last ? `train +${sig.train_gain} / held-out ${sig.heldout_gain >= 0 ? '+' : ''}${sig.heldout_gain} · ${esc(sig.label)}` : '—'}</td>
      <td>${set.pdis.length ? chip(set.pdis.length + ' issue(s)', 'bad') : '—'}</td></tr>`;
  }).join('');
  return `<div class="page">
    <div class="phead"><div><h1>Delivery Sets</h1><p>Sets reference exact task versions. Delivering freezes a snapshot that later edits cannot change.</p></div>
      ${btn('+ New Delivery Set', 'openNewSet', { cls: 'primary', need: ['delivery'] })}</div>
    ${programCard()}
    <div class="card"><table class="tbl"><thead><tr><th>Set</th><th>Name</th><th>Status</th><th>Versions</th><th>Structures</th><th>Blocking</th><th>Delivered</th><th>Customer results</th><th>Post-delivery</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="9"><div class="empty">No delivery sets. Create one from eligible versions.</div></td></tr>`}</tbody></table></div>
  </div>`;
}

function renderSet(set) {
  const val = C.validateSet(S, set), draft = set.status === 'draft';
  const tab = ui.setTab[set.id] || (draft ? (set.items.length ? 'validation' : 'versions') : (set.results.length ? 'results' : 'versions'));
  const p = C.programProgress(S);
  const openNotify = set.pdis.filter(x => x.notification.required && !x.notification.done_at).length;
  const bar = draft
    ? (val.blocking ? `<div class="valbar bad">✖ ${val.blocking} blocking issue(s) · ${val.warnings} warning(s) <a data-act="setTab" data-set="${set.id}" data-tab="validation" style="margin-left:auto">View →</a></div>`
      : `<div class="valbar ok">✓ No blocking issues · ${val.warnings} warning(s) need acknowledgement at delivery</div>`)
    : `<div class="valbar ${set.pdis.length ? 'bad' : 'grey'}">🔒 Frozen snapshot #${esc(set.snapshot_hash)} · delivered ${fmtDay(set.delivered_at)} by ${esc(set.delivered_by)}${set.pdis.length ? ` · ⚠ ${set.pdis.length} post-delivery issue(s)` : ''}${openNotify ? ` · □ Notify ${esc(set.customer)} — required` : ''}</div>`;
  const tabs = [['versions', `Versions <span class="n">${set.items.length}</span>`], ['validation', 'Validation'], ['results', `Customer Results <span class="n">${set.results.length}</span>`], ['history', 'History']];
  const actions = draft
    ? [btn('+ Add versions', 'openAdd', { data: { set: set.id }, need: ['delivery'] }), btn('Deliver', 'openDeliver', { cls: 'primary', data: { set: set.id }, need: ['delivery'], disabled: val.blocking > 0, title: val.blocking ? `Resolve ${val.blocking} blocking issue(s) to deliver` : '' })]
    : [btn('Export manifest', 'openManifest', { data: { set: set.id } }), btn('+ Record customer results', 'openResult', { data: { set: set.id }, need: ['delivery'] }),
       btn('Flag post-delivery issue', 'openFlag', { cls: 'danger', data: { set: set.id }, need: ['delivery'] })];
  const body = tab === 'validation' ? setValidation(set, val) : tab === 'results' ? setResults(set) : tab === 'history' ? setHistory(set) : setVersions(set);
  return `<div class="page">
    <div class="small"><a href="#/sets">← Delivery Sets</a></div>
    <div class="phead" style="margin-top:6px"><div>
      <div class="row wrap"><h1>${esc(set.name)}</h1><span class="mono faint">${esc(set.id)}</span>${draft ? chip('Draft', 'neutral') : chip('Delivered 🔒', 'ok')}</div>
      <p>${esc(set.customer)} · ${esc(set.purpose)} · created ${fmtDay(set.created_at)} by ${esc(set.created_by)} · ${esc(p.stage_label)} · this set ${set.items.length} of target ${p.target} · program in good standing ${p.good}</p></div>
      <div class="row wrap">${actions.join('')}</div></div>
    ${bar}
    <div class="card"><div class="tabs">${tabs.map(([k, l]) => `<a class="${tab === k ? 'on' : ''}" data-act="setTab" data-set="${set.id}" data-tab="${k}">${l}</a>`).join('')}</div>
      <div style="padding:14px">${body}</div></div>
  </div>`;
}
A.setTab = d => { ui.setTab[d.set] = d.tab; };

function setVersions(set) {
  const draft = set.status === 'draft';
  if (!set.items.length) return `<div class="empty">No versions yet. Only approved versions that pass every delivery gate can be added.<div style="margin-top:10px">${btn('+ Add versions', 'openAdd', { cls: 'primary', data: { set: set.id }, need: ['delivery'] })}</div></div>`;
  return `<table class="tbl"><thead><tr><th>Ref</th><th>Name</th><th>Structure</th><th>Template</th><th>Quality</th><th>Grader</th><th>Solvability</th><th>Audited</th><th>${draft ? 'Current eligibility' : 'Status since delivery'}</th><th>Newer version</th><th></th></tr></thead><tbody>
    ${set.items.map(i => {
      const v = C.getVersion(S, i.version_id), t = C.getTask(S, v.task_id), latest = C.latestVersion(S, v.task_id), e = C.eligibility(S, v);
      const pdi = set.pdis.find(p => p.version_ids.includes(v.id));
      return `<tr><td>${pdi ? '⚠ ' : ''}<a href="${taskHash(v)}">${vRef(v.id)}</a></td><td>${esc(t.name)}</td><td><span class="tag">${esc(pretty(v.structure))}</span></td><td class="mono">${esc(v.template_id)}</td>
        <td>${reviewChip(v)}</td><td>${healthChip(C.graderHealth(S, v))}</td><td>${solvChip(v)}</td><td>${auditCell(S, v)}</td>
        <td title="${esc(e.reasons.join('\n'))}">${eligChip(e)}${pdi ? `<div class="small cell-bad">${esc(pdi.id)} ${esc(pretty(pdi.type))}</div>` : ''}</td>
        <td class="small">${latest.id !== v.id ? `<a href="${taskHash(latest)}">v${latest.n} ${esc(latest.review_status)}</a>` : '—'}</td>
        <td>${draft ? btn('Remove', 'removeItem', { cls: 'sm', data: { set: set.id, vid: v.id }, need: ['delivery'] }) : ''}</td></tr>`;
    }).join('')}</tbody></table>
    <p class="faint small">Version references never auto-upgrade. A newer version must be added explicitly to a new set.</p>`;
}
A.removeItem = d => { C.removeFromSet(S, d.set, d.vid, me()); toast('Removed ' + shortRef(d.vid)); };

function setValidation(set, val) {
  const checks = set.status === 'draft' ? val.checks : (set.validation_at_delivery || []);
  const comp = C.composition(S, set);
  const bars = (title, o) => { const max = Math.max(1, ...Object.values(o)); const e = Object.entries(o).sort((a, b) => b[1] - a[1]);
    return `<div><h3>${title}</h3><div class="bars">${e.map(([k, n]) => `<div class="b"><span>${esc(pretty(k))}</span><span class="t"><i style="width:${100 * n / max}%"></i></span><span>${n}</span></div>`).join('') || '<div class="faint small">—</div>'}</div></div>`; };
  const sample = set.sample;
  return `${set.status === 'delivered' ? `<div class="banner info" style="margin-top:0">Validation as recorded at delivery. Current per-version status is on the Versions tab.</div>` : ''}
    <table class="tbl"><thead><tr><th></th><th>Check</th><th>Level</th><th>Result</th><th>Affected</th></tr></thead><tbody>
      ${checks.map(c => `<tr><td class="${c.pass ? 'cell-ok' : c.level === 'blocking' ? 'cell-bad' : ''}" style="${!c.pass && c.level === 'warning' ? 'color:var(--warn)' : ''}">${c.pass ? '✓' : c.level === 'blocking' ? '✖' : '▲'}</td>
        <td><span class="mono faint">${c.id}</span> ${esc(c.label)}</td><td>${c.level === 'blocking' ? chip('Blocking', 'outline') : chip('Warning', 'outline')}</td><td>${esc(c.detail)}</td>
        <td class="small">${(c.affected || []).map(id => `<a href="${taskHash(C.getVersion(S, id))}">${esc(shortRef(id))}</a>${set.status === 'draft' ? ` <a data-act="removeItem" data-set="${set.id}" data-vid="${id}" class="faint">remove</a>` : ''}`).join('<br>')}</td></tr>`).join('')}
    </tbody></table>
    ${set.acknowledged.length ? `<div class="faint small" style="margin-top:6px">Acknowledged at delivery: ${set.acknowledged.map(a => `${a.check} (${esc(a.detail)}) — "${esc(a.reason)}" by ${esc(a.by)}`).join('; ')}</div>` : ''}
    <h3 style="margin-top:16px">Structural composition</h3>
    <div class="grid2" style="gap:12px 24px">${bars('By constraint structure', comp.structure)}${bars('By template', comp.template)}
      ${bars('By failure mode (observed)', comp.failure_mode)}${bars('Structures with a broken constraint on record', comp.constraint_break)}
      ${bars('By workflow', comp.workflow)}</div>
    <div class="faint small">A structure with no broken constraint on record has never been shown to be hard for the model.</div>
    <details style="margin-top:8px"><summary class="faint small" style="cursor:pointer">Domain (metadata only — not a diversity measure)</summary>${bars('', comp.domain)}</details>
    <h3 style="margin-top:16px">Customer review sample (Aster reviews 10 tasks a week)</h3>
    ${sample ? `<div class="small">Random · stratified by structure · seed ${sample.seed}: ${sample.random.map(id => vRef(id)).join(', ')}</div>
      <div class="small">Targeted: ${sample.targeted.map(x => `${vRef(x.id)} <span class="faint">(${esc(x.reason)})</span>`).join(', ') || '<span class="faint">none met a targeting rule</span>'}</div>
      <div class="faint small">Only the random group estimates overall quality.</div>`
      : set.status === 'draft' ? `<div class="row">${btn('Generate sample (up to 10)', 'genSample', { cls: 'sm', data: { set: set.id }, need: ['delivery'], disabled: !set.items.length })}<span class="faint small">5 random stratified by structure + up to 5 targeted.</span></div>`
      : '<div class="faint small">Not generated before delivery.</div>'}`;
}
A.genSample = d => { const x = C.customerSample(S, d.set, me()); toast(`Sample drawn · seed ${x.seed}.`); };

function setResults(set) {
  const openNotify = set.pdis.map(pdi => `<div class="hist"><div class="row sp"><b>${esc(pdi.id)} · ${esc(pretty(pdi.type))}</b><span class="faint small">discovered ${esc(pdi.discovered_at)} · ${esc(pdi.by)}</span></div>
      <div class="small">Versions: ${pdi.version_ids.map(vRef).join(', ')} · Evidence: ${esc(pdi.evidence)}${pdi.impact ? ' · Impact: ' + esc(pdi.impact) : ''}</div>
      <div class="small">Replacement: ${pdi.replacement_version_id ? vRef(pdi.replacement_version_id) : 'none yet'} · Snapshot unchanged.</div>
      <div class="small">${pdi.notification.required ? (pdi.notification.done_at ? `☑ Customer notified via ${esc(pdi.notification.channel)} · ${fmt(pdi.notification.done_at)}` : `□ Notify ${esc(set.customer)} — required ${btn('Mark notified…', 'openNotify', { cls: 'sm', data: { set: set.id, id: pdi.id }, need: ['delivery'] })}`) : 'No notification required: ' + esc(pdi.notification.reason)}</div></div>`).join('');
  if (set.status === 'draft') return '<div class="empty">Customer results attach to a delivered snapshot. Deliver this set first.</div>';
  const vids = set.items.map(i => i.version_id);
  const fp = C.randomAuditFP(S, vids), comp = C.composition(S, set);
  const tplTop = Object.entries(comp.template).sort((a, b) => b[1] - a[1])[0];
  const fails = vids.map(id => C.metrics(S, C.getVersion(S, id))), attributed = fails.reduce((t, m) => t + m.attributed, 0), model = fails.reduce((t, m) => t + m.model_attributed, 0);
  const cards = set.results.slice().reverse().map(r => {
    const sig = C.signal(r), gain = x => `${x >= 0 ? '+' : ''}${x} ${Math.abs(x) === 1 ? 'pt' : 'pts'}`;
    return `<div class="card pad" style="margin-bottom:12px">
      <div class="row sp"><b>Customer result · ${esc(r.date)}</b><span class="faint small mono">linked to ${esc(set.id)} #${esc(r.snapshot_hash)} (${set.items.length} versions)</span></div>
      <div class="result-grid" style="margin-top:8px">
        <div class="hd"></div><div class="hd">Baseline</div><div class="hd">After</div><div class="hd">Gain</div><div class="hd">n</div>
        <div><b>HELD-OUT</b></div><div class="big">${r.heldout_before}%</div><div class="big">${r.heldout_after}%</div><div class="big">${gain(sig.heldout_gain)}</div><div>${r.n_heldout}</div>
        <div class="faint">Training</div><div class="faint">${r.train_before}%</div><div class="faint">${r.train_after}%</div><div class="faint">${gain(sig.train_gain)}</div><div class="faint">${r.n_train}</div>
      </div>
      <div class="small" style="margin-top:8px"><span class="prefix">Design</span> eval budget unchanged: ${esc(r.eval_budget_unchanged)} · matched control: ${esc(r.matched_control)} · repeats: ${r.repeats}</div>
      ${r.traces.count ? `<div class="small"><span class="prefix">Traces</span> ${r.traces.count} · ${esc(r.traces.selection)} sample · ${esc(r.traces.summary)}${r.traces.selection !== 'random' ? ' <span class="faint">(rate not estimable from a non-random sample)</span>' : ''}</div>` : ''}
      ${r.n_train !== set.items.length ? `<div class="faint small">Aster trained on ${r.n_train} tasks; this snapshot holds ${set.items.length}. Version-level attribution of the result is unavailable.</div>` : ''}
      <div class="banner ${sig.label === 'Supported' ? 'ok' : sig.label.startsWith('Promising') ? 'info' : 'warn'}"><b>Generalization signal: ${esc(sig.label)}</b>${sig.note ? ' · ' + esc(sig.note) : ''}</div>
      ${sig.missing.length ? `<div class="small" style="margin-top:6px">What would strengthen this evidence: ${sig.missing.map(x => '□ ' + esc(x)).join(' &nbsp; ')}</div>` : ''}
      <div class="faint small" style="margin-top:4px">Without a matched control, no gain is attributable to this data. Held-out tasks are Aster's and stay private: aggregate only.</div>
      ${r.notes ? `<div class="small" style="margin-top:4px">Notes: ${esc(r.notes)}</div>` : ''}
    </div>`;
  }).join('');
  return `${cards || '<div class="empty">No results recorded. Aster shares aggregate metrics and selected traces; held-out results are aggregate only.</div>'}
    <div class="row wrap" style="margin-bottom:12px">${btn('+ Record customer results', 'openResult', { cls: 'sm', data: { set: set.id }, need: ['delivery'] })}
      <span class="faint small">Selected traces are imported on the task page (Runs → Import customer trace) so they can be audited against the exact version.</span></div>
    ${sweepBlock(set)}
    <h3>Evidence for the pilot decision</h3>
    <table class="tbl"><tbody>
      <tr><td>Held-out signal</td><td>${set.results.length ? esc(C.signal(set.results[set.results.length - 1]).label) : '—'}</td></tr>
      <tr><td>Grader false-positive rate (random audits in this snapshot)</td><td>${fp.n ? `${fp.invalid}/${fp.n}${fp.n < 40 ? ' · low n' : ''}` : 'not measured'}</td></tr>
      <tr><td>Post-delivery issues</td><td>${set.pdis.length}</td></tr>
      <tr><td>Structures · largest template share</td><td>${Object.keys(comp.structure).length} · ${tplTop ? `${esc(tplTop[0])} ${Math.round(100 * tplTop[1] / set.items.length)}%` : '—'}</td></tr>
      <tr><td>Model-attributed failures</td><td>${attributed ? `${model}/${attributed}` : 'none attributed'}</td></tr>
    </tbody></table>
    <p class="faint small">Nexus shows evidence. It does not recommend scaling.</p>
    ${set.pdis.length ? `<h3 style="margin-top:14px">Post-delivery issues</h3>${openNotify}` : ''}`;
}

// Task 3's priority investigation, in the product: draw passing runs at random across the whole
// snapshot, then audit them through the normal per-version flow.
function sweepBlock(set) {
  const sweeps = set.sweeps || [], k = 'sweep:' + set.id;
  form(k, { n: 5 });
  const drawn = sweeps.flatMap(x => x.run_ids.map(id => ({ id, sweep: x })));
  const done = drawn.filter(x => C.auditOf(S, x.id));
  const rows = drawn.map(({ id, sweep }) => {
    const run = C.getRun(S, id), v = C.getVersion(S, run.version_id), a = C.auditOf(S, id);
    return `<tr><td class="mono">${esc(run.label)}</td><td><a href="${taskHash(v)}" data-act="goAudit" data-vid="${v.id}" data-run="${id}">${vRef(v.id)}</a></td>
      <td class="faint small">${esc(sweep.id)} · seed ${sweep.seed == null ? '—' : sweep.seed}</td>
      <td>${a ? chip(a.verdict === 'valid' ? '✓ valid' : '✗ invalid', a.verdict === 'valid' ? 'ok' : 'bad') : chip('to audit', 'warn')}</td>
      <td class="small">${a ? esc(a.reason) : ''}</td></tr>`;
  }).join('');
  return `<h3 style="margin-top:16px">Random audit sweep</h3>
    <div class="small faint">Draws passing runs at random across every version in this snapshot. Convenience samples — including the customer's selected traces — prove a defect exists but cannot estimate its rate.</div>
    <div class="row" style="margin:8px 0"><div style="width:90px"><input type="number" ${bind(k, 'n')} value="${val(k, 'n')}"></div>
      ${btn('Draw sweep', 'drawSweep', { cls: 'sm primary', data: { set: set.id }, need: ['delivery', 'reviewer'] })}
      <span class="faint small">${done.length}/${drawn.length} drawn runs audited</span></div>
    ${drawn.length ? `<table class="tbl"><thead><tr><th>Run</th><th>Version</th><th>Sweep</th><th>Audit</th><th>Reason</th></tr></thead><tbody>${rows}</tbody></table>` : ''}`;
}
A.drawSweep = d => { const x = C.auditSweep(S, d.set, { n: form('sweep:' + d.set).n }, me()); toast(`Sweep ${x.id}: ${x.run_ids.length} of ${x.pool} unaudited passing runs · seed ${x.seed}.`); };
A.goAudit = d => { ui.detail.key = null; go(taskHash(C.getVersion(S, d.vid))); ui.pending = () => { ui.detail.tab = 'audit'; ui.detail.runId = d.run; ui.detail.auditing = d.run; }; };

function setHistory(set) {
  return `<table class="tbl"><thead><tr><th>When</th><th>Event</th><th>Detail</th><th>By</th></tr></thead><tbody>
    ${set.events.slice().reverse().map(e => `<tr><td class="small faint">${fmt(e.at)}</td><td>${esc(e.type)}</td><td class="small mono">${esc(e.detail)}</td><td class="small">${esc(e.by)}</td></tr>`).join('')}</tbody></table>`;
}
