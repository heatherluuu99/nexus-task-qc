# Nexus — evidence-based task QC and delivery

**Live:** https://nexus-task-qc.vercel.app · **Written answer:** the three sections below.
`NOTES.md` holds the same text on its own, inside the 800-word cap; everything under
*Appendix* on this page is extra README material, not part of it.

## Try it — 3 steps

1. Open the live link above, or `app/index.html` locally (if your browser blocks local scripts:
   `python3 -m http.server 8765 -d app`). It opens on the **Review Queue**. Reloading resets to the
   four records in `Nexus_Starter_Tasks.json`.
2. **Accepted path and repair path.** As *Reviewer*: open **B01** and approve it — 0/1 agent pass, yet
   eligible. Open **D01** → Pass Audit → draw the sample → audit the run as an invalid pass → request
   changes. Switch to *Engineer* → **Edit → creates v2** (grader type `state_assertion`) → record a run,
   add solvability evidence, submit. Back as *Reviewer*, approve v2.
3. **Delivery and the pilot update.** As *Delivery Manager*: Delivery Sets → DS-001 → add B01@v1 →
   deliver → record customer results (40→82 / 34→35). On B01, import a customer trace with the wrong
   final state; as *Reviewer* audit it invalid; then flag the post-delivery issue.

`node verify.mjs` runs 88 acceptance checks against the same `core.js` and `seed.js` the page loads.

---

## Task 1 — MVP Design

**Bet: Pool B (Procurement) — ~100 verified tasks first, 500 staged.**

B alone carries positive solvability evidence: an expert solved five. Its
contracts/quotes/orders workflows are cross-document, cross-policy, cross-tool — Aster's gap. Targeted capability: multi-constraint persistence across tools and updates.
I challenge the volume target: 500 tasks from one template are correlated failures — one lesson
taught 500 times.

**Buy vs. build:** Aster has templated support tasks already; what it cannot cheaply build is the
validation apparatus — solvability proof, state-asserting graders, failure attribution.

**12 expert-hours:** B 5h (solvability, constraint taxonomy) · D 3h (state-assertion graders) ·
C 3h (reset noise vs. real failures) · A 1h (confirm the kill).

**Rejected — scaling A:** the only route to 500 now, but its 12 labels are one template.

| | |
|---|---|
| **Capabilities** | (1) Immutable versions; delivery sets freeze version IDs. (2) Review bound to a version: expected vs. actual state, random pass audit, reason required. (3) Delivery gate plus customer results linked to the snapshot. |
| **Deferred** | Standalone dashboard; auth and production infrastructure. |
| **Diversity** | Structural fingerprint — structure, tools, expected paths — not labels → A's 12 collapse to 1; a twin blocks delivery. |
| **Realism** | Real documents and policy, expert-solved under the same budget → holds C. |
| **Complexity** | ≥2 interdependent constraints in final state, ≥2 tools → excludes A; D fails the grader gate. |
| **Data model** | `Task` 1:N `TaskVersion` (`content_hash`, `constraints[]`, `expected[]`, `grader_type`, solvability) → `Run` (captured state, check results) → write-once `Audit`; `Review` on `version_id`; `DeliverySet` N:M `TaskVersion`, frozen at delivery. |
| **Assumption** | Reported failure rates are unverified — not difficulty evidence until graders assert final state. |
| **Tests** | Does gating on audited, state-graded evidence change what ships? |

## Task 2 — Prototype

Four starter records, one reported run each; rates show low n, nothing invented.

**Model failure (accepted):** B01 — the agent picked cheaper Vale and broke the April 20 arrival
constraint; the state grader caught it; an expert solved it. Approved at 0/1 agent pass, eligible.
**Needs repair:** D01 — the message grader passed a run that left the release document at April 17;
a random audit marks it invalid → Confirmed Issue. C01 is blocked: its reset points at a missing snapshot.
**Return → edit → re-review:** D01 v1 returned; the engineer's edit minted D01@v2 (new hash, no
inherited evidence); a run, evidence and review approved v2. v1 keeps its decision.

**Worked:** eligibility reads only a version's own evidence, so a v2 draft never un-ships v1.
**Limitation:** evidence is typed in by hand: no attempt id, environment image or executable grader,
so a buyer cannot re-derive a pass. The manifest exports every run, audit and review, and names what it omits.

## Task 3 — Launch, measure, adapt

**First 48 hours.** Aster's kickoff hour buys the trace and final-state export format. Owners — DataOps lead (20h): resets, grader conversion, delivery; three experts author (9h/wk), three review (9h/wk); I own the weekly Aster call and the feedback log. Week one spends 12 of 18 hours on the pools, so authoring yields ~6;
volume comes from verifying B's 40 and D's 60. Two tests: two authors write from one B recipe — do the structures differ? Three reviewers
attribute the same five traces — target ≥4/5 agreement. If Aster is unavailable we withhold 20 tasks and proceed.

**Measures:** held-out lift · grader false-positive rate from random audits · expert-hours per delivered version.
**Ask the lab for** a matched-compute control and one repeat, held-out reported separately.
Expand: held-out lift confirmed by that control, false positives under 5%. Revise: training lift large,
held-out flat. Stop: flat after a diversity fix, or cost above their internal build.

**Pilot update.** 40→82 against held-out 34→35 is memorisation or grader exploitation; the ten
inspected attempts were conveniently selected, so 3/10 estimates nothing. *Priority investigation:* a random audit sweep across the snapshot, for a real false-positive rate. *Scope change:* stop new authoring; re-grade the batch on final state.

*Prototype change:* customer traces now enter Pass Audit on the delivered version.
Before: B01@v1 in DS-001 is eligible. After importing a wrong-final-state trace and auditing it
invalid: Confirmed Issue, not eligible; flagging it withdraws the version while the snapshot stays
unchanged. Customer audits prove a defect exists; only random audits estimate its rate.

**Buyer message (76 words)**

> Recommendation: pause expansion one week. The 82% on training tasks isn't capability —
> held-out moved 34% to 35%. Separately, 3 of 10 inspected passing attempts left the wrong
> final state, and those 10 were conveniently selected, so the true false-pass rate is
> unknown. Next: we audit a random sample of passing attempts and re-grade the batch on final
> state. We need a matched-compute control run and one repeat to read any lift. Corrected
> collection by Friday.

## Setup, checks, limitations

Open `app/index.html` (or `python3 -m http.server -d app`). `node verify.mjs` runs 88 checks
against the same core the page loads. AI disclosure: built with Claude Code; flows checked in the browser and by the tests.
Live prototype: https://nexus-task-qc.vercel.app

---

# Appendix (README only)

## Pages

| Page | Answers | Main actions |
|---|---|---|
| Task Library | Which versions need review, have grader issues, or can ship? | Filter, create task, open a version |
| Task Detail / Review | Is this exact version worth delivering, and what is the evidence? | Record runs, random pass audit, attribute failures, log grader issues, decide, edit → new version |
| Delivery Sets | Can this batch ship, and what happened after it did? | Add eligible versions, validate, deliver (frozen snapshot), customer results, post-delivery issue |

## Rules the prototype enforces

- **Execution ≠ quality.** Agent pass rate and review status are separate columns and separate header groups.
- **Versions are immutable.** Editing mints `task@vN#hash`; runs, audits and reviews do not carry over.
- **Eligibility is computed per version** from six gates: approved · solvability evidence · grader asserts
  every expected state row · required random audits done · no grader issue · metadata complete. A newer
  draft never affects an older approved version.
- **Evidence cannot certify itself.** Runs cannot carry an audit result or a hand-typed score; audits are
  write-once; authors cannot audit or review their own versions, and nobody can audit a run they recorded.
- **Random, not convenient, samples.** Passes ≤ 5 are all audited; otherwise max(5, 30%) are drawn with a
  recorded seed. Only random audits count toward validity. A delivered set can also draw one sweep across
  every version in the snapshot.
- **Failures are attributed to a constraint**, derived from the captured final state, so you can see whether
  the model trips on the constraint the task was built to test.
- **Duplicates are caught by shape, not by label.** A structural fingerprint flags twins, blocks a batch
  holding two of them, and warns when the customer already has that shape.
- **Snapshots are frozen.** A delivered set keeps its exact versions. A later defect withdraws the version
  and adds a notification to-do; the snapshot is unchanged.
- **Customer results never recommend scaling.** Held-out and training results sit side by side with the
  experiment-design gaps.

## Files

| Path | |
|---|---|
| `app/core.js` | Pure logic: versions, runs, audits, grader health, gates, review, delivery, duplicates, customer results |
| `app/seed.js` | The four starter records plus their structured extensions (constraints, expected state, grader checks) |
| `app/ui-*.js`, `app/styles.css`, `app/index.html` | Rendering only; every write goes through `core.js` |
| `verify.mjs` | 88 acceptance checks, including a check that the seed matches the JSON verbatim |
| `Nexus_Starter_Tasks.json` | Starter records as supplied |
