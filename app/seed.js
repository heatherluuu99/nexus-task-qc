// Nexus demo seed — the four records from Nexus_Starter_Tasks.json, extended with the structured
// fields Nexus needs (constraints, expected state, grader checks). Each record keeps its one reported
// run: nothing is invented to fill a 10-run sample. verify.mjs checks STARTER against the JSON file.
'use strict';
var NexusSeed = (function () {
  const C = typeof NexusCore !== 'undefined' ? NexusCore : require('./core.js');
  const AUTHOR = 'M. Chen', REVIEWER = 'J. Park', ENGINEER = 'R. Diaz', DM = 'L. Ruiz';

  const STARTER = [
    { task_id: 'A01', pool: 'A — Support', title: 'Update a support ticket after checking coverage',
      instruction: 'Check coverage for asset AX-42. If active, mark ticket T-18 eligible for service; otherwise mark it ineligible. Leave a note citing the coverage end date.',
      initial_state: 'Today is 2026-04-01. AX-42 coverage ends 2026-06-30. Ticket T-18 is unreviewed. Twelve industry variants change names and labels while preserving this workflow.',
      tools: ['coverage lookup', 'ticket editor'],
      success_condition: 'T-18 is eligible and its note cites 2026-06-30.',
      reported_run_result: 'Fail',
      run_evidence: 'Lookup returned active coverage through 2026-06-30. The agent marked the ticket ineligible and wrote no note. The grader read the stored ticket fields.',
      reference_evidence: 'A reviewer completed the task using the supplied tools. No setup errors were observed in this illustrative run.' },
    { task_id: 'B01', pool: 'B — Procurement', title: 'Choose a supplier and prepare an order',
      instruction: 'Prepare an order for 20 monitors, keeping total cost at or below $5,000 including shipping. Use an approved supplier whose quote arrives by April 20. Update the order and link the chosen quote.',
      initial_state: 'Policy lists Cedar and Vale as approved. Cedar quotes $4,700 plus $200 shipping, arriving April 19. Vale quotes $4,400 plus $100 shipping, arriving April 25. Both quotes cover 20 monitors. Order O-7 is blank.',
      tools: ['policy reader', 'quote search', 'order editor'],
      success_condition: 'O-7 selects Cedar, records 20 monitors and a $4,900 total, and links the Cedar quote.',
      reported_run_result: 'Fail',
      run_evidence: 'The agent read both quotes, selected Vale because it was cheaper, and saved the order. The state-based grader found the arrival-date constraint violated.',
      reference_evidence: 'An expert completed O-7 with Cedar and checked price, quantity, approval, date, and quote linkage. The runner recorded no setup or tool errors.' },
    { task_id: 'C01', pool: 'C — Incident response', title: 'Recover a failed scheduled data job',
      instruction: 'Use the incident log and recovery guide to restore the scheduled job. Verify that the expected output exists before closing the incident.',
      initial_state: 'The task description says a backup snapshot is available. The reset manifest refers to snapshot-17, but the restored environment contains no such file.',
      tools: ['log reader', 'file browser', 'job runner', 'incident editor'],
      success_condition: 'The job completes, produces the expected output, and the incident is closed with verification evidence.',
      reported_run_result: 'Fail',
      run_evidence: "The agent followed the recovery guide. Restore returned 'snapshot-17 not found'. The job never reached a runnable state; the grader reported failure.",
      reference_evidence: 'No successful reference run is available for this reset version. The missing snapshot has not been investigated.' },
    { task_id: 'D01', pool: 'D — Project coordination', title: 'Move a release milestone across connected tools',
      instruction: 'Move release R-8 to April 24. Update the project board milestone, the calendar event, and the release document so all three agree.',
      initial_state: 'The board, calendar, and release document all show April 17. The tools allow edits to all three records.',
      tools: ['project board', 'calendar', 'document editor'],
      success_condition: 'All three records show April 24 and refer to release R-8.',
      reported_run_result: 'Pass',
      run_evidence: "The agent changed the board and calendar to April 24, left the document at April 17, and wrote 'All updates complete'. The grader passed the attempt by matching that completion message.",
      reference_evidence: 'A reviewer confirmed the stale document state. No reference solution or corrected grader has been supplied.' }
  ];

  // Structured extensions. Where the run evidence does not say what a field held, it is "not captured" (holds: null).
  const EXT = {
    A01: {
      domain: 'Support (12 industry labels)',
      def: {
        starting_state: '{"today":"2026-04-01","asset":{"id":"AX-42","coverage_end":"2026-06-30"},"ticket":{"id":"T-18","status":"unreviewed"}}',
        constraints: [{ text: 'Coverage active on 2026-04-01 → T-18 marked eligible', source: 'instruction' }, { text: 'Note cites the coverage end date 2026-06-30', source: 'instruction' }],
        expected: [{ constraint: 'C1', path: 'ticket.T-18.eligibility', op: '=', value: 'eligible' }, { constraint: 'C2', path: 'ticket.T-18.note', op: 'contains', value: '2026-06-30' }],
        documents: [{ id: 'AX-42', title: 'Coverage record' }],
        grader_type: 'state_assertion',
        grader_checks: [{ name: 'Eligibility field', exp_id: 'E1', assertion: 'ticket.eligibility == "eligible"', weight: 0.5 }, { name: 'Note cites end date', exp_id: 'E2', assertion: 'ticket.note contains "2026-06-30"', weight: 0.5 }],
        capability: 'single_action', structure: 'single_step', workflow: 'support', template_id: 'T-SUP-01'
      },
      run: { result: 'fail', final_response: '',
        state: [{ exp_id: 'E1', actual: 'ineligible', holds: false }, { exp_id: 'E2', actual: '(no note)', holds: false }],
        checks: { K1: 'fail', K2: 'fail' },
        trace: ['TOOL CALL: coverage lookup AX-42 → active through 2026-06-30', 'ACTION: ticket editor → T-18 marked ineligible', 'STATE CHANGE: no note written', 'NOTE: grader read the stored ticket fields'] },
      solvability: { type: 'expert_completed', expert: 'Reviewer (starter record)', date: '2026-04-01', budget: 'same tools', evidence_ref: 'A01 reference_evidence' }
    },
    B01: {
      domain: 'Procurement',
      def: {
        starting_state: '{"approved_suppliers":["Cedar","Vale"],"quotes":{"Cedar":{"price":4700,"shipping":200,"arrives":"April 19","qty":20},"Vale":{"price":4400,"shipping":100,"arrives":"April 25","qty":20}},"order":{"id":"O-7"}}',
        constraints: [{ text: 'Total cost ≤ $5,000 including shipping', source: 'instruction' }, { text: 'Supplier is approved', source: 'policy' }, { text: 'Quote arrives by April 20', source: 'instruction' },
          { text: 'Order records 20 monitors', source: 'instruction' }, { text: 'Order links the chosen quote', source: 'instruction' }],
        expected: [{ constraint: 'C1', path: 'order.O-7.total', op: '=', value: '$4,900' }, { constraint: 'C2', path: 'order.O-7.supplier', op: '∈', value: 'approved (Cedar, Vale)' },
          { constraint: 'C3', path: 'order.O-7.supplier', op: '=', value: 'Cedar (arrives April 19)' }, { constraint: 'C4', path: 'order.O-7.quantity', op: '=', value: '20' },
          { constraint: 'C5', path: 'order.O-7.quote_link', op: '=', value: 'Cedar quote' }],
        documents: [{ id: 'POLICY', title: 'Approved supplier policy' }, { id: 'Q-CEDAR', title: 'Cedar quote' }, { id: 'Q-VALE', title: 'Vale quote' }],
        grader_type: 'state_assertion',
        grader_checks: [{ name: 'Total', exp_id: 'E1', weight: 0.2 }, { name: 'Approved supplier', exp_id: 'E2', weight: 0.1 }, { name: 'Arrival by April 20', exp_id: 'E3', weight: 0.4 },
          { name: 'Quantity', exp_id: 'E4', weight: 0.1 }, { name: 'Quote linked', exp_id: 'E5', weight: 0.2 }],
        capability: 'multi_constraint_persistence', structure: 'budget_plus_policy', workflow: 'order_update', template_id: 'T-PROC-01'
      },
      run: { result: 'fail', final_response: '',
        state: [{ exp_id: 'E1', actual: 'not captured', holds: null }, { exp_id: 'E2', actual: 'Vale (approved)', holds: true }, { exp_id: 'E3', actual: 'Vale (arrives April 25)', holds: false },
          { exp_id: 'E4', actual: 'not captured', holds: null }, { exp_id: 'E5', actual: 'not captured', holds: null }],
        checks: { K1: 'unknown', K2: 'pass', K3: 'fail', K4: 'unknown', K5: 'unknown' },
        trace: ['DOC READ: Cedar quote — $4,700 + $200, arrives April 19', 'DOC READ: Vale quote — $4,400 + $100, arrives April 25', 'DECISION: select Vale because it is cheaper', 'ACTION: order editor → save O-7 with Vale', 'NOTE: state-based grader found the arrival-date constraint violated'] },
      solvability: { type: 'expert_completed', expert: 'Expert (starter record)', date: '2026-04-01', budget: 'same tools', evidence_ref: 'B01 reference_evidence' }
    },
    C01: {
      domain: 'Data operations',
      def: {
        starting_state: '{"reset_manifest":{"snapshot":"snapshot-17"},"filesystem":{"snapshot-17":"missing"},"incident":"open"}',
        constraints: [{ text: 'Scheduled job restored and completes', source: 'recovery guide' }, { text: 'Expected output exists', source: 'instruction' }, { text: 'Incident closed with verification evidence', source: 'instruction' }],
        expected: [{ constraint: 'C1', path: 'job.status', op: '=', value: 'completed' }, { constraint: 'C2', path: 'job.output', op: '=', value: 'exists' }, { constraint: 'C3', path: 'incident.status', op: '=', value: 'closed with verification' }],
        documents: [{ id: 'INCIDENT-LOG', title: 'Incident log' }, { id: 'RECOVERY-GUIDE', title: 'Recovery guide' }, { id: 'RESET-MANIFEST', title: 'Reset manifest (refers to snapshot-17)' }],
        grader_type: 'state_assertion',
        grader_checks: [{ name: 'Job completed', exp_id: 'E1', weight: 0.4 }, { name: 'Output exists', exp_id: 'E2', weight: 0.3 }, { name: 'Incident closed', exp_id: 'E3', weight: 0.3 }],
        capability: 'policy_compliance', structure: 'hidden_dependency', workflow: 'incident', template_id: 'T-INC-01'
      },
      run: { result: 'fail', final_response: '',
        state: [{ exp_id: 'E1', actual: 'never runnable', holds: false }, { exp_id: 'E2', actual: 'missing', holds: false }, { exp_id: 'E3', actual: 'not captured', holds: null }],
        checks: { K1: 'fail', K2: 'fail', K3: 'unknown' },
        trace: ['DOC READ: recovery guide', "ACTION: job runner → restore snapshot-17", "ERROR: snapshot-17 not found", 'NOTE: job never reached a runnable state; grader reported failure'] },
      solvability: null
    },
    D01: {
      domain: 'Project coordination',
      def: {
        starting_state: '{"board":{"R-8":"April 17"},"calendar":{"R-8":"April 17"},"release_doc":{"R-8":"April 17"}}',
        constraints: [{ text: 'Board milestone for R-8 shows April 24', source: 'instruction' }, { text: 'Calendar event for R-8 shows April 24', source: 'instruction' }, { text: 'Release document for R-8 shows April 24', source: 'instruction' }],
        expected: [{ constraint: 'C1', path: 'board.R-8.date', op: '=', value: 'April 24' }, { constraint: 'C2', path: 'calendar.R-8.date', op: '=', value: 'April 24' }, { constraint: 'C3', path: 'release_doc.R-8.date', op: '=', value: 'April 24' }],
        documents: [{ id: 'RELEASE-DOC', title: 'Release document R-8' }],
        grader_type: 'message_match',
        grader_checks: [{ name: 'Completion message', exp_id: '', assertion: 'final message matches a completion phrase', weight: 1 }],
        capability: 'cross_tool_state_tracking', structure: 'multi_tool_state_sync', workflow: 'coordination', template_id: 'T-COORD-01'
      },
      run: { result: 'pass', final_response: 'All updates complete',
        state: [{ exp_id: 'E1', actual: 'April 24', holds: true }, { exp_id: 'E2', actual: 'April 24', holds: true }, { exp_id: 'E3', actual: 'April 17', holds: false, claimed: 'All updates complete' }],
        checks: { K1: 'pass' },
        trace: ['ACTION: project board → R-8 milestone April 24', 'ACTION: calendar → R-8 event April 24', 'STATE CHANGE: release document left at April 17', "FINAL RESPONSE: All updates complete"] },
      solvability: null
    }
  };

  function seed() {
    const s = C.createStore();
    s.t = Date.parse('2026-09-14T09:00:00Z');
    STARTER.forEach(rec => {
      const x = EXT[rec.task_id];
      const v = C.createTask(s, { id: rec.task_id, name: rec.title, pool: rec.pool[0], domain: x.domain },
        Object.assign({ goal: rec.instruction, tools: rec.tools }, x.def), AUTHOR);
      C.getTask(s, rec.task_id).starter = rec;
      C.addRun(s, v.id, Object.assign({ model: 'starter run', budget: 'starter budget' }, x.run), AUTHOR);
      if (x.solvability) C.addSolvability(s, v.id, x.solvability, AUTHOR);
      C.submitForReview(s, v.id, AUTHOR);
    });
    C.createSet(s, { name: 'Aster Pilot Batch 01', purpose: 'training' }, DM);
    s.t = null;
    return s;
  }
  return { seed, STARTER, PEOPLE: { AUTHOR, REVIEWER, ENGINEER, DM } };
})();
if (typeof module !== 'undefined') module.exports = NexusSeed;
