// Nexus core — pure logic, no DOM. Loaded by index.html and tested by verify.mjs.
// Every status that matters for delivery is computed from evidence, never set by hand.
'use strict';

// ---------- utilities ----------
function hash(str) { // FNV-1a 32-bit, hex8
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
function mulberry32(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function shuffled(arr, seed) {
  const r = mulberry32(seed), a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const fail = m => { throw new Error(m); };
const trim = x => String(x == null ? '' : x).trim();

// ---------- enums ----------
const REVIEW_STATUSES = ['Draft', 'Ready for Review', 'Approved', 'Changes Requested', 'Blocked', 'Withdrawn', 'Deprecated'];
const RESULTS = ['pass', 'fail', 'invalid', 'env_error'];
const STRUCTURES = ['budget_plus_policy', 'cross_doc_consistency', 'temporal_update', 'multi_tool_state_sync', 'hidden_dependency', 'single_step'];
const WORKFLOWS = ['contract', 'quote', 'order_update', 'incident', 'coordination', 'support'];
const CAPABILITIES = ['multi_constraint_persistence', 'cross_tool_state_tracking', 'policy_compliance', 'single_action'];
const FAILURE_MODES = ['constraint_dropped', 'stale_document_used', 'state_mismatch', 'wrong_entity', 'incomplete_action', 'claimed_without_doing'];
const ATTRIBUTIONS = ['model', 'task', 'grader', 'environment'];
const ISSUE_TYPES = ['false_positive', 'false_negative', 'missing_check', 'incorrect_weight', 'environment_error', 'ambiguous_task'];
const QUALITY_ISSUES = ['ambiguous_goal', 'unsolvable', 'env_broken', 'grader_false_positive', 'grader_missing_check', 'redundant_template', 'wrong_capability', 'too_easy'];
const SOLV_TYPES = ['expert_completed', 'reference_trajectory', 'reference_state_verified'];
const SELECTIONS = ['random', 'convenience', 'unknown'];
const GRADER_TYPES = ['state_assertion', 'message_match', 'hybrid'];
const PDI_TYPES = ['grader_false_positive', 'env_defect', 'task_ambiguity', 'unsolvable', 'duplicate'];
const STEP_TYPES = ['TOOL CALL', 'DOC READ', 'DECISION', 'ACTION', 'STATE CHANGE', 'ERROR', 'FINAL RESPONSE'];
const DEF_FIELDS = ['goal', 'starting_state', 'constraints', 'expected', 'tools', 'documents', 'grader_type', 'grader_checks', 'capability', 'structure', 'workflow', 'template_id'];
const PROGRAM_TARGET = 500;

// ---------- store ----------
function createStore() {
  return { tasks: [], versions: [], runs: [], annotations: [], samples: [], audits: [], reviews: [], issues: [], sets: [], seq: {}, t: null };
}
function nid(s, prefix, pad = 3) { s.seq[prefix] = (s.seq[prefix] || 0) + 1; return prefix + '-' + String(s.seq[prefix]).padStart(pad, '0'); }
// Seed runs on a fake clock; live use falls back to the real clock.
function now(s) { if (s.t != null) { s.t += 60000; return new Date(s.t).toISOString(); } return new Date().toISOString(); }

const getTask = (s, id) => s.tasks.find(t => t.id === id) || fail('No task ' + id);
const getVersion = (s, id) => s.versions.find(v => v.id === id) || fail('No version ' + id);
const versionsOf = (s, task_id) => s.versions.filter(v => v.task_id === task_id).sort((a, b) => a.n - b.n);
const latestVersion = (s, task_id) => { const a = versionsOf(s, task_id); return a[a.length - 1] || null; };
const versionByN = (s, task_id, n) => versionsOf(s, task_id).find(v => v.n === Number(n)) || null;
const runsOf = (s, vid) => s.runs.filter(r => r.version_id === vid);
const getRun = (s, id) => s.runs.find(r => r.id === id) || fail('No run ' + id);

// ---------- tasks & versions ----------
function normalizeDef(d) {
  const arr = x => Array.isArray(x) ? x : [];
  return {
    goal: trim(d.goal), starting_state: trim(d.starting_state),
    constraints: arr(d.constraints).map((c, i) => ({ id: c.id || 'C' + (i + 1), text: trim(c.text), source: trim(c.source) })).filter(c => c.text),
    expected: arr(d.expected).map((e, i) => ({ id: e.id || 'E' + (i + 1), constraint: trim(e.constraint), path: trim(e.path), op: trim(e.op) || '=', value: trim(e.value) })).filter(e => e.path),
    tools: arr(d.tools).map(trim).filter(Boolean),
    documents: arr(d.documents).map(x => ({ id: trim(x.id), title: trim(x.title), superseded_by: trim(x.superseded_by) || null })).filter(x => x.id),
    grader_type: trim(d.grader_type) || null,
    grader_checks: arr(d.grader_checks).map((k, i) => ({ id: k.id || 'K' + (i + 1), name: trim(k.name), exp_id: trim(k.exp_id) || null, assertion: trim(k.assertion), weight: Number(k.weight) || 0 })).filter(k => k.name),
    capability: trim(d.capability) || null, structure: trim(d.structure) || null,
    workflow: trim(d.workflow) || null, template_id: trim(d.template_id) || null
  };
}
const defHash = (task_id, d) => hash(task_id + '|' + JSON.stringify(DEF_FIELDS.map(f => d[f] == null ? null : d[f])));

function mint(s, task_id, def, { by, note, parent, fixes }) {
  const d = normalizeDef(def);
  if (!d.goal) fail('Goal is required.');
  if (d.grader_type && !GRADER_TYPES.includes(d.grader_type)) fail('Unknown grader type.');
  const h = defHash(task_id, d), latest = latestVersion(s, task_id);
  if (latest && latest.content_hash === h) fail('No changes to save.');
  const n = versionsOf(s, task_id).length + 1;
  const v = Object.assign({ id: `${task_id}@v${n}#${h}`, task_id, n, content_hash: h, parent_version_id: parent || null,
    fixes_issue_ids: fixes || [], note: trim(note), created_by: by, created_at: now(s), review_status: 'Draft', solvability: null }, d);
  s.versions.push(v);
  return v;
}

function createTask(s, meta, def, by) {
  const name = trim(meta.name);
  if (name.length < 5 || name.length > 80) fail('Task name must be 5–80 characters.');
  const pool = meta.pool || 'New';
  if (!['A', 'B', 'C', 'D', 'New'].includes(pool)) fail('Unknown source pool.');
  const letter = pool === 'New' ? 'N' : pool;
  let id = trim(meta.id);
  if (!id) {
    const nums = s.tasks.filter(t => t.id.startsWith('TF-' + letter + '-')).map(t => Number(t.id.split('-')[2]) || 0);
    id = `TF-${letter}-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`;
  }
  if (s.tasks.some(t => t.id === id)) fail('Task id exists: ' + id);
  // Validate the definition before registering the task, so a failed create leaves nothing behind.
  if (!trim(def.goal)) fail('Goal is required.');
  s.tasks.push({ id, name, pool, domain: trim(meta.domain), created_at: now(s) });
  return mint(s, id, def, { by, note: 'Initial version', parent: null, fixes: [] });
}

// Editing never mutates a version: it mints the next one. Evidence does not carry over.
function editVersion(s, from_id, patch, { note, by, fixes_issue_ids = [] }) {
  const from = getVersion(s, from_id);
  if (!trim(note)) fail('Version note is required.');
  const def = {};
  DEF_FIELDS.forEach(f => def[f] = patch[f] !== undefined ? patch[f] : from[f]);
  const issues = fixes_issue_ids.map(id => s.issues.find(i => i.id === id) || fail('No issue ' + id));
  issues.forEach(i => { if (getVersion(s, i.version_id).task_id !== from.task_id) fail(i.id + ' belongs to another task.'); });
  const v = mint(s, from.task_id, def, { by, note, parent: from.id, fixes: fixes_issue_ids });
  issues.forEach(i => { i.status = 'fixed'; i.fixed_in_version_id = v.id; });
  return v;
}

function addSolvability(s, vid, ev, by) {
  const v = getVersion(s, vid);
  if (v.solvability) fail('Solvability evidence is already recorded on this version.');
  if (!SOLV_TYPES.includes(ev.type)) fail('Choose an evidence type.');
  if (!trim(ev.expert) || !trim(ev.date) || !trim(ev.evidence_ref)) fail('Expert, date and evidence reference are required.');
  v.solvability = { type: ev.type, expert: trim(ev.expert), date: trim(ev.date), budget: trim(ev.budget), evidence_ref: trim(ev.evidence_ref), recorded_by: by, at: now(s) };
  return v;
}

// ---------- runs & annotations ----------
function parseStep(line) {
  const t = trim(line); if (!t) return null;
  const i = t.indexOf(':'), head = i > 0 ? t.slice(0, i).toUpperCase().trim() : '';
  return STEP_TYPES.includes(head) ? { type: head, text: t.slice(i + 1).trim() } : { type: 'NOTE', text: t };
}

function addRun(s, vid, r, by) {
  const v = getVersion(s, vid);
  if ('audit' in r || 'verdict' in r || 'audit_result' in r) fail('Audit results are recorded in Pass Audit, never at run entry.');
  const trace = (Array.isArray(r.trace) ? r.trace.map(x => typeof x === 'string' ? parseStep(x) : x) : String(r.trace || '').split('\n').map(parseStep))
    .filter(x => x && trim(x.text));
  if (!trace.length) fail('A run without a trace is not evidence.');
  if (!RESULTS.includes(r.result)) fail('Result must be pass, fail, invalid or env_error.');
  const source = r.source || 'internal';
  if (source === 'customer') {
    const set = s.sets.find(x => x.id === r.set_id);
    if (!set || set.status !== 'delivered') fail('Customer traces attach to a delivered set.');
    if (!set.items.some(i => i.version_id === vid)) fail(`This version is not in ${set.id}.`);
    if (!SELECTIONS.includes(r.selection)) fail("Customer's selection method is required.");
  }
  let state = [], checks = {};
  if (r.result === 'pass' || r.result === 'fail') {
    state = v.expected.map(e => {
      const row = (r.state || []).find(x => x.exp_id === e.id);
      if (!row || trim(row.actual) === '') fail(`Actual final state is required for ${e.id} (write "not captured" if the run did not record it).`);
      if (typeof row.holds !== 'boolean' && row.holds !== null) fail(`Say whether ${e.id} holds, fails, or was not captured.`);
      return { exp_id: e.id, actual: trim(row.actual), holds: row.holds, claimed: trim(row.claimed) || null };
    });
    v.grader_checks.forEach(k => {
      const x = (r.checks || {})[k.id];
      if (!['pass', 'fail', 'unknown'].includes(x)) fail(`Grader result is required for check "${k.name}" (pass, fail or unknown).`);
      checks[k.id] = x;
    });
  }
  const prefix = source === 'customer' ? 'CT' : 'R';
  const count = runsOf(s, vid).filter(x => x.source === source).length + 1;
  // The score is derived from the check results, never taken from the caller: a recorder who can
  // type the score can make a partial pass look complete.
  if (r.score !== undefined && r.score !== '') fail('Score is computed from the check results, not entered.');
  const score = v.grader_checks.reduce((t, k) => t + (checks[k.id] === 'pass' ? k.weight : 0), 0);
  const run = { id: nid(s, 'run', 4), label: `${prefix}-${String(count).padStart(2, '0')}`, version_id: vid, source,
    set_id: source === 'customer' ? r.set_id : null, selection: source === 'customer' ? r.selection : null,
    result: r.result, score: Math.round(score * 100) / 100, checks, state, final_response: trim(r.final_response), trace,
    model: trim(r.model) || 'agent-m4', budget: trim(r.budget) || '45 min', recorded_by: by, at: now(s) };
  s.runs.push(run);
  return run;
}

function annotate(s, run_id, a, by) {
  const run = getRun(s, run_id);
  if (a.attribution && !ATTRIBUTIONS.includes(a.attribution)) fail('Attribution must be model, task, grader or environment.');
  if (a.failure_mode && !FAILURE_MODES.includes(a.failure_mode)) fail('Unknown failure mode.');
  if (!a.attribution && typeof a.agrees_with_grader !== 'boolean') fail('Nothing to record.');
  const x = { id: nid(s, 'ANN'), run_id: run.id, attribution: a.attribution || null, failure_mode: a.failure_mode || null,
    agrees_with_grader: typeof a.agrees_with_grader === 'boolean' ? a.agrees_with_grader : null, note: trim(a.note), by, at: now(s) };
  s.annotations.push(x);
  return x;
}
const annotationsOf = (s, run_id) => s.annotations.filter(a => a.run_id === run_id);
function latestAttribution(s, run_id) {
  const a = annotationsOf(s, run_id).filter(x => x.attribution);
  return a[a.length - 1] || null;
}
// Two people's latest attributions differ → the run needs a second look.
function disagreement(s, run_id) {
  const byPerson = {};
  annotationsOf(s, run_id).filter(x => x.attribution).forEach(x => byPerson[x.by] = x.attribution);
  return new Set(Object.values(byPerson)).size > 1;
}
const isValidRun = (s, run) => (run.result === 'pass' || run.result === 'fail') && (latestAttribution(s, run.id) || {}).attribution !== 'environment';

function metrics(s, v) {
  const runs = runsOf(s, v.id), internal = runs.filter(r => r.source === 'internal');
  const valid = internal.filter(r => isValidRun(s, r));
  const passes = valid.filter(r => r.result === 'pass'), fails = valid.filter(r => r.result === 'fail');
  const dist = {};
  fails.forEach(r => {
    const a = latestAttribution(s, r.id) || {};
    const key = a.failure_mode || 'unattributed';
    const d = dist[key] || (dist[key] = { mode: key, count: 0, attributions: {} });
    d.count++; const at = a.attribution || 'unattributed'; d.attributions[at] = (d.attributions[at] || 0) + 1;
  });
  const attributed = fails.filter(r => latestAttribution(s, r.id));
  const byAttr = at => attributed.filter(r => latestAttribution(s, r.id).attribution === at).length;
  return {
    runs: runs.length, internal: internal.length, customer: runs.length - internal.length,
    valid: valid.length, passes: passes.length, fails: fails.length, invalid: internal.length - valid.length,
    invalid_rate: internal.length ? (internal.length - valid.length) / internal.length : 0,
    pass_ids: passes.map(r => r.id), dist: Object.values(dist).sort((a, b) => b.count - a.count),
    attributed: attributed.length, model_attributed: byAttr('model'), grader_attributed: byAttr('grader'),
    mixed_budgets: new Set(internal.map(r => r.model + '|' + r.budget)).size > 1
  };
}

// Which constraints a run actually broke, read off the captured final state rather than typed in.
// A run can break several; an audited invalid pass counts too, because the grader called it a pass
// while the state says otherwise.
function failedConstraints(s, v, run) {
  const audit = auditOf(s, run.id);
  const counts = run.result === 'fail' || (run.result === 'pass' && audit && audit.verdict === 'invalid');
  if (!counts) return [];
  return (run.state || []).filter(x => x.holds === false)
    .map(x => (v.expected.find(e => e.id === x.exp_id) || {}).constraint)
    .filter(Boolean).filter((c, i, a) => a.indexOf(c) === i);
}

// Per-constraint failure profile for one version: does the model trip on the constraint this task
// was built to test, or on something incidental?
function constraintProfile(s, v) {
  const runs = runsOf(s, v.id).filter(r => r.source === 'internal' && isValidRun(s, r));
  const broke = runs.map(r => failedConstraints(s, v, r));
  const denom = broke.filter(x => x.length).length;
  return {
    denom,
    rows: v.constraints.map(c => ({ id: c.id, text: c.text, source: c.source, fails: broke.filter(x => x.includes(c.id)).length }))
      .sort((a, b) => b.fails - a.fails)
  };
}

// ---------- random pass audit ----------
const AUDIT_RULE = 'passes ≤ 5: audit all; otherwise audit max(5, ceil(30%)) at random';
const requiredAudits = p => p <= 5 ? p : Math.max(5, Math.ceil(0.3 * p));
const sampledRunIds = (s, vid) => new Set(s.samples.filter(x => x.version_id === vid).flatMap(x => x.run_ids));
const auditOf = (s, run_id) => s.audits.find(a => a.run_id === run_id) || null;

function auditStatus(s, v) {
  const m = metrics(s, v), sampledSet = sampledRunIds(s, v.id);
  const required = requiredAudits(m.pass_ids.length);
  const sampled = m.pass_ids.filter(id => sampledSet.has(id));
  const audited = sampled.filter(id => auditOf(s, id));
  const verdicts = audited.map(id => auditOf(s, id).verdict);
  return {
    passes: m.pass_ids.length, required, sampled: sampled.length, audited: audited.length,
    valid: verdicts.filter(x => x === 'valid').length, invalid: verdicts.filter(x => x === 'invalid').length,
    need: Math.max(0, required - sampled.length), pass_ids: m.pass_ids,
    complete: sampled.length >= required && audited.length === sampled.length,
    samples: s.samples.filter(x => x.version_id === v.id)
  };
}

function drawSample(s, vid, by, seed) {
  const v = getVersion(s, vid), st = auditStatus(s, v);
  if (st.need <= 0) fail('The random sample already covers the required audits.');
  const sampledSet = sampledRunIds(s, vid);
  const candidates = st.pass_ids.filter(id => !sampledSet.has(id));
  const sd = Number.isInteger(seed) ? seed : 1000 + Math.floor(Math.random() * 9000);
  const sample = { id: nid(s, 'SMP'), version_id: vid, seed: sd, rule: AUDIT_RULE, passes_at_draw: st.passes,
    required_at_draw: st.required, run_ids: shuffled(candidates, sd).slice(0, st.need), by, at: now(s) };
  s.samples.push(sample);
  return sample;
}

function auditRun(s, run_id, { verdict, reason }, by) {
  const run = getRun(s, run_id), v = getVersion(s, run.version_id);
  if (run.result !== 'pass') fail('Only passing runs are audited.');
  const prior = auditOf(s, run_id);
  if (prior) fail(`Audits are write-once. ${run.label} was audited by ${prior.by}.`);
  if (by === v.created_by) fail('Authors cannot audit their own versions.');
  if (by === run.recorded_by) fail(`${by} recorded ${run.label}. Someone else has to audit it.`);
  if (verdict !== 'valid' && verdict !== 'invalid') fail('Choose Valid pass or Invalid pass.');
  if (verdict === 'invalid' && !trim(reason)) fail('A reason is required for an invalid pass.');
  const sampled_by = run.source === 'customer' ? 'customer' : sampledRunIds(s, v.id).has(run_id) ? 'random' : 'ad_hoc';
  const a = { id: nid(s, 'AUD'), run_id, version_id: v.id, sampled_by, verdict, reason: trim(reason), by, at: now(s) };
  s.audits.push(a);
  return a;
}

// A grader check tied to an expected-state row that disagrees with the captured state.
function mismatches(s, v, run) {
  if (run.result !== 'pass' && run.result !== 'fail') return [];
  return v.grader_checks.filter(k => k.exp_id).map(k => {
    const row = run.state.find(x => x.exp_id === k.exp_id);
    if (!row) return null;
    if (run.checks[k.id] === 'pass' && row.holds === false) return { check: k, kind: 'pass_but_state_fails' };
    if (run.checks[k.id] === 'fail' && row.holds === true) return { check: k, kind: 'fail_but_state_holds' };
    return null;
  }).filter(Boolean);
}

// ---------- grader issues & health ----------
function logIssue(s, vid, { type, check_id, run_id, note }, by) {
  const v = getVersion(s, vid);
  if (!ISSUE_TYPES.includes(type)) fail('Choose an issue type.');
  if (trim(note).length < 10) fail('Describe the issue (at least 10 characters).');
  if (run_id && getRun(s, run_id).version_id !== vid) fail('Run belongs to another version.');
  const audited = run_id && auditOf(s, run_id);
  const status = type === 'false_positive' && audited && audited.verdict === 'invalid' ? 'confirmed' : 'open';
  const i = { id: nid(s, 'GI'), version_id: v.id, type, check_id: check_id || null, run_id: run_id || null, note: trim(note),
    status, fixed_in_version_id: null, by, at: now(s) };
  s.issues.push(i);
  if (type === 'environment_error' && run_id) annotate(s, run_id, { attribution: 'environment', note: 'Logged as ' + i.id }, by);
  return i;
}
function confirmIssue(s, id, by) {
  const i = s.issues.find(x => x.id === id) || fail('No issue ' + id);
  if (i.status !== 'open') fail('Only open issues can be confirmed.');
  i.status = 'confirmed'; i.resolved_by = by; i.resolved_at = now(s);
  return i;
}
function dismissIssue(s, id, { reason }, by) {
  const i = s.issues.find(x => x.id === id) || fail('No issue ' + id);
  if (i.status !== 'open') fail('Only open issues can be dismissed.');
  if (by === i.by) fail('A second reviewer must dismiss an issue.');
  if (!trim(reason)) fail('A reason is required.');
  Object.assign(i, { status: 'dismissed', resolved_by: by, resolved_at: now(s), dismiss_reason: trim(reason) });
  return i;
}
const issuesOf = (s, vid) => s.issues.filter(i => i.version_id === vid);

function graderHealth(s, v) {
  const runs = runsOf(s, v.id);
  const invalid = runs.map(r => ({ r, a: auditOf(s, r.id) })).filter(x => x.a && x.a.verdict === 'invalid');
  const issues = issuesOf(s, v.id);
  const confirmed = issues.filter(i => i.status === 'confirmed' || i.status === 'fixed');
  if (invalid.length || confirmed.length) {
    return { state: 'Confirmed Issue', reasons: invalid.map(x => `${x.r.label} audited as invalid pass`).concat(confirmed.map(i => `${i.id} ${i.type.replace(/_/g, ' ')}`)) };
  }
  const m = metrics(s, v), potential = [];
  issues.filter(i => i.status === 'open').forEach(i => potential.push(`${i.id} open: ${i.type.replace(/_/g, ' ')}`));
  const mm = runs.filter(r => mismatches(s, v, r).length);
  if (mm.length) potential.push(`grader disagrees with captured state on ${mm.map(r => r.label).join(', ')}`);
  if (v.grader_type === 'message_match') potential.push('grader checks the final message only');
  else if (uncheckedExpected(v).length) potential.push(`no grader check reads ${uncheckedExpected(v).map(e => e.id).join(', ')}`);
  if (m.attributed && m.grader_attributed / m.attributed >= 0.3) potential.push(`${m.grader_attributed}/${m.attributed} failures attributed to the grader`);
  if (potential.length) return { state: 'Potential Issue', reasons: potential };
  if (!m.valid) return { state: 'Not Evaluated', sub: 'no runs', reasons: ['no valid runs'] };
  const st = auditStatus(s, v);
  if (!st.complete) return { state: 'Not Evaluated', sub: 'audit pending', reasons: [`${st.audited}/${st.required} required pass audits done`] };
  return { state: 'Healthy', reasons: [] };
}

// Expected-state rows that no grader check reads. A state grader that only reads half the
// final state is the Pool-D defect in slower motion.
const uncheckedExpected = v => v.expected.filter(e => !v.grader_checks.some(k => k.exp_id === e.id));

// ---------- delivery gates ----------
const GATES = [
  { id: 'G1', label: 'Review approved', test: (s, v) => v.review_status === 'Approved' || `not approved (${v.review_status})` },
  { id: 'G2', label: 'Solvability verified', test: (s, v) => !!v.solvability || 'no solvability evidence' },
  { id: 'G3', label: 'Grader asserts every expected state row', test: (s, v) => {
      if (!['state_assertion', 'hybrid'].includes(v.grader_type)) return 'grader checks message only';
      const gaps = uncheckedExpected(v);
      return !gaps.length || `no grader check reads ${gaps.map(e => e.id).join(', ')}`;
    } },
  { id: 'G4', label: 'Required pass audits complete', test: (s, v) => { const st = auditStatus(s, v); return st.complete || `${st.required - st.audited} passing run(s) not audited`; } },
  { id: 'G5', label: 'No grader issue', test: (s, v) => { const h = graderHealth(s, v); return !['Confirmed Issue', 'Potential Issue'].includes(h.state) || `grader: ${h.reasons[0]}`; } },
  { id: 'G6', label: 'Required metadata complete', test: (s, v) => { const miss = ['capability', 'structure', 'workflow', 'template_id'].filter(f => !v[f]); return !miss.length || 'missing ' + miss.join(', '); } }
];

// Reads only this version's own data. A newer draft can never change an older version's eligibility.
function eligibility(s, v) {
  const gates = GATES.map(g => { const r = g.test(s, v); return { id: g.id, label: g.label, pass: r === true, reason: r === true ? '' : r }; });
  const reasons = gates.filter(g => !g.pass).map(g => g.reason);
  if (v.review_status === 'Withdrawn') return { state: 'Withdrawn', eligible: false, gates, reasons: ['withdrawn after a confirmed defect'] };
  if (v.review_status === 'Deprecated') return { state: 'Not eligible', eligible: false, gates, reasons: ['deprecated'] };
  return { state: reasons.length ? 'Not eligible' : 'Eligible', eligible: !reasons.length, gates, reasons };
}

const setsContaining = (s, vid) => s.sets.filter(x => x.items.some(i => i.version_id === vid));
const deliveredIn = (s, vid) => setsContaining(s, vid).filter(x => x.status === 'delivered');
const pdisFor = (s, vid) => s.sets.flatMap(set => set.pdis.filter(p => p.version_ids.includes(vid)).map(p => ({ set, pdi: p })));

// Library shows the highest eligible version; if none, the latest.
function primaryVersion(s, task_id) {
  const vs = versionsOf(s, task_id);
  return vs.slice().reverse().find(v => eligibility(s, v).eligible) || vs[vs.length - 1];
}
// Entry by task id only: something to act on first, then something deliverable, then latest.
function defaultVersion(s, task_id) {
  const vs = versionsOf(s, task_id).slice().reverse();
  return vs.find(v => v.review_status === 'Ready for Review') || vs.find(v => eligibility(s, v).eligible) || vs[0];
}

function queueReason(s, v) {
  if (['Withdrawn', 'Deprecated'].includes(v.review_status)) return null;
  const h = graderHealth(s, v);
  if (h.state === 'Potential Issue') return { priority: 1, reason: 'Potential grader issue' };
  if (runsOf(s, v.id).some(r => disagreement(s, r.id))) return { priority: 1, reason: 'Reviewers disagree on attribution' };
  const st = auditStatus(s, v);
  if (v.review_status === 'Approved' && !st.complete) return { priority: 2, reason: 'New passing run after approval' };
  if (v.review_status === 'Ready for Review') {
    if (!st.complete) return { priority: 2, reason: 'Needs pass audit' };
    const others = s.versions.filter(x => x.task_id !== v.task_id && x.review_status === 'Approved' && x.structure === v.structure);
    return others.length ? { priority: 4, reason: 'Ready for review' } : { priority: 3, reason: 'New constraint structure' };
  }
  return null;
}

// The reviewer's worklist, ordered by information value: grader risk first, then evidence gaps,
// then structures nobody has seen before.
function reviewQueue(s) {
  return s.versions.map(v => ({ v, q: queueReason(s, v) })).filter(x => x.q)
    .sort((a, b) => a.q.priority - b.q.priority || String(a.v.created_at).localeCompare(String(b.v.created_at)));
}
function nextInQueue(s, after_version_id) {
  const q = reviewQueue(s).filter(x => x.v.id !== after_version_id);
  const other = after_version_id ? q.filter(x => x.v.task_id !== getVersion(s, after_version_id).task_id) : q;
  return (other[0] || q[0] || null);
}

function summaryCounts(s) {
  const live = s.versions.filter(v => v.review_status !== 'Deprecated');
  return {
    needs_review: live.filter(v => v.review_status === 'Ready for Review').length,
    grader_issues: live.filter(v => ['Potential Issue', 'Confirmed Issue'].includes(graderHealth(s, v).state)).length,
    approved: live.filter(v => v.review_status === 'Approved').length,
    ready: live.filter(v => eligibility(s, v).eligible && !deliveredIn(s, v.id).length).length,
    blocked: live.filter(v => v.review_status === 'Blocked').length
  };
}

// ---------- structural fingerprint & near-duplicate detection ----------
// Twelve industry labels over one template are one task. The fingerprint deliberately ignores
// names, domains and values, and keeps only the shape: what the task asserts, with which tools.
const normTerm = x => String(x || '').toLowerCase().replace(/[^a-z0-9. ]/g, '').trim();
function fingerprintOf(v) {
  const paths = v.expected.map(e => `${normTerm(e.path)} ${e.op}`).sort();
  const tools = v.tools.map(normTerm).sort();
  return { structure: v.structure, workflow: v.workflow, paths, tools, constraints: v.constraints.length,
    hash: hash([v.structure, v.workflow, paths.join('|'), tools.join('|'), v.constraints.length].join('~')) };
}
const jaccard = (x, y) => {
  const A = new Set(x), B = new Set(y);
  if (!A.size && !B.size) return 1;
  return [...A].filter(k => B.has(k)).length / new Set([...x, ...y]).size;
};
// 0 = unrelated, 1 = the same shape. Paths dominate: they are what a grader actually checks.
function similarity(a, b) {
  const fa = fingerprintOf(a), fb = fingerprintOf(b);
  const score = 0.5 * jaccard(fa.paths, fb.paths) + 0.25 * jaccard(fa.tools, fb.tools)
    + 0.15 * (fa.structure === fb.structure ? 1 : 0) + 0.1 * (a.template_id && a.template_id === b.template_id ? 1 : 0);
  return { score: Math.round(score * 100) / 100, twin: fa.hash === fb.hash, same_template: !!a.template_id && a.template_id === b.template_id };
}
const NEAR_DUPLICATE = 0.8;
// One candidate per other task: the version most likely to be compared against — eligible, else latest.
function duplicateCandidates(s, task_id) {
  return s.tasks.filter(t => t.id !== task_id).map(t => primaryVersion(s, t.id)).filter(Boolean);
}
function nearDuplicates(s, v, candidates) {
  return (candidates || duplicateCandidates(s, v.task_id))
    .filter(x => x.task_id !== v.task_id)
    .map(x => Object.assign({ version: x }, similarity(v, x)))
    .filter(x => x.twin || x.score >= NEAR_DUPLICATE)
    .sort((a, b) => b.score - a.score);
}

// ---------- review ----------
const CHECKLIST = [
  { id: 'goal', text: 'Goal is clear' },
  { id: 'constraints', text: 'Constraints are unambiguous' },
  { id: 'solvable', text: 'Task is solvable', auto: true },
  { id: 'environment', text: 'Environment behaves correctly', auto: true },
  { id: 'expected', text: 'Expected final state is explicit', auto: true },
  { id: 'grader_outcome', text: 'Grader checks actual task outcome', auto: true },
  { id: 'audited', text: 'Passing runs were randomly audited', auto: true },
  { id: 'no_fp', text: 'No unresolved false-positive grader issue', auto: true },
  { id: 'capability', text: 'Task tests intended capability' },
  { id: 'diversity', text: 'Adds structural diversity', auto: true },
  { id: 'model_failures', text: 'Failures reflect the model, not the task', auto: true }
];

function checklistPrefill(s, v) {
  const m = metrics(s, v), st = auditStatus(s, v), h = graderHealth(s, v);
  const yn = b => b ? 'yes' : 'no';
  const shared = s.versions.filter(x => x.task_id !== v.task_id && x.review_status === 'Approved' && x.template_id && x.template_id === v.template_id).length;
  return {
    solvable: { value: yn(!!v.solvability), hint: v.solvability ? 'evidence recorded' : 'no evidence' },
    environment: { value: m.internal ? yn(m.invalid_rate < 0.3) : null, hint: `${m.invalid}/${m.internal} runs invalid` },
    expected: { value: yn(v.constraints.length > 0 && v.constraints.every(c => v.expected.some(e => e.constraint === c.id))), hint: 'every constraint has an assertion' },
    grader_outcome: { value: yn(['state_assertion', 'hybrid'].includes(v.grader_type) && !uncheckedExpected(v).length),
      hint: `${v.grader_type || 'no grader'} · ${v.expected.length - uncheckedExpected(v).length}/${v.expected.length} expected rows checked` },
    audited: { value: yn(st.complete), hint: `${st.audited}/${st.required} required audits` },
    no_fp: { value: yn(h.state !== 'Confirmed Issue'), hint: h.state },
    diversity: (() => { const dupes = nearDuplicates(s, v);
      return { value: yn(shared < 3 && !dupes.length),
        hint: dupes.length ? `${dupes[0].twin ? 'structural twin of' : 'near-duplicate of'} ${dupes[0].version.task_id} (${dupes[0].score})`
          : `${shared} approved version(s) share ${v.template_id || 'no template'}` }; })(),
    model_failures: { value: m.attributed ? yn(m.model_attributed / m.attributed >= 0.8) : null, hint: `${m.model_attributed}/${m.attributed} attributed failures are Model` }
  };
}

// Same rules used to disable the button and to reject the write.
function reviewBlockers(s, v, d, by) {
  const b = [];
  if (!['approve', 'request_changes', 'block'].includes(d.decision)) b.push('Choose a decision.');
  if (v.review_status !== 'Ready for Review') b.push(`Only Ready for Review versions can be decided (this is ${v.review_status}).`);
  if (by === v.created_by) b.push('Reviewers cannot decide on their own versions.');
  if (trim(d.reason).length < 20) b.push('Reason must be at least 20 characters.');
  if (d.decision === 'request_changes') {
    if (!(d.quality_issues || []).length) b.push('Select at least one quality issue.');
    if (!trim(d.suggested_fix)) b.push('Suggested fix is required.');
  }
  if (d.decision === 'block' && d.severity !== 'Blocking') b.push('Block requires severity Blocking.');
  if (d.decision === 'approve') {
    if (metrics(s, v).valid < 1) b.push('Approve needs at least 1 valid run.');
    const st = auditStatus(s, v);
    if (!st.complete) b.push(`Complete the random pass audit first (${st.audited}/${st.required}).`);
    const bare = Object.entries(d.checklist || {}).filter(([, x]) => x && x.value === 'no' && !trim(x.note)).map(([k]) => k);
    if (bare.length) b.push('Add a note to every ✗ checklist item: ' + bare.join(', ') + '.');
  }
  return b;
}

function recordDecision(s, v, decision, fields, by) {
  const r = Object.assign({ id: nid(s, 'REV'), version_id: v.id, content_hash: v.content_hash, decision, reviewer: by, at: now(s) }, fields);
  s.reviews.push(r);
  return r;
}

function addReview(s, vid, d, by) {
  const v = getVersion(s, vid), b = reviewBlockers(s, v, d, by);
  if (b.length) fail(b[0]);
  const auditors = [...new Set(s.audits.filter(a => a.version_id === vid && a.sampled_by === 'random').map(a => a.by))];
  const r = recordDecision(s, v, d.decision, {
    self_audited: d.decision === 'approve' && auditors.length > 0 && auditors.every(x => x === by),
    reason: trim(d.reason), quality_issues: d.quality_issues || [], suggested_fix: trim(d.suggested_fix), fix_owner: d.fix_owner || null,
    severity: d.severity || null, confidence: d.confidence || null, checklist: d.checklist || {},
    evidence_run_ids: d.evidence_run_ids && d.evidence_run_ids.length ? d.evidence_run_ids : runsOf(s, vid).map(x => x.id),
    audit_ids: s.audits.filter(a => a.version_id === vid).map(a => a.id)
  }, by);
  v.review_status = { approve: 'Approved', request_changes: 'Changes Requested', block: 'Blocked' }[d.decision];
  return r;
}
const reviewsOf = (s, vid) => s.reviews.filter(r => r.version_id === vid);

function submitMissing(s, v) {
  const m = [];
  if (!v.goal) m.push('goal');
  if (!v.starting_state) m.push('starting state'); else { try { JSON.parse(v.starting_state); } catch { m.push('starting state must be valid JSON'); } }
  if (v.constraints.length < 2) m.push('at least 2 constraints');
  v.constraints.filter(c => !v.expected.some(e => e.constraint === c.id)).forEach(c => m.push('expected state for ' + c.id));
  if (!v.tools.length) m.push('available tools');
  if (!v.grader_type) m.push('grader type');
  if (!v.grader_checks.length) m.push('grader checks');
  else if (Math.abs(v.grader_checks.reduce((t, k) => t + k.weight, 0) - 1) > 0.011) m.push('grader weights must sum to 1.0');
  ['capability', 'structure', 'workflow', 'template_id'].forEach(f => { if (!v[f]) m.push(f.replace('_', ' ')); });
  // Submitting needs evidence of any kind; a broken environment must still reach a reviewer to be blocked.
  if (!runsOf(s, v.id).length) m.push('at least 1 recorded run');
  return m;
}
function submitForReview(s, vid, by) {
  const v = getVersion(s, vid);
  if (v.review_status === 'Changes Requested') fail(`Changes were requested on v${v.n}. Edit to create v${versionsOf(s, v.task_id).length + 1}.`);
  if (v.review_status !== 'Draft') fail(`Only Draft versions can be submitted (this is ${v.review_status}).`);
  const m = submitMissing(s, v);
  if (m.length) fail('Cannot submit: missing ' + m.join(', ') + '.');
  v.review_status = 'Ready for Review'; v.submitted_by = by; v.submitted_at = now(s);
  return v;
}
function recall(s, vid, by) {
  const v = getVersion(s, vid);
  if (v.review_status !== 'Ready for Review') fail('Only versions in review can be recalled.');
  if (reviewsOf(s, vid).length) fail('This version already has a review.');
  v.review_status = 'Draft';
  return v;
}
function unblock(s, vid, { reason }, by) {
  const v = getVersion(s, vid);
  if (v.review_status !== 'Blocked') fail('Only blocked versions can be unblocked.');
  const block = reviewsOf(s, vid).filter(r => r.decision === 'block').pop();
  if (!runsOf(s, vid).some(r => r.at > block.at)) fail('Unblock needs new evidence: record a run after the block.');
  if (trim(reason).length < 10) fail('Explain what changed (at least 10 characters).');
  recordDecision(s, v, 'unblock', { reason: trim(reason) }, by);
  v.review_status = 'Ready for Review';
  return v;
}
function withdraw(s, vid, { reason }, by) {
  const v = getVersion(s, vid);
  if (v.review_status !== 'Approved') fail('Only approved versions can be withdrawn.');
  if (graderHealth(s, v).state !== 'Confirmed Issue' && !pdisFor(s, vid).length) fail('Withdraw requires a confirmed grader issue or a post-delivery issue.');
  if (!trim(reason)) fail('A reason is required.');
  recordDecision(s, v, 'withdraw', { reason: trim(reason) }, by);
  v.review_status = 'Withdrawn';
  return v;
}
function deprecate(s, vid, { reason }, by) {
  const v = getVersion(s, vid);
  if (['Withdrawn', 'Deprecated'].includes(v.review_status)) fail(`Already ${v.review_status}.`);
  if (!trim(reason)) fail('A reason is required.');
  const draft = setsContaining(s, vid).find(x => x.status === 'draft');
  if (draft) fail(`Remove it from ${draft.id} (draft) first.`);
  recordDecision(s, v, 'deprecate', { reason: trim(reason) }, by);
  v.review_status = 'Deprecated';
  return v;
}

// ---------- version compare ----------
const FIELD_LABEL = { goal: 'Goal', starting_state: 'Starting state', constraints: 'Constraints', expected: 'Expected final state', tools: 'Tools',
  documents: 'Documents', grader_type: 'Grader type', grader_checks: 'Grader checks', capability: 'Capability', structure: 'Constraint structure',
  workflow: 'Workflow', template_id: 'Template' };
function diffVersions(a, b) {
  const changed = DEF_FIELDS.filter(f => JSON.stringify(a[f]) !== JSON.stringify(b[f]));
  const summary = changed.map(f => {
    if (f === 'grader_type') return `Grader: ${a.grader_type} → ${b.grader_type}`;
    if (f === 'constraints') { const d = b.constraints.length - a.constraints.length; return d > 0 ? `${d} constraint(s) added` : d < 0 ? `${-d} constraint(s) removed` : 'Constraints changed'; }
    if (f === 'expected') return 'Expected state changed';
    if (f === 'grader_checks') return `Grader checks updated (${b.grader_checks.length})`;
    return FIELD_LABEL[f] + ' changed';
  });
  return { changed, unchanged: DEF_FIELDS.filter(f => !changed.includes(f)), summary };
}

// ---------- delivery sets ----------
function event(s, set, type, detail, by) { set.events.push({ type, detail, by, at: now(s) }); }
const getSet = (s, id) => s.sets.find(x => x.id === id) || fail('No delivery set ' + id);

function createSet(s, o, by) {
  if (!trim(o.name)) fail('Name is required.');
  const purpose = o.purpose || 'training';
  if (!['training', 'evaluation'].includes(purpose)) fail('Purpose must be training or evaluation.');
  const set = { id: nid(s, 'DS'), name: trim(o.name), customer: trim(o.customer) || 'Aster Frontier', purpose,
    targets: { min_structures: Number(o.min_structures) || 4, max_template_share: o.max_template_share != null && o.max_template_share !== '' ? Number(o.max_template_share) : 0.2 },
    status: 'draft', items: [], created_by: by, created_at: now(s), snapshot_hash: null, delivered_at: null, delivered_by: null,
    acknowledged: [], results: [], pdis: [], sample: null, sweeps: [], events: [] };
  s.sets.push(set);
  event(s, set, 'created', set.name, by);
  return set;
}

function addBlockers(s, set, vid) {
  const v = getVersion(s, vid);
  if (set.status !== 'draft') return ['Snapshot is frozen.'];
  if (set.items.some(i => i.version_id === vid)) return ['Already in this set.'];
  const e = eligibility(s, v);
  if (!e.eligible) return e.reasons.map(r => 'Cannot add: ' + r + '.');
  const same = set.items.find(i => getVersion(s, i.version_id).task_id === v.task_id);
  if (same) return [`One version per task per set (${same.version_id.split('#')[0]} is in).`];
  return [];
}
function addToSet(s, set_id, vid, by) {
  const set = getSet(s, set_id), b = addBlockers(s, set, vid);
  if (b.length) fail(b[0]);
  set.items.push({ version_id: vid, added_by: by, at: now(s) });
  event(s, set, 'version added', vid, by);
}
function removeFromSet(s, set_id, vid, by) {
  const set = getSet(s, set_id);
  if (set.status !== 'draft') fail('Snapshot is frozen.');
  if (!set.items.some(i => i.version_id === vid)) fail('Not in this set.');
  set.items = set.items.filter(i => i.version_id !== vid);
  event(s, set, 'version removed', vid, by);
}

function validateSet(s, set) {
  const vs = set.items.map(i => getVersion(s, i.version_id)), checks = [];
  const add = (id, label, level, bad, passText, failText) => checks.push({ id, label, level, pass: !bad.length, affected: bad.map(v => v.id), detail: bad.length ? failText(bad) : passText });
  const n = vs.length;
  checks.push({ id: 'V0', label: 'Set is not empty', level: 'blocking', pass: n > 0, affected: [], detail: n ? `${n} versions` : 'Add at least 1 version.' });
  add('V1', 'All versions approved', 'blocking', vs.filter(v => v.review_status !== 'Approved'), `${n}/${n}`, b => `${n - b.length}/${n} — ${b.length} not approved`);
  add('V2', 'Solvability verified', 'blocking', vs.filter(v => !v.solvability), `${n}/${n}`, b => `${b.length} missing evidence`);
  add('V3', 'Grader asserts every expected state row', 'blocking', vs.filter(v => !['state_assertion', 'hybrid'].includes(v.grader_type) || uncheckedExpected(v).length),
    `${n}/${n} fully checked`, b => `${b.length} with a message-only or partial grader`);
  add('V4', 'Required pass audits complete', 'blocking', vs.filter(v => !auditStatus(s, v).complete), `${n}/${n}`, b => `${b.length} with unaudited passes`);
  add('V5', 'No grader issue', 'blocking', vs.filter(v => ['Confirmed Issue', 'Potential Issue'].includes(graderHealth(s, v).state)), '0', b => `${b.length} with grader issues`);
  add('V6', 'No deprecated or withdrawn versions', 'blocking', vs.filter(v => ['Deprecated', 'Withdrawn'].includes(v.review_status)), '0', b => `${b.length}`);
  const seen = {}; vs.forEach(v => seen[v.task_id] = (seen[v.task_id] || 0) + 1);
  add('V7', 'One version per task', 'blocking', vs.filter(v => seen[v.task_id] > 1), '✓', b => `${b.length} duplicates`);
  add('V8', 'Required metadata complete', 'blocking', vs.filter(v => !v.capability || !v.structure || !v.workflow || !v.template_id), '✓', b => `${b.length} missing metadata`);
  if (set.purpose === 'evaluation') {
    const trained = new Set(s.sets.filter(x => x.id !== set.id && x.status === 'delivered' && x.purpose === 'training' && x.customer === set.customer)
      .flatMap(x => x.items.map(i => getVersion(s, i.version_id).task_id)));
    add('V9', 'Excludes tasks delivered for training to this customer', 'blocking', vs.filter(v => trained.has(v.task_id)), '✓', b => `${b.length} overlap with training deliveries`);
  }
  // Structural twins inside one batch, or against what this customer already has, are one lesson billed twice.
  const twinPairs = [];
  vs.forEach((a, i) => vs.slice(i + 1).forEach(b => { if (similarity(a, b).twin) twinPairs.push([a, b]); }));
  checks.push({ id: 'V13', label: 'No structural twins inside the set', level: 'blocking', pass: !twinPairs.length,
    affected: twinPairs.map(p => p[0].id), detail: twinPairs.length ? twinPairs.map(p => `${p[0].task_id} ≡ ${p[1].task_id}`).join(', ') : '✓' });
  const shippedBefore = s.sets.filter(x => x.id !== set.id && x.status === 'delivered' && x.customer === set.customer)
    .flatMap(x => x.items.map(i => getVersion(s, i.version_id)));
  const repeats = vs.map(v => ({ v, d: nearDuplicates(s, v, shippedBefore) })).filter(x => x.d.length);
  checks.push({ id: 'V14', label: 'No near-duplicates of earlier deliveries to this customer', level: 'warning', pass: !repeats.length,
    affected: repeats.map(x => x.v.id), detail: repeats.length ? repeats.map(x => `${x.v.task_id} ~ ${x.d[0].version.task_id} (${x.d[0].score})`).join(', ') : '✓' });
  const structures = new Set(vs.map(v => v.structure));
  checks.push({ id: 'V10', label: 'Structural diversity ≥ target', level: 'warning', pass: structures.size >= set.targets.min_structures, affected: [],
    detail: `${structures.size} structures (target ${set.targets.min_structures})` });
  const tpl = {}; vs.forEach(v => tpl[v.template_id] = (tpl[v.template_id] || 0) + 1);
  const top = Object.entries(tpl).sort((a, b) => b[1] - a[1])[0];
  const share = top && n ? top[1] / n : 0;
  checks.push({ id: 'V11', label: 'Template concentration ≤ max share', level: 'warning', pass: share <= set.targets.max_template_share, affected: [],
    detail: top ? `largest ${top[0]} = ${Math.round(share * 100)}% (max ${Math.round(set.targets.max_template_share * 100)}%)` : '—' });
  add('V12', 'Invalid-run rate per version < 30%', 'warning', vs.filter(v => metrics(s, v).invalid_rate >= 0.3), '✓', b => `${b.length} versions`);
  return { checks, blocking: checks.filter(c => c.level === 'blocking' && !c.pass).length, warnings: checks.filter(c => c.level === 'warning' && !c.pass).length };
}

function deliver(s, set_id, { ack_reason }, by) {
  const set = getSet(s, set_id);
  if (set.status !== 'draft') fail('Snapshot is frozen.');
  const val = validateSet(s, set);
  if (val.blocking) fail(`Resolve ${val.blocking} blocking issue(s) to deliver.`);
  const warn = val.checks.filter(c => c.level === 'warning' && !c.pass);
  if (warn.length && !trim(ack_reason)) fail('Acknowledge the warnings with a reason to deliver.');
  const ids = set.items.map(i => i.version_id).sort();
  set.snapshot_hash = hash(ids.join(',') + '|' + JSON.stringify(val.checks.map(c => [c.id, c.pass])));
  set.acknowledged = warn.map(c => ({ check: c.id, detail: c.detail, reason: trim(ack_reason), by }));
  set.validation_at_delivery = val.checks.map(c => ({ id: c.id, label: c.label, level: c.level, pass: c.pass, detail: c.detail }));
  set.items = Object.freeze(set.items.map(i => Object.freeze(Object.assign({}, i))));
  set.status = 'delivered'; set.delivered_at = now(s); set.delivered_by = by;
  event(s, set, 'delivered & frozen', '#' + set.snapshot_hash, by);
  return set;
}

// ---------- customer feedback ----------
function addResult(s, set_id, r, by) {
  const set = getSet(s, set_id);
  if (set.status !== 'delivered') fail('Results attach to a delivered snapshot.');
  const num = k => { const x = Number(r[k]); if (r[k] === '' || r[k] == null || !(x >= 0 && x <= 100)) fail(`${k.replace('_', ' ')} must be a percentage 0–100.`); return x; };
  const out = { train_before: num('train_before'), train_after: num('train_after'), heldout_before: num('heldout_before'), heldout_after: num('heldout_after') };
  ['n_train', 'n_heldout'].forEach(k => { if (!(Number(r[k]) > 0)) fail(`${k} must be greater than 0.`); out[k] = Number(r[k]); });
  ['eval_budget_unchanged', 'matched_control'].forEach(k => { if (!['yes', 'no', 'unknown'].includes(r[k])) fail(`Answer "${k.replace(/_/g, ' ')}".`); out[k] = r[k]; });
  if (!(Number(r.repeats) >= 1)) fail('Repeat runs must be at least 1.');
  if (!trim(r.date)) fail('Result date is required.');
  const traces = r.traces || {};
  if (Number(traces.count) > 0 && !SELECTIONS.includes(traces.selection)) fail('Say how the traces were selected.');
  const res = Object.assign(out, { id: nid(s, 'CR'), set_id, snapshot_hash: set.snapshot_hash, repeats: Number(r.repeats), date: trim(r.date),
    traces: { count: Number(traces.count) || 0, selection: traces.selection || null, summary: trim(traces.summary) }, notes: trim(r.notes), by, at: now(s) });
  set.results.push(res);
  event(s, set, 'customer result recorded', `train ${res.train_before}→${res.train_after}, held-out ${res.heldout_before}→${res.heldout_after}`, by);
  return res;
}

// Shows how strong the evidence is. It never recommends scaling.
function signal(r) {
  const tg = r.train_after - r.train_before, hg = r.heldout_after - r.heldout_before, missing = [];
  if (r.matched_control !== 'yes') missing.push('matched-compute control run');
  if (r.repeats < 2) missing.push('repeat run');
  if (r.traces && r.traces.count && r.traces.selection !== 'random') missing.push('random sample of passing training attempts');
  const out = (label, note) => ({ label, note, train_gain: tg, heldout_gain: hg, missing });
  if (r.eval_budget_unchanged !== 'yes') return out('Not comparable', 'Evaluation budget changed or unknown.');
  if (hg <= 2 && tg >= 10) return out('Weak', 'Training gain without held-out gain. Possible memorization or grader exploitation.');
  if (hg > 2 && missing.slice(0, 2).length) return out('Promising · unconfirmed', 'Needs a matched control and a repeat.');
  if (hg > 2) return out('Supported', '');
  return out('Inconclusive', '');
}

function flagPostDelivery(s, set_id, o, by) {
  const set = getSet(s, set_id);
  if (set.status !== 'delivered') fail('Post-delivery issues apply to delivered sets.');
  const ids = o.version_ids || [];
  if (!ids.length) fail('Select the affected version(s).');
  ids.forEach(id => { if (!set.items.some(i => i.version_id === id)) fail(`${id} is not in this snapshot.`); });
  if (!PDI_TYPES.includes(o.type)) fail('Choose an issue type.');
  if (!trim(o.evidence)) fail('Evidence is required.');
  if (o.replacement_version_id) {
    const rv = getVersion(s, o.replacement_version_id);
    if (ids.some(id => getVersion(s, id).task_id !== rv.task_id)) fail('Replacement must be a version of the same task.');
    if (!eligibility(s, rv).eligible) fail('Replacement must be an eligible version.');
  }
  if (typeof o.notification_required !== 'boolean') fail('Say whether the customer must be notified.');
  if (!o.notification_required && !trim(o.not_required_reason)) fail('Explain why no notification is needed.');
  const pdi = { id: nid(s, 'PDI'), set_id, version_ids: ids, type: o.type, discovered_at: trim(o.date) || now(s).slice(0, 10), evidence: trim(o.evidence),
    impact: trim(o.impact), replacement_version_id: o.replacement_version_id || null,
    notification: { required: o.notification_required, reason: trim(o.not_required_reason), done_at: null, channel: null }, by, at: now(s) };
  set.pdis.push(pdi);
  ids.forEach(id => {
    const v = getVersion(s, id);
    if (v.review_status === 'Approved') { recordDecision(s, v, 'withdraw', { reason: `Post-delivery issue ${pdi.id}: ${pdi.type.replace(/_/g, ' ')}` }, by); v.review_status = 'Withdrawn'; }
  });
  event(s, set, 'post-delivery issue flagged', `${pdi.id} on ${ids.map(x => x.split('#')[0]).join(', ')}`, by);
  return pdi;
}
function markNotified(s, set_id, pdi_id, { channel }, by) {
  const set = getSet(s, set_id), p = set.pdis.find(x => x.id === pdi_id) || fail('No issue ' + pdi_id);
  if (!p.notification.required) fail('No notification required.');
  if (p.notification.done_at) fail('Already marked notified.');
  if (!trim(channel)) fail('Channel is required.');
  Object.assign(p.notification, { done_at: now(s), channel: trim(channel), by });
  event(s, set, 'customer notified', `${p.id} via ${trim(channel)}`, by);
  return p;
}

// Task 3's priority investigation: one random draw of passing runs ACROSS a delivered snapshot,
// so the false-positive rate is estimated from a sample nobody chose. Each drawn run is recorded
// as a per-version random sample, so the ordinary audit flow and the validity maths still apply.
function auditSweep(s, set_id, { n, seed }, by) {
  const set = getSet(s, set_id);
  if (set.status !== 'delivered') fail('Sweeps run against a delivered snapshot.');
  const size = Number(n) || 0;
  if (size < 1) fail('How many passing runs should the sweep draw?');
  const sampled = {};
  set.items.forEach(i => sampled[i.version_id] = sampledRunIds(s, i.version_id));
  const pool = set.items.flatMap(i => {
    const v = getVersion(s, i.version_id);
    return metrics(s, v).pass_ids.filter(id => !sampled[v.id].has(id) && !auditOf(s, id)).map(id => ({ id, version_id: v.id }));
  });
  if (!pool.length) fail('No unsampled passing runs left in this snapshot.');
  const sd = Number.isInteger(seed) ? seed : 1000 + Math.floor(Math.random() * 9000);
  const picks = shuffled(pool.map(x => x.id), sd).slice(0, Math.min(size, pool.length));
  const byVersion = {};
  picks.forEach(id => { const v = pool.find(x => x.id === id).version_id; (byVersion[v] = byVersion[v] || []).push(id); });
  Object.entries(byVersion).forEach(([vid, ids]) => s.samples.push({ id: nid(s, 'SMP'), version_id: vid, seed: sd, rule: `batch sweep of ${set.id}`,
    passes_at_draw: metrics(s, getVersion(s, vid)).pass_ids.length, required_at_draw: ids.length, run_ids: ids, sweep: set.id, by, at: now(s) }));
  const sweep = { id: nid(s, 'SWP'), set_id, seed: sd, requested: size, run_ids: picks, pool: pool.length, by, at: now(s) };
  (set.sweeps = set.sweeps || []).push(sweep);
  event(s, set, 'random audit sweep drawn', `${picks.length} of ${pool.length} unaudited passing runs · seed ${sd}`, by);
  return sweep;
}

function randomAuditFP(s, version_ids) {
  const a = s.audits.filter(x => x.sampled_by === 'random' && version_ids.includes(x.version_id));
  const invalid = a.filter(x => x.verdict === 'invalid').length;
  return { n: a.length, invalid, rate: a.length ? invalid / a.length : null };
}

function programProgress(s) {
  const delivered = [...new Set(s.sets.filter(x => x.status === 'delivered').flatMap(x => x.items.map(i => i.version_id)))];
  const withdrawn = delivered.filter(id => getVersion(s, id).review_status === 'Withdrawn');
  const draft = [...new Set(s.sets.filter(x => x.status === 'draft').flatMap(x => x.items.map(i => i.version_id)))].filter(id => !delivered.includes(id));
  const results = s.sets.flatMap(x => x.results);
  const fp = randomAuditFP(s, delivered);
  const pdis = s.sets.flatMap(x => x.pdis);
  return {
    target: PROGRAM_TARGET, delivered: delivered.length, withdrawn: withdrawn.length, good: delivered.length - withdrawn.length, in_draft: draft.length,
    stage: 1, stage_label: 'Stage 1 · Pilot',
    gate: [
      { label: 'Held-out lift with matched control', pass: results.some(r => signal(r).label === 'Supported') },
      { label: 'Random-audit false-positive rate < 5% (n ≥ 40)', pass: fp.n >= 40 && fp.rate < 0.05, detail: fp.n ? `${fp.invalid}/${fp.n}` : 'not measured' },
      { label: 'Every post-delivery issue has a replacement', pass: pdis.every(p => p.replacement_version_id), detail: pdis.length ? `${pdis.filter(p => p.replacement_version_id).length}/${pdis.length}` : 'no issues yet' }
    ]
  };
}

function customerSample(s, set_id, by, seed) {
  const set = getSet(s, set_id);
  if (set.status !== 'draft') fail('The customer review sample is drawn before delivery.');
  const ids = set.items.map(i => i.version_id);
  if (!ids.length) fail('Add versions first.');
  const sd = Number.isInteger(seed) ? seed : 1000 + Math.floor(Math.random() * 9000);
  const groups = {};
  shuffled(ids, sd).forEach(id => { const k = getVersion(s, id).structure; (groups[k] = groups[k] || []).push(id); });
  const random = [], keys = Object.keys(groups).sort();
  while (random.length < Math.min(5, ids.length)) keys.forEach(k => { if (groups[k].length && random.length < 5) random.push(groups[k].shift()); });
  const reasonFor = id => {
    const v = getVersion(s, id), vs = versionsOf(s, v.task_id);
    if (vs.some(x => issuesOf(s, x.id).length)) return 'had a grader issue, fixed in a later version';
    if (vs.some(x => x.n < v.n && x.review_status === 'Changes Requested')) return 'revised after review';
    if (runsOf(s, id).some(r => disagreement(s, r.id))) return 'reviewer disagreement';
    if (ids.filter(x => getVersion(s, x).structure === v.structure).length === 1) return 'only version of its structure';
    return null;
  };
  const targeted = ids.filter(id => !random.includes(id)).map(id => ({ id, reason: reasonFor(id) })).filter(x => x.reason).slice(0, 5);
  set.sample = { seed: sd, random, targeted, by, at: now(s) };
  event(s, set, 'customer review sample drawn', `seed ${sd}`, by);
  return set.sample;
}

function composition(s, set) {
  const vs = set.items.map(i => getVersion(s, i.version_id)), count = f => { const o = {}; vs.forEach(v => { const k = f(v); if (k) o[k] = (o[k] || 0) + 1; }); return o; };
  const modes = {}; vs.forEach(v => metrics(s, v).dist.forEach(d => modes[d.mode] = (modes[d.mode] || 0) + d.count));
  // Which constraint types the batch actually breaks, aggregated by the structure the task tests.
  const broken = {};
  vs.forEach(v => { const p = constraintProfile(s, v); if (p.rows.some(r => r.fails)) broken[v.structure] = (broken[v.structure] || 0) + 1; });
  return { structure: count(v => v.structure), template: count(v => v.template_id), workflow: count(v => v.workflow),
    failure_mode: modes, constraint_break: broken, domain: count(v => getTask(s, v.task_id).domain) };
}

const NexusCore = {
  hash, shuffled, createStore, now, nid, getTask, getVersion, versionsOf, latestVersion, versionByN, runsOf, getRun,
  createTask, editVersion, addSolvability, parseStep, addRun, annotate, annotationsOf, latestAttribution, disagreement, isValidRun, metrics,
  failedConstraints, constraintProfile, requiredAudits, auditStatus, drawSample, auditRun, auditOf, sampledRunIds, mismatches, logIssue, confirmIssue, dismissIssue, issuesOf,
  graderHealth, uncheckedExpected, fingerprintOf, similarity, nearDuplicates, duplicateCandidates, NEAR_DUPLICATE, eligibility, reviewQueue, nextInQueue, setsContaining, deliveredIn, pdisFor, primaryVersion, defaultVersion, queueReason, summaryCounts,
  checklistPrefill, reviewBlockers, addReview, reviewsOf, submitMissing, submitForReview, recall, unblock, withdraw, deprecate, diffVersions,
  getSet, createSet, addBlockers, addToSet, removeFromSet, validateSet, deliver, addResult, signal, flagPostDelivery, markNotified,
  randomAuditFP, auditSweep, programProgress, customerSample, composition,
  GATES, CHECKLIST, AUDIT_RULE, REVIEW_STATUSES, RESULTS, STRUCTURES, WORKFLOWS, CAPABILITIES, FAILURE_MODES, ATTRIBUTIONS, ISSUE_TYPES,
  QUALITY_ISSUES, SOLV_TYPES, SELECTIONS, GRADER_TYPES, PDI_TYPES, STEP_TYPES, DEF_FIELDS, FIELD_LABEL, PROGRAM_TARGET
};
if (typeof module !== 'undefined') module.exports = NexusCore;
