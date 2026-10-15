# Coding-Model Prompt Templates (A–G)

Copy a template, replace every `[PLACEHOLDER]`, and send it. Templates are model- and provider-neutral. Placeholders:

| Placeholder | Fill with |
| --- | --- |
| `[WORKSTREAM ID]` | e.g. `WS-CAT` |
| `[WORKSTREAM NAME]` | e.g. `Item Categorizer & Ingestion` |
| `[DEVELOPER]` | Dev A / B / C / D |
| `[CURRENT PLAN]` | e.g. `WS-CAT-P2 — Canonical Ingestion Gateway (local Plan 2 of 3)` |
| `[PLAN FILE]` | path, e.g. `docs/implementation-plan/workstreams/WS-CAT/plan-002-canonical-ingestion-gateway.md` |
| `[PLAN TEXT]` | full contents of the plan file (always pasted for chat-only models; pasted or read for agents) |
| `[SEQUENCE OVERVIEW]` | the table from `tracking/state/[WORKSTREAM ID].md` §1 |
| `[STATE FILE]` | contents of `tracking/state/[WORKSTREAM ID].md` |
| `[ARCHITECTURE FILES]` | paths + sections from `execution-manual.md` §1.4 for this workstream |
| `[CONTRACTS]` | merged contract files/sections this plan consumes or produces |
| `[OWNED FILES]` | the plan's §4 table |
| `[TEST COMMANDS]` | the plan's §9 commands + `npm --prefix backend test`, `npm run build`, `npx oxlint` |
| `[ACCEPTANCE]` | the plan's §10 criteria |
| `[PREVIOUS HANDOFF]` | last Template E output for this workstream (or "none — first plan") |
| `[REPO ACCESS]` | `You can read files and run commands in the repository.` **or** `You cannot access the repository; the relevant file contents are pasted below.` |

---

## Template A — Initial context and workstream setup
```
You are the coding agent for workstream [WORKSTREAM ID] ([WORKSTREAM NAME]) of FinMate AI, owned by [DEVELOPER].
[REPO ACCESS]

PROJECT FACTS (do not change them):
- FinMate AI is a B2B personal-finance coach: Express 4 + node:sqlite backend (Node >= 22.5, CommonJS) in backend/,
  React 19 + Vite in src/, delivered as an Electron desktop app. One backend, one database (ADR-01).
- Components: John (orchestrator/chat), Atlas, Nova, Iris (LLM specialists via a shared runner), Sentinel (deterministic
  analytics, 17 functions + rule library), Item Categorizer (deterministic), Action Service, Tool Gateway, Snapshot,
  Budget Monitor, Profile, Ingestion, LLM Adapter (Qwen prototype via OpenAI-compatible API; tests use a fake provider).
- Money is integer paise (*_minor) and basis points (*_bp), half-even rounding, never floating point.
- Only the Action Service writes plan/profile/categorization state (through owner executors); LLM output never authorizes
  a write; T2/T3 actions need the user's Confirm on a card; T1 needs an intent token.
- Every user-visible number is bound to a tool result via placeholders; no fabricated tool_result_id, no mock data.

AUTHORITATIVE DOCUMENTS (read the sections listed; they override anything you assume):
[ARCHITECTURE FILES]
Global rules: docs/implementation-plan/README.md ("Global rules for every plan").
File ownership: docs/implementation-plan/workstream-assignments.md §4–§5.

YOUR SEQUENCE (local numbering; other workstreams have their own Plan 1..N — always use full IDs like WS-PLT-P1):
[SEQUENCE OVERVIEW]

CURRENT STATE:
[STATE FILE]

RULES FOR THIS SESSION:
1. You will implement exactly ONE plan, given in the next message. Do not start any other plan.
2. Inspect existing code before proposing changes; reuse what exists; do not rewrite working code.
3. Edit only files listed in the plan's "Files and ownership" table. Anything else: stop and ask.
4. Do not invent APIs, routes, tables, events, action names, env vars or dependencies. If something you need is missing
   from the plan, the specifications or merged contracts, stop and report it.
5. STOP AND ESCALATE (do not decide) if the work would change the architecture, a shared contract/schema, financial
   correctness, a security boundary (auth, consent, tokens, isolation, LLM data minimisation) or the data model.
6. Never delete, skip or weaken an existing test. If a test contradicts the spec, report it.
7. Evidence over claims: completion means passing commands with output shown.
8. One plan = one branch = one PR. Never split the plan; if it grows, add commits in plan-step order.

Reply only with: (a) your one-paragraph understanding of this workstream, (b) the documents you read, (c) any
conflict you already see between the documents and the code. Then wait for the plan.
```

## Template B — Execute one plan
```
Implement [CURRENT PLAN] now. Plan file: [PLAN FILE].

[PLAN TEXT]

CONTRACTS YOU CONSUME OR PRODUCE (do not alter them unless this plan produces them; if it does, write them as the FIRST commit and stop for consumer approval before continuing):
[CONTRACTS]

PREVIOUS HANDOFF:
[PREVIOUS HANDOFF]

ALLOWED FILES (plan §4) — touch nothing else:
[OWNED FILES]

WORK IN THIS ORDER:
1. Inspection report first (no code yet): for each file in the allow-list, what exists today and what the plan needs;
   dependencies from plan §2 and whether they are present on this branch; conflicts or unclear points.
   Then WAIT for my "go".
2. After "go": follow plan §6 steps in order. Write tests first where the plan says so. Keep commits small; message
   format: "[WORKSTREAM ID]-P<n>: <what>".
3. Run: [TEST COMMANDS]
   Show the exact commands and their output (pass/fail counts). If something fails, diagnose before changing code.
4. Check each acceptance criterion with evidence:
[ACCEPTANCE]
5. Produce the handoff using Template E headings.

OUT OF SCOPE: later plans in this sequence, other workstreams' files, refactors not required by the plan,
new dependencies, UI/UX changes not in the plan. If you believe something out of scope is required, say so and stop.
```

## Template C — Review completed work (fresh session; different model if possible)
```
You are an independent reviewer for FinMate AI. You did not write this code. Be strict and concrete.
[REPO ACCESS]

PLAN UNDER REVIEW: [CURRENT PLAN]
[PLAN TEXT]

ALLOWED FILES (plan §4):
[OWNED FILES]

DIFF (or branch name ws-<id>/p<n>-<slug> against main):
[PASTE `git diff --stat main...HEAD` AND THE FULL DIFF, OR GIVE THE BRANCH]

TEST OUTPUT (as run by the developer):
[PASTE OUTPUT OF TEST COMMANDS]

CHECK AND REPORT, citing file:line for every finding:
1. Scope: any file outside the allowed list? any work belonging to a later plan or another workstream?
2. Invented elements: functions, routes, tables, events, action names, env vars, dependencies not in the plan,
   specifications or merged contracts.
3. Contract conformance against: [CONTRACTS]
4. FinMate invariants: integer paise/bp and half-even rounding (no float money); writes only via the Action Service;
   no T2/T3 execution without a confirm token; tokens never in proposal responses or LLM input; every query scoped by
   user_id; grounding (no unbound numbers, no fabricated tool_result_id); no mock data or hardcoded financial results;
   no secrets.
5. Tests: deleted/skipped/weakened assertions? do new tests actually exercise the change? missing tests for plan §9?
6. Acceptance: for each item below, PASS / FAIL / NOT EVIDENCED with the evidence you used:
[ACCEPTANCE]
7. Security and failure handling relevant to this plan (Doc 5 S-1..S-16, RL-1..RL-8 where applicable).

OUTPUT: a table of findings (severity BLOCKER / MAJOR / MINOR, file:line, problem, smallest fix), then a verdict:
APPROVE, APPROVE WITH MINOR FIXES, or REQUEST CHANGES. Do not rewrite the code yourself.
```

## Template D — Debug and repair
```
Debug a failure in FinMate AI, plan [CURRENT PLAN]. Find the root cause BEFORE changing any code.
[REPO ACCESS]

FAILING COMMAND AND FULL OUTPUT:
[PASTE COMMAND + OUTPUT VERBATIM]

WHAT CHANGED RECENTLY: [PASTE `git log --oneline -10` AND `git diff --stat main...HEAD`]
RELEVANT CONTRACTS / SPEC SECTIONS: [CONTRACTS]
ALLOWED FILES: [OWNED FILES]

PROCEDURE:
1. Reproduce: state the exact command you run and confirm the same failure.
2. Diagnose: explain the root cause with evidence (file:line, values). List at least two hypotheses you ruled out.
3. Classify: (a) bug in this plan's code, (b) wrong test, (c) contract mismatch with another workstream,
   (d) environment/tooling. For (b), (c) or any fix that would change a contract, money logic, a security boundary
   or the data model: STOP and report — do not change code.
4. For (a) or (d): propose the minimal fix, then apply it.
5. Re-run the failing test, then the full suite: [TEST COMMANDS]. Show outputs.
6. Report: root cause, fix, files changed, tests run, anything still unexplained.
Never delete, skip or loosen a test to make it pass.
```

## Template E — Handoff to the next plan or session
```
Write the handoff for [CURRENT PLAN] using exactly these headings. Facts only; every claim must be checkable.
Status: COMPLETE | PARTIAL (session ended) | BLOCKED
Plan: [CURRENT PLAN]
Branch / PR: <name / link>
Commits: <`git log --oneline main..HEAD`>
Files changed: <`git diff --stat main...HEAD`>
Implemented: <bullets mapped to plan §6 step numbers>
Not done (if PARTIAL): <remaining plan §6 steps, exact next action>
Tests executed: <command → pass/fail counts>; new test files: <list>
Acceptance criteria: <each plan §10 item → evidence or outstanding + reason>
Contract changes: <none | file + consumers notified + PR>
Decisions/assumptions made: <list; mark any that need owner approval>
Known limitations / temporary stubs (with TODO tags): <list>
Risks: <list>
Next eligible plans (from plan §13, only if COMPLETE): <IDs>
Integration instructions: <migrations, env vars, seed steps, routes-inventory updates>
Update for tracking/state/[WORKSTREAM ID].md: <3–6 lines to append>
```

## Template F — Cross-workstream integration
```
Integrate work from two FinMate workstreams and find incompatibilities. Do not redesign either side.
[REPO ACCESS]

PRODUCER: [PRODUCER PLAN ID] (owner [DEVELOPER]) — branch/commit: [REF]
CONSUMER: [CONSUMER PLAN ID] (owner [DEVELOPER]) — branch/commit: [REF]
DEPENDENCY ROW(S) from docs/implementation-plan/cross-workstream-dependencies.md: [PASTE ROWS]
CONTRACT (authoritative): [PASTE SCHEMA FILE / SIGNATURES / SPEC SECTION]

CHECK:
1. Interface compatibility: names, parameter shapes, return shapes, error codes, event payloads, HTTP paths/bodies
   against the contract — list every mismatch with file:line on each side.
2. Shared files: did both sides edit the same file (git diff on both refs)? conflicts? ownership rules followed
   (workstream-assignments.md §4–§5)?
3. Merge rehearsal: on a scratch branch from main, merge producer then consumer; run [TEST COMMANDS]; report regressions.
4. Hidden assumptions: anything one side assumes that the contract does not state (ordering, idempotency, units,
   paise vs rupees, time zone IST, null handling).
OUTPUT: mismatch table (side that deviates from the contract, smallest fix), merge-rehearsal results, and a list of
questions the two owners must decide. If the contract itself is ambiguous, say so — do not choose for them.
```

## Template G — Final workstream verification
```
Verify that workstream [WORKSTREAM ID] is complete. Do not trust earlier claims; check evidence on main.
[REPO ACCESS]

SEQUENCE: [SEQUENCE OVERVIEW]
WORKSTREAM ACCEPTANCE (acceptance-checklist.md §3, row [WORKSTREAM ID]): [PASTE ROW]
PLANS' ACCEPTANCE (§10 of each plan): [PASTE OR GIVE PATHS]
HANDOFFS: [PASTE ALL HANDOFFS OF THIS WORKSTREAM]

DO:
1. For every plan Plan 1..N: confirm the PR is merged to main (`git log --oneline --grep "[WORKSTREAM ID]-P<n>"`),
   every plan-level criterion has evidence, and no TODO/temporary stub from that plan remains
   (`git grep -n "TODO([WORKSTREAM ID]"`).
2. Run on a clean checkout of main: `npm ci`, `npm --prefix backend ci`, [TEST COMMANDS], `npm run reset-demo`
   (if it exists). Show outputs.
3. Check the workstream acceptance row item by item with evidence.
4. Check integration acceptance items the workstream contributes to (gates in roadmap.md §6) and report which are
   satisfied.
5. List spec acceptance IDs (e.g. CAT-AC-xx, SEN-AC-xx) claimed by the plans and confirm each maps to a passing test.
OUTPUT: checklist with PASS / FAIL / NOT EVIDENCED per item, open defects, and a final verdict:
WORKSTREAM COMPLETE or NOT COMPLETE (with the smallest remaining actions).
```
