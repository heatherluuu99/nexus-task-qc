// Acceptance checks for the Nexus prototype (PRD §14). Runs the same core.js and seed.js the page loads.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('./app/core.js');
const N = require('./app/seed.js');
const { AUTHOR, REVIEWER, ENGINEER, DM } = N.PEOPLE;

let n = 0, bad = 0;
const ok = (label, cond, detail = '') => { n++; if (!cond) bad++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`); };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re ? re.test(e.message) : true; } };
const section = t => console.log('\n## ' + t);
const V = (s, id) => C.latestVersion(s, id);
const approveReady = (s, vid, reason) => C.addReview(s, vid, { decision: 'approve', reason, severity: 'Low', confidence: 'High' }, REVIEWER);

section('0. Seed matches Nexus_Starter_Tasks.json');
const json = JSON.parse(readFileSync(new URL('./Nexus_Starter_Tasks.json', import.meta.url), 'utf8'));
ok('4 starter records embedded verbatim', JSON.stringify(json.tasks) === JSON.stringify(N.STARTER));
const S0 = N.seed();
ok('one version and one reported run per record', S0.tasks.every(t => C.versionsOf(S0, t.id).length === 1 && C.runsOf(S0, V(S0, t.id).id).length === 1));
ok('reported results preserved', json.tasks.every(r => C.runsOf(S0, V(S0, r.task_id).id)[0].result === r.reported_run_result.toLowerCase()));

section('AC1 · B01: model failure, task approved (execution ≠ quality)');
{
  const s = N.seed(), v = V(s, 'B01');
  approveReady(s, v.id, 'Agent chose the cheaper supplier and broke the arrival-date constraint; state grader caught it; expert-solvable.');
  const m = C.metrics(s, v), e = C.eligibility(s, v);
  ok('agent pass 0/1 and quality Approved at the same time', m.passes === 0 && m.valid === 1 && v.review_status === 'Approved');
  ok('B01@v1 eligible', e.eligible, e.reasons.join(' | '));
}

section('AC2 · D01: grader false positive needs repair');
{
  const s = N.seed(), v = V(s, 'D01');
  ok('message grader starts as Potential Issue', C.graderHealth(s, v).state === 'Potential Issue');
  const smp = C.drawSample(s, v.id, REVIEWER, 42);
  ok('p = 1 → sample all 1', smp.run_ids.length === 1);
  ok('author cannot audit own version', throws(() => C.auditRun(s, smp.run_ids[0], { verdict: 'valid' }, AUTHOR), /Authors cannot audit/));
  ok('invalid audit needs a reason', throws(() => C.auditRun(s, smp.run_ids[0], { verdict: 'invalid', reason: '' }, REVIEWER)));
  C.auditRun(s, smp.run_ids[0], { verdict: 'invalid', reason: 'Release document still April 17; grader matched "All updates complete".' }, REVIEWER);
  ok('audits are write-once', throws(() => C.auditRun(s, smp.run_ids[0], { verdict: 'valid' }, REVIEWER), /write-once/));
  const e = C.eligibility(s, v);
  ok('Confirmed Issue; G3 and G5 fail', C.graderHealth(s, v).state === 'Confirmed Issue' && !e.gates.find(g => g.id === 'G3').pass && !e.gates.find(g => g.id === 'G5').pass);
  approveReady(s, v.id, 'Approving anyway to show that approval does not make a version deliverable.');
  ok('even if approved, a confirmed grader issue keeps it ineligible', v.review_status === 'Approved' && !C.eligibility(s, v).eligible);
}

section('AC3 · return → edit → re-review (D01 grader repair)');
{
  const s = N.seed(), v1 = V(s, 'D01');
  const run = C.runsOf(s, v1.id)[0];
  C.auditRun(s, C.drawSample(s, v1.id, REVIEWER, 7).run_ids[0], { verdict: 'invalid', reason: 'Release doc still April 17.' }, REVIEWER);
  const gi = C.logIssue(s, v1.id, { type: 'false_positive', check_id: 'K1', run_id: run.id, note: 'Grader matched completion message; document stale.' }, REVIEWER);
  ok('issue auto-confirmed from invalid audit', gi.status === 'confirmed');
  ok('request changes needs issues + fix', throws(() => C.addReview(s, v1.id, { decision: 'request_changes', reason: 'Grader rewards the completion message, not state.' }, REVIEWER)));
  C.addReview(s, v1.id, { decision: 'request_changes', reason: 'Grader rewards the completion message, not the final state of the release document.', quality_issues: ['grader_false_positive'], suggested_fix: 'Assert all three dates in state.', fix_owner: 'Engineer', severity: 'High', confidence: 'High' }, REVIEWER);
  ok('v1 Changes Requested cannot be resubmitted', throws(() => C.submitForReview(s, v1.id, ENGINEER), /Edit to create v2/));
  ok('edit without changes rejected', throws(() => C.editVersion(s, v1.id, {}, { note: 'noop', by: ENGINEER }), /No changes/));
  const v2 = C.editVersion(s, v1.id, { grader_type: 'state_assertion', grader_checks: [{ name: 'Board', exp_id: 'E1', weight: 0.34 }, { name: 'Calendar', exp_id: 'E2', weight: 0.33 }, { name: 'Release doc', exp_id: 'E3', weight: 0.33 }] },
    { note: 'Grader: message_match → state_assertion', by: ENGINEER, fixes_issue_ids: [gi.id] });
  ok('v2 has a new hash; v1 untouched', v2.content_hash !== v1.content_hash && v1.review_status === 'Changes Requested' && v1.grader_type === 'message_match');
  ok('issue marked fixed in v2', gi.status === 'fixed' && gi.fixed_in_version_id === v2.id);
  ok('evidence did not carry over', C.runsOf(s, v2.id).length === 0 && !v2.solvability && C.reviewsOf(s, v2.id).length === 0);
  ok('submit blocked without a run', throws(() => C.submitForReview(s, v2.id, ENGINEER), /recorded run/));
  ok('trace required', throws(() => C.addRun(s, v2.id, { result: 'fail', trace: '  ' }, ENGINEER), /not evidence/));
  ok('audit cannot be set at entry', throws(() => C.addRun(s, v2.id, { result: 'pass', verdict: 'valid', trace: 'x' }, ENGINEER), /never at run entry/));
  const rerun = C.addRun(s, v2.id, { result: 'fail', trace: 'ACTION: board April 24\nACTION: calendar April 24\nSTATE CHANGE: document left April 17',
    state: [{ exp_id: 'E1', actual: 'April 24', holds: true }, { exp_id: 'E2', actual: 'April 24', holds: true }, { exp_id: 'E3', actual: 'April 17', holds: false }],
    checks: { K1: 'pass', K2: 'pass', K3: 'fail' } }, ENGINEER);
  ok('rerun scored by weights', rerun.score === 0.67, String(rerun.score));
  C.addSolvability(s, v2.id, { type: 'reference_trajectory', expert: 'R. Diaz', date: '2026-09-16', evidence_ref: 'trajectory D01-R1' }, ENGINEER);
  C.submitForReview(s, v2.id, ENGINEER);
  ok('approve reason ≥ 20 chars', throws(() => approveReady(s, v2.id, 'ok'), /20 characters/));
  approveReady(s, v2.id, 'State grader now fails the stale document the old grader passed; expert trajectory recorded.');
  ok('v2 Approved and eligible', C.eligibility(s, v2).eligible, C.eligibility(s, v2).reasons.join(' | '));
}

section('AC4 · a newer draft does not affect an approved version');
{
  const s = N.seed(), v1 = V(s, 'B01');
  approveReady(s, v1.id, 'Arrival-date constraint dropped by the model; grader and expert evidence hold.');
  const v2 = C.editVersion(s, v1.id, { goal: v1.goal + ' Record the arrival date on the order.' }, { note: 'Clarify arrival date field', by: AUTHOR });
  ok('v2 Draft, not eligible', v2.review_status === 'Draft' && !C.eligibility(s, v2).eligible);
  ok('v1 still eligible', C.eligibility(s, v1).eligible);
  ok('library shows v1 as primary, default opens v1', C.primaryVersion(s, 'B01').id === v1.id && C.defaultVersion(s, 'B01').id === v1.id);
}

section('AC5 · only eligible versions enter a delivery set');
{
  const s = N.seed(), set = s.sets[0];
  ['A01', 'C01', 'D01', 'B01'].forEach(id => ok(`${id}@v1 rejected before approval`, throws(() => C.addToSet(s, set.id, V(s, id).id, DM), /Cannot add/)));
  approveReady(s, V(s, 'B01').id, 'Arrival-date constraint dropped by the model; grader and expert evidence hold.');
  C.addToSet(s, set.id, V(s, 'B01').id, DM);
  ok('duplicate rejected', throws(() => C.addToSet(s, set.id, V(s, 'B01').id, DM), /Already/));
}

section('AC6 · delivered snapshot is immutable');
{
  const s = N.seed(), set = s.sets[0], v1 = V(s, 'B01');
  approveReady(s, v1.id, 'Arrival-date constraint dropped by the model; grader and expert evidence hold.');
  C.addToSet(s, set.id, v1.id, DM);
  ok('warnings need acknowledgement', throws(() => C.deliver(s, set.id, {}, DM), /Acknowledge/));
  C.deliver(s, set.id, { ack_reason: 'Pilot seed: one structure only.' }, DM);
  const h = set.snapshot_hash;
  C.editVersion(s, v1.id, { goal: v1.goal + ' (reworded)' }, { note: 'reword', by: AUTHOR });
  ok('snapshot still pins B01@v1 with the same hash', set.items[0].version_id === v1.id && set.snapshot_hash === h);
  ok('adding to a delivered set rejected', throws(() => C.addToSet(s, set.id, v1.id, DM), /frozen/));
  ok('frozen items cannot be mutated', throws(() => { 'use strict'; set.items.push({}); }));
}

section('AC7 · random audit sample size');
{
  ok('p≤5 audit all', C.requiredAudits(3) === 3 && C.requiredAudits(5) === 5);
  ok('p=8 → 5, p=20 → 6', C.requiredAudits(8) === 5 && C.requiredAudits(20) === 6);
  const a = C.shuffled([1, 2, 3, 4, 5, 6], 99), b = C.shuffled([1, 2, 3, 4, 5, 6], 99);
  ok('seeded shuffle is reproducible', JSON.stringify(a) === JSON.stringify(b));
}

section('AC8 · approved version with a new unaudited pass loses eligibility, keeps its review');
{
  const s = N.seed(), v = V(s, 'B01');
  approveReady(s, v.id, 'Arrival-date constraint dropped by the model; grader and expert evidence hold.');
  C.addRun(s, v.id, { result: 'pass', trace: 'ACTION: select Cedar\nACTION: link Cedar quote',
    state: v.expected.map(e => ({ exp_id: e.id, actual: e.value, holds: true })), checks: { K1: 'pass', K2: 'pass', K3: 'pass', K4: 'pass', K5: 'pass' } }, ENGINEER);
  ok('still Approved, not eligible, back in queue', v.review_status === 'Approved' && !C.eligibility(s, v).eligible && C.queueReason(s, v).reason === 'New passing run after approval');
  C.auditRun(s, C.drawSample(s, v.id, REVIEWER, 3).run_ids[0], { verdict: 'valid' }, REVIEWER);
  ok('eligible again after audit', C.eligibility(s, v).eligible);
}

section('AC9 · Task 3: customer trace → confirmed grader issue → post-delivery withdrawal');
{
  const s = N.seed(), set = s.sets[0], v = V(s, 'B01');
  approveReady(s, v.id, 'Arrival-date constraint dropped by the model; grader and expert evidence hold.');
  C.addToSet(s, set.id, v.id, DM);
  C.deliver(s, set.id, { ack_reason: 'Pilot seed: one structure only.' }, DM);
  const r = C.addResult(s, set.id, { date: '2026-09-30', train_before: 40, train_after: 82, n_train: 100, heldout_before: 34, heldout_after: 35, n_heldout: 100,
    eval_budget_unchanged: 'yes', matched_control: 'no', repeats: 1, traces: { count: 10, selection: 'convenience', summary: '3 of 10 wrong final state' } }, DM);
  const sig = C.signal(r);
  ok('signal Weak with missing evidence listed', sig.label === 'Weak' && sig.missing.length === 3, sig.missing.join(', '));
  ok('BEFORE: B01 eligible', C.eligibility(s, v).eligible);
  const ct = C.addRun(s, v.id, { source: 'customer', set_id: set.id, selection: 'convenience', result: 'pass', trace: 'ACTION: select Vale\nFINAL RESPONSE: order ready',
    state: [{ exp_id: 'E1', actual: '$4,500', holds: false }, { exp_id: 'E2', actual: 'Vale', holds: true }, { exp_id: 'E3', actual: 'Vale (April 25)', holds: false }, { exp_id: 'E4', actual: '20', holds: true }, { exp_id: 'E5', actual: 'Vale quote', holds: false }],
    checks: { K1: 'pass', K2: 'pass', K3: 'pass', K4: 'pass', K5: 'pass' } }, DM);
  ok('customer trace labelled CT-01, excluded from pass rate', ct.label === 'CT-01' && C.metrics(s, v).passes === 0);
  C.auditRun(s, ct.id, { verdict: 'invalid', reason: 'Wrong supplier left in final state.' }, REVIEWER);
  ok('AFTER: Confirmed Issue, not eligible', C.graderHealth(s, v).state === 'Confirmed Issue' && !C.eligibility(s, v).eligible);
  ok('customer audit not counted as random', C.randomAuditFP(s, [v.id]).n === 0);
  const pdi = C.flagPostDelivery(s, set.id, { version_ids: [v.id], type: 'grader_false_positive', evidence: 'CT-01 audited invalid', notification_required: true }, DM);
  ok('version Withdrawn, snapshot unchanged', v.review_status === 'Withdrawn' && set.items.length === 1 && set.items[0].version_id === v.id);
  const set2 = C.createSet(s, { name: 'Batch 02' }, DM);
  ok('withdrawn version cannot enter a new set', throws(() => C.addToSet(s, set2.id, v.id, DM), /Cannot add/));
  C.markNotified(s, set.id, pdi.id, { channel: 'weekly research call' }, DM);
  ok('notification recorded', !!pdi.notification.done_at);
}

section('AC10 · template concentration & structure warnings');
{
  const s = N.seed(), set = s.sets[0];
  approveReady(s, V(s, 'B01').id, 'Arrival-date constraint dropped by the model; grader and expert evidence hold.');
  C.addToSet(s, set.id, V(s, 'B01').id, DM);
  const val = C.validateSet(s, set);
  ok('V10 and V11 warn on a 1-version set', !val.checks.find(c => c.id === 'V10').pass && !val.checks.find(c => c.id === 'V11').pass && val.blocking === 0);
}

section('AC11/12 · review and independence guards');
{
  const s = N.seed(), v = V(s, 'A01');
  ok('author cannot review own version', throws(() => C.addReview(s, v.id, { decision: 'approve', reason: 'Looks fine to me, approving my own task.' }, AUTHOR), /own versions/));
  ok('✗ checklist item needs a note', throws(() => C.addReview(s, v.id, { decision: 'approve', reason: 'Coverage decision failed, grader reads stored fields.', checklist: { diversity: { value: 'no' } } }, REVIEWER), /note/));
  ok('block needs severity Blocking', throws(() => C.addReview(s, V(s, 'C01').id, { decision: 'block', reason: 'Reset manifest points to a missing snapshot.', severity: 'High' }, REVIEWER), /Blocking/));
  const c = V(s, 'C01');
  C.annotate(s, C.runsOf(s, c.id)[0].id, { attribution: 'environment', note: 'snapshot-17 missing' }, REVIEWER);
  ok('environment attribution removes the run from the valid count', C.metrics(s, c).valid === 0 && C.graderHealth(s, c).state === 'Not Evaluated');
  C.addReview(s, c.id, { decision: 'block', reason: 'Reset manifest refers to snapshot-17, which the environment does not contain.', severity: 'Blocking', confidence: 'High' }, REVIEWER);
  ok('C01 Blocked; unblock needs new evidence', c.review_status === 'Blocked' && throws(() => C.unblock(s, c.id, { reason: 'snapshot restored' }, ENGINEER), /new evidence/));
}

section('AC13 · a state grader that only reads part of the final state is not deliverable');
{
  const s = N.seed(), v1 = V(s, 'B01');
  approveReady(s, v1.id, 'Arrival-date constraint dropped by the model; grader and expert evidence hold.');
  ok('full coverage passes G3', C.eligibility(s, v1).gates.find(g => g.id === 'G3').pass);
  const v2 = C.editVersion(s, v1.id, { grader_checks: v1.grader_checks.filter(k => k.exp_id !== 'E3') }, { note: 'drop the arrival-date check', by: AUTHOR });
  ok('uncheckedExpected finds the gap', C.uncheckedExpected(v2).map(e => e.id).join() === 'E3');
  const g3 = C.eligibility(s, v2).gates.find(g => g.id === 'G3');
  ok('G3 fails and names the row', !g3.pass && /E3/.test(g3.reason), g3.reason);
  ok('grader health flags the gap', C.graderHealth(s, v2).state === 'Potential Issue');
}

section('AC14 · batch random audit sweep across a delivered snapshot');
{
  const s = N.seed(), set = s.sets[0], v = V(s, 'B01');
  approveReady(s, v.id, 'Arrival-date constraint dropped by the model; grader and expert evidence hold.');
  C.addToSet(s, set.id, v.id, DM);
  C.deliver(s, set.id, { ack_reason: 'Pilot seed: one structure only.' }, DM);
  const passing = () => C.addRun(s, v.id, { result: 'pass', trace: 'ACTION: Cedar selected', state: v.expected.map(e => ({ exp_id: e.id, actual: e.value, holds: true })),
    checks: { K1: 'pass', K2: 'pass', K3: 'pass', K4: 'pass', K5: 'pass' } }, ENGINEER);
  passing(); passing(); passing();
  ok('sweep needs a delivered snapshot', throws(() => C.auditSweep(s, C.createSet(s, { name: 'draft' }, DM).id, { n: 2 }, DM), /delivered snapshot/));
  const sw = C.auditSweep(s, set.id, { n: 2, seed: 5 }, DM);
  ok('draws 2 of 3 unaudited passing runs, recording the seed', sw.run_ids.length === 2 && sw.pool === 3 && sw.seed === 5);
  C.auditRun(s, sw.run_ids[0], { verdict: 'invalid', reason: 'Vale left on the order.' }, REVIEWER);
  C.auditRun(s, sw.run_ids[1], { verdict: 'valid' }, REVIEWER);
  const fp = C.randomAuditFP(s, [v.id]);
  ok('sweep audits count as random', fp.n === 2 && fp.invalid === 1, JSON.stringify(fp));
  ok('sweep is recorded on the set', set.sweeps.length === 1 && set.events.some(e => e.type === 'random audit sweep drawn'));
  ok('a second sweep only draws what is left', C.auditSweep(s, set.id, { n: 5, seed: 6 }, DM).run_ids.length === 1);
}

section('AC15 · reviewer worklist order');
{
  const s = N.seed();
  const q = C.reviewQueue(s);
  ok('all four starter versions are queued', q.length === 4);
  ok('the message-grader task is first', q[0].v.task_id === 'D01' && q[0].q.reason === 'Potential grader issue', q.map(x => x.v.task_id + ':' + x.q.priority).join(' '));
  const nx = C.nextInQueue(s, V(s, 'D01').id);
  ok('next skips the task just decided', nx && nx.v.task_id !== 'D01');
  approveReady(s, V(s, 'B01').id, 'Arrival-date constraint dropped by the model; grader and expert evidence hold.');
  ok('a decided version leaves the queue', !C.reviewQueue(s).some(x => x.v.task_id === 'B01'));
}

section('AC16 · independence and derived scores (from the buyer-side review)');
{
  const s = N.seed(), v = V(s, 'B01');
  const mine = C.addRun(s, v.id, { result: 'pass', trace: 'ACTION: Cedar selected',
    state: v.expected.map(e => ({ exp_id: e.id, actual: e.value, holds: true })), checks: { K1: 'pass', K2: 'pass', K3: 'pass', K4: 'pass', K5: 'pass' } }, ENGINEER);
  C.drawSample(s, v.id, REVIEWER, 2);
  ok('the person who recorded a run cannot audit it', throws(() => C.auditRun(s, mine.id, { verdict: 'valid' }, ENGINEER), /recorded/));
  ok('someone else can', !!C.auditRun(s, mine.id, { verdict: 'valid' }, REVIEWER));
  ok('a supplied score is rejected', throws(() => C.addRun(s, v.id, { result: 'fail', score: 1, trace: 'x',
    state: v.expected.map(e => ({ exp_id: e.id, actual: 'x', holds: false })), checks: { K1: 'fail', K2: 'fail', K3: 'fail', K4: 'fail', K5: 'fail' } }, ENGINEER), /computed/));
  const partial = C.addRun(s, v.id, { result: 'fail', trace: 'ACTION: Vale selected',
    state: v.expected.map(e => ({ exp_id: e.id, actual: 'x', holds: e.id !== 'E3' })), checks: { K1: 'pass', K2: 'pass', K3: 'fail', K4: 'pass', K5: 'pass' } }, ENGINEER);
  ok('score comes from the weights', partial.score === 0.6, String(partial.score));
}
{
  const s = N.seed(), v = V(s, 'A01');
  approveReady(s, v.id, 'One tool and two independent constraints, but the decision is defensible here.');
  ok('an approval with no random audits is not flagged self-audited', C.reviewsOf(s, v.id).pop().self_audited === false);
}
{
  const s = N.seed(), v = V(s, 'D01');
  C.auditRun(s, C.drawSample(s, v.id, REVIEWER, 3).run_ids[0], { verdict: 'valid' }, REVIEWER);
  approveReady(s, v.id, 'Same reviewer audited the passing run and approved the version.');
  ok('approving on your own audits is recorded on the review', C.reviewsOf(s, v.id).pop().self_audited === true);
}

section('AC17 · constraint-level failure profile (derived, not typed)');
{
  const s = N.seed(), v = V(s, 'B01');
  const p = C.constraintProfile(s, v);
  ok('B01 breaks only the arrival-date constraint', p.denom === 1 && p.rows[0].id === 'C3' && p.rows[0].fails === 1,
    p.rows.map(r => r.id + ':' + r.fails).join(' '));
  ok('rows that were not captured are not counted as broken', p.rows.filter(r => r.fails).length === 1);
  const d = V(s, 'D01');
  ok('an unaudited pass breaks nothing yet', C.constraintProfile(s, d).denom === 0);
  C.auditRun(s, C.drawSample(s, d.id, REVIEWER, 9).run_ids[0], { verdict: 'invalid', reason: 'Release doc still April 17.' }, REVIEWER);
  const after = C.constraintProfile(s, d);
  ok('an invalid pass counts, and names C3', after.denom === 1 && after.rows[0].id === 'C3' && after.rows[0].fails === 1,
    after.rows.map(r => r.id + ':' + r.fails).join(' '));
  ok('failedConstraints reads the state, not the label', C.failedConstraints(s, d, C.runsOf(s, d.id)[0]).join() === 'C3');
}

section('AC18 · structural fingerprint catches relabelled templates');
{
  const s = N.seed(), a = V(s, 'A01');
  const def = Object.fromEntries(C.DEF_FIELDS.map(f => [f, a[f]]));
  const clone = C.createTask(s, { name: 'Update a billing ticket after checking coverage', pool: 'A', domain: 'Telecom' },
    Object.assign({}, def, { goal: 'Same workflow, different industry label.' }), AUTHOR);
  ok('relabelled copy is a structural twin', C.similarity(a, clone).twin && C.similarity(a, clone).score === 1);
  ok('a genuinely different task is not', C.similarity(a, V(s, 'B01')).score < 0.3, String(C.similarity(a, V(s, 'B01')).score));
  ok('the fingerprint ignores names, domains and values', C.fingerprintOf(a).hash === C.fingerprintOf(clone).hash);
  ok('nearDuplicates finds it from either side', C.nearDuplicates(s, a).length === 1 && C.nearDuplicates(s, clone).length === 1);

  // both approved and put in one set → V13 blocks
  [a, clone].forEach(v => { if (!v.solvability) C.addSolvability(s, v.id, { type: 'expert_completed', expert: 'X', date: '2026-04-01', evidence_ref: 'ref' }, AUTHOR); });
  C.addRun(s, clone.id, { result: 'fail', trace: 'ACTION: ticket marked ineligible',
    state: clone.expected.map(e => ({ exp_id: e.id, actual: 'wrong', holds: false })), checks: { K1: 'fail', K2: 'fail' } }, ENGINEER);
  C.submitForReview(s, clone.id, AUTHOR);
  [a, clone].forEach(v => approveReady(s, v.id, 'Approved here only to prove the duplicate gate blocks the pair.'));
  const set = s.sets[0];
  C.addToSet(s, set.id, a.id, DM); C.addToSet(s, set.id, clone.id, DM);
  const val = C.validateSet(s, set), v13 = val.checks.find(c => c.id === 'V13');
  ok('V13 blocks a set holding both twins', !v13.pass && val.blocking > 0, v13.detail);
  ok('delivery is refused', throws(() => C.deliver(s, set.id, { ack_reason: 'x' }, DM), /blocking/));
  C.removeFromSet(s, set.id, clone.id, DM);
  ok('removing one twin clears V13', C.validateSet(s, set).checks.find(c => c.id === 'V13').pass);
  C.deliver(s, set.id, { ack_reason: 'Single-structure pilot seed.' }, DM);
  const set2 = C.createSet(s, { name: 'Batch 02' }, DM);
  C.addToSet(s, set2.id, clone.id, DM);
  const v14 = C.validateSet(s, set2).checks.find(c => c.id === 'V14');
  ok('V14 warns that the customer already has this shape', !v14.pass, v14.detail);
}

console.log(`\n${n - bad}/${n} checks passed`);
process.exit(bad ? 1 : 0);
