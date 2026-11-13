# How agents used rata, 2026-10-24 to 2026-11-12

Date: 2026-11-12
Status: answered

## Question

How did agents use `rata` between 2026-10-24 and 2026-11-12, and which current
behaviors cost them the most calls, tokens, and time?

## Answer

Agents used `rata` as a working tracker, not a broken one. The run covers 4,097
tracker calls in 445 threads across 12 repositories. Reads are 60.5% of calls
and writes are 35.7%. The CLI returned a useful result for most calls.

The cost is uneven. Five findings explain most of it.

1. **Repeated reads are the largest call waste.** 865 extra calls repeat an
   exact command inside a thread, 21.1% of 4,097 calls. The stricter count is
   461 reads of the same issue with no write between, across 393 items and 121
   threads. Those stale reads add 0.75M characters, 8.9% of output. Agents also
   retry 79 times within 180s of a failure.
2. **Subagents pay for context twice.** Subagent threads are 62.3% of tracker
   threads, 16.5% of calls, and 51.4% of output. Each subagent makes 2.4 calls
   and reads the parent mission in full, about 15.6k characters per thread.
   The main session already holds that context.
3. **Five mission issues are 27.7% of all tracker output.** `FND-967`, `FND-1019`,
   `FND-1068`, `HARB-327`, and `JYOT-69` were read in 224 items and produced
   2.33M characters. Agents used `--summary` 49 times in 4,097 calls (1.2%).
   A full `FND-967` JSON read is 25,444 bytes; `--summary` is 688 bytes.
4. **The instruction layer teaches forms that later versions removed.** Four
   product repositories teach the positional assign form, and three of them also
   teach the direct comment form. Version 0.7 removed the assign form and 0.8
   removed the comment form. Agents made 30 positional assign calls (27 failed)
   and 68 direct comment calls (20 failed after the change). 43 of the 47
   failures recovered with a second, canonical call. The 0.9.0 hint names the
   right form, but the first call is still lost.
5. **Stale team links fail every team-scoped read until an agent repairs them,
   and exit codes hide most failures.** Stale or missing team keys caused 28
   visible errors in 20 threads, the largest visible cluster. 48 tracker items
   exited non-zero, but 120 tracker items printed a rata error. 92 of those
   errors exited 0 because the shell item ended with `; echo`, `|| true`, or a
   pipe to `head`. Exit-code telemetry undercounts visible errors by 2.5x.

The cost by lens:

| Lens   | Largest cost                  | Count           | Share          |
| ------ | ----------------------------- | --------------- | -------------- |
| Calls  | `issue show`                  | 1,669 calls     | 40.7% of 4,097 |
| Calls  | Help, version, root probes    | 590 calls       | 12.6% of 4,687 |
| Calls  | Exact duplicate commands      | 865 extra calls | 21.1% of 4,097 |
| Calls  | Stale reads, no write between | 461 calls       | 11.3% of 4,097 |
| Tokens | `issue show` output           | 6.08M chars     | 72.2% of 8.42M |
| Tokens | Read commands                 | 7.99M chars     | 94.9%          |
| Tokens | Subagent threads              | 4.33M chars     | 51.4% of 8.42M |
| Tokens | Five mission issues           | 2.33M chars     | 27.7% of 8.42M |
| Time   | `issue show`                  | 2,816s          | 33% of 8,459s  |
| Time   | `issue update`                | 1,828s          | 22%            |

The rows are separate lenses. They overlap. For example, a stale read can also be
a duplicate command and a large `issue show`.

The median tracker command item waits 1.81s. The p90 is 5.32s, the p99 is 16.03s, and
the maximum is 120.1s. Two command items that update an issue hit the harness
timeout, at 60s and 120s.

## Evidence

### Scope and method

- **Database.** The source is the local T3 state database
  `~/.t3/userdata/statev2.sqlite`, tables
  `orchestration_v2_projection_turn_items`,
  `orchestration_v2_projection_threads`, and `projection_projects`. The data is
  local and is not committed.
- **Base query.** The extraction selects `type = 'command_execution'`, an input
  that contains `rata`, and a start time on or after 2026-10-24. It joins the
  thread for title and lineage, and the project for `workspace_root`. Source:
  `/tmp/opencode/rata-research/extract.ts`.
  ```sql
  SELECT t.turn_item_id, t.thread_id,
         json_extract(t.payload_json,'$.input')    AS input,
         json_extract(t.payload_json,'$.output')   AS output,
         json_extract(t.payload_json,'$.startedAt') AS started,
         json_extract(t.payload_json,'$.exitCode') AS exit_code,
         p.workspace_root, th.title
  FROM orchestration_v2_projection_turn_items t
  JOIN orchestration_v2_projection_threads th ON th.thread_id = t.thread_id
  JOIN projection_projects p ON p.project_id = th.project_id
  WHERE t.type = 'command_execution'
    AND json_extract(t.payload_json,'$.input') LIKE '%rata%'
    AND json_extract(t.payload_json,'$.startedAt') >= '2026-10-24';
  ```
- **Invocation parser.** A shell item can hold several commands. The parser
  splits on newlines, `;`, `&&`, `||`, and `|`, then keeps a segment only when
  the first command is `rata` or a known wrapper (`bun run`, `bunx`, `npx`,
  `varlock run`, env assignments, and similar). It removes redirections and
  records subcommand, positionals, and flags. Source:
  `/tmp/opencode/rata-research/analyze4.ts`.
- **Probes.** Help, version, bare root, and completion calls are counted
  separately. They are not tracker work. Source: `analyze4.ts`, `isProbe`.
- **Tracker and development scopes.** The tracker scope is every repository
  except `/home/ulezot/Projects/js/rata`. The rata repository holds the CLI
  development and research sessions. The tracker scope is 4,097 calls in 445
  threads. The development scope is 1,332 calls in 74 threads. Source:
  `/tmp/opencode/rata-research/final.ts`, `isTracker`.
- **Excluded sessions.** This research session (`e4cbaf62-...`) and its five
  subagent threads are excluded. They would otherwise add the analysis calls
  to the data. Source: `final.ts`, `excludedThreads`.
- **Raw volume.** 7,478 command items name `rata` in the window. After parsing,
  they hold 5,429 work invocations and 844 probes. Source: `analyze4.ts`
  output and `final.ts` `scope`.

| Measure                             | Value                                  |
| ----------------------------------- | -------------------------------------- |
| Window                              | 2026-10-24T06:23Z to 2026-11-12T19:05Z |
| Command items that name rata        | 7,478                                  |
| Work invocations, all repositories  | 5,429                                  |
| Tracker work invocations            | 4,097                                  |
| Rata development invocations        | 1,332                                  |
| Probe invocations, all repositories | 844                                    |
| Tracker command items               | 3,027                                  |
| Tracker threads                     | 445                                    |
| Tracker repositories                | 12                                     |

### 1. Command and flag mix

- **The read path dominates calls.** `issue show` is 1,669 calls (40.7%),
  `issue update` is 650 (15.9%), `issue list` is 425 (10.4%), `issue create`
  is 219 (5.3%), and `search` is 173 (4.2%). Source: `final.ts`,
  `tracker.bySub`.
- **The phase split is 60.5% read, 35.7% write, 3.8% other.** Reads are 2,480
  calls and writes are 1,462 calls. The section replace command is a write and
  is counted as one. Source: `final.ts`, `phaseOf` and `metrics.ts`, `phases`.
- **Text output is still common.** `issue show` uses `--json` on 61.7% of
  calls. `issue list` uses it on 66.6%, `search` on 49.7%, and `issue update`
  on 24.6%. Source: `final.ts`, `tracker.bySub[].jsonPct`.
- **The optional flags have low adoption.** `--fields` is 126 calls (3.1%),
  `--summary` 49 (1.2%), `--no-comments` 99 (2.4%), `--all` 35 (0.9%),
  `--if-unchanged` 113 (2.8%), `--dry-run` 8 (0.2%), `--dedupe-key` 17 (0.4%),
  and `--include` 8 (0.2%). Source: `final.ts`, `flags`.
- **`--comments` is used 535 times (13.1%).** In JSON mode, `issue show`
  already includes comments by default. Source: `src/cli/issue/show.ts:100`
  and `final.ts`, `flags`.

| Subcommand               | Calls | Share |  JSON | p50 s | p90 s | p50 chars |
| ------------------------ | ----: | ----: | ----: | ----: | ----: | --------: |
| `issue show`             | 1,669 | 40.7% | 61.7% |  1.33 |  2.98 |     2,483 |
| `issue update`           |   650 | 15.9% | 24.6% |  1.81 |  6.61 |        21 |
| `issue list`             |   425 | 10.4% | 66.6% |  1.44 |  2.60 |     1,152 |
| `issue create`           |   219 |  5.3% | 52.5% |  2.33 |  7.43 |       242 |
| `search`                 |   173 |  4.2% | 49.7% |  1.77 |  7.80 |     1,832 |
| `issue section replace`  |   164 |  4.0% |    0% |  1.68 |  2.57 |        38 |
| `issue link`             |   125 |  3.1% | 12.0% |  3.41 |  4.23 |       254 |
| `issue close`            |    97 |  2.4% | 13.4% |  2.08 |  3.68 |        37 |
| `issue assign`           |    73 |  1.8% |    0% |  1.79 |  7.90 |       120 |
| `issue comment create`   |    72 |  1.8% |  1.4% |  2.06 |  5.35 |        23 |
| `issue comment` (direct) |    68 |  1.7% |  2.9% |  1.66 |  4.23 |       105 |
| `status`                 |    55 |  1.3% | 23.6% |  1.50 |  4.78 |       401 |

Source: `final.ts`, `tracker.bySub`; durations in `/tmp/opencode/rata-research/cost.json`.

- **Write flags cluster on `--body-file` (959 calls); read flags cluster on
  `--json` (1,839 calls).** `--comment` is 104 calls, while `--fields` and
  `--summary` stay rare. Source: `final.ts`, `flags`.

| Flag             | Calls | Share |
| ---------------- | ----: | ----: |
| `--json`         | 1,839 | 44.9% |
| `--fields`       |   126 |  3.1% |
| `--summary`      |    49 |  1.2% |
| `--no-comments`  |    99 |  2.4% |
| `--all`          |    35 |  0.9% |
| `--if-unchanged` |   113 |  2.8% |
| `--dry-run`      |     8 |  0.2% |
| `--dedupe-key`   |    17 |  0.4% |
| `--include`      |     8 |  0.2% |

Source: `final.ts`, `flags`.

#### Before and after 0.9.0

The 0.9.0 tag was cut at 2026-11-10T10:35Z and the GitHub release was published
at 2026-11-10T10:37Z. The first `rata v0.9.0` probe in the data is
2026-11-11T13:13Z. The task states 2026-11-09. That date has no support in the
tag, the release, or the version probes. This report uses the published release
for the cohort split and the first observed binary for the current-friction
section.

| Cohort                                | Calls | show JSON | update JSON | create JSON | `--summary` | `--include` | section replace |
| ------------------------------------- | ----: | --------: | ----------: | ----------: | ----------: | ----------: | --------------: |
| Before release (to 2026-11-10T10:37Z) | 2,763 |     60.8% |       19.1% |       43.7% |           0 |           0 |              42 |
| After release                         | 1,334 |     63.7% |       36.4% |       72.1% |          48 |           8 |             122 |
| After first v0.9.0 probe              | 1,002 |     75.4% |       39.1% |       77.8% |          48 |           8 |              73 |

Source: `final.ts`, `cohorts`; release date from `git show -s --format=%cI v0.9.0`
and `gh release view v0.9.0 --json publishedAt`.

### 2. Failure clusters

- **69 command items exited non-zero in the window.** 66 have a work
  invocation: 48 in tracker repositories and 18 in the rata development
  repository. Three are probes, one tracker and two development. Source:
  `/tmp/opencode/rata-research/failures.ts` and the appendix below.
- **120 tracker items printed a rata error.** They span 78 threads. 92 of the
  120 exited 0, so the non-zero count misses most of them. The full list is in
  `/tmp/opencode/rata-research/visible-errors.json`; the tables below group it
  by code and by cause. Source:
  `/tmp/opencode/rata-research/visible-errors.ts`.
- **20 more tracker items failed in a consumer after rata succeeded.** The
  usual causes are `jq`, `python3`, and a pipe that assumed a different JSON
  shape. The union is 140 problem items in the tracker scope. Source:
  `final.ts`, `errors.trackerProblems`.
- **The visible error codes are mostly command-surface errors.** The structured
  code `unknown_command` covers 50 of 120. Plain text errors cover 45. Source:
  `visible-errors.ts`.

| Code                        | Items | Share | Main cause                                                                |
| --------------------------- | ----: | ----: | ------------------------------------------------------------------------- |
| `unknown_command`           |    50 | 41.7% | Direct comment, bare `issue`, `issue read/children/comments`, group forms |
| text                        |    45 | 37.5% | Positional assign, team key, auth, label                                  |
| `validation`                |    12 | 10.0% | Field paths, `--fields` on writes, include value                          |
| `not_found`                 |     6 |  5.0% | Missing issue, team, section                                              |
| `internal`                  |     3 |  2.5% | Legacy `.rata.json` removal                                               |
| `not_linked`                |     2 |  1.7% | No team link                                                              |
| `conflict`                  |     1 |  0.8% | `--if-unchanged` stale write                                              |
| `GRAPHQL_VALIDATION_FAILED` |     1 |  0.8% | Linear API field error                                                    |

Source: `visible-errors.ts`, tracker scope.

| Root-cause cluster                                  |   Items | Threads | 0.9.0 status                                   |
| --------------------------------------------------- | ------: | ------: | ---------------------------------------------- |
| Stale or missing team link                          |      28 |      20 | `status` warns; `list` and `search` still fail |
| Direct `issue comment <ref>`                        |      19 |      18 | Rejected with a one-line hint                  |
| JSON shape assumption                               |      17 |      15 | Reads are flat; writes still wrap `{issue}`    |
| Positional `issue assign`                           |      16 |      15 | Rejected with a correct hint                   |
| Mixed forms and flags                               |      17 |      17 | Mostly unchanged                               |
| Bare `issue` and `issue read/children/comments`     |      13 |      11 | Rejected with a hint                           |
| `--fields` projection                               |       7 |       5 | Unchanged                                      |
| Group forms (`team show`, `label list --workspace`) |       5 |       5 | Mostly fixed after 0.7                         |
| Label add or remove                                 |       5 |       4 | Unchanged                                      |
| Missing issue or section                            |       4 |       4 | Data, not a CLI bug                            |
| `--if-unchanged` conflict                           |       2 |       2 | By design                                      |
| External (`git`, `gh`)                              |       2 |       2 | Not rata                                       |
| Auth, limit, ref, internal, wrong flag              |       5 |       5 | Mixed                                          |
| **Total**                                           | **140** |         |                                                |

Source: `final.ts`, `errors.problemClasses`; the "mixed forms and flags" row is
the classifier's `other` bucket, listed item by item in the appendix.

#### The documented forms that later versions removed

- **`issue comment <ref>` worked in 0.6.** 43 direct comment calls succeeded in
  October, all on 0.6.0. The 0.8 commit `6e2b420` turned `comment` into a group
  with `create`, `update`, and `delete`. From that point, the direct form fails.
  Source: `git show v0.6.0:src/cli/issue-write.ts` (`commentCommand` is a leaf
  command) and `git show v0.8.0:src/cli/issue/comment.ts`.
- **`issue assign me <ref>` worked in 0.6.** 3 positional assign calls
  succeeded on 2026-10-28 and 2026-10-29 before the 0.7 install. The 0.7 commit
  `37f0761` made the assignee a flag. It treats two positionals as a legacy form
  and returns an error. Source: `git show v0.6.0:src/cli/issue-transition.ts`
  (assignee is the first positional, example `rata issue assign me RAT-42`) and
  `git show v0.7.0:src/cli/issue-transition.ts:152-160`.
- **The product tracker docs still teach the 0.6 forms.**
  - `founders-app/docs/agents/issue-tracker.md:20` says
    `rata issue comment <ref> --body-file -` and line 27 says
    `rata issue assign me <ref>`.
  - `harbagsa/docs/agents/issue-tracker.md:24` says
    `rata issue comment HARB-123 --body "..."` and line 29 says
    `rata issue assign HARB-123 me`.
  - `phaephe/docs/agents/issue-tracker.md:22` says
    `rata issue assign me <ref>` and line 31 says
    `rata issue comment <ref> --body-file -`.
  - `jyoti/docs/agents/issue-tracker.md:131` says
    `rata issue assign me <ref>`. Its comment form at line 25 is correct.
- **The rata repository doc is correct, but it is the exception.** It says the
  assignee is a flag, names `rata issue assign <ref> me` as a validation error,
  and says `issue comment <ref>` exits 2. Source:
  `docs/agents/issue-tracker.md:41-47` and `:106-108`.
- **The shipped skill names the correct forms.** The table names
  `issue comment create <ref>` and `issue assign <ref> --assignee <me|none|id>`,
  and the text says there is no direct `issue comment <ref>` form and no bare
  `issue <ref>` form. Source: `skills/rata/SKILL.md:27-34`.
- **Few agents load the skill.** 24 of 445 tracker threads loaded
  `~/.agents/skills/rata` (5.4%). 0 tracker threads read the repository skill.
  In all 519 rata-using threads, 26 loaded the installed skill and 17 read the
  repo skill, the latter only in rata development. Source: `final.ts`, `skill`;
  tool calls in `/tmp/opencode/rata-research/tools-all.json`.
- **Doc readers hit the documented-form errors.** Of 15 threads with a
  positional assign error, 9 read `docs/agents/issue-tracker.md` before the
  first error, 0 read it only after, and 6 never read it. Of 15 threads with a
  direct comment error, 11 read the doc before the first error and 4 never did.
  Source: `visible-errors.ts` and `tools-all.json`.
- **The form errors are concentrated in the repos with the wrong docs.**
  Positional assign error threads: harbagsa 10, founders-app 3, sikhu 1,
  phaephe 1. Direct comment error threads: harbagsa 6, fcy-app 2, founders-app
  2, sikhu 2, jyoti 1, phaephe 1, acme 1. Source: `visible-errors.ts`, grouped
  by `root` and thread.
- **The hints are now correct, so the cost is one extra call.** In 0.9.0,
  `rata issue assign RATA-1 me` returns
  `error: The --assignee flag replaces the positional assignee.` and
  `hint: rata issue assign RATA-1 --assignee me`. A direct comment returns
  `error: The comment group needs a subcommand.` and
  `hint: rata issue comment create RATA-1`. Sources:
  `src/cli/assign-hint.ts:7-15`, `src/cli/pre-parse.ts:117-131`, and a local
  run on 2026-11-12.
- **Most failures recover.** 27 positional assign failures, 25 recovered with
  an `--assignee` call within 180s. 20 direct comment failures, 18 recovered
  with `issue comment create` within 180s. 4 did not retry. Source:
  `final.ts`, `repetition.retries`, and the recovery count script run on
  2026-11-12.

| Form                                 | Attempts | Succeeded on 0.6 | Failed after removal |    Recovered | No retry |
| ------------------------------------ | -------: | ---------------: | -------------------: | -----------: | -------: |
| `issue assign <ref> <assignee>`      |       30 |                3 |                   27 |           25 |        2 |
| `issue comment <ref>`                |       68 |               43 |                   20 |           18 |        2 |
| `issue <ref>`                        |       11 |                0 |                   11 | not measured |          |
| `issue read`, `children`, `comments` |        6 |                0 |                    6 | not measured |          |
| `issue comment list`                 |        2 |                0 |                    2 | not measured |          |

Source: `analyze4.ts` invocations; counts in `metrics.ts`, `forms`; success is
the presence of `Commented on`
or `Assigned` in the output; recovery is a canonical call in the same thread
within 180s. The direct comment row has 5 outputs that show neither success nor
the group error, so 43 plus 20 does not reach 68.

#### The failures that later versions fixed

- **The legacy `.rata.json` removal is no longer fatal.** 0.9.0 writes
  `warning: Could not remove the legacy repository config at ...` and continues.
  The 0.8 failures on 2026-11-06 at 06:06 are three consecutive `internal`
  errors. Source: `src/config/repo.ts:205-217`.
- **`status` survives a stale team key.** 0.9.0 prints a warning and reports
  `team: null`. The earlier command failed with
  `error: No team with key JYO. Run rata team list to see the team keys.`
  Source: `src/cli/status.ts:77-82`; the failure is at
  2026-10-29T12:34Z in jyoti, thread "Sync brightness with safety envelope".
- **`issue show` includes `createdAt`.** The 0.7 list failed with
  `KeyError: 'createdAt'` on 2026-10-29. The 0.9.0 show and list rows include
  it. Source: `src/api/issue-model.ts:183` and a local `issue show` on
  2026-11-12.
- **`issue list --include relations` exists.** It adds every relation group in
  one request. Adoption is 8 calls. Source: `src/cli/issue.ts:47-49` and
  `src/api/issue-query.ts:9-12`.
- **The `issue view` alias exists.** 0.8 added
  `Command.withAlias("view")`. The 0.6 and 0.7 calls failed with the group
  help. Source: `src/cli/issue/show.ts:120`.

#### The failures that still reproduce on 0.9.0

- **Positional assign.** The parser rejects both orders. A local run on
  2026-11-12 reproduces the error and the correct hint. Source:
  `src/cli/issue-transition.ts:171-180`.
- **Direct comment.** The comment group has no default action. A local run
  reproduces the error and the hint. Source:
  `src/cli/issue/comment.ts:234-237` and `src/cli/pre-parse.ts:117-123`.
- **Bare `issue <ref>` and `issue read/children/comments`.** The pre-parser
  catches `issue <ref>` only when the first positional is a valid ref. It names
  `issue show`. It does not know `read`, `children`, or `comments`. A local run
  of `issue read` produces the full issue help. Source:
  `src/cli/pre-parse.ts:126-132`.
- **`--fields` on a write.** `issue update`, `issue create`, `issue assign`, and
  `issue close` call `rejectFields`. The global flag appears in their help, so
  agents try it. A local run of
  `rata issue update RATA-1 --state Backlog --fields identifier --dry-run`
  returns `error: --fields is not supported by this command.` Source:
  `src/cli/issue-write/update.ts:132` and `src/cli/fields.ts:125`.
- **`--fields labels.name`.** The field selector rejects any path that enters
  an array. It tells the agent to select `labels` as a whole. A local run
  reproduces it. Source: `src/cli/fields.ts:56-60`.
- **Stale team key on reads.** `RepoTeam.resolve` calls `teams.byKey` and fails
  with `No team. Pass --team, or run rata link.` when the stored key is gone.
  `status` has a separate warning path; the read commands do not. `whoami` does
  not use the team and still works. Source: `src/api/repo-team.ts:33-42` and the
  2026-11-09T10:04Z item, where `whoami` succeeds and `search` and `issue list`
  fail on `PHA`.
- **Flat reads and wrapped writes.** `issue show`, `issue status`, `next`,
  `why`, and `team show` return the object at the top level. `issue create` and
  `issue update` return `{issue}`. `issue list` returns `{issues}`. Sources:
  `src/cli/issue/show.ts:114-116`, `src/cli/issue-write/create.ts:111`, and
  `src/cli/issue-write/update.ts:180`.
- **`issue update` does not accept `--label`.** `issue create` accepts it. An
  agent that tries to set a label during an update gets the update help. The
  2026-11-11T08:16Z item in the `Align CRM UI with ReUI patterns` thread shows
  this. Source: `src/cli/issue-write/update.ts` flags.
- **A wrong state name has no list of valid states.** The phaephe update with
  `--state Cancelled` failed once. The valid state is `Canceled`. The error names
  the team but not the states. Source: the 2026-11-03T13:38Z item in the
  appendix and `src/api/issue-write/state` resolution.

### 3. Skill loading and correlation

- **24 of 445 tracker threads loaded the installed skill (5.4%).** The skill
  tool was called 25 times in those 24 threads. Two more loads are in rata
  development. Source: `final.ts`, `skill.installedThreads`.
- **107 tracker threads read `docs/agents/issue-tracker.md` (24.0%).** 90 used
  the read tool, 19 used a shell command, and 2 did both. 325 threads
  (73.0%) read neither the skill nor the doc. Source: `final.ts`, `skill` and
  `metrics.ts`, `skillDoc`.
- **Subagents rarely load either.** 277 tracker subagent threads, 4 loaded the
  skill, 10 read the doc. Source: `final.ts`, `skill.subagent*`.
- **The raw thread failure rate follows session size, not the doc.** Skill
  threads fail at 33.3%, doc threads at 44.9%, threads with neither at 10.8%.
  Doc readers average 21.6 calls per thread; threads with neither average 4.8.
  Source: `final.ts`, `skill.groups` and the call counts in `tracker`.

| Group           | Threads | Calls | Calls/thread | Problem items | Per 100 calls | Assign threads | Comment threads |
| --------------- | ------: | ----: | -----------: | ------------: | ------------: | -------------: | --------------: |
| Installed skill |      24 |   633 |         26.4 |            16 |          2.53 |              1 |               1 |
| Tracker doc     |     107 | 2,306 |         21.6 |            80 |          3.47 |             10 |              12 |
| Either          |     120 | 2,529 |         21.1 |            85 |          3.36 |             10 |              12 |
| Neither         |     325 | 1,568 |          4.8 |            55 |          3.51 |              5 |               3 |

Source: `final.ts`, `skill.groups`; per-call rates from the tracker work list
and the problem union. The skill and doc groups overlap in 11 threads, so the
first two rows do not sum to the Either row. The per-call rate is similar across
the groups, at 2.5 to 3.5 problems per 100 calls. The skill
group has a lower form-error rate, but the sample is 24 threads. The doc group
has the highest form-error rate, which matches the wrong forms in four product
docs.

- **The doc is read before the error, not after.** 9 of 15 assign-error threads
  and 11 of 15 comment-error threads had a doc read timestamp before the first
  related error. No thread read the doc only after the error. Source:
  `visible-errors.ts` and `tools-all.json`, timestamp comparison run on
  2026-11-12.

### 4. Cost

- **The tracker scope waited 2h21m.** 3,027 command items waited 8,459s. The
  median item is 1.81s, p90 5.32s, p95 7.54s, p99 16.03s, and the maximum is
  120.1s. Source: `/tmp/opencode/rata-research/cost.ts`, `totalDurS` and
  `durQuantiles`.
- **`issue show` and `issue update` are 55% of the wait.** Apportioned by
  invocation count: show 2,816s (33%), update 1,828s (22%), create 717s (8%),
  list 693s (8%), section replace 375s (4%), search 343s (4%), link 339s (4%).
  Source: `/tmp/opencode/rata-research/wait.ts`.
- **Two updates hit the harness timeout.** One `issue update JYOT-45` item
  timed out at 60s on 2026-10-29. One `issue update FND-981 --state In Progress`
  timed out at 120s on 2026-11-08. Both have `exitCode = null` and no output.
  Source: `commands.json`, durations above 59s.
- **The output is 8.42M characters, about 2.1M tokens at 4 characters per
  token.** The median item is 724 chars, p90 7,976, p99 24,880, and the maximum
  is 51,327. The maximum is a harness cap: 21 outputs carry a truncation
  marker, and several are within 100 characters of 51,200. Source: `cost.ts`,
  `charQuantiles` and `totalChars`.
- **Reads are 94.9% of output.** Read items produce 7.99M chars, writes 0.32M
  (3.8%), and other 0.10M (1.2%). Source: `cost.ts` and the phase grouping run
  on 2026-11-12.
- **`issue show` alone is 72.2% of output.** It produces 6.08M chars in 1,096
  single-invocation items. `issue list` adds 0.63M (7.4%), `issue view` 0.14M
  (1.6%), and `search` 0.11M (1.4%). Source: `cost.ts`, `bySub`.
- **The mode ladder is steep.** For single-invocation `issue show` items:
  - 478 text calls, average 6,615 chars, 3.16M total.
  - 573 JSON calls, average 5,093 chars, 2.92M total.
  - 45 `--summary` calls, average 87 chars, 3,917 total.
    Source: `cost.ts` and `metrics.ts`, `showModes`.
- **A mission read is 25 to 28 KB; a summary is under 700 bytes.** A local
  read of `FND-967` on 2026-11-12: full JSON 25,444 bytes, `--no-comments`
  25,024, `--no-comments --no-children --no-relations --no-attachments`
  13,314, `--summary` 688. For `FND-1019`: full 27,795, summary 658. Source:
  `rata issue show` run from `/home/ulezot/Projects/js/founders-app` on
  2026-11-12.
- **Five mission issues are 27.7% of tracker output.** 224 read items mention
  `FND-967`, `FND-1019`, `FND-1068`, `HARB-327`, or `JYOT-69`, and produce
  2.33M chars. Source: `metrics.ts`, `mission`.
- **The five issues were almost never read with `--summary`.** `FND-967` has
  119 read calls (751k chars), `FND-1019` 47 (742k), `FND-1068` 30 (390k),
  `HARB-327` 30 (379k), `JYOT-69` 44 (209k). The per-ref counts overlap when
  one read mentions two refs. The mode counts show no
  `--summary` use on these refs. Source: the ref and mode run on 2026-11-12.
- **Subagents are half the output.** 277 subagent threads, 614 items, 674
  calls, 4.33M chars (51.4%). The average subagent thread is 2.4 calls and
  15.6k chars. Main threads are 168, 3,423 calls, 4.09M chars, median 17 calls.
  Source: `metrics.ts`, `lineage`.
- **Per-thread output is heavy in the tail.** Thread output p50 15,832 chars,
  p90 37,267, p99 80,386, max 108,157. 27 threads exceed 50k, 2 exceed 100k,
  and 102 exceed 25k. Source: `metrics.ts`, `threadOutput`.

| Thread                                | Items |   Chars |
| ------------------------------------- | ----: | ------: |
| Rebuild CRM shell with system theme   |    31 | 108,157 |
| Check recent English issues           |    14 | 101,816 |
| Screen sync to one bulb at 1.5 Hz     |    18 |  99,136 |
| Collect domain constraints on exports |    17 |  92,066 |
| Spec re-review of PR 8                |     8 |  80,386 |

Source: `cost.json`, `topThreads`.

- **Help probes are 12.0% of output.** 590 tracker probe calls, 428 items,
  1.01M chars. The top help topics are `issue update` (95 calls), `issue create`
  (60), root (52), `issue link` (30), `issue` (27), `issue list` (23), and
  `issue comment` (23). Source: `metrics.ts`, `probes`.

| Heaviest read                                      |  Chars | Thread                            | Repo         |
| -------------------------------------------------- | -----: | --------------------------------- | ------------ |
| `issue show JYO-33` and `JYO-26` with `--comments` | 47,458 | Screen sync to one bulb at 1.5 Hz | jyoti        |
| `issue show JYO-26 --comments`                     | 39,269 | Spec review JYO-27                | jyoti        |
| `issue show JYOT-26`                               | 39,119 | Spec review JYOT-31               | jyoti        |
| `issue show FND-967 --json`                        | 36,124 | Spec review of auth shell         | founders-app |
| `issue list --parent FND-967 --limit 250 --json`   | 34,923 | Rebuild CRM pages from ReUI       | founders-app |
| `issue show FND-967 --json`                        | 35,089 | Spec review of diff               | founders-app |

Source: `cost.ts`, `largest`.

### 5. Repetition

- **865 extra calls are exact duplicates.** 359 command pairs repeat at least
  once inside a thread with no shell variable. The extras are 21.1% of 4,097
  calls. Some are deliberate bulk-audit re-reads; the stricter stale-read count
  is below. Source: `final.ts`, `repetition.dupExtras`.
- **461 reads repeat with no write between.** They span 393 items, 121 threads,
  and 0.75M chars (8.9% of output). The worst examples are `FND-928` and
  `FND-949`, each read twice with no write. Source: `final.ts`,
  `repetition.staleReads` and `metrics.ts`, `stale`.
- **79 commands retry within 180s of a failure.** The retry is either the same
  subcommand or the same issue ref. Source: `final.ts`, `repetition.retries`.
- **Polling loops are not counted.** A `sleep`/`while` search matched 133 items,
  but most matches were prose inside heredocs, not real polls. The 79 retries
  within 180s are the reliable substitute. Source: `analyze4.ts` inputs.
- **The worst thread for repetition is `Update All Dependencies`.** It makes 14
  calls for two issues. Two `label list` calls are identical. It updates the
  same mission body three times in 12 minutes. It makes two direct comment
  calls, both fail, then one `comment create` succeeds. At least 4 of 14 calls
  are avoidable. Source: `commands.json`, thread `b5f9fabd-...`, 2026-11-03.
- **The worst thread for volume is `Rebuild CRM shell with system theme`.** 31
  items produce 108k chars. The largest single read is 35k. Source:
  `cost.json`, `topThreads`.

| Repetition measure                 |                 Count |       Share of calls or output |
| ---------------------------------- | --------------------: | -----------------------------: |
| Exact duplicate extra calls        |                   865 |                 21.1% of calls |
| Stale reads, no write between      | 461 calls / 393 items | 11.3% of calls, 8.9% of output |
| Retries after a failure            |                    79 |                  1.9% of calls |
| Form failures recovered by a retry |                    43 |                  1.0% of calls |
| `--if-unchanged` writes            |                   113 |                  2.8% of calls |

Source: `final.ts`, `repetition`; the output share uses `cost.ts` total.

### 6. Workflow shape

- **A normal main session is 17 calls; a subagent is 2.** Main tracker threads
  have mean 20.4 calls, median 17, p90 39. Subagent threads have mean 2.4,
  median 2, p90 4. Source: the main/sub split run on 2026-11-12.
- **A clean one-issue loop is 11 calls.** The `Add DOCX support to knowledge
uploads` session in founders-app runs search, two list calls, create, three
  show calls, three update calls, and close with a comment. Read 6, write 5.
  Source: `commands.json`, thread `817f7ac3-...`, 2026-11-03.
- **A mission session is 15 calls per issue.** The `Improve Codebase
Architecture` session in kachito makes 121 calls for 8 issues, with 42 section
  replaces, 17 updates, and 45 shows. Source: `final.ts`, `reps`.
- **A batch ticket session is 8 calls per issue.** The `Align CRM UI with ReUI
patterns` session in founders-app makes 123 calls for 16 issues, with 104
  writes and 19 reads. It also has 17 failures. Source: `final.ts`, `reps`.
- **The read phase is 60.5% of calls but 94.9% of tokens.** The write phase is
  35.7% of calls and 3.8% of tokens. Source: `metrics.ts`, `phases` and
  `lineage`.

| Representative thread                 | Repo         | Calls | Issues | Calls/issue | Read | Write | Other |
| ------------------------------------- | ------------ | ----: | -----: | ----------: | ---: | ----: | ----: |
| Improve Codebase Architecture         | kachito      |   121 |      8 |        15.1 |   49 |    72 |     0 |
| Align CRM UI with ReUI patterns       | founders-app |   123 |     16 |         7.7 |   19 |   104 |     0 |
| Port Rune UI ideas to Odin engine     | harbagsa     |    99 |     12 |         8.3 |   30 |    65 |     4 |
| Audit Linear issues for relevance     | fcy-app      |    66 |     14 |         4.7 |   25 |    30 |    11 |
| Spec screen-to-bulb color sync        | jyoti        |    45 |     12 |         3.8 |   29 |    11 |     5 |
| Add DOCX support to knowledge uploads | founders-app |    11 |      1 |        11.0 |    6 |     5 |     0 |

Source: `final.ts`, `reps`; the last row from `commands.json`.

- **The thread-size distribution is heavy-tailed.** 75 threads have 1 call, 215
  have 2 to 5, 86 have 6 to 20, 63 have 21 to 50, and 6 have 51 or more. The
  top 10% of threads hold 45.6% of calls; the top 20% hold 68.7%. Source: the
  thread-size distribution in `metrics.ts`, `sizes`.

### 7. Current friction on 0.9.0

The 0.9.0 binary was first observed at 2026-11-11T13:13Z. The window to
2026-11-12T19:05Z holds 1,002 tracker calls in 122 threads. 22 items printed a
rata error and 3 more failed on a JSON shape assumption, for 25 problem items in
18 threads. The problem rate is 2.5% of calls, but the same causes remain.

| Rank | Behavior                                                     | 0.9.0 items | Evidence                                                                                 |
| ---- | ------------------------------------------------------------ | ----------: | ---------------------------------------------------------------------------------------- |
| 1    | Natural forms: positional assign, direct comment, bare issue |          13 | 5 assign items (10 calls), 6 comment items (6 calls), 2 bare `issue` items               |
| 2    | `--fields` on writes and arrays                              |           4 | `KACHITO-8` update, `KACHITO-16` update, two `labels.name` list calls                    |
| 3    | Stale or missing team key                                    |           3 | `KACH`, `PHA`, `SIKHU`                                                                   |
| 4    | Flat read versus wrapped write                               |           3 | `ACME-22` assumed `{issue}`; `KACHITO` create assumed flat; `FND` link loop assumed flat |
| 5    | Root `issues list` typo                                      |           1 | `User Not Found Error Handling`                                                          |
| 6    | `--if-unchanged` conflict                                    |           1 | `KACHITO-7`                                                                              |

Source: `visible-errors.ts` post-binary slice and `final.ts`, `errors`. Two more
items failed in a data or external step: an empty `KACHITO-6` read and a `gh`
field error. They are not rata defects, so the table excludes them. Source:
`metrics.ts`, `post`.

- **The documented forms still fit the 0.6 docs.** In the 0.9.0 window,
  `issue assign` had 28 calls, 10 positional and 18 flagged. `issue comment`
  had 6 direct calls. All 16 direct calls fail. Source: the form split run on
  2026-11-12.
- **`--fields` is the main new-feature trap.** `issue update --fields` is
  rejected even though the global flag is in the help. `labels.name` is
  rejected even though labels are the common projection. Four items in two days
  is the highest rate among the new 0.9 flags. Source: `src/cli/fields.ts:56-60`,
  `src/cli/issue-write/update.ts:132`, and the post-binary slice.
- **Flat reads break old scripts.** The `ACME` session on 2026-11-12 read
  `ACME-22`, `ACME-21`, and `ACME-19` with `python3` and `d['issue']`. All
  three failed with `KeyError: 'issue'`. The same pattern worked in 0.8. Source:
  the 2026-11-12T11:26Z item in the appendix and `src/cli/issue/show.ts:114-116`.
- **Wrapped writes break new scripts.** The `KACHITO` create on 2026-11-12
  piped `issue create --json` to `jq` and read `.labels[]` at the top level.
  The create output is `{issue, visible}`, so `.labels` is null. Source:
  `src/cli/issue-write/create.ts:111` and the 2026-11-12T12:12Z item.
- **Help churn continues.** The 0.9.0 window holds 73 probe items, 109 help,
  version, or root calls, 10.9% of work calls, and 228k chars. Source:
  `metrics.ts`, `post.probes`.

### What to fix first, by observed cost

| Rank | Fix                                                                                                                | Cost removed                                      | Owner               |
| ---- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------- |
| 1    | Update the four product `docs/agents/issue-tracker.md` files to the 0.9 forms, or add a doc check to `rata status` | 47 failed calls, 43 retries, 25 threads           | product repos       |
| 2    | Read mission context with `--summary` or one section, and pass it to subagents instead of a full re-read           | 28% of tracker output; 51% of output in subagents | skills and workflow |
| 3    | Make `--fields` work on writes and array element paths, or remove the global flag from write help                  | 7 visible tracker items; 4 items in two days      | rata                |
| 4    | Store the team id in the link, or resolve a stale key by name and warn instead of failing reads                    | 28 items, 20 threads                              | rata                |
| 5    | Unify the read and write JSON shape, or document one rule in the skill and error text                              | 17 items, 15 threads; 3 in two days               | rata                |
| 6    | Add a short `--help` or a common-commands block, and load the skill once for tracker sessions                      | 590 probes, 1.01M chars                           | rata and skills     |

## Conflicts

- **Release date.** The task states 2026-11-09. The `v0.9.0` tag commit is
  2026-11-10T10:35Z, the GitHub release was published at 2026-11-10T10:37Z, and
  the first `rata v0.9.0` probe is 2026-11-11T13:13Z. This report uses the
  published time for the cohort split and the first probe for current friction.
  Sources: `git show -s --format=%cI v0.9.0`, `gh release view v0.9.0`, and
  `final.json` `versionSpan`.
- **Prior count.** The earlier note
  `docs/research/agent-usage-pain-points.md` reports 3,159 commands and 307
  threads through 2026-11-09. This study reports 5,429 work invocations and 519
  threads through 2026-11-12. The units differ: the earlier count uses command
  rows, this count uses parsed invocations. The earlier scope is reproducible:
  at the 2026-11-09T18:27Z cutoff the database has 3,150 command rows and 307
  threads with `LIKE '%rata %'`. The 9-row difference from the earlier 3,159 is
  the filter pattern; the earlier script is not available. Source: the cutoff
  query in this report.
- **Skill loading as the main cause.** The earlier note says the natural-form
  failures are mostly a skill-loading problem. This data agrees that the skill
  is rarely loaded, 24 of 445 tracker threads. It adds that the product docs
  teach the rejected forms, and that 17 of 25 form-error threads read the doc
  before the error. The per-call problem rate is similar across skill, doc, and
  neither groups (2.5 to 3.5 per 100 calls), so the skill alone is not a
  measured fix. The doc is the stronger cause for the form failures.
- **Stale team key.** The earlier note says `status` fails on a stale key.
  0.9.0 fixes `status` with a warning. `issue list` and `search`
  still fail. The fix is partial, not complete.
- **List edges.** The earlier note says `issue list` cannot carry blocking
  edges. 0.9.0 adds `--include relations`, but adoption is 8 calls. The
  capability exists; the workflow does not use it.
- **Flat reads.** 0.9.0 flattens single-resource reads. That fixes the old
  `{issue}` wrapper errors. It breaks scripts that learned the wrapper. It also
  leaves writes wrapped. The repository rule says no backward compatibility,
  so the break is accepted. The mixed read and write shape is still a cost.

## Not found

- **A 2026-11-09 release.** The tag, the GitHub release, and the version probes
  all point to 2026-11-10. No source in the data supports 2026-11-09.
- **The exact cause of `Entity not found: Issue` for `FND-967` on
  2026-11-09.** The issue reads on 2026-11-08 and again later. The data does not
  show whether Linear returned a transient error, the wrong team, or a deleted
  issue.
- **The exact cause of the two `issue update` timeouts.** Both have no rata
  output and `exitCode = null`; the harness timeout message is the only output.
  The data cannot separate a Linear API hang from a local process hang.
- **The true token count.** The report uses 4 characters per token. The harness
  tokenizer and the system prompt are not in the data. Treat the 2.1M token
  figure as an estimate.
- **The full size of the largest outputs.** The harness caps output at about
  51,200 characters. 21 outputs carry a truncation marker, so the largest reads
  may be clipped.
- **The intent behind each help call.** 590 probes are counted. The data does
  not show whether the agent was learning a new flag or recovering from an
  error.
- **The exact number of skill loads without a tool call.** The data shows
  explicit `skill` and `read` calls. A harness that injects a skill without a
  tool call would not appear.
- **The reason `issue comment <ref>` and `assign me <ref>` succeeded in some
  0.6 items and failed in others.** The version is inferred from `--version`
  probes, not from each binary. A shell that used a source checkout could run a
  different version.

## References

- `src/cli/issue/comment.ts:234-237`: the comment group has no default action.
- `src/cli/pre-parse.ts:117-131`: the one-line hints for comment and issue.
- `src/cli/assign-hint.ts:7-15`: the correct assign hint.
- `src/cli/issue-transition.ts:152-180`: the assign grammar and the error.
- `src/cli/issue/show.ts:100`: JSON includes comments by default.
- `src/cli/issue/show.ts:114-116`: the flat show object.
- `src/cli/issue/show.ts:120`: the `view` alias.
- `src/cli/issue-write/create.ts:111`: the `{issue, visible}` create output.
- `src/cli/issue-write/update.ts:89-96` and `:180`: the `{issue}` update output.
- `src/cli/issue-write/update.ts:132`: `--fields` is rejected on update.
- `src/cli/fields.ts:56-60`: array paths are rejected.
- `src/cli/fields.ts:125`: `rejectFields`.
- `src/cli/issue.ts:47-49`: `issue list --include relations`.
- `src/api/issue-query.ts:9-12`: the list relation connection.
- `src/api/repo-team.ts:33-42`: the stale team read error.
- `src/cli/status.ts:77-82`: the stale team warning.
- `src/config/repo.ts:205-217`: the legacy config removal warning.
- `docs/agents/issue-tracker.md:41-47` and `:106-108`: the canonical forms and
  the rejected forms.
- `skills/rata/SKILL.md:27-34`: the correct form table and the rejected forms.
- `/home/ulezot/Projects/js/founders-app/docs/agents/issue-tracker.md:20,27`:
  the wrong comment and assign forms.
- `/home/ulezot/Projects/odin/harbagsa/docs/agents/issue-tracker.md:24,29`:
  the wrong comment and assign forms.
- `/home/ulezot/Projects/js/phaephe/docs/agents/issue-tracker.md:22,31`: the
  wrong assign and comment forms.
- `/home/ulezot/Projects/js/jyoti/docs/agents/issue-tracker.md:131`: the wrong
  assign form.
- `/tmp/opencode/rata-research/extract.ts`: the database extraction.
- `/tmp/opencode/rata-research/analyze4.ts`: the shell and invocation parser.
- `/tmp/opencode/rata-research/final.ts`: scope, commands, errors, skill,
  repetition, cohorts.
- `/tmp/opencode/rata-research/metrics.ts`: forms, phases, lineage, stale,
  show modes, mission refs, probes, skill/doc, post-binary, thread sizes.
- `/tmp/opencode/rata-research/cost.ts`: output and duration percentiles.
- `/tmp/opencode/rata-research/wait.ts`: apportioned wait shares.
- `/tmp/opencode/rata-research/visible-errors.ts`: visible rata errors.
- `/tmp/opencode/rata-research/failures.ts`: non-zero items.
- `/tmp/opencode/rata-research/master.json`, `final.json`, `cost.json`,
  `metrics.json`, and `inv4.json`: the derived data used by the tables.
- `docs/research/agent-usage-pain-points.md`: the earlier partial study. The
  scope and conclusions are compared in Conflicts.

## Appendix: non-zero command items

The table lists all 69 command items with a non-zero exit code in the window.
49 are in tracker repositories (48 with a work invocation and 1 probe) and 20
are in the rata development repository (18 work items and 2 probes). The class
column is coarse: `CLI` means rata rejected the command, `CONSUMER`
means a jq, python, or shell consumer failed after rata, `CONFIG` means a team,
link, or auth problem, `DATA` means a missing issue, section, relation, or a
stale write, `ENV` means a module, git, gh, or filesystem problem, and `AGENT`
means the agent's own script logic.

|   # | Time (UTC)       | Repo         | Thread                                       | Command                                                                                                                 | Exit | Class    |
| --: | ---------------- | ------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---: | -------- |
|   1 | 2026-10-28 09:55 | fcy-app      | Audit Linear issues for relevance            | `rata issue show FND-477 --json`                                                                                        |    3 | CONSUMER |
|   2 | 2026-10-28 18:11 | jyoti        | Decide 1.5 Hz screen-sync transport          | `rata issue update JYO-16 --body-file /tmp/opencode/jyo16-body.md --json`                                               |    1 | CONSUMER |
|   3 | 2026-10-29 10:14 | rata         | Bulk parent issue writes with dry...         | `rata --version`                                                                                                        |    2 | ENV      |
|   4 | 2026-10-29 10:49 | rata         | Revisioned writes and PR-aware reads         | `rata -- issue show RAT-77 --json`                                                                                      |    5 | CONSUMER |
|   5 | 2026-10-29 11:07 | harbagsa     | Migrate issue tracking to Linear             | `rata --version`                                                                                                        |    1 | CONFIG   |
|   6 | 2026-10-29 11:32 | rata         | Verify comment/child read-after-write        | `rata issue show RAT-73 --json`                                                                                         |    5 | CONSUMER |
|   7 | 2026-10-29 11:32 | harbagsa     | Migrate issue tracking to Linear             | `rata issue list --team HARB --text Player shell: look, walk, cursor, reset --limit 20 --json`                          |    1 | CONSUMER |
|   8 | 2026-10-29 11:45 | rata         | Release 0.7.0 and update Arch package        | `rata -- issue update RAT-66 --body-file /tmp/opencode/RAT-66-body.md`                                                  |    1 | AGENT    |
|   9 | 2026-10-29 12:34 | jyoti        | Sync brightness with safety envelope         | `rata status`                                                                                                           |    1 | CONFIG   |
|  10 | 2026-10-29 12:54 | rata         | Section editing and body appends             | `rata issue show RATA-78 --json --no-comments --fields state.name,updatedAt`                                            |    1 | CLI      |
|  11 | 2026-10-29 13:29 | rata         | Comment lifecycle and dedupe support         | `rata issue update RATA-79 --state In Review --comment-file - --json <<EOF`                                             |    1 | CLI      |
|  12 | 2026-10-29 15:15 | rata         | Chart agent-native tracker decision...       | `rata -- issue create --title $title --parent RATA-83 --label wayfinder:$label --no-default-l...`                       |    1 | AGENT    |
|  13 | 2026-10-29 15:18 | rata         | Chart agent-native tracker decision...       | `rata -- issue show RATA-83 --json --no-comments`                                                                       |    1 | CONSUMER |
|  14 | 2026-10-29 15:53 | harbagsa     | Denoise baked indirect lightmaps             | `rata issue show HARB-307 --json --no-comments`                                                                         |    1 | CONSUMER |
|  15 | 2026-10-29 16:04 | jyoti        | Dashboard layout and light controls          | `rata issue show JYOT-47 --json --fields description,updatedAt`                                                         |    1 | CONSUMER |
|  16 | 2026-10-29 16:10 | harbagsa     | Capture harness diagnostic term views        | `rata issue assign HARB-310 me`                                                                                         |    1 | CLI      |
|  17 | 2026-10-29 17:07 | harbagsa     | Add harness pick command                     | `rata issue assign HARB-311 me`                                                                                         |    1 | CLI      |
|  18 | 2026-10-29 17:12 | rata         | Decide batch execution and progress contract | `rata -- issue list --parent RATA-83 --json`                                                                            |    5 | CONSUMER |
|  19 | 2026-10-29 17:15 | rata         | Decide the trash and restore surface         | `rata -- issue show RATA-91 --json`                                                                                     |    1 | CONSUMER |
|  20 | 2026-10-29 17:26 | rata         | Decide rata label scope resolution           | `rata -- issue show RATA-91 --json`                                                                                     |    1 | CONSUMER |
|  21 | 2026-10-29 17:33 | rata         | Decide rata label scope resolution           | `rata -- issue show RATA-99 --json`                                                                                     |    1 | CONSUMER |
|  22 | 2026-10-29 17:49 | rata         | Decide label scope semantics                 | `rata -- issue list --parent RATA-83 --all --json --fields identifier,title,state.name,priority,assignee.name`          |    1 | CONSUMER |
|  23 | 2026-10-29 18:01 | harbagsa     | Add harness pick command                     | `rata issue comment HARB-311 --body PR: https://github.com/eyenalxai/harbagsa/pull/402`                                 |    1 | CLI      |
|  24 | 2026-10-29 18:05 | rata         | Decide graph-aware issue read                | `rata -- issue list --parent RATA-83 --all --json --fields identifier,createdAt,priority,state.name`                    |    1 | CONSUMER |
|  25 | 2026-10-29 18:27 | rata         | Add issue status command                     | `rata -- issue show RATA-111 --json --no-comments --no-children`                                                        |    1 | CONSUMER |
|  26 | 2026-10-29 18:28 | rata         | Verify Linear batch write round trip         | `rata -- issue show RATA-96 --no-children --no-relations --json`                                                        |    1 | CONSUMER |
|  27 | 2026-11-01 08:20 | rata         | Unspecified triage request                   | `rata issue label add RATA-1 wontfix`                                                                                   |    5 | CONSUMER |
|  28 | 2026-11-01 08:20 | rata         | Unspecified triage request                   | `rata team show --json --fields states`                                                                                 |    5 | CONSUMER |
|  29 | 2026-11-04 16:29 | skills       | Fix issue churn in mission skills            | `rata auth --help`                                                                                                      |    2 | ENV      |
|  30 | 2026-11-06 06:52 | skills       | Stop agents rewriting mission state          | `rata issue update SKILL-14 --body-file /tmp/opencode/mission-record.md --if-unchanged 2026-11-06T06:45:02.785Z --json` |    4 | DATA     |
|  31 | 2026-11-06 08:20 | fcy-app      | Segmentation Model: Read Instructions        | `rata issue section replace FND-960 Outputs --body-file - <<EOF`                                                        |    3 | DATA     |
|  32 | 2026-11-08 12:55 | founders-app | Rebuild CRM shell with system theme          | `rata issue show FND-969 --json`                                                                                        |    5 | CONSUMER |
|  33 | 2026-11-08 13:10 | founders-app | Rebuild CRM shell with system theme          | `rata issue comment FND-980 --body-file -`                                                                              |    2 | CLI      |
|  34 | 2026-11-08 17:48 | founders-app | CRM two-factor setup and challenge           | `rata issue show FND-967 --comments --json`                                                                             |    1 | CONSUMER |
|  35 | 2026-11-08 17:48 | founders-app | CRM two-factor setup and challenge           | `rata issue show FND-984 --comments --json`                                                                             |    1 | CONSUMER |
|  36 | 2026-11-09 07:21 | founders-app | Gratitude and word-cloud review tabs         | `rata issue list --team FND --parent FND-967 --limit 100 --json`                                                        |    1 | CONSUMER |
|  37 | 2026-11-09 11:06 | founders-app | Rebuild CRM pages and auth with ReUI         | `rata issue section get FND-967 References`                                                                             |    2 | DATA     |
|  38 | 2026-11-09 11:11 | founders-app | Rebuild CRM pages from ReUI                  | `rata issue assign me FND-1015`                                                                                         |    2 | CLI      |
|  39 | 2026-11-09 13:32 | skills       | Confirm Mission Flow Manual Gates            | `rata issue create --title Merge the scope and spec gates...`                                                           |    2 | CONFIG   |
|  40 | 2026-11-09 14:51 | founders-app | Rebuild remaining CRM pages with ReUI        | `rata issue assign me FND-995`                                                                                          |    2 | CLI      |
|  41 | 2026-11-09 15:13 | jyoti        | Bulb health record and worker handle         | `rata issue show JYOT-69 --json`                                                                                        |    1 | CONSUMER |
|  42 | 2026-11-09 15:37 | founders-app | Rebuild remaining CRM pages with ReUI        | `rata issue show FND-967 --json`                                                                                        |    1 | DATA     |
|  43 | 2026-11-09 15:49 | founders-app | Rebuild CRM recipients and analytics         | `rata issue assign me FND-993`                                                                                          |    2 | CLI      |
|  44 | 2026-11-09 15:59 | jyoti        | Unify bulb metadata and token registry       | `rata issue list --parent JYOT-69 --json`                                                                               |    5 | CONSUMER |
|  45 | 2026-11-09 18:17 | harbagsa     | Improve codebase architecture                | `rata issue assign HARB-322 me`                                                                                         |    2 | CLI      |
|  46 | 2026-11-09 18:33 | sikhu        | Set up agent skills for docs and issues      | `rata issue list --team SIKHU --json`                                                                                   |    2 | CLI      |
|  47 | 2026-11-09 18:50 | skills       | Rewrite Skills With Writing Standards        | `rata issue create --title Rewrite the skills to the writing standards...`                                              |    2 | CONFIG   |
|  48 | 2026-11-09 18:51 | skills       | Rewrite Skills With Writing Standards        | `rata label list --team SKILL`                                                                                          |    1 | ENV      |
|  49 | 2026-11-09 19:13 | rata         | Review PR 29: createdAt in issue reads       | `rata -- issue status RATA-123 --json --fields issue.createdAt,nextChild.createdAt`                                     |    2 | CLI      |
|  50 | 2026-11-10 07:57 | sikhu        | Integrate ReUI component library             | `rata issue list --limit 5`                                                                                             |    2 | ENV      |
|  51 | 2026-11-10 08:57 | harbagsa     | Improve Codebase Architecture                | `rata issue assign $key me`                                                                                             |    2 | CLI      |
|  52 | 2026-11-11 08:16 | founders-app | Align CRM UI with ReUI patterns              | `rata issue create --parent FND-1035 --label ready-for-agent --assignee me...`                                          |    2 | CLI      |
|  53 | 2026-11-11 08:17 | founders-app | Align CRM UI with ReUI patterns              | `rata issue update FND-1035 --priority high`                                                                            |    5 | CONSUMER |
|  54 | 2026-11-11 08:33 | founders-app | Align CRM UI with ReUI patterns              | `rata issue update FND-1036 --state Done --comment Shipped in PR #74.`                                                  |  255 | ENV      |
|  55 | 2026-11-11 08:40 | founders-app | Implement FND-1041 row actions               | `rata issue comment FND-1041 --body-file - <<EOF`                                                                       |    2 | CLI      |
|  56 | 2026-11-11 16:18 | harbagsa     | Critique 2D lighting system design           | `rata issue assign HARB-351 me`                                                                                         |    2 | CLI      |
|  57 | 2026-11-12 08:13 | scratch      | Rune-Based Video Player Feasibility          | `rata issue show KACHITO-6 --json`                                                                                      |    1 | DATA     |
|  58 | 2026-11-12 09:25 | kachito      | Improve Codebase Architecture                | `rata issue list --json --fields identifier,title,state.name,priority,labels.name --all`                                |    2 | CLI      |
|  59 | 2026-11-12 09:38 | sikhu        | Tutor fails to generate next question        | `rata issue assign me SIKHU-15`                                                                                         |    2 | CLI      |
|  60 | 2026-11-12 09:54 | kachito      | Improve Codebase Architecture                | `rata issue update KACHITO-8 --state In Review --comment PR... --json --fields identifier,state.name`                   |    2 | CLI      |
|  61 | 2026-11-12 10:20 | kachito      | Improve Codebase Architecture                | `rata issue section replace KACHITO-7 Next step --body-file - --if-unchanged ...`                                       |    4 | DATA     |
|  62 | 2026-11-12 11:25 | harbagsa     | Critique 2D lighting system design           | `rata issue show HARB-357 --json --no-comments`                                                                         |    1 | ENV      |
|  63 | 2026-11-12 11:26 | acme         | Finish stack refresh and hardening           | `rata issue show ACME-22 --json`                                                                                        |    1 | CONSUMER |
|  64 | 2026-11-12 12:12 | kachito      | Fix video scaling and player chrome          | `rata issue create --title Player shell and export tray... --json`                                                      |    5 | CONSUMER |
|  65 | 2026-11-12 14:51 | kachito      | Codebase architecture and prose cleanup      | `rata issue list --all --json --fields identifier,title,state.name,labels.name,assignee.name`                           |    2 | CLI      |
|  66 | 2026-11-12 15:17 | kachito      | Codebase architecture and prose cleanup      | `rata issue update KACHITO-16 --body-file ... --if-unchanged ... --json --fields ...`                                   |    2 | CLI      |
|  67 | 2026-11-12 16:15 | founders-app | Fix community CRM tracking gaps              | `rata issue link FND-1070 --blocked-by FND-1069`                                                                        |    5 | CONSUMER |
|  68 | 2026-11-12 16:39 | harbagsa     | Rebuild UI with Rune-Style Components        | `rata issue assign HARB-362 me`                                                                                         |    2 | CLI      |
|  69 | 2026-11-12 18:42 | rata         | Update setup-agent-skills setup              | `rata -- --help`                                                                                                        |    1 | ENV      |

Source: `/tmp/opencode/rata-research/failures.json`, sorted by start time. The
thread column is shortened. The command column is shortened and shows the first
rata invocation; a later command in the same shell item can be the one that
failed. The full commands are in the JSON. The exit codes are the shell item
exit codes, not the rata exit codes; the appendix classes separate the consumer
and environment failures.
