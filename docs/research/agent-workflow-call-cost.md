# How agents use rata, and where the workflow costs too many calls

Date: 2026-11-12
Status: answered

## Question

For each ask-matt phase that touches the tracker, what is the minimum set of
`rata` calls? Where do the skills, the repo tracker doc, or the CLI force extra
calls or stale forms?

The scope is `rata` 0.9.0, the ask-matt skills in `~/.agents/skills`, the tracker
docs in this repo and in the repos that use `rata`, and the live Linear tracker.
The map trace predates 0.9.0. The CLI facts are checked against the installed
0.9.0 binary.

## Answer

The minimum is small. A phase needs two or three reads to establish context, one
write per state change, and one write per ticket or edge it publishes. A phase
that publishes `N` tickets and `M` blocking edges needs `2 + N + M` calls. A
phase that updates a record with `K` sections needs `1 + K` calls if the CLI can
write the sections in one batch. When the agent follows the documented loop, the
current one-section command needs `2K` calls without the dry-run and `3K` with
it.

The real sessions do not run at that minimum. Three traced sessions used 96, 68
and 51 `rata` calls. A fourth current session used 120. The excess is not search
or reasoning. It is three repeated patterns:

1. **Record updates dominate the build.** The KACHITO-7 session made 42 section
   writes and 42 `issue show --summary` reads to get the next `updatedAt`. That
   is 84 of 120 calls, or 70 percent. The agent used human output, and human
   output hides the new `updatedAt` that the write already returns.
2. **Spec and ticket publishing pays twice per ticket.** The FND-967 spec
   session created 10 tickets, then updated each ticket's priority in a second
   call. It also read each child once to verify labels, priority and edges. That
   is 20 extra calls on top of 10 creates and 17 links. The skills apply the
   label after publish. The FND session also treated priority as a second write
   even though the tracker doc allows it on create. An agent that reads only one
   source pays the extra write.
3. **Context assembly is chained.** A session start needs the work item body,
   its state, its children, its blockers and its PRs. No single read returns all
   of that. Agents call `issue show`, then `issue status`, then `issue list`, or
   they repeat the same read after every write. The handoff prompt names the work
   item by title and team but never by id, so every new session starts with a
   `search`.

The FND tracker doc is the main stale source. It teaches three forms that 0.9.0
rejects: `issue comment <ref>`, `issue assign me <ref>`, and `label ensure`. It
also teaches two unsafe instructions: `issue list ... --limit 250` without
`--all` or `--include relations`, and a map update through a whole-body
`issue update --body-file`. The other repo tracker docs in the same estate repeat
the same forms.

The first change is a batch section write:
`rata issue update <ref> --sections-file -`. It applies several section
replacements with one snapshot check and returns one new `updatedAt`. This
removes about 72 of the 120 KACHITO-7 calls by itself, and it removes the unsafe
shell loops that other sessions use to approximate it.

Confidence is high for the 0.9.0 CLI shapes and the FND-967, FND-969 and KACHITO-7
counts. Confidence is medium for the RATA-83 map trace because it ran on 0.7.0.

## Phase table

The notation: `N` is the number of tickets, `M` the number of blocking edges, `B`
the number of blocked tickets, and `K` the number of record sections. "Docs
imply" means the calls a careful agent makes when it follows the named skill and
tracker doc literally. "Minimum" means the calls needed with the current 0.9.0
CLI, assuming the agent knows the ref and does not verify twice.

| Phase                | What the agent must know                                                               | Minimum calls with 0.9.0                                                                              | Calls the docs imply                                                                                                                                         | Gap                                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Triage queue         | Which issues are unlabeled, `needs-triage`, or `needs-info` with new reporter activity | 4: `status`, two label lists, one full list filtered for unlabeled                                    | 6: add `team show` for label strings and `search` for duplicates (`triage/SKILL.md:66-74`)                                                                   | No unlabeled filter and no "reporter activity since" filter. The agent must fetch comments or accept false positives.                                            |
| Triage one issue     | Body, comments, labels, priority, assignee, state, PRs                                 | 2: `issue show <ref> --json` and `issue status <ref> --json`                                          | 3: add `team show`; the skill also asks for a duplicate search (`triage/SKILL.md:78-82`)                                                                     | `show` has no PRs, blockers or `nextChild`; `status` has no body or comments.                                                                                    |
| Spec                 | Problem, decisions, existing spec, gate                                                | 2: `status` and `issue create` for a new spec; or `issue show` and `issue update` for an existing one | 3: create with label and priority, then one verify; the skill adds a label call if read alone (`to-spec/SKILL.md:35-44`, `docs/agents/issue-tracker.md:177`) | The skill applies the label after publish; the tracker doc puts it on create. An agent that follows the skill pays one extra call.                               |
| Tickets              | Spec body, existing children, edges, surfaces                                          | `2 + N + M`: spec read, `N` creates with label and priority, `M` links                                | `2 + 2N + M`: the skill applies `ready-for-agent` after publish (`to-tickets/SKILL.md:117-125`), so an agent can create then label each ticket               | The split between "publish" and "apply the label" adds up to `N` writes. The FND-967 trace added another `N` priority updates.                                   |
| Wayfinder map        | Destination, notes, fog, existing children, ticket types                               | `3 + N + M`: status, map write, `N` child creates, `M` links                                          | `3 + N + M` from `wayfinder/SKILL.md:119-132` and `docs/agents/issue-tracker.md:194-225`. The per-child label reads are agent-added.                         | The trace used 18 per-child `issue show` calls for labels. One `issue list --parent --fields identifier,labels` replaces them. The CLI has no relation gap here. |
| Frontier and claim   | The first ready child and its body                                                     | 3: `next --parent`, `issue show <ticket>`, `issue assign <ticket> --assignee me`                      | `3 + B`: `next` plus one `why` per blocked ticket (`docs/agents/issue-tracker.md:202-218`)                                                                   | `next` returns the summary without the body. `why` is a second read per blocked ticket. A `next --claim` call would be 1.                                        |
| Session start        | Work item title, state, body, gate, frontier                                           | 2: `status`, `issue show <ref> --json`; add `issue list --parent` for a map or spec                   | 4: title `search`, `show`, `status`, and a frontier list (`handoff/SKILL.md:83-84,128`)                                                                      | The handoff forbids the id, so the next session must search by title. Two reads are often the same issue.                                                        |
| Implement one ticket | Approved gate, ticket body, spec, file scope                                           | 2: `issue show <ticket>` and `issue show <parent>`                                                    | 3: the skill fetches the ticket and then reads the mission document, which is the same issue on a feature (`implement/SKILL.md:16-23`)                       | Duplicate read of the work item.                                                                                                                                 |
| Implement frontier   | Spec, child edges, cap, PR state                                                       | `2 + N`: spec read, child list with relations, `N` claims                                             | `2 + 3N`: add one worker re-read per ticket and one status read per ticket (`implement-spec/SKILL.md:54-70,80-89`)                                           | The crew chief already has the ticket and spec. The worker re-reads both.                                                                                        |
| Handoff              | Work item, gate, frontier, references                                                  | 1: `issue show <ref>` if the prompt carries the ref                                                   | 3: title search, show, status (`handoff/SKILL.md:83-84,110-113,128`)                                                                                         | The prompt carries a title, not a ref. The search can also hit the wrong issue.                                                                                  |
| Review and PR        | Ticket body, spec, PR attachments                                                      | 0: pass the ticket and spec text in the reviewer prompt; 2: fetch both                                | 2 per review: ticket and parent spec (`code-review/SKILL.md:41-50`)                                                                                          | The Spec reviewer re-fetches both issues even when the crew chief has both.                                                                                      |
| Close                | Every child is Done, spec state                                                        | 2: `issue list --parent --all --fields identifier,state.type` and `issue close`                       | 3: `issue status` to inspect `nextChild`, then a list, then close (`docs/agents/issue-tracker.md:186-187`)                                                   | `nextChild: null` is ambiguous. It can mean all done, all blocked, or all claimed.                                                                               |

## Session traces

The counts come from `~/.t3/userdata/statev2.sqlite`, table
`orchestration_v2_projection_turn_items`, type `command_execution`. A shell loop
is expanded from its output or its static list. The counts are CLI invocations,
not tool calls. One shell command can hold several invocations.

### Map: chart RATA-83

Thread `9a7f87f6-35ea-4a0e-bcbf-4d521575721b`, title "Chart agent-native tracker
decision map", 2026-10-29, `rata` 0.7.0. The thread has 54 command items and 96
`rata` invocations. The map is RATA-83 and the 18 children are RATA-91 through
RATA-108.

| Operation        | Calls | Notes                                                                                      |
| ---------------- | ----: | ------------------------------------------------------------------------------------------ |
| version and help |     5 | two version calls, one failed because the dev build was missing a module; three help calls |
| `status`         |     2 | one failed before `bun install`                                                            |
| `issue show`     |    28 | 18 are one-per-child label reads; 3 re-read the map after updates; 3 failed on a JSON pipe |
| `issue list`     |     5 | 1 failed on `--fields labels.name`; 3 context reads; 1 verification                        |
| `issue create`   |    18 | RATA-91 through RATA-108                                                                   |
| `issue link`     |    24 | blocking edges                                                                             |
| `why`            |     4 | one per blocked ticket                                                                     |
| `next`           |     1 | frontier                                                                                   |
| `issue update`   |     4 | 1 failed on `--fields`; 3 map body updates                                                 |
| `issue section`  |     4 | 3 replace, 1 append                                                                        |
| `label list`     |     1 | type labels                                                                                |

Classes: 12 context reads, 49 writes, 6 verification reads, 22 re-reads, 7 failed
calls. The 18 child reads are the single largest avoidable block. One
`issue list --parent RATA-83 --all --json --fields identifier,labels` would return
the same facts. The command exists. The trace used `--fields labels.name`, which
0.9.0 rejects because a path cannot enter an array, and then fell back to 18
shows instead of selecting `labels` as a whole. The failed call is at 15:10:52.

The 24 links are not waste. The graph needs 24 edges. The 18 creates are not
waste either. The waste is in verification and discovery: 18 child shows, 7
failed calls, 3 map re-reads, and 4 `why` calls that the frontier query answers
in one row set. Some of the failed calls are a missing dev dependency, not a CLI
defect. The per-child label reads are the design cost.

### Spec: publish FND-967 and its tickets

Thread `47a029dc-6b28-47d5-b6a9-70aa43080eef`, title "Adopt ReUI dashboard
shells in CRM", 2026-11-08, `rata` 0.8.0. The thread has 109 command items and 68
`rata` invocations. It publishes FND-967 and 10 child tickets FND-968 through
FND-977.

| Operation         | Calls | Notes                                                                              |
| ----------------- | ----: | ---------------------------------------------------------------------------------- |
| `search`          |     6 | three pairs of terms before the spec existed                                       |
| `issue show`      |    18 | 3 existing issues before the spec, 5 reads of FND-967, 10 child verification reads |
| `issue list`      |     1 | started issues                                                                     |
| `issue create`    |    11 | FND-967 plus 10 tickets                                                            |
| `issue update`    |    14 | 1 spec priority, 3 spec body updates, 10 ticket priority updates                   |
| `issue label add` |     1 | `ready-for-agent` after create                                                     |
| `issue link`      |    17 | blocking edges                                                                     |

Classes: 10 context reads, 43 writes, 15 verification reads, 0 failed calls. The
10 priority updates are pure duplication. `issue create` accepts `--priority`.
The 10 child shows are pure duplication. One
`issue list --parent FND-967 --all --json --include relations` returns labels,
priority and edges for all 10 rows. The 6 searches are reasonable for an unknown
spec, but three pairs repeat the same intent.

Minimum for this phase: 2 context reads, 11 creates with label and priority, 17
links, 1 verification list, 1 final body update. That is 32 calls. The session
used 68. The gap is 36 calls, mostly 10 priority updates, 9 extra child shows and
3 duplicate body updates with 5 verification reads.

### Ticket: FND-969 under FND-967

Thread `4716c9ec-f501-4817-970f-58f32816f098`, title "Rebuild CRM shell with
system theme", 2026-11-08, `rata` 0.8.0. The thread has 257 command items and 47
command lines that invoke `rata`. The shell loops expand to 51 process calls. It
implements FND-969 and edits the FND-967 record.

| Operation                       | Calls | Notes                                             |
| ------------------------------- | ----: | ------------------------------------------------- |
| `search`                        |     2 | one for the spec, one for the ticket              |
| `issue show FND-967`            |     8 | repeated spec reads                               |
| `issue show FND-969`            |     6 | repeated ticket reads                             |
| `issue show` of created tickets |     5 | FND-980, FND-981, FND-982, FND-999                |
| `issue list`                    |     6 | five child lists plus one team list               |
| `issue update`                  |     8 | 1 ticket state, 4 spec body updates, 3 help calls |
| `issue create`                  |     3 | one new ticket, one dry-run, one help call        |
| `issue comment create`          |     2 | one canonical, one help call                      |
| `issue comment` (rejected)      |     1 | the direct form                                   |
| `issue link`                    |     1 | one relation                                      |
| `issue close`                   |     8 | the close loop for the eight superseded tickets   |
| help                            |     1 | after the rejected comment form                   |

The largest block is 22 context or re-read calls, and 23 calls write. Five reads
verify created tickets. Two calls failed, and one help call followed a failure.
The 8 spec reads and 5 child lists are the largest block. The session fetches the
spec in human mode first, then JSON, then again after each body update. One
`issue show FND-967 --json` at the start plus one verification read at the end is
enough.

Minimum for one ticket: 2 reads, 1 claim, 2 state writes with comments, 1 close,
1 verification. That is 7 calls. The session used 51. Not all 44 excess calls are
ticket work: the session also rewrote the parent record and created another
ticket. That is exactly the boundary problem. A ticket session carries the whole
mission record and pays for it.

### Supplementary: KACHITO-7 spec, tickets and record

Thread `9c8641d9-c8dd-4469-a923-8ed5aaaf6fb3`, title "Improve Codebase
Architecture", 2026-11-12, `rata` 0.9.0. The thread has 289 command items and 120
`rata` invocations. It creates KACHITO-7, five child tickets KACHITO-8 through
KACHITO-12, implements the stack, and updates the record after every ticket.

The load-bearing counts are exact:

- 42 `issue section replace` commands, all on KACHITO-7.
- 43 `issue show KACHITO-7`; 42 are the snapshot read before a section write, 1
  is the final verification.
- 15 ticket state updates, 6 ticket creates, 5 links, 1 close.
- 3 failed calls: one `--fields labels.name` on a list, one `--fields` on an
  update, one `--if-unchanged` conflict on a section write.
- 3 help calls, one `status`, one `team show`.

The 42 snapshot reads match the 42 section writes one for one. The write returns
the new `updatedAt` in JSON:

```json
{
  "issue": { "identifier": "KACHITO-7", "updatedAt": "2026-11-12T09:41:51.602Z" },
  "section": { "heading": "Flow", "level": 2 }
}
```

The human output is only `Updated KACHITO-7, section "Flow".` (`src/cli/issue/section.ts:75-77`).
The agent therefore read the issue again before the next section. The docs teach
this loop: read the snapshot, preview the diff, write with `--if-unchanged`
(`docs/agents/issue-tracker.md:73-83`, `skills/rata/SKILL.md:148-157`).

A batch write would turn 84 calls into about 12: one read at the start of a
record update, then one batch call for the four sections that change. That saves
about 72 calls, or 60 percent of the session.

The same pattern is present outside this trace. In the 317 threads that used
`rata` since 2026-11-09, there are 139 `issue section replace` or `append` calls,
and 42 of them are in KACHITO-7. Some sessions batch four section writes inside
one shell command instead of reading between them. That avoids the reads but
loses the snapshot check and makes the record update non-atomic. A native batch
command gives both the low call count and the safety.

## Missing one-call reads

| Missing read               | Exact command or flag                                                         | Output shape                                                                                                                                                                                                           | Replaces                                                                                                 |                                                          Calls saved |
| -------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------: |
| Session read for one issue | `rata issue status <ref> --session --json`                                    | The summary plus `description`, `comments`, `relations`, `prs`, `blocked`, `blockedBy`, `nextChild`, and `children` rows with `identifier`, `title`, `state`, `priority`, `assignee`, `labels`, `blocked`, `blockedBy` | `issue show` plus `issue status`, and for a parent `issue list --parent --include relations`             |                                                   1 to 2 per session |
| Ticket plus spec           | `rata issue show <ref> --with-parent --json`                                  | The ticket object plus `parentBody` with the parent `description`, `identifier` and `title`                                                                                                                            | `issue show <ticket>` plus `issue show <parent>`                                                         |                                               1 per ticket or review |
| Array field projection     | `rata issue list --parent <ref> --json --fields identifier,title,labels.name` | Each row keeps `labels` as an array of objects with only `name`, or as an array of strings                                                                                                                             | The whole-array `labels` already works. This removes only the rejected dotted path and the local filter. | 17 in the RATA-83 chart when the agent falls back to per-child shows |
| Triage queue               | `rata triage --json`                                                          | `{ "unlabeled": [...], "needsTriage": [...], "needsInfo": [...] }`, each row with `identifier`, `title`, `labels`, `priority`, `assignee`, `lastCommentAt`, `lastCommentAuthor`, `updatedAt`                           | 3 label or full list calls plus one `issue show` per candidate                                           |                                        2 to 3 per triage run, plus N |
| Whole frontier             | `rata frontier <parent> --with-body --json`                                   | `{ "parent": {...}, "frontier": [rows with description, relations, state, labels], "blocked": [...], "claimed": [...] }`                                                                                               | `next` plus one `why` per blocked ticket plus one `show` for the chosen candidate                        |                                                              `B + 1` |
| Claim and read             | `rata next --parent <ref> --claim --json`                                     | The full ticket object after assigning it to the viewer, or `null` when no ticket is ready                                                                                                                             | `next`, `issue show`, `issue assign`                                                                     |                                                         2 per ticket |
| Several sections           | `rata issue show <ref> --sections "Flow,Gates,Outputs,Next step" --json`      | `{ "sections": [{ "heading", "level", "content" }] }`                                                                                                                                                                  | 1 `issue section get` per heading, or a full body read                                                   |                                              `K - 1` per record read |
| Write fields               | `--fields` on `issue create`, `issue update`, `issue section replace`         | The write result trimmed to the requested paths, for example `{ "identifier", "updatedAt" }`                                                                                                                           | A verification `issue show` after each write, and a parse of the wrapped result                          |                                                    1 per write batch |

The `--fields` array limit is a design choice, not a bug. ADR-0010 says a path
into an array is a validation error (`docs/adr/0010-read-shapes-follow-the-resource.md:41-47`).
The map trace hit it at 15:10:52. A new syntax such as `labels.name` that maps
over the array is the smallest fix. It does not change the existing contract for
paths that enter an array with no projection.

## Write cost: the section loop

The record template has 10 headings: Problem, Flow, Gates, Session plan,
References, Decisions, Rejected options, Outputs, Follow-ups, Next step
(`~/.agents/skills/mission/mission-template.md:23-131`). A boundary update
usually changes Flow, Gates, Outputs and Next step. The current command edits one
heading. The docs teach three calls per heading: read the snapshot, dry-run, then
write with `--if-unchanged`. That is 8 calls for one boundary update without the
dry-run, or 12 with it.

The CLI already returns the next snapshot. `issue section replace` JSON returns
`issue.updatedAt` (`src/cli/issue/section.ts:71-74`,
`skills/rata/reference.md:321`). The agent can chain the next write with that
value and skip the read. The human output hides it, and the docs do not mention
the chain. That is a one-line fix for the read half of the cost.

The write half needs a batch command:

```bash
rata issue update KACHITO-7 --sections-file - --dry-run
rata issue update KACHITO-7 --sections-file - --if-unchanged <updatedAt>
```

Input:

```json
{
  "sections": [
    { "heading": "Flow", "content": "- [X] implement...\n" },
    { "heading": "Gates", "content": "| Gate | ... |\n" },
    { "heading": "Outputs", "content": "- PRs: ...\n" },
    { "heading": "Next step", "content": "- Skill to load: ...\n" }
  ]
}
```

Output:

```json
{
  "issue": { "identifier": "KACHITO-7", "updatedAt": "2026-11-12T12:00:00.000Z" },
  "sections": [
    { "heading": "Flow", "action": "replaced" },
    { "heading": "Gates", "action": "replaced" },
    { "heading": "Outputs", "action": "replaced" },
    { "heading": "Next step", "action": "replaced" }
  ]
}
```

One dry-run shows one unified diff for all sections. One write checks one
snapshot. The command validates every heading before the first write, so a bad
heading cannot leave a partial update. The command also gives the four-section
shell loop a safe replacement.

## Subagent context

A child session starts without the parent's tracker context. The evidence is
direct:

- The KACHITO "Spec review export boundary" subagent
  (`ses_e30d90b9dffe59MOxgR4ES06Y8`) starts with two tracker reads:
  `rata issue show KACHITO-8 --json` and `rata issue show KACHITO-7 --json`.
- The FND-968 worker (`75b2c439-ebad-43a5-9b50-566c68a5772d`) starts with
  `rata issue view FND-967` and `rata issue view FND-968`.
- `implement-spec` says each worker "gets only its ticket body, the spec section
  it needs" (`implement-spec/SKILL.md:80-83`). In practice the prompt carries
  refs, and the worker fetches the bodies.
- `code-review` allows a path or fetched contents for the spec
  (`code-review/SKILL.md:94-98`). The parent often has the contents and still
  passes the path.

The handoff contract for a child should require the text, not the ref:

```text
Tracker context. Do not call rata issue show for the ticket or the spec.

Ticket: <identifier> <title>
State: <state>
Body:
<full ticket markdown>

Acceptance criteria:
<criteria>

Spec: <identifier> <title>
Spec body:
<the spec sections this ticket needs>

Relations: blockedBy <ids>; blocks <ids>
Write scope: update, comment on, or close <ticket> only. Do not edit the parent
spec. If a fact is missing, stop and ask the parent; do not guess.
```

The parent should also pass the current `updatedAt` and the rule for writes. A
worker that writes twice can chain the returned `updatedAt` and avoid a read. A
worker that only opens a PR needs no tracker write.

Calls saved: 2 per worker and 2 per Spec reviewer. For a 10-ticket feature with
one worker and two reviews per ticket, that is 40 calls. For the KACHITO stack it
is 10.

## Per-phase session start contract

This is the smallest set that gives an agent the context it needs. Use the exact
commands. Add a write only when the phase changes state.

| Phase                | Exact commands                                                                                                                                                                                          |       Calls |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------: |
| Triage queue         | `rata status --json`; `rata issue list --label needs-triage --all --json`; `rata issue list --label needs-info --all --json`; `rata issue list --all --json` filtered for no labels                     |           4 |
| Triage one issue     | `rata issue show <ref> --json`; `rata issue status <ref> --json`                                                                                                                                        |           2 |
| Spec, new            | `rata status --json`; `rata issue create --title ... --label ready-for-agent --priority medium --assignee me --body-file - --json`                                                                      |           2 |
| Spec, existing       | `rata issue show <ref> --json --no-comments`; `rata issue update <ref> --body-file - --json`                                                                                                            |           2 |
| Tickets              | `rata issue show <spec> --json --no-comments`; `rata issue list --parent <spec> --all --json --include relations`; `N` creates with `--label ready-for-agent --priority <value>`; `M` links             | `2 + N + M` |
| Map chart            | `rata status --json`; map create or update; `N` child creates with `--no-default-labels --assignee none --priority <value>`; `M` links; one verification list                                           | `3 + N + M` |
| Frontier and claim   | `rata issue list --parent <map> --unblocked --unassigned --include relations --sort priority --all --json`; `rata issue show <ticket> --json --no-comments`; `rata issue assign <ticket> --assignee me` |           3 |
| Implement one ticket | `rata issue show <ticket> --json`; `rata issue show <parent> --json --no-comments`                                                                                                                      |           2 |
| Implement frontier   | `rata issue show <spec> --json --no-comments`; `rata issue list --parent <spec> --all --json --include relations`; one claim per ready ticket                                                           |     `2 + N` |
| Handoff              | `rata issue show <ref> --json --no-comments`; `rata issue status <ref> --json` only if PRs or blockers matter                                                                                           |      1 to 2 |
| Review               | Pass the ticket text and spec text in the reviewer prompt. Use `rata issue show <ticket> --json` and `rata issue show <parent> --json` only when the parent did not pass them.                          |      0 to 2 |
| PR                   | `rata issue status <ticket> --json` when the PR attachment state matters                                                                                                                                |           1 |
| Close                | `rata issue list --parent <spec> --all --json --fields identifier,state.type`; `rata issue close <spec> --comment ...`                                                                                  |           2 |

The first call in a fresh session should be `rata status --json` only when the
session needs the team, viewer or defaults. If the handoff prompt carries the
team and the ref, skip it. `status` does not identify the work item.

The first call for a known work item should be `issue show <ref> --json
--no-comments`. It returns the body, labels, children and relations. Add
`--no-children --no-relations` when the phase does not need them. For a map or a
spec, follow with the child list with relations. For a leaf ticket, follow with
`issue status` only when the PR attachment or the blocker flag matters.

## Evidence

### CLI and live reads

- `rata v0.9.0`, installed at `/home/ulezot/.local/bin/rata`, 2026-11-12.
- `rata issue show RATA-102 --json --no-comments` returns the issue object at the
  top level with keys `assignee`, `attachments`, `children`, `createdAt`,
  `description`, `id`, `identifier`, `labels`, `parent`, `priority`, `project`,
  `relations`, `state`, `team`, `title`, `updatedAt`, `url`.
- `rata issue status RATA-102 --json` returns those summary keys plus `blocked`,
  `blockedBy`, `prs`, `nextChild`. It has no `description` and no `comments`.
- `rata issue show FND-967 --json` returns 39 children with only `id`,
  `identifier`, `state`, `title`. The children have no labels, priority,
  relations or assignee.
- `rata issue list --parent RATA-83 --all --json --include relations` returns 18
  rows, each with the six relation groups. It is 35,740 bytes for this map.
- `rata issue show RATA-83 --json` is 28,659 bytes. `rata issue status RATA-83
--json` is 1,418 bytes. The lean read is 20 times smaller.
- `rata issue show RATA-83 --json --fields issue.identifier` exits 2 with
  `Unknown field path: issue.identifier`. This is the old envelope shape.
- `rata issue list --parent RATA-83 --json --fields identifier,labels.name` exits
  2 with `The field path enters the array labels.` The hint says `Select labels
as a whole`.
- `rata issue section get RATA-83 "Decisions so far" --json` returns
  `{ "heading", "level", "content" }`.
- `rata label --help` lists `list`, `create`, `edit`. It has no `ensure`.
- `rata issue --help` lists `show, view`, `status`, `create`, `comment`,
  `update`, `section`, `label`, `close`, `reopen`, `assign`, `unassign`, `link`,
  `unlink`. It has no claim command.

### File citations

- This repo's tracker doc is current: `docs/agents/issue-tracker.md:59-67` for
  `issue show`, `:68-72` for `issue status`, `:73-83` for the section loop,
  `:96-105` for `issue list --include relations`, `:177-185` for spec publishing,
  `:194-225` for wayfinding.
- The section write returns `updatedAt` in JSON:
  `src/cli/issue/section.ts:71-74`, documented at
  `skills/rata/reference.md:321`.
- The human section output hides it: `src/cli/issue/section.ts:75-77`.
- The write result wrapper is `{ "issue": ... }`:
  `src/cli/issue-write/create.ts:111`, `src/cli/issue-write/update.ts:180`.
- The flat read rule is ADR-0010:
  `docs/adr/0010-read-shapes-follow-the-resource.md:30-39`.
- The canonical form rule is ADR-0009:
  `docs/adr/0009-one-canonical-form-per-operation.md:24-37`.
- `skills/rata/SKILL.md:140-146` calls `issue status` "the one read for a session
  start" but lists no body or comments.
- `skills/rata/SKILL.md:148-157` teaches read, dry-run, write for one section.
- `to-spec/SKILL.md:35-44` applies `ready-for-agent` after publishing.
- `to-tickets/SKILL.md:107-125` applies the label after publishing.
- `implement/SKILL.md:16-23` fetches the ticket and then reads the mission
  document.
- `implement-spec/SKILL.md:54-70` reads the spec, tickets and mission document,
  then claims each ticket one by one.
- `implement-spec/SKILL.md:80-89` says a worker gets its ticket body.
- `handoff/SKILL.md:83-84,110-113,128` names the work item by title and team,
  never by id or URL.
- `code-review/SKILL.md:41-50` fetches the ticket and treats the parent spec as
  context.
- `mission/mission-template.md:23-131` defines the 10 record sections.
- `triage/SKILL.md:66-74` asks for three buckets but names no command.
- `triage/SKILL.md:78-94` gathers the full issue and applies the outcome in
  separate steps.

### Stale tracker docs

The canonical FND checkout is `/home/ulezot/Projects/js/founders-app`. Its
`docs/agents/issue-tracker.md` teaches these forms:

- `rata issue show <ref> --comments --json` at line 15. Valid, but `--comments`
  is redundant in JSON mode. Comments are included by default.
- `rata issue comment <ref> --body-file -` at line 20. 0.9.0 rejects it. The
  canonical form is `issue comment create`.
- `rata issue assign me <ref>` at line 27 and line 133. 0.9.0 rejects the
  positional form and the reversed order. The canonical form is
  `issue assign <ref> --assignee me`.
- `rata label ensure --team FND` at line 34. 0.9.0 has no `label ensure`.
- `rata issue show <ref> --comments` at line 88. Human output, no JSON. An agent
  that expects JSON or the old `.issue` envelope fails.
- `rata issue list --parent <spec-ref> --limit 250 --json` at lines 102-103. It
  returns one page with no `--include relations`, so it has no edges and can
  truncate at 250.
- Map and child creates at lines 123-124 without `--no-default-labels` or
  `--assignee none`. This does not enforce the map rule.
- `rata issue list --parent <map-ref> --unblocked --unassigned --json` at line 131. It has no `--include relations`, no `--sort priority`, and no `--all`. The
  first result is creation order, not priority order or map order.
- `rata issue assign me <ref>` at line 133 and `issue comment <ref>` at line 135.
  Both are rejected.
- Whole-body map update with `issue update <map-ref> --body-file -` at line 137.
  This can drop headings.

The same stale forms appear in other checkouts:

- `/home/ulezot/.t3/worktrees/sikhu/t3-009d56bd/docs/agents/issue-tracker.md:17,26,78,103,105`
  has the positional assign, direct comment, `--limit 250` one-page read, claim,
  and resolve forms.
- `/home/ulezot/.t3/worktrees/skills/t3-21184ab5/docs/agents/issue-tracker.md:118-120`
  uses `--limit 250` and manual paging without `--all` or relations.
- `/home/ulezot/.t3/worktrees/acme/t3-9d15b7a4/docs/agents/issue-tracker.md:17,26,78,103,105`
  repeats the Sikhu forms.

The repo tracker docs that are current show the correct forms. The KACHITO
checkout at `/home/ulezot/.t3/worktrees/kachito/t3-953feee2/docs/agents/issue-tracker.md:203-225`
teaches `next`, the full frontier query, `why`, claim and resolve correctly.

Three more places carry the old shape or the old form:

- `docs/adr/0010-read-shapes-follow-the-resource.md:9-16` says "The read commands
  wrap the primary object in a named key". The Decision at lines 30-33 says the
  opposite: a resource is the object at the top level. The context is historical,
  but it is in the present tense. An agent that reads only the context may parse
  `.issue` on a flat read.
- `docs/research/agent-usage-pain-points.md:26-28` says single-issue reads wrap
  `{"issue": ...}`. The note is dated 2026-11-09 and marked partial. It describes
  the 0.8.0 shape, not the 0.9.0 shape.
- `README.md:1425,1445` lists `issue <ref>` and `issue comment <ref>` under
  "Breaking changes". The section is historical, but a grep for `issue comment`
  lands on the old side of the arrow. An agent can copy the rejected form.

### Session evidence

- Map: thread `9a7f87f6-35ea-4a0e-bcbf-4d521575721b`, 54 command items, 96
  invocations. The map is RATA-83, 18 children.
- Spec: thread `47a029dc-6b28-47d5-b6a9-70aa43080eef`, 109 command items, 68
  invocations. FND-967 has 39 children; the session created FND-968 through
  FND-977.
- Ticket: thread `4716c9ec-f501-4817-970f-58f32816f098`, 257 command items, 51
  process calls. FND-969 is a child of FND-967.
- Current: thread `9c8641d9-c8dd-4469-a923-8ed5aaaf6fb3`, 289 command items, 120
  invocations. KACHITO-7 has 5 children and 5 PR attachments.
- Since 2026-11-09: 3,105 `rata` invocations across 317 threads, 82 non-zero
  exits. Observed stale attempts: 16 `assign me <ref>`, 12 `assign <ref> me`, 22
  `issue comment <ref>`, 9 `--limit 250` without `--all`, 139 section writes.
- The KACHITO review subagent `ses_e30d90b9dffe59MOxgR4ES06Y8` starts with
  `issue show KACHITO-8` and `issue show KACHITO-7`.
- The FND-968 worker `75b2c439-ebad-43a5-9b50-566c68a5772d` starts with
  `issue view FND-967` and `issue view FND-968`.

### Issue URLs

FND-967 and FND-969 live in the `founders` workspace, not the `personal`
workspace that this repo uses. The reads ran from
`/home/ulezot/.t3/worktrees/founders-app/t3-71d15836`, whose repository config
points to team FND and workspace `founders`. RATA-83, RATA-102, KACHITO-7 and
KACHITO-8 live in the `personal` workspace.

- RATA-83: https://linear.app/utbetdix/issue/RATA-83/agent-native-tracker-follow-ups-for-rata-0100
- RATA-102: https://linear.app/utbetdix/issue/RATA-102/decide-the-declarative-apply-semantics
- FND-967: https://linear.app/zaagdar/issue/FND-967/crm-reui-first-pages-auth-and-list-foundation
- FND-969: https://linear.app/zaagdar/issue/FND-969/new-shell-and-system-theme
- KACHITO-7: https://linear.app/utbetdix/issue/KACHITO-7/harden-the-playback-session-and-export-boundaries
- KACHITO-8: https://linear.app/utbetdix/issue/KACHITO-8/deepen-the-export-boundary

## Conflicts

1. **FND tracker doc against 0.9.0.** The doc teaches direct `issue comment`,
   positional `issue assign`, and `label ensure`
   (`/home/ulezot/Projects/js/founders-app/docs/agents/issue-tracker.md:20,27,34`).
   The 0.9.0 CLI rejects all three. The repo follows the CLI and the RATA tracker
   doc, which teach `issue comment create`, `issue assign <ref> --assignee me`,
   and `label list/create/edit`. The FND doc must be regenerated from the RATA
   template.
2. **FND tracker doc against the map rule.** The FND doc creates maps and children
   without `--no-default-labels --assignee none` (lines 123-124). The RATA
   tracker doc requires both (`docs/agents/issue-tracker.md:194-195`), and the
   wayfinder skill says maps carry no triage labels and stay unassigned
   (`wayfinder/SKILL.md:71-73`). The repo follows the RATA doc.
3. **FND frontier order against the CLI.** The FND doc says the first result of
   `issue list --parent <map> --unblocked --unassigned --json` is "in map order"
   (line 132). The CLI orders lists by `createdAt`; `next` orders by priority
   then `createdAt`; the RATA doc says the same (`docs/agents/issue-tracker.md:202-210`).
   The repo follows the RATA doc. "Map order" is not a stored order.
4. **`issue status` as the session read.** `skills/rata/SKILL.md:140` calls it
   "the one read for a session start". It returns no `description` and no
   `comments`. An agent that needs the body must call `issue show` too. The repo
   has no single read for both. The conflict is in the wording, not the CLI.
5. **Label timing.** `to-spec/SKILL.md:38` and `to-tickets/SKILL.md:122` apply
   `ready-for-agent` after publish. `docs/agents/issue-tracker.md:177,179` passes
   it on create. The repo follows the tracker doc. The skills should say "create
   with the label", not "publish, then apply".
6. **Priority timing.** `to-tickets/SKILL.md:107-125` does not name a priority on
   create. `docs/agents/issue-tracker.md:178-179` does. The FND-967 session
   created 10 tickets without priority and updated each one after. An agent that
   reads only the skill pays 2 writes per ticket.
7. **Duplicate spec read in `implement-spec`.** `implement-spec/SKILL.md:54`
   says read the spec, the tickets and the mission document. On a feature the
   spec is the mission document. The repo treats them as one issue
   (`mission/SKILL.md:388-391`). The skill should say "read the spec, then its
   child list".
8. **Handoff title against session cost.** `handoff/SKILL.md:83-84,110-113,128`
   forbids the id or URL in the prompt. The next session must search by title.
   The "no bare id in the reply" rule is about owner-facing prose
   (`mission/SKILL.md:329-331`), not the prompt. The repo follows the handoff
   rule, and pays one search per session.
9. **`issue show` children against the frontier.** `docs/agents/issue-tracker.md:185`
   says `issue show <spec> --json` also lists the children. It lists only `id`,
   `identifier`, `state`, `title`. The children have no labels, priority or
   blocking edges. The list with `--include relations` is the only one-call
   frontier read. The fallback is misleading.
10. **Array field paths.** ADR-0010 rejects a path into an array
    (`docs/adr/0010-read-shapes-follow-the-resource.md:41-47`). The RATA-83 chart
    needed `labels.name` and failed. The design is deliberate, so the fix is a
    new projection syntax, not a relaxation of the path rule.

## Not found

- No 0.9.0 map-charting session exists in the T3 database. The RATA-83 trace ran
  on 0.7.0. The map counts are real, but its rejected forms are not evidence
  against 0.9.0. The 0.9.0 facts come from live reads and the KACHITO trace.
- No `rata triage` command. Checked `rata --help`, `rata issue --help`,
  `rata issue list --help`, `triage/SKILL.md`, and the tracker docs.
- No batch section write. Checked `rata issue section --help` and
  `skills/rata/reference.md`.
- No body or comments in `issue status`. Checked the live JSON keys on RATA-102.
- No array projection in `--fields`. Checked the live error and ADR-0010.
- No `label ensure` or `rata teams` in 0.9.0. Checked `rata label --help` and
  `rata --help`.
- No measurement of how many of the 317 threads loaded the `rata` skill. The
  prior usage note says the skill was absent in the sampled natural-form
  failures. This note does not re-measure that.

## References

- `docs/agents/issue-tracker.md`: the current tracker contract for this repo.
- `docs/agents/triage-labels.md`: the label mapping.
- `docs/adr/0009-one-canonical-form-per-operation.md`: one form per operation.
- `docs/adr/0010-read-shapes-follow-the-resource.md`: flat reads and `--fields`.
- `skills/rata/SKILL.md`: the agent-facing CLI guide.
- `skills/rata/reference.md`: the command and flag reference.
- `~/.agents/skills/mission/SKILL.md`: phase contracts, gates and record rules.
- `~/.agents/skills/mission/mission-template.md`: the 10 record sections.
- `~/.agents/skills/wayfinder/SKILL.md`: map, ticket, claim and resolve rules.
- `~/.agents/skills/triage/SKILL.md`: triage buckets and outcome steps.
- `~/.agents/skills/to-spec/SKILL.md`: spec publish and label timing.
- `~/.agents/skills/to-tickets/SKILL.md`: ticket publish, edges and label timing.
- `~/.agents/skills/implement/SKILL.md`: one-ticket build and gate check.
- `~/.agents/skills/implement-spec/SKILL.md`: crew chief, workers and claims.
- `~/.agents/skills/code-review/SKILL.md`: spec source and review subagents.
- `~/.agents/skills/handoff/SKILL.md`: prompt contents and the title-only rule.
- `/home/ulezot/Projects/js/founders-app/docs/agents/issue-tracker.md`: the stale
  FND tracker doc.
- `/home/ulezot/.t3/worktrees/kachito/t3-953feee2/docs/agents/issue-tracker.md`:
  a current 0.9.0 tracker doc.
- `~/.t3/userdata/statev2.sqlite`: the T3 session database.
- `/tmp/opencode/rata-research/analyze.ts`, `analyze2.py`, `stats.py`,
  `section_cost.py`: the scripts used for the counts.
- RATA-83, RATA-102, FND-967, FND-969, KACHITO-7 and KACHITO-8: the live issues
  cited above.
