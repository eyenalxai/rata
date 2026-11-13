# Agent documentation audit: rata

Date: 2026-11-12
Status: answered

Scope: repository at `d508686`, installed skill at `~/.agents/skills/rata`
(byte-identical to the repository), and the T3 state database snapshot at
2026-11-12T19:05Z.

Abbreviations used below:

- **R**: `README.md`
- **A**: `AGENTS.md`
- **G**: `GLOSSARY.md`
- **T**: `docs/agents/issue-tracker.md`
- **L**: `docs/agents/triage-labels.md`
- **D**: `docs/agents/domain.md`
- **S**: `skills/rata/SKILL.md`
- **F**: `skills/rata/reference.md`
- **C**: source under `src/`

## Question

Does the rata documentation corpus teach an agent what it needs, in the order it
needs it, without duplication or drift, and what should the corpus look like
instead?

## Answer

No. The corpus has the right facts, but it puts them in the wrong documents, in
the wrong order, and in too many copies.

The load path is inverted. The skill says read the tracker doc first. The
tracker doc does not say load the skill. The phase skills say read "the tracker
doc". In practice the tracker doc is the entry point and the skill is a
rata-development document. Only 46 of 538 rata threads (8.6%) loaded the skill.
Twenty-two of those 46 are in the rata repository itself. In the other
repositories, the skill load rate is 5.2%. Half the threads (269, 50.0%) read
neither the skill nor the tracker doc, and 328 (61.0%) ran the first rata
command before reading either.

The duplication causes the drift. About 30 command, flag, shape and rule
families appear in three to five files. The copies disagree on `--no-body`, the
priority rule, assignment in create examples, bulk labels on maps, close-state
examples and dry-run JSON shapes. Most of these errors exit 0. The observed
command failure rate of 1% to 2% does not measure them.

The docs that protect correctness are in the document agents read least. Auth,
link hazards, write result shapes and close semantics live in the README. Only
21 of 538 threads (3.9%) read the rata README. The tracker doc, which 267 threads
read, is a 225-line CLI manual. Its Conventions section is 135 lines and 9,334
characters, 65% of the doc. The spec and wayfinding sections are 25% of it.

The corpus should have four layers. An 80-line skill covers the first command.
A 50-line tracker doc covers repo facts. A lookup reference covers flags and
shapes. A human README covers install, auth, the full catalog and examples. Each
rule gets one owner. Duplicate only the entry contract and the few repo facts
that the phase skills must see.

## Evidence

### 1. Token cost

Counts are from the working tree. Tokens are `characters / 4`. A tokenizer gives
roughly 10% more or less. The comparison matters more than the absolute number.

| Document                        | Lines | Characters | Approx. tokens | Role                       |
| ------------------------------- | ----: | ---------: | -------------: | -------------------------- |
| `README.md`                     | 1,474 |     69,099 |         17,275 | Human manual               |
| `AGENTS.md`                     |   172 |      9,037 |          2,259 | Repo contract, auto-loaded |
| `GLOSSARY.md`                   |   164 |     10,280 |          2,570 | Domain vocabulary          |
| `docs/agents/issue-tracker.md`  |   225 |     14,408 |          3,602 | Repo tracker doc           |
| `docs/agents/triage-labels.md`  |    23 |      1,281 |            320 | Label mapping              |
| `docs/agents/domain.md`         |    43 |      1,285 |            321 | Domain configuration       |
| `skills/rata/SKILL.md`          |   359 |     17,743 |          4,436 | Global skill               |
| `skills/rata/reference.md`      |   404 |     31,830 |          7,958 | Command lookup             |
| Skill description (frontmatter) |     1 |        327 |             82 | System-prompt trigger      |

Common combinations:

| Load                 | Files                         | Characters | Approx. tokens | Share of all eight docs |
| -------------------- | ----------------------------- | ---------: | -------------: | ----------------------: |
| Tracker doc only     | T                             |     14,408 |          3,602 |                      9% |
| Skill only           | S                             |     17,743 |          4,436 |                     11% |
| Skill plus tracker   | S + T                         |     32,151 |          8,038 |                     21% |
| Skill plus reference | S + F                         |     49,573 |         12,393 |                     32% |
| All four agent docs  | R + T + S + F                 |    133,080 |         33,270 |                     86% |
| All eight docs       | R + A + G + T + L + D + S + F |    154,963 |         38,741 |                    100% |
| Session start        | A + description + T           |     23,772 |          5,943 |                     15% |
| Human start          | R + A + G                     |     88,416 |         22,104 |                     57% |

The entry path that the phase skills actually use (tracker doc only) costs
3,602 tokens. The path the skill assumes (skill plus tracker) costs 8,038. The
worst case costs 33,270. A mission session also loads the mission skill
(24,277 characters, about 6,069 tokens) and the mission template (5,308
characters, about 1,327 tokens). The four rata docs can cost 4.5 times the phase
skill that drives the work.

Empirical read sizes show that agents often read a section, not the full file.
The counts cover all threads in the database, not only rata threads.

| Document       | Read events | Threads | Average characters per read | Average tokens per read | Full-doc tokens |
| -------------- | ----------: | ------: | --------------------------: | ----------------------: | --------------: |
| `SKILL.md`     |          26 |      22 |                      10,384 |                   2,596 |           4,436 |
| `reference.md` |          28 |      23 |                      15,744 |                   3,936 |           7,958 |
| Tracker doc    |         216 |     200 |                       7,353 |                   1,838 |           3,602 |
| Rata README    |          64 |      25 |                      13,159 |                   3,290 |          17,275 |

The average tracker read is half the full doc. The average skill read is 59% of
the full skill. Agents already treat these files as lookup sources. The files
should be built for that use.

### 2. Duplication and drift

I compared every pair of docs with 8-word shingles. The overlap is large:
README to reference 566 shared shingles, README to skill 411, skill to reference
367, tracker to skill 225. The table groups the repeated passages by surface. A
row with four locations has four copies of the same rule. The rows name command
and rule families. The cited passages list the individual flags inside a family.
The families cover every command group in the CLI surface.

|   # | Surface                                                                                           | Copies | Locations                                                                     | Risk   |
| --: | ------------------------------------------------------------------------------------------------- | -----: | ----------------------------------------------------------------------------- | ------ |
|   1 | Canonical form table                                                                              |      4 | R:86-99, S:21-35, F:30-44, T:136-140                                          | High   |
|   2 | Read shapes table                                                                                 |      4 | R:103-126, S:39-55, F:168-199, T:15-27                                        | High   |
|   3 | JSON contract: `--json`, `--fields`, error object, exit codes                                     |      5 | R:128-193, S:57-66, F:6-23, F:53-87, T:14-27, G:158-163                       | High   |
|   4 | Paging: `--limit`, `--after`, `--all`, `pageInfo`, cursor                                         |      5 | R:256-303, S:173-194, F:13-15, F:247-263, T:142-154, G:135-143                | High   |
|   5 | `issue show` read flags: `--summary`, `--comments`, `--no-*`                                      |      4 | R:917-954, S:128-138, F:193-199, T:59-67                                      | High   |
|   6 | `issue list` filters, `--include relations`, `--sort`, caps                                       |      4 | R:771-834, S:68-73, S:105-109, F:201-225, T:96-105                            | High   |
|   7 | `issue status`, `next`, `why`                                                                     |      4 | R:825-866, S:140-146, S:338-355, F:150, F:177, F:227-232, T:68-72, T:203-216  | Medium |
|   8 | Section editing and safe body write                                                               |      5 | R:1076-1106, S:148-165, F:311-337, T:73-93, G:48-60                           | High   |
|   9 | `issue create` defaults and flags                                                                 |      4 | R:730-767, R:1108-1144, S:267-293, F:268-284, T:31-52                         | High   |
|  10 | `issue update` flags: `--append`, `--comment`, `--if-unchanged`, `--state`                        |      4 | R:1115-1159, S:259-263, F:285-296, T:88-95                                    | High   |
|  11 | Comment lifecycle: create, update, delete, `--wait`, `--dedupe-key`                               |      4 | R:1171-1260, S:236-265, F:298-309, T:106-115                                  | High   |
|  12 | Bulk writes by `--parent`                                                                         |      4 | R:1262-1301, S:208-218, F:373-399, T:118-123                                  | High   |
|  13 | Write mechanics: dry-run list, dry-run shapes, idempotency, read-after-write, write result shapes |      4 | R:1303-1421, S:167-171, S:55, F:348-371, F:401-404, T:34-35, T:53-58, T:58    | High   |
|  14 | Link, repository config, legacy `.rata.json`                                                      |      5 | R:630-728, S:75-97, F:91-123, T:127-134, G:113-127                            | High   |
|  15 | Stale team key in `status`                                                                        |      4 | R:207-210, S:94-97, F:117-119, T:8-13                                         | Medium |
|  16 | Auth and workspace profiles                                                                       |      3 | R:305-384, F:91-99, G:128-134                                                 | High   |
|  17 | Priority values and the priority rule                                                             |      5 | A:158-160, T:36-40, S:220-234, G:38-40, R:789                                 | High   |
|  18 | Assignee rule and claim                                                                           |      4 | A:158-161, T:41-48, S:216-218, R:590-592, R:1116                              | High   |
|  19 | Triage roles and label strings                                                                    |      5 | A:163-167, L:8-22, G:87-89, S:198-206, R:1370-1372                            | High   |
|  20 | Wayfinding map, child, blocking, frontier, claim, resolve                                         |      4 | T:189-226, S:312-355, R:60-61, R:603, R:825-841, G:96-104                     | High   |
|  21 | Specs and tickets                                                                                 |      4 | R:584-602, T:171-187, S:295-310, G:90-93                                      | High   |
|  22 | Close and reopen                                                                                  |      4 | R:1129-1130, R:1367-1368, F:164-165, T:124, T:187, T:220, S:265, S:335        | High   |
|  23 | `issue link` relation flags and semantics                                                         |      5 | R:1137-1139, R:1161-1166, F:339-347, T:180-181, T:199-202, S:288-293, G:69-72 | Medium |
|  24 | Issue reference forms                                                                             |      4 | R:917, S:120, F:5, T:127-128                                                  | Low    |
|  25 | `team show` states, labels, members, priorities                                                   |      4 | R:392-423, S:103-104, S:117-118, F:130, T:28-30                               | Medium |
|  26 | `config show`, `config set`, `config unset`                                                       |      4 | R:730-767, S:277-286, F:106-109, T:49-52                                      | Medium |
|  27 | `--body`, `--body-file -`, `--comment-file -`                                                     |      4 | R:1361-1363, S:236-237, F:16, T:31                                            | Medium |
|  28 | Section errors: `not_found`, `ambiguous`                                                          |      3 | R:1105-1106, F:315-316, T:91-93                                               | Medium |
|  29 | Summary fields                                                                                    |      4 | R:925-928, G:148-152, S:45, F:198-199                                         | Medium |
|  30 | Dedupe key derivation                                                                             |      5 | R:1189-1193, F:301-303, S:247-257, T:111-113, G:144-147                       | Low    |
|  31 | Link side effects: terminal prompt, env key, timezone                                             |      3 | R:640-643, R:655-657, R:681-684, S:83-87, T:131-134                           | High   |
|  32 | Install and admin: teams, projects, labels, auth                                                  |      2 | R:20-36, R:386-628, F:91-139                                                  | Low    |

The following passages disagree, or one copy is incomplete in a way that
changes a write or a parse. Each finding cites the doc passages and, where
relevant, the code that settles the question.

| ID  | Passage                       | Doc A says                                                                                                                     | Doc B says                                                                         | Truth                                                                                                                                                           | Fix                                                                |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| D1  | `--no-body` fetch             | R:930-931: drops the description from output, still fetches it                                                                 | S:130, F:196-198, T:63-65: the `--no-*` flags skip their fetches                   | README is right. `C:src/cli/issue/show.ts:57-65` removes the field from output. `C:src/cli/issue/show.ts:108-113` always fetches the detail.                    | Fix S, F and T.                                                    |
| D2  | Priority rule                 | A:158-160 and T:36-40: every issue must carry a priority                                                                       | S:220-234: only actionable issues, `needs-info` and `wontfix` may stay `none`      | No code enforcement. The two policies conflict.                                                                                                                 | Choose the triage-compatible rule and state it once.               |
| D3  | Assignee in create examples   | T:177-179 includes `--assignee me`                                                                                             | S:301-303, R:590-592 and R:1116 omit it                                            | `issue create` applies repository defaults. If the default is unset, the issue is unassigned and the command exits 0.                                           | Add `--assignee me` to every non-map create example.               |
| D4  | Bulk labels on a map          | T:118-123: bulk repair is for a spec's tickets, not a wayfinder map                                                            | S:216-218: label a map's children in bulk, claim them one by one                   | The CLI writes to every child. The tracker rule is the repo policy.                                                                                             | Remove the bulk-label advice from S.                               |
| D5  | Close state                   | S:262, R:1124 and R:1232 use `--state Done`                                                                                    | S:117-118 and T:29-30: do not guess a state name; T:124 uses `issue close`         | `issue update --state Done` resolves a name. A team without a `Done` state fails. `issue close` selects a state of type `completed`.                            | Use `issue close` in every example.                                |
| D6  | Dry-run JSON shape            | R:1352-1354 and F:357-359: `{dryRun, actions}`                                                                                 | F:303 and F:318-321: `{dryRun, action, ...}` for comments and sections             | Both shapes exist. `C:src/cli/output.ts:79-86` writes `actions`; `C:src/cli/issue/comment.ts:65-74` and `C:src/cli/issue/section.ts:59-78` write one `action`.  | Publish a shape table by command.                                  |
| D7  | Failure output                | R:138-142 and F:53-57: bulk writes and `issue update --comment` can write partial results to stdout                            | S:122-124 and T:23-27: a failed `--json` command writes one error object to stderr | README and reference are right. `C:src/cli/output.ts:51-67` sends errors to stderr; `C:src/cli/issue-write/update.ts:82-93` sends the partial update to stdout. | Fix S and T.                                                       |
| D8  | One canonical form            | R:86-99: each operation has one canonical form                                                                                 | R:1122 and F:287: `issue update --assignee` also assigns                           | The CLI accepts both `issue assign` and `issue update --assignee`.                                                                                              | Say "one spelling per operation", not "one command per operation". |
| D9  | Triage label strings          | L:3-4 and L:23: roles map to the strings in the table                                                                          | S:205-206 and R:1370-1372 hardcode the same strings                                | The mapping is identical today. A repo with different strings would make S and R wrong.                                                                         | S says read `triage-labels.md`; do not hardcode.                   |
| D10 | Close versus update state     | R:1124 and R:1232 use `--state Done`; R:1367-1368 says close sets a completed state                                            | T:124 uses `issue close`                                                           | `issue close` is the stable path. A state name is team-specific.                                                                                                | Remove the `--state Done` examples.                                |
| D11 | Link hazards                  | R:640-643: the prompt needs a terminal; R:655-657: `LINEAR_API_KEY` changes the target; R:681-684: link sets the team timezone | S:83-87 and T:131-134 omit all three                                               | README is right. The skill does not warn about a hang, a wrong profile or a team mutation.                                                                      | Put three lines in the skill entry section.                        |
| D12 | Auth before the first command | R:305-384 and F:91-99: `auth login --with-token`, profiles, key resolution                                                     | S:75-97 and T:8-13 start at `link` and `status`                                    | The first command in a fresh environment fails with `auth`. The skill has no path for it.                                                                       | Add auth to the skill entry section.                               |
| D13 | Write result shapes           | R:1374-1421: full shapes for create, update, close, assign, label, link, reopen                                                | F:303-321 covers comments and sections; S:55 says only "the write result object"   | README is the only complete source. An agent with S and T cannot parse a write reliably.                                                                        | Move the shape table to F.                                         |
| D14 | README documentation index    | R:1464-1470 lists GLOSSARY, tracker, triage labels, domain and AGENTS                                                          | It omits S and F                                                                   | A human who reads the README cannot find the agent skill.                                                                                                       | Add S and F to the list.                                           |

Stale forms:

- `issue assign me <ref>` is not in the current corpus. The canonical rejected
  form `issue assign <ref> me` appears at R:92, S:28, F:37 and T:47-48. The prior
  research file records the old failure at
  `docs/research/agent-usage-pain-points.md:19` and `:44`. The corpus has fixed
  it.
- `{issue: ...}` is not in the current corpus. R:919-920, S:131 and F:198-199
  say the issue object is at the top level. The prior research file records the
  old wrapper at `docs/research/agent-usage-pain-points.md:27` and `:90`. The
  corpus has fixed it.
- `issue comment <ref>` appears only as a rejected form at R:91, S:27, F:36 and
  T:106-108. The corpus has fixed it.
- The old label behavior is gone. `--label` on `issue create` adds to defaults
  everywhere (R:760-762, S:285-286, F:276, T:32-34). The remaining risk is the
  hardcoded mapping in D9, not a stale string.
- The installed skill copies are byte-identical to the repository. There is no
  installed-versus-repo drift at this commit.

### 3. Load path

What an agent sees at session start:

1. `AGENTS.md` if the harness auto-loads repo instructions. It says issues live
   in Linear, driven with `rata`, and points to `docs/agents/issue-tracker.md`
   (A:156-161). It also gives the priority and assignee rule (A:158-161).
2. The skill description (327 characters, about 82 tokens) if the harness lists
   skill descriptions. It triggers on Linear and names
   `docs/agents/issue-tracker.md` (S:3).
3. The tracker doc only if the agent follows A or a phase skill. The mission
   skill says "Read `AGENTS.md` and the tracker doc" (mission:46). Wayfinder says
   read the tracker doc's "Wayfinding operations" section (wayfinder:31). The
   other phase skills say "the issue tracker comes from the repo's agent docs"
   without a path (to-spec:18-19, to-tickets:12-13, implement-spec:12-13,
   code-review:15, triage:11).
4. The skill body only if the agent invokes the skill or reads its file. No
   phase skill tells it to. The tracker doc does not mention the skill.

The empirical load table uses 538 threads with a genuine `rata` command. The
strict command filter is a command word at the start of a shell segment,
optionally after `cd`, `&&`, `;`, `|` or `bun run`. The range is
2026-10-24T06:23Z to 2026-11-12T19:05Z. The table also gives the read-tool-only
definition, because many agents read the tracker doc with `cat`, `sed` or `rg`
instead of the read tool.

| Measure                         | Definition                                     | Threads | Share |
| ------------------------------- | ---------------------------------------------- | ------: | ----: |
| Rata threads                    | Genuine `rata` command                         |     538 |  100% |
| Skill loaded                    | Skill tool `rata`, or a read of `skills/rata/` |      46 |  8.6% |
| Skill tool invoked              | Skill tool `rata` only                         |      24 |  4.5% |
| Skill file read                 | Read of `skills/rata/` only                    |      25 |  4.6% |
| Tracker read, read tool         | `docs/agents/issue-tracker.md` read            |     130 | 24.2% |
| Tracker read, any               | Read tool or shell command                     |     267 | 49.6% |
| Neither, any                    | No skill and no tracker read                   |     269 | 50.0% |
| Neither, read tool              | No skill and no read-tool tracker read         |     391 | 72.7% |
| Rata README                     | Read tool, path in the rata repo               |      21 |  3.9% |
| Skill before first command      | Ordinal comparison                             |      27 |  5.0% |
| Skill after first command       | Ordinal comparison                             |      19 |  3.5% |
| Tracker before first command    | Ordinal comparison                             |     194 | 36.1% |
| Tracker after first command     | Ordinal comparison                             |      71 | 13.2% |
| First command before either doc | Ordinal comparison                             |     328 | 61.0% |

The prior count was 562 threads, 44 skill loads, 132 tracker reads and 413
neither. The current read-tool-only count is close: 538 threads, 46 skill loads,
130 tracker reads and 391 neither. The prior total sits between the strict count
(538) and the any-mention count (611), so its thread filter is not exactly
reproducible. The prior 132 is close to the read-tool tracker count (130), not
the any-read count (267). This suggests the prior query used the read-tool
definition. The direction is the same: the skill is rare, and the tracker doc is
the de facto entry point.

The skill tool and the file read are two routes to the same skill. They overlap
in 3 threads, so 24 plus 25 does not equal 46. The tracker read rows use the same
rule: a skill or tracker count can overlap the other, and "Neither" is the
complement of their union.

Repo split (majority path evidence, read-tool tracker count). The Skill and
Tracker columns can overlap. The Neither column is the complement of their
union.

| Repo            | Threads | Skill | Tracker | Rata README | Neither |
| --------------- | ------: | ----: | ------: | ----------: | ------: |
| founders-app    |     141 |     2 |      15 |           0 |     125 |
| rata            |      79 |    22 |      38 |          21 |      39 |
| jyoti           |      58 |     8 |      21 |           0 |      31 |
| harbagsa        |      58 |     3 |       7 |           0 |      49 |
| unknown         |      56 |     1 |       1 |           0 |      54 |
| fcy-app         |      36 |     4 |      11 |           0 |      23 |
| skills          |      28 |     1 |      15 |           0 |      13 |
| sikhu           |      23 |     2 |       8 |           0 |      14 |
| phaephe         |      21 |     1 |       6 |           0 |      15 |
| kachito         |      13 |     2 |       3 |           0 |       8 |
| other (8 repos) |      25 |     0 |       8 |           0 |      17 |

The skill load rate is 22 of 79 threads in the rata repo (28%). It is 24 of 459
threads in every other repo (5.2%). The skill is mostly loaded by agents who
work on rata, not by agents who use rata.

Doc readers do more rata work:

| Group                           | Threads | Commands | Failed commands | Failure rate | Median commands per thread |
| ------------------------------- | ------: | -------: | --------------: | -----------: | -------------------------: |
| Skill (with or without tracker) |      46 |      634 |               7 |         1.1% |                         13 |
| Tracker only                    |     101 |    1,572 |              32 |         2.0% |                         13 |
| Neither                         |     391 |    2,129 |              27 |         1.3% |                          2 |

The failure rate is a lower bound. Many commands pipe to `head`, so the pipeline
exit hides a rata failure. More important, the dangerous doc errors are silent
successes: an unassigned issue, a missing priority, a bulk label on a map, a
dropped body section and a guessed state all exit 0 or reach the wrong state
without a parse error. The 1% to 2% failure rate does not measure doc quality.

The load path breaks in four places:

1. **The tracker doc does not point to the skill.** An agent that starts from A
   or a phase skill reads T and never sees S. The skill's first instruction to
   read T (S:11-13) cannot fire, because the agent never loads S.
2. **The phase skills do not name the tracker doc path.** They say "the repo's
   agent docs" or "the tracker doc". A is the only bridge. If A is absent or
   different in a host repo, the agent must search.
3. **The first command can fail before any doc helps.** A fresh environment
   needs `auth login`. An unlinked repo needs `link`, and the prompt needs a
   terminal. The skill and the tracker doc both start after these steps.
4. **The docs that settle shapes and safety are off the path.** Auth, link
   hazards, write result shapes and close semantics are in R, which 3.9% of
   threads read. F has some of them, but no phase skill tells the agent to load
   F.

### 4. Fit to task

I read the ten phase skills under `~/.agents/skills/` and checked each against T
and S. "Fit" means the phase can find its tracker instructions in one named
section without reading the whole doc.

| Phase            | What it needs                                                               | Where it is now                                                                  | Fit                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `mission`        | Create or claim the record, replace a section, comment, close               | T:31-52, T:73-93, T:106-124. No "Mission record" heading.                        | Medium. The operations are in a 135-line bullet list.                                                                           |
| `wayfinder`      | Create a map and children, wire blocking, read the frontier, claim, resolve | T:189-226. Wayfinder:31 names the section.                                       | Good. The one named section is at the end.                                                                                      |
| `triage`         | Role mapping, read, label, priority, assign, comment, close                 | T:36-48, T:106-124. L:8-22 is not linked from T. S:196-265 has a Triage section. | Poor. The role mapping is in a separate file that T never names.                                                                |
| `to-spec`        | Create the spec, label it, set priority and assignee                        | T:171-187.                                                                       | Good.                                                                                                                           |
| `to-tickets`     | Create children, wire blocking edges, apply labels                          | T:171-187.                                                                       | Good. T says `--parent`; the phase skill says "sub-issue". The agent must map the term.                                         |
| `implement`      | Fetch one ticket                                                            | T:167-169.                                                                       | Good. One line.                                                                                                                 |
| `implement-spec` | List the spec's children with relations                                     | T:182-185.                                                                       | Excellent. The exact command is there.                                                                                          |
| `code-review`    | Resolve `#123` or `Closes #45` to an issue                                  | T:167-169 gives `issue show <ref>`. No rule for a bare `#42`.                    | Poor. The phase skill says "fetched with the workflow in the tracker doc" (code-review:43), but the workflow does not cover it. |
| `pr`             | Link the issue in the PR body, close on merge                               | T:156-160 covers PRs as an input surface only. No output convention.             | Poor. The `pr` skill says `Closes <issue>` (pr:109-110), but T does not say which identifier form Linear expects.               |
| `handoff`        | Work item title and team, never the id                                      | T:8-13 gives the team. T:167-169 gives the issue.                                | OK. Indirect, but enough.                                                                                                       |

Sections an agent never needs for the tracking loop:

| Document | Section                                                                     | Lines                                                | Why                                                  |
| -------- | --------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| R        | Install, Authentication, Teams, Projects, Labels, Breaking changes, License | 20-36, 305-384, 386-480, 482-602, 604-628, 1423-1475 | Human or admin. Lookup only.                         |
| R        | Usage catalog with team, project and label admin                            | 40-74                                                | Includes commands the tracker doc says not to use.   |
| S        | Set up a repository                                                         | 75-97                                                | First run only. Overlaps the tracker doc and `link`. |
| S        | Read before you write                                                       | 99-171                                               | Long tutorial. Most of it is lookup.                 |
| S        | Paging lists                                                                | 173-194                                              | Pure lookup. Belongs in F.                           |
| S        | Publish tickets, Specs and tickets, Wayfinding                              | 267-355                                              | Duplicates T and the phase skills.                   |
| T        | Conventions                                                                 | 6-140                                                | 65% of the doc. Most of it is CLI mechanics.         |
| F        | Conventions and One way per operation                                       | 3-44                                                 | Duplicates S.                                        |
| G        | All                                                                         | 1-164                                                | Domain vocabulary, not tracker commands.             |
| D        | All                                                                         | 1-43                                                 | Domain configuration, not tracker commands.          |

Sections an agent needs but must hunt for:

| Need                                              | Where it is                                                                          | Why it is hard to find                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Auth and profile resolution                       | R:305-384, F:91-99                                                                   | Neither S nor T mentions it. The first command can fail.                         |
| Link prompt, env key and timezone side effect     | R:640-643, R:655-657, R:681-684                                                      | S:83-87 gives the happy path only.                                               |
| `issue update --append`                           | R:94-95, R:1121, F:290-291, T:94-95                                                  | S does not mention it.                                                           |
| `config set --label` replaces the default list    | R:750, F:107                                                                         | S:282 and T:49-52 omit the replace behavior.                                     |
| `issue comment delete` needs `--yes` in JSON mode | R:1218-1221, F:308-309                                                               | S:258 says `--yes`, but not the JSON rule.                                       |
| `issue show --summary` fields                     | R:925-928, G:148-152                                                                 | S:45 and F:198-199 say "summary object" without the fields.                      |
| Full `issue list` filters                         | R:784-801, F:203-220                                                                 | S gives examples only.                                                           |
| Write result shapes                               | R:1374-1421                                                                          | F is partial. S has one line.                                                    |
| Dry-run shape exceptions                          | F:303, F:318-321, C:src/cli/issue/comment.ts:65-74, C:src/cli/issue/section.ts:59-78 | R and F's general rule says `actions`, which is wrong for comments and sections. |
| PR output convention                              | None                                                                                 | T covers PRs as input only.                                                      |
| Bare `#42` resolution                             | None                                                                                 | `code-review` needs it.                                                          |
| Triage label mapping                              | L:8-22                                                                               | T never links it. S hardcodes the strings.                                       |
| Map bulk-label prohibition                        | T:118-123                                                                            | S:216-218 says the opposite.                                                     |

## Conflicts

1. **Priority scope.** A:158-160 and T:36-40 require a priority on every issue.
   S:220-234 requires one only on actionable issues and allows `none` for
   `needs-info` and `wontfix`. The triage state machine makes the skill's rule
   more sensible. Recommended rule: every issue that leaves triage for
   `ready-for-agent` or `ready-for-human` carries a priority. `needs-triage`,
   `needs-info` and `wontfix` may stay `none`. Update A and T.
2. **Assignment in examples.** T:177-179 includes `--assignee me`. S:301-303,
   R:590-592 and R:1116 omit it. An agent that copies the skill example creates
   an unassigned issue when the repository default is unset. Recommended rule:
   every non-map create example includes `--assignee me`.
3. **Bulk labels on a map.** T:118-123 says bulk repair is for a spec's tickets,
   not a map. S:216-218 says label a map's children in bulk. The CLI cannot tell
   a map from a spec, so the docs must decide. Recommended rule: bulk `--parent`
   is for spec tickets only. Maps and their children are created with
   `wayfinder:*` labels and claimed one by one.
4. **Close state.** S:262, R:1124 and R:1232 use `--state Done`. S:117-118 and
   T:29-30 say do not guess a state name. `issue update --state Done` fails when
   the team has no state with that exact name. Recommended rule: close with
   `issue close`. Use `issue update --state` only with a name read from
   `team show`.
5. **`--no-body` fetch.** R:930-931 is correct. S:130, F:196-198 and T:63-65
   say the flag skips the fetch. The code always fetches the description and
   only removes it from the output. Recommended rule: `--no-body` changes the
   output only. `--no-relations`, `--no-children` and `--no-attachments` skip
   their fetches.
6. **Dry-run shape.** R:1352-1354 and F:357-359 say every JSON dry run returns
   `{dryRun, actions}`. F:303 and F:318-321 document one `action` for comments
   and sections. The code confirms both shapes. Recommended rule: list the
   shape by command in F. The skill should not state a single shape.
7. **Failure output.** R:138-142 and F:53-57 document the stdout exceptions for
   bulk writes and `issue update --comment`. S:122-124 and T:23-27 say stderr
   only. The code writes the partial result to stdout. Recommended rule: copy
   the README exception into S and T, or point to F.
8. **One form per operation.** R:86-99 says one canonical form. R:1122 and
   F:287 accept `issue update --assignee`, which is a second way to assign. The
   CLI accepts both. Recommended rule: say "one spelling per operation" and
   name the compound forms (`issue update --assignee`, `issue assign --assignee
none`, `issue update --state <completed>`) as explicit alternatives.
9. **Triage label strings.** L:3-4 and L:23 define a mapping. S:205-206 and
   R:1370-1372 hardcode the strings. The mapping is identical today, so the
   conflict is latent. Recommended rule: S and R say "read
   `docs/agents/triage-labels.md`; the role names are not the label strings."
10. **Load direction.** S:11-13 says read T first. T:1-4 does not mention S.
    The phase skills point to T, not S. Recommended rule: T starts with one
    line, "Load the `rata` skill before the first command." S starts with one
    line, "Read the tracker doc for repo facts." Each doc owns one layer.

## Proposed architecture

Four layers plus two supporting docs, one owner per rule:

| Layer   | File                                   |                                  Target | Owns                                                                                                                        | Must not contain                                           |
| ------- | -------------------------------------- | --------------------------------------: | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Entry   | `skills/rata/SKILL.md`                 |                            60-100 lines | Binary, auth and link checks; canonical forms; read loop; write loop; error handling; pointers                              | Full flag tables, JSON shapes, repo labels, admin commands |
| Repo    | `docs/agents/issue-tracker.md`         |                                50 lines | Team, project, label mapping pointer, priority and assignee rules, spec and ticket recipe, wayfinding recipe, PR convention | CLI tutorial, paging, error codes, section mechanics       |
| Lookup  | `skills/rata/reference.md`             |                           250-300 lines | Every command and flag, JSON read and write shapes, exit codes, dry-run shapes, field selection                             | Tutorial, repo conventions, motivation                     |
| Human   | `README.md`                            | Current length plus a table of contents | Product, install, auth, full catalog, examples, breaking changes                                                            | Agent entry path                                           |
| Mapping | `docs/agents/triage-labels.md`         |                                23 lines | Role-to-label map                                                                                                           | Commands                                                   |
| Domain  | `GLOSSARY.md`, `docs/agents/domain.md` |                                 Current | Vocabulary and ADR rules                                                                                                    | Tracker commands                                           |

What moves where:

- **T to S:** the CLI mechanics in T:14-27, T:53-58, T:73-117, T:124-154. About
  120 lines. T keeps the repo facts: T:1-4, T:8-13, T:28-52, T:68-72, T:118-123,
  T:156-226.
- **T to F:** the flag lists and shapes in T:17-23, T:53-58, T:96-105,
  T:142-154. About 40 lines.
- **S to F:** the full tables in S:37-73, S:99-194. About 120 lines. S keeps a
  five-row read summary and a five-row write summary.
- **S to T:** the repo rules in S:196-234, S:295-355. About 60 lines. T owns the
  spec, ticket, map and triage recipes. S points to T.
- **R to F:** the exhaustive flags and shapes in R:784-1421. R keeps the human
  examples and the product story. This does not shorten R, but it makes F the
  single lookup source.
- **Cut from S:** auth and admin (R:305-628), the full spec and wayfinding
  recipes (S:267-355), the long read tutorial (S:99-171) and paging (S:173-194).
  Keep one-line pointers.
- **Cut from T:** canonical forms, read shapes, paging, error codes, dry-run
  lists, idempotency, read-after-write and section mechanics. About 150 lines.
- **Add to T:** one line that points to S, one line that points to L, a three-line
  PR output convention and a one-line bare-`#42` rule.
- **Add to R:** S and F in the Documentation list (R:1464-1470). Add a short
  "For agents" box at the top that points to S and T.

What must stay duplicated:

- The skill description and the tracker doc's one-line skill pointer. Both are
  entry points from different directions.
- The priority and assignee rules in A and T. A is the repo contract; T is the
  workflow. Two short statements are acceptable.
- The triage label strings in L and the tracker doc's pointer to L. The skill
  should not repeat the strings.
- The spec, ticket and map commands in T and the phase skills. T owns the repo
  convention; the phase skill owns the procedure. The rata skill should not
  repeat them.
- A compact canonical-form table in S and a command index in F. The index is for
  lookup; it should not repeat the rationale or the rejected forms.

Target cost:

| Load                                   |  Today | Target | Cut |
| -------------------------------------- | -----: | -----: | --: |
| Entry: skill plus tracker              |  8,038 |  1,800 | 78% |
| Lookup: skill, tracker and reference   | 15,996 |  6,700 | 58% |
| Worst case: all four agent docs        | 33,270 |  6,700 | 80% |
| Session start: A, description, tracker |  5,943 |  3,000 | 50% |

The targets assume 55 characters per line for the skill and the tracker doc, and
78 characters per line for the reference, which is a table-heavy document. An
80-line skill is about 4,400 characters, or 1,100 tokens. A 50-line tracker doc
is about 2,750 characters, or 690 tokens. A 250-line reference is about 19,500
characters, or 4,900 tokens.

The load path becomes:

```text
AGENTS.md
  -> skills/rata/SKILL.md (entry, 80 lines)
       -> docs/agents/issue-tracker.md (repo facts, 50 lines)
       -> skills/rata/reference.md (lookup)
  -> docs/agents/triage-labels.md (triage only)
  -> GLOSSARY.md and docs/agents/domain.md (domain only)
README.md (human, not on the agent path)
```

## Short skill outline

Target: 60 to 100 lines. The outline below is about 80 lines. It gives the
commands and the order. It does not write the file.

1. **Frontmatter and entry contract (8 lines).** Keep the trigger. Say: "Read
   the repo tracker doc for the team, labels and conventions. This skill covers
   the CLI." Exact commands:
   - `command -v rata`
   - `rata status --json`
   - `rata auth login --with-token` (only when `status` reports `auth`; point
     to the README for profiles)
   - `rata link --team <key>` (pass `--team`; the prompt needs a terminal)
   - `rata team show --json`
2. **One form per operation (12 lines).** An eight-row table:
   - `rata issue show <ref>` not `rata issue <ref>`
   - `rata issue comment create <ref> --body-file -` not `rata issue comment <ref>`
   - `rata issue assign <ref> --assignee me` not a positional assignee
   - `rata issue section replace <ref> "<heading>" --body-file -`
   - `rata issue create`, `rata issue update`, `rata issue list`
   - `rata issue close <ref> --comment "..."`
   - `rata next --parent <ref>` and `rata why <ref>`
   - `rata issue list --parent <ref> --all --json --include relations`
3. **Read loop (12 lines).** Exact commands:
   - `rata status --json`
   - `rata issue status <ref> --json`
   - `rata issue show <ref> --json`
   - `rata issue show <ref> --summary --json`
   - `rata issue list --parent <ref> --all --json --include relations`
   - `rata next --parent <ref>`
   - `rata why <ref>`
   - `rata search "<text>" --json`
     One sentence: a single resource is the object; a list is `{ <plural>, pageInfo }`.
4. **Write loop (20 lines).** Exact commands:
   - `rata issue create --title "<title>" --body-file - --priority <p> --assignee me`
   - `rata issue create --title "<title>" --parent <spec> --body-file - --priority <p> --assignee me --label ready-for-agent`
   - `rata issue update <ref> --priority <p>`
   - `rata issue update <ref> --state "<state from team show>"`
   - `rata issue section replace <ref> "<heading>" --body-file - --dry-run`
   - `rata issue section replace <ref> "<heading>" --body-file - --if-unchanged <updatedAt>`
   - `rata issue comment create <ref> --body-file - --dedupe-key <key>`
   - `rata issue label add <ref> <label...>`
   - `rata issue label remove <ref> <label...>`
   - `rata issue assign <ref> --assignee me`
   - `rata issue close <ref> --comment "..."`
   - `rata issue create --title "<map>" --label wayfinder:map --no-default-labels --assignee none --body-file -` (then children the same way)
     Guards: `--body-file -` reads stdin; `--dry-run` previews; `--if-unchanged`
     guards a body write; `--dedupe-key` makes a retried comment idempotent.
     Priority values are `urgent`, `high`, `medium` and `low`.
5. **Repo rules (10 lines).** Short statements, no commands:
   - Every actionable issue carries a priority and an assignee.
   - Maps and their children stay unassigned until the claim.
   - Triage roles map through `docs/agents/triage-labels.md`; the role name is
     not always the label string.
   - A spec is an issue. Its tickets are child issues. This repo does not use
     projects.
   - A map is an issue labelled `wayfinder:map`. Read the tracker doc's
     "Wayfinding operations" section for the frontier and claim.
   - Never rewrite a whole body for one section.
6. **Errors and paging (8 lines).** One error object: `{error:{code,message,hint}}`.
   Exit codes: 2 validation, 3 not found, 4 conflict, 5 auth, 6 retryable.
   `issue update --comment` and bulk writes can write a partial result to stdout.
   Lists return one page; use `--all` or `--after`.
7. **Pointers (4 lines).** Full flags and shapes: `reference.md`. Auth, install
   and admin: `README.md`. Repo conventions: `docs/agents/issue-tracker.md`.
   Label mapping: `docs/agents/triage-labels.md`.

Do not include in the short skill: `team create` or `team delete`, any
`project` command, `label create` or `label edit`, `auth status` or
`auth logout`, `workspace list` or `workspace use`, `unlink`, `whoami`, the full
flag tables, full JSON examples, breaking changes, or the spec and wayfinding
recipes.

## Not found

- No stale `issue assign me <ref>` form in the current corpus. Only the rejected
  form `issue assign <ref> me` appears, at R:92, S:28, F:37 and T:47-48.
- No `{issue: ...}` wrapper in the current corpus. The docs say the issue object
  is at the top level at R:919-920, S:131 and F:198-199. The old wrapper survives
  only in the prior research file.
- No PR output convention in T. T:156-160 covers PRs as an input surface only.
- No rule for resolving a bare `#42` or `Closes #45` in T. `code-review` needs
  it at code-review:43.
- No guidance on when to use `search` instead of `issue list --text`. R:956-959
  and F:234-245 describe `search`; R:794 and F:213 describe `--text`. The docs
  do not choose.
- No guidance on when to use `issue close` instead of `issue update --state
<completed>`. R:1124 and R:1232 teach the second form; R:1367-1368 and T:124
  teach the first.
- No exact reproduction of the prior 562/44/132/413 count. The closest current
  read-tool count is 538/46/130/391. The difference is data growth and the
  thread filter. The prior 132 is close to the read-tool count, not the any-read
  count.
- No doc for `issue delete` or `issue restore`. The CLI has no such commands.
  The prior research defers them to the 0.10 surface.
- No proof that the skill description is present in every harness system prompt.
  The load data shows the skill is available and rarely used. The exact
  system-prompt content is outside this audit.

## References

- `README.md`: the human manual. The agent-relevant cost is 17,275 tokens.
  Sections 769-1421 are 50% of the file by characters and hold the CLI semantics.
- `AGENTS.md`: the repo contract. Lines 156-172 hold the tracker, triage and
  domain pointers.
- `GLOSSARY.md`: domain vocabulary. Lines 85-108 define the skill workflow.
- `docs/agents/issue-tracker.md`: the repo tracker doc. Lines 6-140 are the
  Conventions section. Lines 171-226 are the phase recipes.
- `docs/agents/triage-labels.md`: the role-to-label map. Lines 8-22.
- `docs/agents/domain.md`: the domain doc contract. Lines 6-13 and 28-43.
- `skills/rata/SKILL.md`: the global skill. Line 3 is the description. Lines
  21-73 are the canonical forms and read shapes. Lines 196-355 are the triage,
  spec and wayfinding recipes.
- `skills/rata/reference.md`: the command lookup. Lines 3-44 are the duplicated
  conventions. Lines 91-139 are setup and admin. Lines 141-405 are the issue
  commands and shapes.
- `~/.agents/skills/rata/SKILL.md` and `reference.md`: installed copies,
  byte-identical to the repository at this commit.
- `src/cli/issue/show.ts:57-65` and `:108-113`: the `--no-body` behavior.
- `src/cli/output.ts:51-67` and `:79-86`: error output and the generic dry-run
  shape.
- `src/cli/issue/comment.ts:65-74`: the comment dry-run shape.
- `src/cli/issue/section.ts:59-78`: the section dry-run and write shape.
- `src/cli/issue-write/create.ts:105-110`: the create result shape.
- `src/cli/issue-write/update.ts:82-93`: the partial `issue update --comment`
  failure.
- `src/cli/issue-transition.ts:91-105` and `:129-140`: the close and reopen
  result shapes.
- `~/.agents/skills/mission/SKILL.md:46`: "Read `AGENTS.md` and the tracker doc."
- `~/.agents/skills/wayfinder/SKILL.md:31`: points to the tracker doc's
  "Wayfinding operations" section.
- `~/.agents/skills/{triage,to-spec,to-tickets,implement,implement-spec,code-review,pr,handoff}/SKILL.md`:
  the phase skills that consume the tracker doc.
- `docs/research/agent-usage-pain-points.md`: the prior usage study. It records
  the old `issue assign` and `{issue}` failures at lines 18-31 and 90.
- T3 state database `~/.t3/userdata/statev2.sqlite`, table
  `orchestration_v2_projection_turn_items`, query range
  2026-10-24T06:23Z to 2026-11-12T19:05Z. The strict command filter is a `rata`
  command word at the start of a shell segment. The read-tool filter uses
  `dynamic_tool` items with `toolName = read`. The any-read filter also counts
  `command_execution` items that name the tracker doc.
