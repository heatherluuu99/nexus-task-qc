# Nexus — Supporting Notes

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
against the same core the page loads. Time: [fill in]. AI disclosure: built with Claude Code; flows checked in the browser and by the tests.
