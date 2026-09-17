# Nexus — task QC & delivery prototype

Prototype for the Tandem Forge product take-home. Plain HTML/JS, no build step, no network.
State lives in memory; reloading resets to the four records from `Nexus_Starter_Tasks.json`.

Notes for all three tasks (800-word cap): **[NOTES.md](NOTES.md)**

## Try it — 3 steps

1. Open `app/index.html` in a browser. If your browser blocks local scripts, run
   `python3 -m http.server 8765 -d app` and open http://localhost:8765.
2. **Accepted path and repair path.** Keep *Viewing as: Reviewer* — the library opens on the
   **Review Queue**, ordered by grader risk first. Open **B01** and approve it:
   0/1 agent pass, yet eligible. Open **D01** → Pass Audit → draw the sample → audit the run as an
   invalid pass → request changes. Switch to *Engineer* → **Edit → creates v2** (grader type
   `state_assertion`) → record a run, add solvability evidence, submit. Switch back to *Reviewer* and approve v2.
3. **Delivery and Task 3.** Switch to *Delivery Manager* → Delivery Sets → DS-001 → add B01@v1 →
   deliver → record customer results (40→82 / 34→35). On B01, import a customer trace with the
   wrong final state; as *Reviewer*, audit it invalid; then flag the post-delivery issue.

Optional: `node verify.mjs` runs 88 acceptance checks against the same `core.js` and `seed.js` the page loads.

## Pages

| Page | Answers | Main actions |
|---|---|---|
| Task Library | Which versions need review, have grader issues, or can ship? | Filter, create task, open a version |
| Task Detail / Review | Is this exact version worth delivering, and what is the evidence? | Record runs, random pass audit, attribute failures, log grader issues, decide, edit → new version |
| Delivery Sets | Can this batch ship, and what happened after it did? | Add eligible versions, validate, deliver (frozen snapshot), customer results, post-delivery issue |

## Rules the prototype enforces

- **Execution ≠ quality.** Agent pass rate and review status are separate columns and separate header groups.
- **Versions are immutable.** Editing mints `task@vN#hash`; runs, audits and reviews do not carry over.
- **Eligibility is computed per version** from six gates: approved · solvability evidence · state-asserting grader ·
  required random audits done · no grader issue · metadata complete. A newer draft never affects an older approved version.
- **Evidence cannot certify itself.** Runs cannot carry an audit result or a hand-typed score; audits are write-once;
  authors cannot audit or review their own versions, and nobody can audit a run they recorded themselves.
- **The reviewer's time is the scarce input.** Reviewers land on the queue, each row states why it is queued,
  and a decision offers the next task instead of sending them back to the list.
- **Random, not convenient, samples.** Passes ≤ 5 are all audited; otherwise max(5, 30%) are drawn with a recorded seed. Only random audits count toward validity.
  A delivered set can also draw one sweep across every version in the snapshot.
- **Failures are attributed to a constraint, not just a label.** "Which constraint breaks" is derived from the
  captured final state (including passes an audit found invalid), so you can see whether the model trips on the
  constraint the task was built to test.
- **Duplicates are caught by shape, not by label.** A structural fingerprint (constraint structure, tool set,
  expected paths and operators, constraint count) flags twins in the library, blocks a batch that holds two of them,
  and warns when the customer already has that shape.
- **Snapshots are frozen.** A delivered set keeps its exact versions. A later defect withdraws the version and adds a notification to-do; the snapshot is unchanged.
- **Customer results never recommend scaling.** Held-out and training results are shown side by side with the experiment-design gaps.

## Files

| Path | |
|---|---|
| `app/core.js` | Pure logic: versions, runs, audits, grader health, gates, review, delivery, customer results |
| `app/seed.js` | The four starter records plus their structured extensions (constraints, expected state, grader checks) |
| `app/ui-*.js`, `app/styles.css`, `app/index.html` | Rendering only; every write goes through `core.js` |
| `verify.mjs` | 88 acceptance checks (PRD §14), including a check that the seed matches the JSON verbatim |
| `Nexus_Starter_Tasks.json` | Starter records as supplied |
