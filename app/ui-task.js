// PAGE 2 — Task Detail / Review Workspace: header, definition (left), review panel (right).
'use strict';

function renderTask(t, v) {
  if (ui.detail.key !== v.id) Object.assign(ui.detail, { key: v.id, runId: null, auditing: null, agree: null, gatesOpen: false, cmpFrom: null, cmpTo: null, otherReviews: false });
  const vs = C.versionsOf(S, t.id), latest = vs[vs.length - 1];
  const m = C.metrics(S, v), st = C.auditStatus(S, v), h = C.graderHealth(S, v), e = C.eligibility(S, v);
  const delivered = C.deliveredIn(S, v.id), pdis = C.pdisFor(S, v.id);
  const topFail = m.dist[0];

  const banners = [];
  pdis.forEach(({ set, pdi }) => banners.push(`<div class="banner bad">Delivered in ${esc(set.id)}. Post-delivery issue ${esc(pdi.id)} (${esc(pretty(pdi.type))}, ${esc(pdi.discovered_at)}). ${v.review_status === 'Withdrawn' ? 'Withdrawn for future delivery.' : ''}
    ${pdi.replacement_version_id ? 'Replacement: ' + vRef(pdi.replacement_version_id) + '.' : 'No replacement yet.'} <a href="#/set/${set.id}">Open ${esc(set.id)}</a></div>`));
  if (!pdis.length && delivered.length && h.state === 'Confirmed Issue')
    banners.push(`<div class="banner bad">This version was delivered in ${delivered.map(x => esc(x.id)).join(', ')} and now has a confirmed grader issue.
      <a href="#/set/${delivered[0].id}" data-act="flagFromTask" data-set="${delivered[0].id}" data-vid="${v.id}">Flag post-delivery issue →</a></div>`);
  else if (h.state === 'Confirmed Issue') banners.push(`<div class="banner bad">Confirmed grader issue. This version cannot be delivered; fix it in a new version.</div>`);
  if (v.review_status === 'Approved' && !st.complete) banners.push(`<div class="banner warn">New passing run after approval. Eligibility paused until audited (Pass Audit tab).</div>`);
  if (v.grader_type === 'message_match') banners.push(`<div class="banner bad">Grader checks the final message only.</div>`);
  const dupes = C.nearDuplicates(S, v);
  if (dupes.length) banners.push(`<div class="banner warn">${dupes[0].twin ? 'Structural twin' : 'Near-duplicate'} of
    <a href="${taskHash(dupes[0].version)}">${esc(dupes[0].version.task_id)}</a> (similarity ${dupes[0].score}): same expected paths, tools and structure.
    ${dupes.length > 1 ? `And ${dupes.length - 1} more. ` : ''}Different labels are not diversity.</div>`);
  if (v.id !== latest.id) banners.push(`<div class="banner info">Viewing v${v.n}. Latest is v${latest.n} (${esc(latest.review_status)}). <a href="${taskHash(latest)}">Go to v${latest.n}</a></div>`);

  const kpi = (l, value, cls = '') => `<div class="kpi ${cls}"><div class="l">${l}</div><div class="v">${value}</div></div>`;
  const nextN = vs.length + 1;
  const actions = [];
  if (!['Withdrawn', 'Deprecated'].includes(v.review_status)) actions.push(btn(`Edit → creates v${nextN}`, 'openEdit', { data: { vid: v.id }, need: ['author', 'engineer'] }));
  if (v.review_status === 'Draft') actions.push(btn('Submit for Review', 'submitVersion', { cls: 'primary', data: { vid: v.id }, need: ['author', 'engineer'], disabled: C.submitMissing(S, v).length > 0, title: C.submitMissing(S, v).length ? 'Missing: ' + C.submitMissing(S, v).join(', ') : '' }));
  if (v.review_status === 'Ready for Review' && !C.reviewsOf(S, v.id).length) actions.push(btn('Recall', 'recallVersion', { data: { vid: v.id }, need: ['author', 'engineer'] }));
  if (!['Withdrawn', 'Deprecated'].includes(v.review_status)) actions.push(btn('Deprecate', 'openReason', { cls: 'danger', data: { kind: 'deprecate', vid: v.id }, need: ['author', 'reviewer'] }));

  return `<div class="page wide">
    <div class="card dhead">
      <div class="small"><a href="#/tasks">Task Library</a> / ${esc(t.id)} / v${v.n}</div>
      <div class="row sp wrap" style="margin-top:4px">
        <div class="row wrap"><h1>${esc(t.name)}</h1>
          <select data-act-change="pickVersion" data-task="${t.id}" style="width:auto">${vs.map(x => opt(x.n, `v${x.n} · ${x.review_status}`, v.n)).join('')}</select>
          <span class="mono faint" title="content hash">#${esc(v.content_hash)}</span></div>
        <div class="row wrap">${actions.join('')}</div>
      </div>
      ${v.review_status === 'Draft' && C.submitMissing(S, v).length ? `<div class="faint small" style="margin-top:4px">To submit: ${esc(C.submitMissing(S, v).join(' · '))}</div>` : ''}
      ${v.review_status === 'Changes Requested' ? `<div class="faint small" style="margin-top:4px">Changes were requested on v${v.n}. Edit to create v${nextN}; v${v.n} cannot be resubmitted.</div>` : ''}
      <div class="row wrap" style="margin-top:6px"><span class="tag">${esc(pretty(v.structure))}</span><span class="tag">${esc(pretty(v.capability))}</span><span class="tag">${esc(pretty(v.workflow))}</span>
        <span class="tag">template ${esc(v.template_id)}</span><span class="tag">Pool ${esc(t.pool)}</span><span class="faint small">Author ${esc(v.created_by)} · Domain ${esc(t.domain)} (metadata only)</span></div>
      ${banners.join('')}
      <div class="band">
        <div><div class="grp-title">Agent execution · about the model</div><div class="kpis">
          ${kpi('Runs', `${m.internal}${m.invalid ? ` <span class="faint small">(${m.invalid} invalid)</span>` : ''}${m.customer ? ` <span class="faint small">+${m.customer} cust.</span>` : ''}`, 'exec')}
          ${kpi('Agent pass', frac(m.passes, m.valid), 'exec')}
          ${kpi('Top failure', topFail ? `<span style="font-size:13px">${esc(pretty(topFail.mode))} ×${topFail.count}</span>` : '—', 'exec')}</div></div>
        <div class="div"></div>
        <div><div class="grp-title">Task quality · about this version</div><div class="kpis">
          ${kpi('Review', reviewChip(v))}${kpi('Grader health', healthChip(h))}${kpi('Audited passes', auditCell(S, v))}${kpi('Solvability', solvChip(v))}
          <div class="kpi" style="cursor:pointer" data-act="toggleGates"><div class="l">Delivery ▾</div><div class="v">${eligChip(e)}</div></div></div>
          ${ui.detail.gatesOpen ? `<div class="card pad" style="margin-top:8px">${gateList(e)}</div>` : ''}</div>
      </div>
    </div>
    <div class="cols">
      <div class="col">${renderDefinition(t, v)}</div>
      <div class="col">${renderCenter(t, v)}</div>
      <div class="col sticky">${renderReviewPanel(t, v)}</div>
    </div>
  </div>`;
}
const gateList = e => e.gates.map(g => `<div class="gate"><span class="${g.pass ? 'cell-ok' : 'cell-bad'}">${g.pass ? '✓' : '✗'}</span><span class="mono faint">${g.id}</span><span>${esc(g.label)}${g.pass ? '' : `<div class="small" style="color:var(--bad)">${esc(g.reason)}</div>`}</span></div>`).join('')
  + (e.state === 'Withdrawn' ? '<div class="small cell-bad">Withdrawn: never deliverable again.</div>' : '');

function renderDefinition(t, v) {
  const D = ui.detail;
  const sec = (key, title, body, openDefault) => {
    const open = D.open[key] == null ? openDefault : D.open[key];
    return `<div class="sec"><div class="sh" data-act="toggleSec" data-key="${key}" data-def="${openDefault ? 1 : 0}"><span>${title}</span><span class="faint">${open ? '▾' : '▸'}</span></div>${open ? `<div class="sb">${body}</div>` : ''}</div>`;
  };
  const rec = t.starter;
  return `<div class="card">
    <div style="padding:10px 14px;border-bottom:1px solid var(--line)" class="faint small">Definition of v${v.n} · immutable</div>
    ${sec('goal', 'Goal', esc(v.goal), true)}
    ${sec('constraints', `Constraints (${v.constraints.length})`, `<ul>${v.constraints.map(c => `<li><b>${c.id}</b> ${esc(c.text)}${c.source ? ` <span class="faint small">(${esc(c.source)})</span>` : ''}</li>`).join('')}</ul>`, true)}
    ${sec('expected', 'Expected final state', `<ul>${v.expected.map(e => `<li><span class="faint">${e.id} · ${esc(e.constraint)}</span> <span class="mono">${esc(e.path)} ${esc(e.op)} ${esc(e.value)}</span></li>`).join('')}</ul>`, true)}
    ${sec('solv', 'Solvability evidence', v.solvability
      ? `${chip('✓ Verified', 'ok')}<div class="small" style="margin-top:6px">${esc(pretty(v.solvability.type))} · ${esc(v.solvability.expert)} · ${esc(v.solvability.date)}${v.solvability.budget ? ' · ' + esc(v.solvability.budget) : ''}<br>Evidence: ${esc(v.solvability.evidence_ref)}</div>`
      : `<div class="banner warn" style="margin-top:0">No evidence this task is solvable. Delivery blocked.</div><div style="margin-top:8px">${btn('+ Add evidence', 'openSolv', { cls: 'sm', data: { vid: v.id }, need: ['author', 'engineer'] })}</div>`, true)}
    ${sec('grader', 'Grader logic', `${chip(esc(pretty(v.grader_type)), v.grader_type === 'message_match' ? 'bad' : 'outline')}
      <table class="tbl" style="margin-top:6px">${v.grader_checks.map(k => `<tr><td>${esc(k.name)}<div class="faint small mono">${esc(k.assertion || '')}</div></td><td class="small">${k.exp_id ? esc(k.exp_id) : '<span style="color:var(--warn)">no state</span>'}</td><td>${k.weight}</td></tr>`).join('')}</table>`, v.grader_type === 'message_match')}
    ${sec('start', 'Starting state', `<pre class="json">${esc(v.starting_state)}</pre>`, false)}
    ${sec('docs', `Documents / policies (${v.documents.length})`, `<ul>${v.documents.map(d => `<li><span class="mono">${esc(d.id)}</span> ${esc(d.title)}${d.superseded_by ? ' ' + chip('superseded by ' + esc(d.superseded_by), 'warn') : ''}</li>`).join('')}</ul>`, false)}
    ${sec('tools', 'Available tools', v.tools.map(x => `<span class="tag" style="margin:2px">${esc(x)}</span>`).join(''), false)}
    ${rec ? sec('starter', 'Starter record (source)', `<div class="small">${['instruction', 'initial_state', 'success_condition', 'reported_run_result', 'run_evidence', 'reference_evidence'].map(k => `<div style="margin-bottom:6px"><span class="prefix">${pretty(k)}</span><div>${esc(rec[k])}</div></div>`).join('')}</div>`, false) : ''}
  </div>`;
}
A.toggleSec = d => { const cur = ui.detail.open[d.key]; ui.detail.open[d.key] = !(cur == null ? d.def === '1' : cur); };
A.toggleGates = () => { ui.detail.gatesOpen = !ui.detail.gatesOpen; };
CH.pickVersion = (value, d) => go(`#/task/${d.task}/v/${value}`);

function renderReviewPanel(t, v) {
  const e = C.eligibility(S, v), prefill = C.checklistPrefill(S, v), k = 'review:' + v.id;
  const f = form(k, { decision: '', reason: '', quality_issues: [], suggested_fix: '', fix_owner: '', severity: '', confidence: '', checklist: {} });
  const ckVal = id => (f.checklist[id] && f.checklist[id].value) || (prefill[id] ? prefill[id].value : null);
  const checklist = C.CHECKLIST.map(item => {
    const cur = ckVal(item.id), p = prefill[item.id];
    const b = (value, label, cls) => `<button class="${cls} ${cur === value ? 'on' : ''}" data-act="ck" data-k="${k}" data-id="${item.id}" data-value="${value}">${label}</button>`;
    return `<div class="ck"><div>${item.auto ? '<span title="pre-filled from data" style="color:var(--warn)">★</span> ' : ''}${esc(item.text)}${p ? `<div class="h">${esc(p.hint)}</div>` : ''}
        ${cur === 'no' && v.review_status === 'Ready for Review' ? `<input ${bind(k, 'note_' + item.id)} data-refresh="decision" value="${esc(f['note_' + item.id] || '')}" placeholder="Note (required for ✗)" style="margin-top:4px">` : ''}</div>
      <div class="tri">${b('yes', '✓', 'yes')}${b('no', '✗', 'no')}${b('unk', '?', 'unk')}</div></div>`;
  }).join('');
  const reviews = C.reviewsOf(S, v.id).slice().reverse();
  const others = C.versionsOf(S, t.id).filter(x => x.id !== v.id).flatMap(x => C.reviewsOf(S, x.id).map(r => ({ x, r })));
  const history = reviews.map(r => reviewCard(r, false)).join('') || '<div class="faint small">No reviews on this version.</div>';

  let decision = '';
  if (v.review_status === 'Ready for Review') {
    const radio = (value, label) => `<label><input type="radio" name="dec-${v.id}" value="${value}" ${bind(k, 'decision')} ${f.decision === value ? 'checked' : ''}> ${label}</label>`;
    decision = `<div class="decision">
      <h3>Decision on v${v.n}</h3>
      <div class="opts">${radio('approve', 'Approve this version')}${radio('request_changes', 'Request changes')}${radio('block', 'Block this version')}</div>
      <label class="f">Reason <span class="req">*</span></label><textarea rows="3" ${bind(k, 'reason')} data-refresh="decision" placeholder="Tie the decision to the evidence (≥ 20 characters)">${val(k, 'reason')}</textarea>
      ${f.decision === 'request_changes' || f.decision === 'block' ? `<label class="f">Quality issues ${f.decision === 'request_changes' ? '<span class="req">*</span>' : ''}</label>
        <div class="opts" style="columns:2;font-size:12px">${C.QUALITY_ISSUES.map(q => `<label><input type="checkbox" value="${q}" ${bind(k, 'quality_issues')} ${f.quality_issues.includes(q) ? 'checked' : ''}> ${pretty(q)}</label>`).join('')}</div>` : ''}
      ${f.decision === 'request_changes' ? `<label class="f">Suggested fix <span class="req">*</span></label><textarea rows="2" ${bind(k, 'suggested_fix')} data-refresh="decision">${val(k, 'suggested_fix')}</textarea>
        <label class="f">Fix owner</label>${selectF(k, 'fix_owner', ['Author', 'Engineer'], 'Select…')}` : ''}
      <div class="grid2"><div><label class="f">Severity</label>${selectF(k, 'severity', ['Low', 'Medium', 'High', 'Blocking'], 'Select…')}</div>
        <div><label class="f">Confidence</label>${selectF(k, 'confidence', ['Low', 'Medium', 'High'], 'Select…')}</div></div>
      ${(() => { const mine = S.audits.filter(a => a.version_id === v.id && a.sampled_by === 'random');
        return mine.length && mine.every(a => a.by === me()) ? `<div class="small" style="color:var(--warn);margin-top:8px">You audited every sampled pass on this version. Approving is allowed, but the review record will say so.</div>` : ''; })()}
      <div class="faint small" style="margin-top:8px">Evidence reviewed: ${esc((ui.detail.viewed[v.id] || []).map(id => C.getRun(S, id).label).join(', ') || 'none opened')} · ${S.audits.filter(a => a.version_id === v.id).length} audit(s)</div>
      <div id="decision-state">${decisionState(v, k)}</div>
    </div>`;
  } else {
    const other = [];
    if (v.review_status === 'Blocked') other.push(btn('Unblock with new evidence…', 'openReason', { data: { kind: 'unblock', vid: v.id }, need: ['reviewer'] }));
    if (v.review_status === 'Approved') other.push(btn('Withdraw…', 'openReason', { cls: 'danger', data: { kind: 'withdraw', vid: v.id }, need: ['reviewer', 'delivery'],
      disabled: C.graderHealth(S, v).state !== 'Confirmed Issue' && !C.pdisFor(S, v.id).length, title: 'Requires a confirmed grader issue or a post-delivery issue' }));
    const msg = { 'Draft': 'Draft — the author submits it for review.', 'Changes Requested': 'Changes requested — waiting for a new version.', 'Approved': 'Approved. Delivery depends on the gates above.',
      'Blocked': 'Blocked — unblock needs a run recorded after the block.', 'Withdrawn': 'Withdrawn — never deliverable again. History is kept.', 'Deprecated': 'Deprecated.' }[v.review_status];
    decision = `<div class="decision"><div class="small">${esc(msg)}</div>${other.length ? `<div class="row" style="margin-top:8px">${other.join('')}</div>` : ''}</div>`;
  }
  const issues = C.issuesOf(S, v.id);
  const next = ui.nextUp && ui.nextUp.after === v.id ? C.getVersion(S, ui.nextUp.id) : null;
  const lens = roleIs('reviewer') ? null : roleCard(t, v, e, issues);
  return `<div class="card">
    ${next ? `<div class="banner ok" style="margin:12px 14px 0">Decision recorded. Next in queue: <a href="${taskHash(next)}" data-act="goNext">${esc(next.task_id)} v${next.n} · ${esc(ui.nextUp.reason)}</a></div>` : ''}
    <div style="padding:12px 14px;border-bottom:1px solid var(--line2)"><h3>Delivery gates for v${v.n}</h3>${gateList(e)}
      <div class="small" style="margin-top:4px">${e.eligible ? '<span class="cell-ok">All gates pass — eligible for delivery.</span>' : `${e.gates.filter(g => !g.pass).length} gate(s) failing.${v.review_status === 'Ready for Review' ? ' Approved ≠ eligible.' : ''}`}</div></div>
    ${issues.length ? `<div style="padding:12px 14px;border-bottom:1px solid var(--line2)"><h3>Grader issues</h3>${issues.map(i => `<div class="hist"><b>${esc(i.id)}</b> ${chip(esc(i.status), i.status === 'open' ? 'warn' : i.status === 'dismissed' ? 'neutral' : 'bad')} ${esc(pretty(i.type))}
      <div class="small">${esc(i.note)}</div><div class="faint small">${esc(i.by)} · ${fmt(i.at)}${i.fixed_in_version_id ? ' · fixed in ' + vRef(i.fixed_in_version_id) : ''}${i.dismiss_reason ? ' · dismissed: ' + esc(i.dismiss_reason) : ''}</div>
      ${i.status === 'open' ? `<div class="row" style="margin-top:4px">${btn('Confirm', 'confirmIssue', { cls: 'sm', data: { id: i.id }, need: ['reviewer', 'engineer'] })}${btn('Dismiss…', 'openReason', { cls: 'sm', data: { kind: 'dismiss', id: i.id }, need: ['reviewer'] })}</div>` : ''}</div>`).join('')}</div>` : ''}
    ${lens ? '' : `<div style="padding:12px 14px;border-bottom:1px solid var(--line2)"><h3>Review checklist</h3>${checklist}</div>`}
    <div style="padding:12px 14px"><h3>Review history</h3>${history}
      ${others.length ? `<a class="small" data-act="toggleOtherReviews">${ui.detail.otherReviews ? 'Hide' : 'Show'} reviews of other versions (${others.length})</a>
        ${ui.detail.otherReviews ? others.map(({ x, r }) => `<div style="opacity:.6">${reviewCard(r, true, x)}</div>`).join('') : ''}` : ''}</div>
    ${lens || decision}
  </div>`;
}

// Non-reviewers get their own question answered here instead of the reviewer's checklist:
// what do I have to do to this version, and what is in my way.
function roleCard(t, v, e, issues) {
  const failing = e.gates.filter(g => !g.pass);
  const nextN = C.versionsOf(S, t.id).length + 1;
  const lastReturn = C.reviewsOf(S, v.id).filter(r => ['request_changes', 'block'].includes(r.decision)).pop();
  const head = (title, body) => `<div class="decision"><h3>${title}</h3>${body}</div>`;
  const gapList = failing.length
    ? `<ul class="blockers">${failing.map(g => `<li>${esc(g.reason)}</li>`).join('')}</ul>`
    : '<div class="small cell-ok">Every delivery gate passes.</div>';

  if (roleIs('author')) {
    const missing = v.review_status === 'Draft' ? C.submitMissing(S, v) : [];
    return head('Your version', `
      <div class="small">${esc({ 'Draft': 'Draft — add evidence, then submit it for review.', 'Ready for Review': 'With a reviewer. You can recall it until someone decides.',
        'Changes Requested': `A reviewer returned v${v.n}. Edit to create v${nextN}; this version cannot be resubmitted.`, 'Approved': 'Approved. Delivery depends on the gates above.',
        'Blocked': 'Blocked. A reviewer unblocks it after new evidence.', 'Withdrawn': 'Withdrawn after a confirmed defect.', 'Deprecated': 'Deprecated.' }[v.review_status])}</div>
      ${lastReturn ? `<div class="hist" style="margin-top:8px"><b>${esc(lastReturn.reviewer)} asked for</b><div>${esc(lastReturn.suggested_fix || lastReturn.reason)}</div>
        ${lastReturn.quality_issues && lastReturn.quality_issues.length ? `<div class="faint small">${lastReturn.quality_issues.map(pretty).join(', ')}</div>` : ''}</div>` : ''}
      ${missing.length ? `<div class="small" style="margin-top:8px">To submit: <span class="faint">${esc(missing.join(' · '))}</span></div>` : ''}
      <div style="margin-top:8px">${gapList}</div>
      <div class="row" style="margin-top:10px">${btn('+ Record run', 'openRun', { cls: 'sm', data: { vid: v.id } })}
        ${v.solvability ? '' : btn('+ Solvability evidence', 'openSolv', { cls: 'sm', data: { vid: v.id } })}</div>`);
  }
  if (roleIs('engineer')) {
    const gaps = C.uncheckedExpected(v);
    return head('Grader & environment', `
      <div class="small">Grader type: <b>${esc(pretty(v.grader_type))}</b>${v.grader_type === 'message_match' ? ' — reads the agent\'s words, not the world.' : ''}</div>
      <div class="small">${gaps.length ? `<span class="cell-bad">No check reads ${gaps.map(g => esc(g.id)).join(', ')}.</span>` : `All ${v.expected.length} expected rows are checked.`}</div>
      <div class="small">Invalid runs: ${C.metrics(S, v).invalid}/${C.metrics(S, v).internal} — environment-attributed runs leave the pass rate.</div>
      ${issues.filter(i => i.status !== 'dismissed').map(i => `<div class="hist" style="margin-top:8px"><b>${esc(i.id)}</b> ${esc(pretty(i.type))} · ${esc(i.status)}<div>${esc(i.note)}</div></div>`).join('')}
      <div style="margin-top:8px">${gapList}</div>
      <div class="row" style="margin-top:10px">${btn(`Edit → creates v${nextN}`, 'openEdit', { cls: 'sm primary', data: { vid: v.id } })}
        ${btn('+ Record run', 'openRun', { cls: 'sm', data: { vid: v.id } })}</div>`);
  }
  const inSets = C.setsContaining(S, v.id);
  return head('Delivery', `
    <div class="small">${e.eligible ? '<span class="cell-ok">Eligible for delivery.</span>' : 'Not eligible yet:'}</div>
    ${e.eligible ? '' : `<div style="margin-top:6px">${gapList}</div>`}
    <div class="small" style="margin-top:8px">${inSets.length ? inSets.map(x => `${esc(x.id)} · ${x.status === 'delivered' ? 'delivered ' + fmtDay(x.delivered_at) : 'draft'}`).join('<br>') : 'Not in any delivery set.'}</div>
    ${C.pdisFor(S, v.id).map(({ set, pdi }) => `<div class="hist" style="margin-top:8px"><b>${esc(pdi.id)}</b> ${esc(pretty(pdi.type))} in ${esc(set.id)}<div class="small">${esc(pdi.evidence)}</div></div>`).join('')}
    <div class="row" style="margin-top:10px"><a class="btn sm" href="#/sets">Open Delivery Sets</a></div>`);
}
function reviewCard(r, other, x) {
  const tone = { approve: 'ok', request_changes: 'warn', block: 'bad', withdraw: 'bad', deprecate: 'neutral', unblock: 'info' }[r.decision];
  return `<div class="hist"><div class="row sp">${chip(esc(pretty(r.decision)), tone)}<span class="faint small">${esc(r.reviewer)} · ${fmt(r.at)}</span></div>
    <div class="faint small mono">on ${esc(shortRef(r.version_id))}${other ? ` — does not apply to the viewed version` : ''}</div>
    <div style="margin-top:4px">${esc(r.reason)}</div>
    ${r.quality_issues && r.quality_issues.length ? `<div class="small">Issues: ${r.quality_issues.map(pretty).join(', ')}</div>` : ''}
    ${r.suggested_fix ? `<div class="small">Fix (${esc(r.fix_owner || '—')}): ${esc(r.suggested_fix)}</div>` : ''}
    ${r.severity || r.confidence ? `<div class="faint small">Severity ${esc(r.severity || '—')} · confidence ${esc(r.confidence || '—')}</div>` : ''}
    ${r.self_audited ? `<div class="small" style="color:var(--warn)">Same person audited the passing runs and approved this version.</div>` : ''}
    ${r.evidence_run_ids ? `<div class="faint small">Evidence: ${r.evidence_run_ids.map(id => esc(C.getRun(S, id).label)).join(', ') || 'none'}${r.audit_ids && r.audit_ids.length ? ' · ' + r.audit_ids.join(', ') : ''}</div>` : ''}</div>`;
}
function reviewPayload(v, k) {
  const f = form(k), prefill = C.checklistPrefill(S, v), checklist = {};
  C.CHECKLIST.forEach(item => {
    const x = f.checklist[item.id] || {}, value = x.value || (prefill[item.id] ? prefill[item.id].value : null);
    if (value) checklist[item.id] = { value, note: f['note_' + item.id] || '' };
  });
  return { decision: f.decision, reason: f.reason, quality_issues: f.quality_issues, suggested_fix: f.suggested_fix, fix_owner: f.fix_owner,
    severity: f.severity, confidence: f.confidence, checklist, evidence_run_ids: ui.detail.viewed[v.id] || [] };
}
function decisionState(v, k) {
  const blockers = roleIs('reviewer') ? C.reviewBlockers(S, v, reviewPayload(v, k), me()) : ['Switch "Viewing as" to Reviewer to decide.'];
  return `${blockers.length ? `<ul class="blockers">${blockers.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
    <div class="row" style="margin-top:10px;justify-content:flex-end"><button class="btn primary" data-act="submitDecision" data-vid="${v.id}" ${blockers.length ? 'disabled' : ''}>Submit decision on v${v.n}</button></div>`;
}
REFRESH.decision = () => {
  const r = route(); if (!r || r.page !== 'task') return;
  const el = document.getElementById('decision-state'); if (el) el.innerHTML = decisionState(r.v, 'review:' + r.v.id);
};

A.ck = d => { const f = form(d.k); f.checklist[d.id] = Object.assign(f.checklist[d.id] || {}, { value: d.value }); };
A.toggleOtherReviews = () => { ui.detail.otherReviews = !ui.detail.otherReviews; };
A.submitDecision = d => {
  const v = C.getVersion(S, d.vid), k = 'review:' + v.id;
  const r = C.addReview(S, v.id, reviewPayload(v, k), me());
  delete ui.f[k];
  const e = C.eligibility(S, v), nx = C.nextInQueue(S, v.id);
  ui.nextUp = nx ? { id: nx.v.id, after: v.id, reason: nx.q.reason } : null;
  toast(`Review recorded on ${shortRef(v.id)} — ${v.review_status}.${r.decision === 'approve' && !e.eligible ? ' Approved ≠ eligible: ' + e.reasons.join('; ') : ''}`);
};
A.goNext = () => { const n = ui.nextUp; ui.nextUp = null; go(taskHash(C.getVersion(S, n.id))); };
A.submitVersion = d => { const v = C.submitForReview(S, d.vid, me()); toast(`v${v.n} submitted for review.`); };
A.recallVersion = d => { C.recall(S, d.vid, me()); toast('Recalled to Draft.'); };
A.confirmIssue = d => { C.confirmIssue(S, d.id, me()); toast(`${d.id} confirmed.`); };
A.openSolv = d => { ui.f.solv = { type: 'expert_completed', expert: '', date: localDate(), budget: '', evidence_ref: '' }; ui.modal = { kind: 'solv', vid: d.vid }; };
A.openReason = d => { ui.f.reason = { reason: '' }; ui.modal = { kind: 'reason', action: d.kind, vid: d.vid, id: d.id }; };
A.flagFromTask = d => { ui.pending = () => A.openFlag({ set: d.set, vid: d.vid }); go('#/set/' + d.set); };
