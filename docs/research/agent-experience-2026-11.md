# Agent experience with rata

Date: 2026-11-12
Status: answered

## Question

How do agents use `rata`, where does the experience cost them calls, tokens and
time, and which changes would improve it most?

Scope: `rata` 0.9.0, the ask-matt skills that drive it, the repo tracker docs,
the local T3 session record from 2026-10-24 to 2026-11-12, and the Linear API.
The tracker scope is 4,097 calls in 445 threads across 12 repositories. The rata
development scope is 1,332 calls in 74 threads and is reported separately.

## Answer

Agents use `rata` as a working tracker. Reads are 60.5% of calls and writes are
35.7%. Most calls return a useful result. The cost is uneven, and five findings
explain most of it.

1. **Repeated reads are the largest call waste.** 865 extra calls repeat an exact
   command inside a thread, 21.1% of 4,097 calls. The stricter count is 461 reads
   of the same issue with no write between, across 393 items and 121 threads,
   worth 0.75M characters, 8.9% of output. `issue show` is 1,669 calls (40.7%)
   and 72.2% of output. Five mission issues are 27.7% of all output, and agents
   used `--summary` 49 times in 4,097 calls (1.2%). A full `FND-967` read is
   25,444 bytes; `--summary` is 688.
2. **Subagents pay for context twice.** Subagent threads are 62.3% of tracker
   threads, 16.5% of calls, and 51.4% of output. Each subagent makes 2.4 calls
   and reads the parent mission in full, about 15.6k characters. The main session
   already holds that context.
3. **The product tracker docs teach forms that 0.7 and 0.8 removed.** Four
   repositories teach the positional assign form, and three also teach the direct
   comment form. Agents made 30 positional assign calls (27 failed) and 68
   direct comment calls (20 failed after the change). 43 of the 47 failures
   recovered with a canonical retry. 17 of 25 form-error threads read the doc
   before the error; only 24 of 445 tracker threads loaded the skill.
4. **Stale team links fail every team-scoped read, and exit codes hide most
   failures.** Stale or missing team keys caused 28 visible errors in 20 threads,
   the largest visible cluster. 48 tracker items exited non-zero, but 120 printed
   a rata error. 92 of those errors exited 0 because the shell item ended with
   `; echo`, `|| true`, or a pipe to `head`. With 20 consumer-side parse
   failures, the problem set is 140 items, about 3.4% of calls. Exit-code
   telemetry undercounts visible errors by 2.5 times.
5. **The remaining CLI traps are narrow but repeated.** `--fields` validates
   against the data, not a declared shape: an empty list accepts any path,
   `assignee.naem` returns null, and `labels.name` and
   `team show --fields states.name` fail. `issue update --label` and
   `issue create --blocked-by` print the full help. The comment hint omits the
   required body flag. `issue link` makes four requests for one target.

The cost by lens:

| Lens   | Largest cost                  |           Count |          Share |
| ------ | ----------------------------- | --------------: | -------------: |
| Calls  | `issue show`                  |     1,669 calls | 40.7% of 4,097 |
| Calls  | Help, version, root probes    |       590 calls | 12.6% of 4,687 |
| Calls  | Exact duplicate commands      | 865 extra calls | 21.1% of 4,097 |
| Calls  | Stale reads, no write between |       461 calls | 11.3% of 4,097 |
| Tokens | `issue show` output           |     6.08M chars | 72.2% of 8.42M |
| Tokens | Read commands                 |     7.99M chars |          94.9% |
| Tokens | Subagent threads              |     4.33M chars | 51.4% of 8.42M |
| Tokens | Five mission issues           |     2.33M chars | 27.7% of 8.42M |
| Time   | `issue show`                  |          2,816s |  33% of 8,459s |
| Time   | `issue update`                |          1,828s |            22% |

The rows are separate lenses and overlap. A stale read can also be a duplicate
command and a large `issue show`.

The highest-value changes, by observed cost:

| Rank | Change                                                                                                                        | Evidence                                                                                                                     | Cost removed                                                     |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1    | Update the four product tracker docs to the 0.9 forms, add a "load the rata skill" line, and add a doc check to `rata status` | 30 positional assign calls (27 failed), 68 direct comment calls (20 failed), 47 failed calls and 43 retries in 25 threads    | 47 failed calls and 43 retries; the first call is no longer lost |
| 2    | Batch section write: `issue update <ref> --sections-file -` with one `--if-unchanged` snapshot                                | KACHITO-7: 42 section writes plus 42 snapshot reads, 84 of 120 calls; 42 of 139 section writes since 2026-11-09              | About 72 calls in one session; one read per record update        |
| 3    | Pass context to subagents and read mission bodies with `--summary` or one section                                             | 51.4% of output in subagents; five mission issues 27.7% of output; `--summary` 49 uses                                       | About 28% of tracker output; 51% in subagent work                |
| 4    | Fix `--fields` shape validation and finish the 0.10 array walk                                                                | Empty lists accept any path; `assignee.naem` returns null; `labels.name` and `team show --fields states.name` fail           | A wrong parse or an extra turn; 7 visible items, 4 in two days   |
| 5    | Repair stale team links: store the team id in the link, or resolve a stale key by name and warn instead of failing reads      | 28 visible errors in 20 threads, the largest visible cluster; `status` warns but `list` and `search` fail                    | 28 errors and 20 threads                                         |
| 6    | One session read and batch read: `issue status <ref> --with-body`, and `issue list --id` for a known set                      | `issue status` fetches the body and drops it; 1,669 show calls; 338 refs re-read                                             | 1 to 2 calls per session; N-1 calls per batch                    |
| 7    | Apply label and priority on create in `to-spec` and `to-tickets`; put the work item ref in the handoff prompt                 | FND-967: 68 calls against a 32-call minimum; handoff forbids the id, so every session starts with a search                   | 20 calls per 10-ticket spec; 1 search per session                |
| 8    | Cut help and probe cost: a compact common-commands block and one skill load per tracker session                               | 590 probes, 1.01M chars, 12% of output; top topics `issue update` and `issue create`                                         | About 12% of output                                              |
| 9    | Fix the hints and the silent filters: comment body flag, `issue update --label`, `issue create --blocked-by`, typo filters    | The comment hint is not executable; the two wrong flags print 36 to 45 lines; `In Progess` and `redy-for-agent` return empty | 1 turn per mistake; a false conclusion                           |
| 10   | Return `updatedAt` in the section dry-run and cut `issue link` requests                                                       | Human output hides the snapshot; `link` makes 4 requests for one target, p50 3.5 to 9.5 s, p90 21.9 to 32.4 s                | 1 read per safe write; 2 requests per link                       |

Two risks need a measurement before they become recommendations:

- **`issue list --include relations` may exceed Linear's complexity cap.** The
  README promises up to 250 relations per outgoing and inverse connection on
  every row. Linear caps a query at 10,000 complexity points. A 50-row page with
  two 250-node relation connections is 25,000 nodes before field costs. The
  measured 18-row map read works; a 39-child spec or a 50-row page may fail.
  Adoption is 8 calls, so the capability exists but the workflow barely uses it.
- **`--sort priority` drains every matching page.** The current code fetches all
  pages and sorts on the client. Linear's `IssueSortInput.priority` can return
  one page. For 500 matching issues, that is 10 calls to 1. The tie order needs a
  real-workspace check.

The changes split cleanly:

- **Now, low risk:** the product tracker doc repairs and the skill pointer, the
  hint fixes, the silent-filter check, the stale-team repair, `--with-body`, the
  `updatedAt` dry-run field, and the link request reduction.
- **0.10.0, already decided:** `--fields` array walking (RATA-104), PR awareness
  (RATA-105), graph read (RATA-103), import/export/apply (RATA-101/102).
- **New owner decisions:** a batch section write, a subagent context contract, a
  session read contract, and a batch issue read. None is in the 0.10 map.

The docs target, from `agent-docs-audit.md`:

| Layer  | File                           |         Target | Owns                                                                                   |
| ------ | ------------------------------ | -------------: | -------------------------------------------------------------------------------------- |
| Entry  | `skills/rata/SKILL.md`         |   60-100 lines | Binary, auth and link checks; canonical forms; read loop; write loop; errors; pointers |
| Repo   | `docs/agents/issue-tracker.md` | about 50 lines | Team, labels, priority and assignee rules, spec and map recipes, PR convention         |
| Lookup | `skills/rata/reference.md`     |  250-300 lines | Every command and flag, read and write shapes, exit codes, dry-run shapes              |
| Human  | `README.md`                    |        current | Install, auth, full catalog, examples                                                  |

The tracker scope reads the tracker doc in 107 threads (24.0%) and the skill in
24 threads (5.4%). 325 threads (73.0%) read neither. The entry load today is the
tracker doc plus the skill, 8,038 tokens; the target is about 1,800. The worst
case, all four agent docs, is 33,270 tokens today; the target is 6,700. The full
split is a larger change than a pointer. It moves CLI mechanics out of the
tracker doc, moves repo rules out of the skill, and gives each rule one owner.

## Evidence

The detailed evidence is in five notes:

- `docs/research/agent-usage-2026-11.md`: the tracker scope, command mix, failure
  clusters, skill loading, latency, output size and repetition, with the SQL and
  scripts.
- `docs/research/agent-workflow-call-cost.md`: the phase-by-phase minimum, the
  RATA-83, FND-967, FND-969 and KACHITO-7 traces, the stale tracker docs, and
  the missing one-call reads.
- `docs/research/agent-cli-surface-audit.md`: the current 0.9.0 errors, shapes,
  hints and request paths, with reproductions.
- `docs/research/agent-cli-prior-art.md`: the agent-first CLI patterns and the
  Linear API headroom.
- `docs/research/agent-docs-audit.md`: the token cost, duplication and drift of
  the docs corpus, and the proposed short skill.

Summary facts:

- 4,097 tracker calls in 445 threads across 12 repositories; 1,332 development
  calls in 74 threads; 844 probe calls across both.
- Reads are 60.5% of calls, writes 35.7%, other 3.8%. `issue show` is 1,669
  calls, `issue update` 650, `issue list` 425, `issue create` 219, `search` 173,
  `issue section replace` 164, `issue link` 125.
- `--json` is used in 44.9% of calls; `--fields` 3.1%; `--summary` 1.2%;
  `--no-comments` 2.4%; `--all` 0.9%; `--if-unchanged` 2.8%; `--dry-run` 0.2%;
  `--dedupe-key` 0.4%; `--include` 0.2%; `--comments` 13.1% (redundant in JSON
  mode).
- Latency: median 1.81 s, p90 5.32 s, p99 16.03 s, maximum 120.1 s. The tracker
  scope waits 8,459 s (2h21m). `issue show` is 33% of the wait, `issue update`
  22%.
- Output is 8.42M characters, about 2.1M tokens at 4 characters per token. Reads
  are 94.9%. `issue show` is 72.2%. Subagent threads are 51.4%. Help probes are
  12.0%.
- 48 tracker items exited non-zero; 120 printed a rata error; 92 of those exited
  0 because of shell masking; 20 more failed in a consumer. The problem set is
  140 items, about 3.4% of calls.
- The 0.9.0 tag and release are dated 2026-11-10, not 2026-11-09. The first
  observed `rata v0.9.0` probe is 2026-11-11T13:13Z. The earlier date has no
  support in the data.

## Conflicts

- **Release date.** The task brief says 2026-11-09. The tag commit is
  2026-11-10T10:35Z, the GitHub release is 2026-11-10T10:37Z, and the first
  `rata v0.9.0` probe is 2026-11-11T13:13Z. This report uses the published
  release and the observed binary.
- **Prior counts.** The earlier note reports 3,159 command rows and 307 threads
  through 2026-11-09. This study reports 5,429 work invocations and 519 threads
  through 2026-11-12. The units differ: command rows vs parsed invocations. The
  earlier scope is reproducible at the cutoff: 3,150 rows and 307 threads.
- **Skill loading as the main cause.** The earlier note says the natural-form
  failures are mostly a skill-loading problem. This data agrees the skill is
  rarely loaded, 24 of 445 tracker threads. It adds that the product docs teach
  the rejected forms, and that 17 of 25 form-error threads read the doc before
  the error. The per-call problem rate is similar across skill, doc and neither
  groups, so the skill alone is not the measured fix. The doc is the stronger
  cause for the form failures.
- **Stale team key.** The earlier note says `status` fails on a stale key. 0.9.0
  fixes `status` with a warning. `issue list` and `search` still fail. The fix
  is partial.
- **List edges.** The earlier note says `issue list` cannot carry blocking
  edges. 0.9.0 adds `--include relations`, but adoption is 8 calls. The
  capability exists; the workflow does not use it.
- **Flat reads and wrapped writes.** 0.9.0 flattens single-resource reads. That
  fixes the old wrapper errors. It breaks scripts that learned the wrapper. It
  also leaves writes wrapped. The repository rule says no backward
  compatibility, so the break is accepted. The mixed shape is still a cost:
  17 items, 15 threads.
- **`issue status` as the session read.** The skill calls it "the one read for a
  session start", but it returns no `description` and no `comments`. An agent
  that needs the body calls `issue show` too.
- **Label and priority timing.** `to-spec` and `to-tickets` apply
  `ready-for-agent` after publishing. The tracker doc passes it on create.
  `to-tickets` does not name a priority on create. The FND-967 session created 10
  tickets, then made 10 priority updates and 10 verification reads.
- **Handoff ref.** `handoff` forbids the id or URL in the prompt. The mission
  output contract forbids a bare id in a reply, not in a self-contained prompt.
  The current rule costs one search per session.
- **Priority scope.** `AGENTS.md` and the tracker doc require a priority on every
  issue. The skill requires one only on actionable issues and allows `none` for
  `needs-info` and `wontfix`. Pick one and state it once.
- **Bulk labels on a map.** The tracker doc says bulk `--parent` repair is for a
  spec's tickets, not a map. The skill says label a map's children in bulk. The
  CLI cannot tell a map from a spec, so the docs must decide.
- **Close state.** The skill and README use `--state Done`; the tracker doc and
  the skill elsewhere say do not guess a state name. `issue close` is the stable
  path.
- **`--no-body` fetch.** README says the flag drops the description from the
  output but still fetches it. The skill, reference and tracker doc say it skips
  the fetch. The code always fetches.
- **Dry-run shape.** README and reference say every JSON dry run returns
  `{dryRun, actions}`. Comments and sections return `{dryRun, action, ...}`.
- **Failure output.** README and reference document the stdout partial-result
  exceptions for bulk writes and `issue update --comment`. The skill and tracker
  doc say every failed `--json` command writes one error object to stderr.
- **`--fields` on writes.** RATA-77 and RATA-104 reject it. The observed cost is
  a failure plus a verification read. A change is an owner decision.
- **`--count` and `--ids-only` are already decided.** The prior-art note
  recommends rejecting both. RATA-104 already approves them for 0.10.0. Do not
  reopen them. The batch-read flag should not be named `--ids` without stating
  the difference from `--ids-only`; `--id` repeatable is cleaner.
- **Batch writes against the best-effort bulk contract.** RATA-72 approved
  best-effort parent bulk writes with one result per child. `issueBatchUpdate`
  is transactional per 50 and would change that contract. The 0.10 map's batch
  execution and import/apply path already own this ground.

## Not found

- No data from external users of the public skill. All usage evidence is the
  owner's fleet.
- No measurement of the API latency split between Linear and rata. The durations
  are wall-clock.
- No proof that a batch section write is safe against a concurrent writer beyond
  the best-effort `updatedAt` check. Linear has no compare-and-swap.
- No exact cause for the two `issue update` timeouts. Both have no rata output
  and a null exit code.
- No exact cause for `Entity not found: Issue` on FND-967 on 2026-11-09.
- No tokenizer count. The 2.1M token figure is an estimate at 4 characters per
  token.
- No `rata triage`, `frontier` or `claim` command. The skills assemble these
  from list queries.

## References

- `docs/research/agent-usage-2026-11.md`
- `docs/research/agent-workflow-call-cost.md`
- `docs/research/agent-cli-surface-audit.md`
- `docs/research/agent-cli-prior-art.md`
- `docs/research/agent-docs-audit.md`
- `docs/agents/issue-tracker.md`
- `docs/adr/0009-one-canonical-form-per-operation.md`
- `docs/adr/0010-read-shapes-follow-the-resource.md`
- `skills/rata/SKILL.md`, `skills/rata/reference.md`
- RATA-72, RATA-77, RATA-83, RATA-104, RATA-122
