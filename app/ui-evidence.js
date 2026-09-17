// PAGE 2 center column — Runs, Pass Audit, Versions.
'use strict';

function defaultRunId(v) {
  const runs = C.runsOf(S, v.id);
  const pick = runs.find(r => r.result === 'pass' && !C.auditOf(S, r.id))
    || runs.find(r => (C.auditOf(S, r.id) || {}).verdict === 'invalid')
    || runs.find(r => r.result === 'fail') || runs[0];
  return pick ? pick.id : null;
}
const markViewed = (v, runId) => { const set = ui.detail.viewed[v.id] || (ui.detail.viewed[v.id] = []); if (runId && !set.includes(runId)) set.push(runId); };

function renderCenter(t, v) {
  const D = ui.detail, runs = C.runsOf(S, v.id), st = C.auditStatus(S, v);
  if (!D.runId || !runs.some(r => r.id === D.runId)) D.runId = defaultRunId(v);
  markViewed(v, D.runId);
  const tabs = [['runs', `Runs <span class="n">${runs.length}</span>`], ['audit', `Pass Audit <span class="n">${st.audited}/${st.required}</span>`], ['versions', `Versions <span class="n">${C.versionsOf(S, t.id).length}</span>`]];
  const body = D.tab === 'audit' ? renderAuditTab(v) : D.tab === 'versions' ? renderVersionsTab(t, v) : renderRunsTab(v);
  return `<div class="card"><div class="tabs">${tabs.map(([k, l]) => `<a class="${D.tab === k ? 'on' : ''}" data-act="dTab" data-tab="${k}">${l}</a>`).join('')}</div>
    <div style="padding:14px">${body}</div></div>`;
}

// ---------- Runs ----------
function renderRunsTab(v) {
  const runs = C.runsOf(S, v.id), m = C.metrics(S, v);
  const recordBtns = `<div class="row">${btn('+ Record run', 'openRun', { cls: 'sm', data: { vid: v.id }, need: ['author', 'engineer'] })}
    ${btn('Import customer trace', 'openRun', { cls: 'sm', data: { vid: v.id, customer: 1 }, disabled: !C.deliveredIn(S, v.id).length, title: C.deliveredIn(S, v.id).length ? '' : 'Only versions in a delivered set can receive customer traces' })}</div>`;
  if (!runs.length) return `<div class="empty">No runs recorded for v${v.n}. Review needs evidence.<div style="margin-top:10px">${recordBtns}</div></div>`;
  const distRows = m.dist.map(d => `<tr><td>${esc(pretty(d.mode))}</td><td>${d.count}</td><td>${Object.entries(d.attributions).map(([a, n]) => `${esc(a)} ${n}`).join(' · ')}</td></tr>`).join('');
  const hint = !m.valid ? 'No valid runs: every run is invalid or attributed to the environment.'
    : m.attributed && m.model_attributed === m.attributed ? `${m.model_attributed}/${m.attributed} attributed failures are Model — consistent with a valid hard task.`
    : m.attributed ? `${m.attributed - m.model_attributed}/${m.attributed} attributed failures are not Model. Investigate before approving.`
    : m.fails ? 'Failures not yet attributed. Open a failed run and attribute it.' : '';
  const run = runs.find(r => r.id === ui.detail.runId);
  return `
    <div class="row sp wrap"><div><b>${m.valid} valid</b> · ${m.passes} PASS · ${m.fails} FAIL${m.invalid ? ` · <span class="faint">${m.invalid} invalid (excluded)</span>` : ''}${m.customer ? ` · <span class="faint">${m.customer} customer trace(s), not in pass rate</span>` : ''}
      ${m.valid < 5 ? '<span class="chip warn" style="margin-left:6px">low n</span>' : ''}</div>${recordBtns}</div>
    <div style="margin:10px 0">${strip(S, v, true)} <span class="faint small" style="margin-left:8px">solid = pass · outline = fail · hatched = invalid · dashed = customer · ✓/✗ = audit</span></div>
    ${m.mixed_budgets ? '<div class="banner warn">Runs use different models or budgets. Pass rate is not comparable.</div>' : ''}
    ${distRows ? `<table class="tbl" style="margin:6px 0 4px"><thead><tr><th>Failure mode</th><th>Count</th><th>Attribution</th></tr></thead><tbody>${distRows}</tbody></table>` : ''}
    ${constraintProfileBlock(v)}
    ${hint ? `<div class="faint small" style="margin-bottom:10px">${esc(hint)}</div>` : ''}
    <table class="tbl"><thead><tr><th>Run</th><th>Source</th><th>Grader result</th><th>Score</th><th>Failure mode</th><th>Attribution</th><th>Audit</th><th>Recorded</th></tr></thead><tbody>
      ${runs.map(r => { const a = C.latestAttribution(S, r.id) || {}, au = C.auditOf(S, r.id);
        return `<tr class="click ${r.id === ui.detail.runId ? 'sel' : ''}" data-act="selRun" data-run="${r.id}">
          <td class="mono">${esc(r.label)}</td><td>${r.source === 'customer' ? chip('customer · ' + esc(r.selection), 'outline') : 'internal'}</td>
          <td>${chip(esc(r.result.toUpperCase()), 'outline')}</td><td>${r.result === 'pass' || r.result === 'fail' ? r.score.toFixed(2) : '—'}</td>
          <td>${esc(pretty(a.failure_mode)) || '<span class="faint">—</span>'}
            ${(() => { const br = C.failedConstraints(S, v, r); return br.length ? `<div class="faint small">broke ${br.join(', ')}</div>` : ''; })()}</td>
          <td>${a.attribution ? esc(a.attribution) : r.result === 'fail' ? '<span class="faint">unattributed</span>' : '—'}${C.disagreement(S, r.id) ? ' ' + chip('disagreement', 'warn') : ''}</td>
          <td>${au ? chip(au.verdict === 'valid' ? '✓ valid' : '✗ invalid', au.verdict === 'valid' ? 'ok' : 'bad') : r.result === 'pass' ? chip('not audited', 'warn') : '—'}</td>
          <td class="faint small">${fmt(r.at)}</td></tr>`; }).join('')}
    </tbody></table>
    ${run ? renderRunDetail(v, run) : ''}`;
}

// Which constraint the model actually breaks, read off the captured state. This is what tells a
// hard task from a task that is merely fiddly: the failures should land on the constraint the task
// was built to test, not scatter.
function constraintProfileBlock(v) {
  const p = C.constraintProfile(S, v);
  if (!p.denom) return '';
  const max = Math.max(1, ...p.rows.map(r => r.fails));
  return `<h3 style="margin:14px 0 6px">Which constraint breaks <span class="faint" style="text-transform:none;letter-spacing:0">· ${p.denom} run(s) with a broken constraint</span></h3>
    <div class="bars">${p.rows.map(r => `<div class="b"><span><b>${esc(r.id)}</b> ${esc(r.text)}</span>
      <span class="t"><i style="width:${Math.round(100 * r.fails / max)}%"></i></span><span>${r.fails}</span></div>`).join('')}</div>
    <div class="faint small">Derived from the captured final state, including passes an audit found invalid — not from the failure-mode label.</div>`;
}

function renderRunDetail(v, run) {
  const au = C.auditOf(S, run.id), captured = run.result === 'pass' || run.result === 'fail';
  const mm = C.mismatches(S, v, run);
  const disagree = au && au.verdict === 'invalid' && run.result === 'pass';
  const rows = captured ? v.expected.map(e => ({ e, s: run.state.find(x => x.exp_id === e.id) || {} }))
    .sort((a, b) => (a.s.holds === false ? 0 : a.s.holds === null ? 1 : 2) - (b.s.holds === false ? 0 : b.s.holds === null ? 1 : 2)) : [];
  const staleDocs = v.documents.filter(d => d.superseded_by).map(d => d.id);
  const D = ui.detail, fk = 'agree:' + run.id, af = form(fk, { type: '', check_id: '', note: '' });
  const annK = 'ann:' + run.id, ann = form(annK, () => { const a = C.latestAttribution(S, run.id) || {}; return { attribution: a.attribution || '', failure_mode: a.failure_mode || '' }; });
  return `<div class="card" style="margin-top:14px;border-color:#d8d2c8">
    <div class="row sp wrap" style="padding:10px 14px;border-bottom:1px solid var(--line)">
      <div><b>Run ${esc(run.label)}</b> <span class="faint small">· ${esc(run.source)}${run.set_id ? ' · ' + esc(run.set_id) : ''} · ${esc(run.model)} · ${esc(run.budget)} · ${fmt(run.at)} · recorded by ${esc(run.recorded_by)}</span></div>
      <div class="row">${chip('GRADER ' + esc(run.result.toUpperCase()) + (captured ? ' ' + run.score.toFixed(2) : ''), 'outline')}
        ${au ? chip('AUDIT ' + (au.verdict === 'valid' ? '✓ valid' : '✗ invalid'), au.verdict === 'valid' ? 'ok' : 'bad') : run.result === 'pass' ? chip('AUDIT pending', 'warn') : ''}</div>
    </div>
    <div style="padding:12px 14px">
      ${disagree ? `<div class="banner bad">Grader and audit disagree: the grader passed this run, the audit found the final state wrong. ${esc(au.reason)}</div>` : ''}
      ${mm.length ? `<div class="banner warn">Grader disagrees with the captured state on ${mm.map(x => esc(x.check.name)).join(', ')}.</div>` : ''}
      <h3 style="margin-top:6px">Expected vs actual final state</h3>
      ${captured ? `<table class="tbl"><thead><tr><th>Constraint</th><th>Expected</th><th>Actual (environment)</th><th>Agent claimed</th><th>Result</th></tr></thead><tbody>
        ${rows.map(({ e, s }) => { const c = v.constraints.find(x => x.id === e.constraint) || {};
          return `<tr><td><b>${esc(e.constraint)}</b> <span class="small">${esc(c.text)}</span></td><td class="mono">${esc(e.path)} ${esc(e.op)} ${esc(e.value)}</td>
            <td class="${s.holds === false ? 'cell-bad' : ''}">${esc(s.actual)}</td>
            <td>${s.claimed ? `<span class="${s.holds === false ? 'claimdiff' : ''}">"${esc(s.claimed)}"</span>${s.holds === false ? ' ' + chip('claim ≠ state', 'bad') : ''}` : '<span class="faint">—</span>'}</td>
            <td>${s.holds === true ? '<span class="cell-ok">✓ holds</span>' : s.holds === false ? '<span class="cell-bad">✗ fails</span>' : '<span class="faint">? not captured</span>'}</td></tr>`; }).join('')}
      </tbody></table>` : `<div class="banner info">No final state captured: ${esc(run.result)} run, excluded from the pass rate.</div>`}

      ${captured ? `<h3 style="margin-top:14px">Grader checks</h3>
      <table class="tbl"><thead><tr><th>Check</th><th>Weight</th><th>Grader said</th><th>Evidence</th></tr></thead><tbody>
        ${v.grader_checks.map(k => { const s = k.exp_id ? run.state.find(x => x.exp_id === k.exp_id) : null, said = run.checks[k.id];
          const conflict = mm.some(x => x.check.id === k.id);
          return `<tr><td>${esc(k.name)}${k.assertion ? `<div class="faint small mono">${esc(k.assertion)}</div>` : ''}</td><td>${k.weight}</td>
            <td>${said === 'pass' ? '<b>PASS</b>' : said === 'fail' ? '<b>FAIL</b>' : '<span class="faint">unknown</span>'}</td>
            <td>${s ? `${esc(k.exp_id)}: ${esc(s.actual)}${conflict ? ' ' + chip('⚠ mismatch', 'warn') : ''}` : '<span style="color:var(--warn)">does not read state</span>'}</td></tr>`; }).join('')}
      </tbody></table>` : ''}

      <h3 style="margin-top:14px">Do you agree with the grader?</h3>
      <div class="row wrap">${btn('Yes, agree', 'agreeYes', { cls: 'sm', data: { run: run.id }, need: ['reviewer'] })}
        ${btn('No…', 'agreeNo', { cls: 'sm' + (D.agree === run.id ? ' primary' : ''), data: { run: run.id }, need: ['reviewer'] })}
        ${C.annotationsOf(S, run.id).filter(a => a.agrees_with_grader !== null).map(a => `<span class="faint small">${esc(a.by)}: ${a.agrees_with_grader ? 'agrees' : 'disagrees'}</span>`).join(' · ')}</div>
      ${D.agree === run.id ? `<div class="card pad" style="margin-top:8px"><div class="grid2">
          <div><label class="f">Issue type <span class="req">*</span></label>${selectF(fk, 'type', C.ISSUE_TYPES, 'Select…')}</div>
          <div><label class="f">Affected check</label>${selectF(fk, 'check_id', v.grader_checks.map(k => [k.id, k.name]), 'Select…')}</div></div>
          <label class="f">Note <span class="req">*</span></label><textarea ${bind(fk, 'note')} rows="2" placeholder="What the grader got wrong">${val(fk, 'note')}</textarea>
          ${af.type === 'false_positive' && !(au && au.verdict === 'invalid') ? '<div class="help">Logged as Open. It becomes Confirmed once this run is audited as an invalid pass.</div>' : ''}
          ${af.type === 'environment_error' ? '<div class="help">Also marks this run as environment-attributed, removing it from the pass rate.</div>' : ''}
          <div class="row" style="margin-top:8px">${btn('Log grader issue', 'logIssue', { cls: 'primary sm', data: { run: run.id, vid: v.id } })}</div></div>` : ''}

      ${run.result === 'fail' || disagree ? `<h3 style="margin-top:14px">Failure attribution</h3>
        <div class="row wrap"><div class="seg">${C.ATTRIBUTIONS.map(a => `<button class="${ann.attribution === a ? 'on' : ''}" data-act="setAttr" data-run="${run.id}" data-attr="${a}">${a}</button>`).join('')}</div>
          <div style="width:200px">${selectF(annK, 'failure_mode', C.FAILURE_MODES, 'Failure mode…')}</div>
          ${btn('Save attribution', 'saveAttr', { cls: 'sm', data: { run: run.id }, need: ['reviewer'] })}</div>
        ${C.annotationsOf(S, run.id).filter(a => a.attribution).map(a => `<div class="faint small">${esc(a.by)} · ${esc(a.attribution)}${a.failure_mode ? ' · ' + esc(pretty(a.failure_mode)) : ''}${a.note ? ' · ' + esc(a.note) : ''} · ${fmt(a.at)}</div>`).join('')}` : ''}

      <details style="margin-top:14px" ${D.open['trace:' + run.id] ? 'open' : ''}><summary data-act="toggleOpen" data-key="trace:${run.id}" style="cursor:pointer"><b>Execution trace</b>
        <span class="faint small">· ${run.trace.length} steps · ${run.trace.filter(s => s.type === 'TOOL CALL' || s.type === 'ACTION').length} tool/actions · ${run.trace.filter(s => s.type === 'ERROR').length} errors</span></summary>
        <ul class="steps" style="margin-top:6px">${run.trace.map((s, i) => `<li><span class="faint">${i + 1}</span><span class="t ${s.type}">${esc(s.type)}</span><span>${esc(s.text)}${staleDocs.some(d => s.text.includes(d)) ? ' ' + chip('stale doc', 'warn') : ''}</span></li>`).join('')}</ul>
      </details>
      ${run.final_response ? `<h3 style="margin-top:12px">Final response</h3><div class="quote">"${esc(run.final_response)}"</div><div class="faint small">What the agent said. Compare with the actual state above.</div>` : ''}
    </div></div>`;
}

A.dTab = d => { ui.detail.tab = d.tab; };
A.selRun = d => { ui.detail.runId = d.run; ui.detail.tab = 'runs'; };
A.toggleOpen = d => { ui.detail.open[d.key] = !ui.detail.open[d.key]; };
A.agreeYes = d => { C.annotate(S, d.run, { agrees_with_grader: true }, me()); ui.detail.agree = null; toast('Agreement recorded.'); };
A.agreeNo = d => { ui.detail.agree = ui.detail.agree === d.run ? null : d.run; };
A.logIssue = d => {
  const f = form('agree:' + d.run);
  const i = C.logIssue(S, d.vid, { type: f.type, check_id: f.check_id, run_id: d.run, note: f.note }, me());
  C.annotate(S, d.run, { agrees_with_grader: false, note: i.id }, me());
  delete ui.f['agree:' + d.run]; ui.detail.agree = null;
  toast(`${i.id} logged (${i.status}).`);
};
A.setAttr = d => { form('ann:' + d.run).attribution = d.attr; };
A.saveAttr = d => {
  const f = form('ann:' + d.run);
  C.annotate(S, d.run, { attribution: f.attribution, failure_mode: f.failure_mode || undefined }, me());
  toast('Attribution saved.');
};

// ---------- Pass Audit ----------
function renderAuditTab(v) {
  const st = C.auditStatus(S, v), runs = C.runsOf(S, v.id), sampled = C.sampledRunIds(S, v.id);
  const passes = runs.filter(r => r.result === 'pass');
  const rowFor = r => {
    const a = C.auditOf(S, r.id), by = r.source === 'customer' ? 'customer (' + r.selection + ')' : sampled.has(r.id) ? 'random' : 'not sampled';
    const editing = ui.detail.auditing === r.id, fk = 'audit:' + r.id;
    const canAudit = !a && (by !== 'not sampled' || C.isValidRun(S, r));
    return `<tr class="${r.id === ui.detail.runId ? 'sel' : ''}"><td class="mono"><a data-act="selRun" data-run="${r.id}">${esc(r.label)}</a></td><td>${esc(by)}</td><td>PASS</td>
      <td>${a ? chip(a.verdict === 'valid' ? '✓ Valid' : '✗ Invalid', a.verdict === 'valid' ? 'ok' : 'bad') : chip('pending', 'warn')}</td>
      <td class="small">${esc(a ? a.reason : '')}${a && a.sampled_by === 'ad_hoc' ? ' <i class="faint">not counted in validity</i>' : ''}</td><td class="small">${a ? esc(a.by) : ''}</td>
      <td>${canAudit ? btn(by === 'not sampled' ? 'Ad hoc audit' : 'Audit', 'startAudit', { cls: 'sm', data: { run: r.id }, need: ['reviewer'] }) : ''}</td></tr>
      ${editing ? `<tr><td colspan="7" style="background:#faf8f4">
        <div class="small faint" style="margin-bottom:6px">Judge the final state, not the agent's message. Audits are write-once.</div>
        <table class="tbl" style="background:#fff">${v.expected.map(e => { const s = r.state.find(x => x.exp_id === e.id) || {};
          return `<tr><td class="mono">${esc(e.path)} ${esc(e.op)} ${esc(e.value)}</td><td class="${s.holds === false ? 'cell-bad' : ''}">${esc(s.actual)}</td><td>${s.holds === true ? '✓' : s.holds === false ? '✗' : '?'}</td></tr>`; }).join('')}</table>
        <div class="opts row" style="margin-top:8px"><label><input type="radio" name="v-${r.id}" value="valid" ${bind(fk, 'verdict')} ${form(fk).verdict === 'valid' ? 'checked' : ''}> Valid pass</label>
          <label><input type="radio" name="v-${r.id}" value="invalid" ${bind(fk, 'verdict')} ${form(fk).verdict === 'invalid' ? 'checked' : ''}> Invalid pass</label></div>
        <label class="f">Reason ${form(fk).verdict === 'invalid' ? '<span class="req">*</span>' : ''}</label><input ${bind(fk, 'reason')} value="${val(fk, 'reason')}" placeholder="Which assertion fails in the final state">
        <div class="row" style="margin-top:8px">${btn('Submit audit', 'submitAudit', { cls: 'primary sm', data: { run: r.id } })}${btn('Cancel', 'startAudit', { cls: 'sm', data: { run: '' } })}</div>
      </td></tr>` : ''}`;
  };
  const ordered = passes.slice().sort((a, b) => (sampled.has(b.id) - sampled.has(a.id)) || ((b.source === 'customer') - (a.source === 'customer')));
  return `
    <div class="card pad" style="background:#faf8f4">
      <div class="mono small">Audit rule: ${esc(C.AUDIT_RULE)}</div>
      <div style="margin-top:4px">Grader marked <b>${st.passes}</b> valid internal run(s) PASS → <b>${st.required}</b> required.</div>
      ${st.samples.map(x => `<div class="faint small">Sample ${esc(x.id)} · system random · seed ${x.seed} · ${x.run_ids.length} run(s) drawn by ${esc(x.by)} · ${fmt(x.at)}</div>`).join('') || '<div class="faint small">No sample drawn yet.</div>'}
    </div>
    <div class="row sp" style="margin:12px 0">
      <div>${!st.required ? '<span class="faint">No passing internal runs, so no random audit is required.</span>' : st.complete ? `<b>Audited pass validity (random only): ${frac(st.valid, st.audited)}</b>` : st.need ? `${st.passes} passing run(s) · ${st.audited} audited` : `Sample drawn · ${st.audited}/${st.sampled} audited`}</div>
      ${st.need > 0 ? btn(st.samples.length ? `Extend sample (+${st.need})` : 'Draw random sample', 'drawSample', { cls: 'primary sm', data: { vid: v.id }, need: ['reviewer'] }) : ''}
    </div>
    ${st.samples.length && st.need > 0 ? `<div class="banner warn">${st.need} new passing run(s) since the last sample. Audit required before delivery.</div>` : ''}
    ${passes.length ? `<table class="tbl"><thead><tr><th>Run</th><th>Sampled by</th><th>Grader</th><th>Audit</th><th>Reason</th><th>Auditor</th><th></th></tr></thead><tbody>${ordered.map(rowFor).join('')}</tbody></table>`
      : `<div class="empty">No passing runs. Nothing to audit.${C.metrics(S, v).valid ? ' Consider whether the task is solvable.' : ''}</div>`}
    <p class="faint small">Grader pass rate and audited validity are different measures. Only random samples count toward validity; ad hoc and customer audits can confirm a grader issue but do not estimate its rate.</p>`;
}
A.drawSample = d => { const x = C.drawSample(S, d.vid, me()); toast(`Drew ${x.run_ids.length} run(s) at random · seed ${x.seed}.`); };
A.startAudit = d => { ui.detail.auditing = d.run || null; };
A.submitAudit = d => {
  const f = form('audit:' + d.run), a = C.auditRun(S, d.run, { verdict: f.verdict, reason: f.reason }, me());
  ui.detail.auditing = null;
  toast(a.verdict === 'invalid' ? 'Invalid pass recorded. Grader health is now Confirmed Issue.' : 'Valid pass recorded.', a.verdict === 'invalid');
};

// ---------- Versions ----------
function renderVersionsTab(t, v) {
  const vs = C.versionsOf(S, t.id), D = ui.detail;
  const from = C.versionByN(S, t.id, D.cmpFrom) || vs[Math.max(0, vs.length - 2)], to = C.versionByN(S, t.id, D.cmpTo) || vs[vs.length - 1];
  const list = vs.slice().reverse().map(x => {
    const e = C.eligibility(S, x), h = C.graderHealth(S, x);
    return `<tr class="click ${x.id === v.id ? 'sel' : ''}" data-act="go" data-href="${taskHash(x)}">
      <td><b>v${x.n}</b> ${x.n === vs.length ? chip('latest', 'outline') : ''} ${x.id === v.id ? chip('viewing', 'info') : ''}</td>
      <td class="mono">#${esc(x.content_hash)}</td><td>${reviewChip(x)}</td><td>${healthChip(h)}</td><td>${eligChip(e)}</td>
      <td class="small">${C.deliveredIn(S, x.id).map(sx => esc(sx.id)).join(', ') || '—'}</td>
      <td class="small">${fmtDay(x.created_at)}<div class="faint">${esc(x.created_by)}</div></td><td class="small">${esc(x.note)}
        <div class="faint">${C.runsOf(S, x.id).length} runs · ${S.audits.filter(a => a.version_id === x.id).length} audits · ${C.reviewsOf(S, x.id).length} reviews · ${C.issuesOf(S, x.id).length} issues</div></td></tr>`;
  }).join('');
  let cmp = '';
  if (vs.length > 1 && from && to && from.id !== to.id) {
    const df = C.diffVersions(from, to), show = f => {
      const x = from[f], y = to[f], fmtv = z => Array.isArray(z) ? z.map(o => typeof o === 'object' ? Object.values(o).filter(Boolean).join(' | ') : o).join('\n') : (z == null ? '' : String(z));
      return `<tr><td><b>${esc(C.FIELD_LABEL[f])}</b></td><td><pre class="json">${esc(fmtv(x))}</pre></td><td><pre class="json">${esc(fmtv(y))}</pre></td></tr>`;
    };
    cmp = `<h3 style="margin-top:16px">Compare versions</h3>
      <div class="row"><select data-act-change="cmp" data-side="cmpFrom">${vs.map(x => opt(x.n, 'v' + x.n, from.n)).join('')}</select> ↔
        <select data-act-change="cmp" data-side="cmpTo">${vs.map(x => opt(x.n, 'v' + x.n, to.n)).join('')}</select></div>
      <div style="margin:8px 0">${df.summary.map(x => chip(esc(x), 'info')).join(' ') || '<span class="faint">No definition changes.</span>'}</div>
      <div class="banner info">Runs, audits and reviews are not carried over. v${to.n} needs its own evidence.</div>
      <table class="tbl" style="margin-top:8px"><thead><tr><th>Field</th><th>v${from.n}</th><th>v${to.n}</th></tr></thead><tbody>${df.changed.map(show).join('')}</tbody></table>
      <div class="faint small">${df.unchanged.length} field(s) unchanged: ${df.unchanged.map(f => esc(C.FIELD_LABEL[f])).join(', ')}</div>`;
  }
  return `<table class="tbl"><thead><tr><th>Version</th><th>Hash</th><th>Quality</th><th>Grader</th><th>Delivery</th><th>Delivered in</th><th>Created</th><th>Change note</th></tr></thead><tbody>${list}</tbody></table>${cmp}`;
}
CH.cmp = (value, d) => { ui.detail[d.side] = Number(value); };
