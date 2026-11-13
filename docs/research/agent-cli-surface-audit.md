# Agent CLI surface audit: rata 0.9.0

Date: 2026-11-12
Status: complete

## Question

Which parts of the current 0.9.0 CLI surface still cost an agent a turn, a wrong
guess, or a large output, and what is the smallest change that removes each cost?

## Answer

The 0.9.0 surface fixed the natural-form failures from 0.8.0. All four checked
forms now fail with one hint and exit 2. Three hints are executable. The comment
hint names the right command but omits the required body flag. The remaining
costs are not missing aliases. They fall into four groups:

1. Reads return more data than the caller asked for. `issue show --json` has a
   p90 output of 13,656 bytes and a maximum of 47,458 bytes. Agents use it for
   session starts even when `issue status --json` (1,418 bytes) or
   `--summary` (583 bytes) answers the question.
2. `--fields` validates against the data, not a declared shape. An empty list
   accepts any path, and a null object hides a typo. An array path fails, so
   `team show --fields states.name` is not the discovery call that the 0.10
   decision already names.
3. `issue status` makes 3 requests and drops the body it already fetched.
   `issue link` makes 1 request per target plus 2 relation reads. `section
replace` makes the minimum 2 requests.
4. Batch reads and empty-result checks are absent. `issue show A B C` prints 39
   lines of help. A state, label or project typo returns an empty list with no
   warning.

The smallest set of changes is: add a declared shape and array walk to
`--fields`; reuse the detail id in `issue status` and add free `--with-body`;
batch the refs and relation reads in `issue link`; add `issue list --ids`; make
the comment hint executable; add hints for the known wrong flags; validate
filters only when the result is empty; and report database startup failures in
the normal error object.

### Ranked findings

| Rank | Finding                                                        | Observed cost                                                                                                                  | Smallest fix                                                                                                                            | Effort | ADR                                           |
| ---- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------- |
| 1    | Default read size and read choice                              | p90 13.7 KB, max 47.5 KB for `issue show`; 65% of show calls use `--json`; only 6% use `--summary`                             | Lead the skill and tracker doc with `issue status --json` and `issue show --summary --json`; skip the description fetch for `--no-body` | Small  | None                                          |
| 2    | `--fields` is data-driven and cannot cross arrays              | `--fields nope` on an empty list exits 0; `assignee.naem` returns null; `labels.name` fails; 0.10 decision names `states.name` | Validate against a declared shape; walk arrays; return `details` with `path` and `validPaths`                                           | Medium | Conflicts with ADR-0010; RATA-104 reverses it |
| 3    | `issue link` resolves targets and reads relations one by one   | 4 requests for 1 target, 6 for 3; p50 9.5 s, p90 32 s                                                                          | Batch target refs in one `id.in` query; combine relations and inverse relations in one query                                            | Medium | None                                          |
| 4    | `issue status` fetches the detail and drops the body           | 3 requests, 1,418 B output; p50 5 s; duplicate `IssueId` for the parent                                                        | Reuse the detail id; add `--with-body` (free), `--comments` (+1), `--children` (free on one page if it replaces the child list)         | Small  | None                                          |
| 5    | Batch reads are absent                                         | 1,911 `issue show` calls; 338 refs read more than once; `issue show A B C` prints 39 lines of help                             | Add `issue list --ids A,B,C`; one list request, `{issues,pageInfo}`                                                                     | Small  | None                                          |
| 6    | The comment hint is not executable                             | `issue comment RATA-42` hints `rata issue comment create RATA-42`; that command exits 2 for a missing body                     | Hint `rata issue comment create RATA-42 --body-file -`                                                                                  | Small  | None                                          |
| 7    | Known wrong flags dump 36 to 45 lines of help                  | `update --label`, `create --blocked-by`, `show A B`                                                                            | Add pre-parse hints; add a hint to `rejectFields`                                                                                       | Small  | None                                          |
| 8    | Empty filters are silent; a bad assignee is `internal`         | `--state "In Progess"`, `--label "redy-for-agent"` and `--project "No Such"` exit 0 with `[]`; `--assignee not-a-user` exits 1 | On an empty result, check that each named state, label, project or assignee exists; validate the assignee locally                       | Medium | None                                          |
| 9    | Missing migrations print a raw Effect stack to stdout          | `DatabaseError` with timestamp and stack, exit 1, no JSON error object                                                         | Catch startup errors in the normal reporter; add a version check for the chosen migration folder                                        | Medium | None                                          |
| 10   | `bun run rata` without dependencies gives a Bun resolver error | `Unexpected while resolving package '@effect/sql-sqlite-bun'`                                                                  | Preflight check or one README and skill line: run `bun install` first                                                                   | Small  | None                                          |
| 11   | The installed `rata` is a wrapper around a different checkout  | `#!/bin/sh exec bun /home/ulezot/Projects/js/rata/src/main.ts "$@"`                                                            | Report `version` and `source` in `status --json`                                                                                        | Small  | None                                          |
| 12   | `why` fetches children and attachments and drops them          | 1 request, but a larger payload and more pages on a large issue                                                                | Pass `children: false` and `attachments: false` to `show`                                                                               | Small  | None                                          |
| 13   | The section edit loop runs 3 commands and reads the body twice | `show --summary` for `updatedAt`, `section replace --dry-run`, `section replace`                                               | Return `updatedAt` in the dry-run result so the first command is unnecessary                                                            | Small  | Changes the dry-run result object             |
| 14   | `--fields` on a write has no hint                              | `--fields is not supported by this command.` with `hint: null`                                                                 | Add a hint that names `--json` and `jq`                                                                                                 | Small  | None                                          |

## Evidence

### 1. Natural-form errors

**Finding.** All four requested natural forms now give one hint and exit 2.
Three hints are executable. The comment hint names the right command but omits
the body flag, so copying it costs a second turn.

**Evidence.** `src/cli/pre-parse.ts:98-132` intercepts `issue <ref>` and
`issue comment <ref>` before the Effect CLI parser. `src/cli/assign-hint.ts:5-15`
builds the assign hint in both argument orders. In 0.8.0 there is no
`pre-parse.ts`, and the assign hint was reversed at
`src/cli/issue-transition.ts:177` in that tag.

**Repro and observed output.**

```text
$ rata issue assign RAT-42 me
exit 2
error: The --assignee flag replaces the positional assignee.
hint: rata issue assign RAT-42 --assignee me

$ rata issue assign me RAT-42
exit 2
error: The --assignee flag replaces the positional assignee.
hint: rata issue assign RAT-42 --assignee me

$ rata issue comment RAT-42
exit 2
error: The comment group needs a subcommand.
hint: rata issue comment create RAT-42

$ rata issue RAT-42
exit 2
error: The issue group needs a subcommand.
hint: rata issue show RAT-42
```

The assign and bare-issue hints are executable. The comment hint is not:

```text
$ rata issue comment create RAT-42
exit 2
error: A comment needs --body or --body-file.
```

`rata issue comment --body hi` is the one natural form that still prints help:
19 lines on stdout, exit 2, with `Unrecognized flag: --body` and
`Unknown subcommand "hi"` on stderr. `src/cli/pre-parse.ts:114-123` cannot build
a hint because there is no ref.

**Impact.** The comment form costs one extra turn for every agent that copies
the hint. The `comment --body hi` form is outside the four checked forms, but it
costs a help dump.

**Fix.** Change the comment hint to
`rata issue comment create RAT-42 --body-file -`. If a body flag is present,
keep it in the hint. Leave the `comment --body hi` edge for a later pre-parse
rule; it is not in the observed volume.

**Effort.** Small.

**ADR.** No conflict with ADR-0009. The hint still names one canonical form.
The canonical form includes the body flag, so the hint should too.

### 2. `--fields`

**Finding.** Field selection is data-driven. It validates only the keys it
actually sees. Empty lists accept every path. Null objects hide typos. Array
paths fail, including the path that the 0.10 decision names as the discovery
call.

**Evidence.** `src/cli/fields.ts:64-106` walks the concrete value. At line 79 it
fails when the key is absent. At line 85 it stops on a null object before it
checks the rest of the path. At line 88 it rejects any array before the final
segment. `src/cli/fields.ts:125-134` rejects `--fields` on writes with no hint.
`src/cli/issue-page.ts:30-40` applies `selectItems` to each row; an empty row
list validates nothing.

**Repro and observed output.**

```text
$ rata issue show RATA-128 --json --fields labels.name
exit 2
{"error":{"code":"validation","message":"The field path enters the array labels.","hint":"Select labels as a whole."}}

$ rata issue show RATA-128 --json --fields labels
exit 0
{"labels":[{"id":"e41fdd63-...","name":"ready-for-agent"}]}

$ rata issue show RATA-128 --json --fields nope
exit 2
{"error":{"code":"validation","message":"Unknown field path: nope.","hint":"Valid paths: assignee, attachments, children, comments, createdAt, description, id, identifier, labels, parent, priority, project, relations, state, team, title, updatedAt, url."}}

$ rata issue show RATA-107 --json --fields assignee.name
exit 0
{"assignee": null}

$ rata issue show RATA-107 --json --fields assignee.naem
exit 0
{"assignee": null}
```

The null case hides the typo. The empty list case hides every path:

```text
$ rata issue list --state "In Review" --json --fields nope
exit 0
{"issues":[],"pageInfo":{"hasNextPage":false,"endCursor":null}}

$ rata team show --json --fields states.name
exit 2
{"error":{"code":"validation","message":"The field path enters the array states.","hint":"Select states as a whole."}}
```

`nextChild` behaves the same way. On `RATA-83`, `nextChild.identifier` works. On
`RATA-122`, `nextChild.nope` exits 0 with `{"nextChild": null}`.

`--fields` on `status` works as a context document:

```text
$ rata status --json --fields repository.root,team.key
exit 0
{"repository":{"root":"/home/ulezot/.t3/worktrees/rata/t3-2d5ad919"},"team":{"key":"RATA"}}
```

`--fields` on a write is short but has no hint:

```text
$ rata issue update RATA-107 --priority low --json --fields identifier --dry-run
exit 2
{"error":{"code":"validation","message":"--fields is not supported by this command.","hint":null}}
```

**Impact.** An agent can run a wrong `--fields` path, get exit 0, and parse a
missing key later. That is one wrong parse or one extra turn. The array gap
blocks the 0.10 discovery call and forces agents to fetch and parse the full
`team show` object (3,627 bytes) or the whole `states` array (979 bytes).

**Fix.** Use one declared shape per read command and validate the path before
walking the value. Then apply this array contract:

- A final array segment returns the array whole. `labels` gives the label
  objects.
- A segment after an array projects each element. A scalar leaf returns an
  array of scalars. `labels.name` gives `{"labels":["ready-for-agent"]}`.
- A deeper scalar leaf also returns an array of scalars.
  `children.state.name` gives `{"children":["Todo", ...]}`. An object leaf
  returns one object per element: `children.state` gives
  `{"children":[{"state":{"name":"Todo","type":"unstarted"}}, ...]}`.
- A path that crosses an array of scalars and continues is `validation`.
  `states.name.deeper` fails.
- A null object returns `null` for the path and still validates the remaining
  keys. `assignee.naem` fails even when the assignee is null.
- An empty array returns `[]` after the shape check. `--fields nope` on an empty
  list fails.
- `pageInfo` stays outside the selection.
- A validation error carries `details: { path, validPaths }`, as RATA-104
  decides.

Expected results after the change:

```text
$ rata team show --json --fields states.name
{"states":["Backlog","Todo","In Progress","Done","Canceled","Duplicate","In Review"]}

$ rata issue show RATA-122 --json --fields children.identifier
{"children":["RATA-128","RATA-127","RATA-126","RATA-125","RATA-124","RATA-123"]}

$ rata issue list --state "In Review" --json --fields nope
exit 2
```

**Effort.** Medium. The walk itself is small. The declared shapes for every
read command are the work. Effect Schema models can provide the shapes later;
a constant path table is enough for the first cut.

**ADR.** Direct conflict with ADR-0010 lines 44-46 and consequence line 61. They
say an array is selectable only as a whole and a path into an array is
`validation`. RATA-104 section 2 says a path may cross an array. The owner must
amend ADR-0010 or defer the 0.10 rule. See **Conflicts**.

### 3. Write ergonomics

**Finding.** Unknown flags on `issue update` and `issue create` dump the full
command help. `--fields` on a write gives a short error with no hint. `issue
link` with no relation flags gives a message but no executable hint.

**Evidence.** `src/cli/issue-write/update.ts:102-128` has no `--label` flag.
`src/cli/issue-write/create.ts:56-77` has no relation flag.
`src/cli/fields.ts:125-134` builds no hint. `src/cli/issue-link.ts:80-85`
returns a message with no hint.

**Repro and observed output.**

```text
$ rata issue update RATA-107 --label bug --dry-run
exit 2
stdout: 45 lines of help, including 20 flag lines
stderr: Unrecognized flag: --label in command rata issue update

$ rata issue create --title x --blocked-by RATA-1 --dry-run
exit 2
stdout: 36 lines of help
stderr: Unrecognized flag: --blocked-by in command rata issue create

$ rata issue create --title x --json --fields identifier --dry-run
exit 2
{"error":{"code":"validation","message":"--fields is not supported by this command.","hint":null}}

$ rata issue link RATA-107
exit 2
error: Pass at least one of --blocks, --blocked-by, --related or --duplicate.
```

**Impact.** The agent pays a turn to read 36 to 45 lines, then guesses the right
command. The `--fields` error names the problem but not the next step.

**Fix.** Add pre-parse rules in `src/cli/pre-parse.ts` for the known wrong flags:

- `issue update ... --label`: hint `rata issue label add <ref> <label>`. For
  removal, `rata issue label remove <ref> <label>`.
- `issue create ... --blocked-by`: hint `Create the issue, then run rata issue
link <new-ref> --blocked-by <ref>.` Do not add a second create form.
- `issue update ... --blocked-by`: hint `rata issue link <ref> --blocked-by
<target>`.
- `issue link <ref>` with no relation flag: hint `rata issue link <ref>
--blocked-by <blocker>`.
- `--fields` on any write: add the hint `--fields applies to reads only. Use
--json and jq on the write result.` in `rejectFields`.

**Effort.** Small.

**ADR.** No conflict with ADR-0009. The fixes teach the one canonical form.
They do not add aliases.

### 4. Silent empty results

**Finding.** A typo in `--state`, `--label` or `--project` returns an empty list
with exit 0 and no warning. A malformed `--assignee` returns `internal` and exit

1. `--team` and `--parent` are the good counterexamples: they return `not_found`
   with a hint.

**Evidence.** `src/api/issue.ts:84-105` builds name filters without a prior
existence check. `src/api/issue-filter.ts:7-10` builds a project name filter.
`src/cli/issue-page.ts:25-28` prints `No issues found.` for an empty page and no
warning. `src/api/issue.ts:96-99` passes the assignee value straight into the
filter. `src/cli/error-report.ts:150` maps an unclassified GraphQL error to
`internal`.

**Repro and observed output.**

```text
$ rata issue list --state "In Progess" --json
exit 0
{"issues":[],"pageInfo":{"hasNextPage":false,"endCursor":null}}

$ rata issue list --label "redy-for-agent" --json
exit 0
{"issues":[],"pageInfo":{"hasNextPage":false,"endCursor":null}}

$ rata issue list --project "No Such Project" --json
exit 0
{"issues":[],"pageInfo":{"hasNextPage":false,"endCursor":null}}

$ rata issue list --assignee not-a-user --json
exit 1
{"error":{"code":"internal","message":"Argument Validation Error","hint":"Run with RATA_DEBUG=1 for details."}}

$ rata issue list --assignee 00000000-0000-4000-8000-000000000000 --json
exit 0
{"issues":[],"pageInfo":{"hasNextPage":false,"endCursor":null}}
```

A valid state with no issues must stay empty, so the check must test existence,
not the result count:

```text
$ rata issue list --state "In Review" --json
exit 0
{"issues":[],"pageInfo":{"hasNextPage":false,"endCursor":null}}
```

**Impact.** The agent can conclude that no work exists when the filter name is
wrong. That is a wrong decision, not just an extra turn. The assignee typo also
gives the wrong error class and the wrong exit code.

**Fix.** Add a zero-result validation step. When the page is empty and a named
filter is present, run one small query per named filter:

- State: `team(id).states(filter: { name: { eqIgnoreCase: value } })`.
- Label: the team and workspace label query with the same name filter.
- Project: `projects(filter: { name: { eqIgnoreCase: value } })`.
- Assignee: reject a value that is not `me` or a UUID before the request, with
  `validation` and a hint to read `team show --json`. For a UUID, one user query
  can confirm that the user exists.

If the name exists, keep the empty result. If it does not, return `not_found`
with a hint that lists the valid names. The check runs only on an empty page.
One request measured 0.6 to 1.1 seconds in this workspace.

**Effort.** Medium.

**ADR.** No conflict. It changes an empty result from success to `not_found`
only when the named filter does not exist. Update README and the skill.

### 5. One-read context: `issue status`

**Finding.** `issue status` fetches the full detail, including the description,
and then drops the description. It does not fetch comments or children. It also
resolves the parent ref a second time for the child list. The command makes 3
requests, not 2.

**Evidence.** `src/api/issue.ts:173-184` calls `show(input, { comments: false,
children: false })`, then calls `list({ parent: input, ... })`.
`src/api/issue/read.ts:105-123` builds the full detail, including `description`.
`src/api/issue/status.ts:6-15` spreads `toIssueSummary`, and
`src/api/issue-model.ts:126-137` removes `description`, `team`, `children`,
`relations`, `attachments` and `comments`. `src/api/issue.ts:106-108` resolves
`options.parent` again with `issueIdQuery`. The fetch counter shows:

```text
$ bun --preload /tmp/opencode/count-fetch.ts src/main.ts issue status RATA-83 --json
[fetch 1] IssueShow
[fetch 2] IssueId
[fetch 3] IssueList
[fetch total] 3
```

`issue status RATA-83 --json` is 1,418 bytes. It contains `blocked`, `blockedBy`,
`prs` and `nextChild`, and no `description`, `comments` or `children`.

**Impact.** One extra request on every status call, roughly one third of the
latency. The body is fetched and discarded, so an agent that needs the body
issues a second read.

**Fix.** Add a compact session-start contract to `issue status`:

- Reuse the detail id for the child list. Pass `parentId: issue.id` and skip the
  `IssueId` query. This takes 3 requests to 2 with no shape change.
- Add `--with-body`. It costs 0 requests because `IssueShow` already selects
  `description`. It adds output tokens, so it stays opt-in.
- Add `--comments`. It costs 1 request plus pages, because comments are not in
  the detail today.
- Add `--children`. It costs 0 extra requests on one page if it replaces the
  one-child list with an all-children list that includes relations. Compute
  `nextChild` from those rows. A separate children query would cost 1 request.
- Do not make `--with-body` the default. A body can be 22 KB.

The compact contract is `rata issue status <ref> --json --with-body`. Comments
and the full child list stay separate, opt-in reads.

**Effort.** Small for the id reuse and `--with-body`. Medium for `--children`
because it changes the child query and the `nextChild` computation.

**ADR.** No conflict with the wrapper rule. `issue show` already has opt-in
fields through `--comments` and the `--no-*` flags. If the owner wants the
status object to stay fixed, record the opt-in fields in ADR-0010 as a one-line
amendment.

### 6. Batch reads

**Finding.** `issue show` accepts one ref. A second ref prints 39 lines of help.
There is no batch read, even though Linear's `IssueFilter` supports
`id: { in: [...] }`.

**Evidence.** `src/cli/issue/show.ts:68-79` declares one `ref` argument.
`src/api/issue-query.ts:32-57` selects one issue by id. `src/api/issue.ts:81-119`
composes list filters but has no id filter. The `@linear/sdk` 102.0.0 schema
shows `IssueFilter.id?: IssueIdComparator`, and `IssueIdComparator` has
`in?: Array<ID>`; the field matches a UUID or a human-readable identifier.

**Repro and observed output.**

```text
$ rata issue show RATA-128 RATA-129 RATA-130
exit 2
stdout: 39 lines of help
stderr: Unexpected positional arguments: "RATA-129", "RATA-130"

$ rata issue list --ids RATA-128,RATA-129 --json
exit 2
stdout: 36 lines of help
stderr: Unrecognized flag: --ids in command rata issue list
```

**Impact.** Mission telemetry records 1,911 `issue show` calls and 338 refs read
more than once. A fresh strict parse of the same local state database finds
1,768 calls with a parsed ref, 268 refs used more than once and 1,352 repeat
calls. The scale is the same: repeated reads are a large share of the calls.
Each batch call removes one call per ref in the batch.

**Fix.** Add `issue list --ids A,B,C`. It is a list filter, not a second read
shape:

```text
$ rata issue list --ids RATA-128,RATA-129 --json
{
  "issues": [ ... ],
  "pageInfo": { "hasNextPage": false, "endCursor": null }
}
```

Rules:

- `--ids` accepts a comma-separated list of identifiers, UUIDs or linear.app
  URLs. Convert URLs to identifiers locally.
- Build one filter: `{ id: { in: ["RATA-128","RATA-129"] } }`. One request per
  page.
- Compare the requested refs with the returned rows. If a ref is missing,
  return `not_found` and name it. Linear returns only the matching rows.
- Compose with `--fields`, `--include relations`, `--all`, `--count` and
  `--ids-only`.
- Decide whether `--ids` bypasses the default team filter. Recommended: yes,
  because the caller named exact issues. Pass `--team` to narrow. This is an
  owner decision, because the list commands default to the linked team today.
- The name `--ids` is close to the 0.10 `--ids-only` output flag. Keep `--ids`
  as the filter and document the difference, or use `--ref` repeatable if the
  owner wants no collision.

A one-ref batch still costs one list request. A 10-ref batch turns 10 calls into

1. With the mission count, the 338 refs that were read more than once can each
   be read once. A fresh strict parse measures 1,352 repeat calls, so the saved
   calls are of that order. The batch returns summary rows, not full bodies. It is
   the right shape for a session start, a triage sweep and a frontier read, not a
   replacement for a full detail read.

**Effort.** Small. The API already has the filter type and the list query.

**ADR.** No conflict with ADR-0010. The result is a collection with
`{ issues, pageInfo }`. It is not a second form of `issue show`. Do not add
`issue show A B C`.

### 7. Latency

**Finding.** `issue link` has serial target resolution and two separate relation
reads. `issue status` has a duplicate ref resolution. `section replace` already
makes the minimum 2 requests. Absolute latency varies, but the request counts are
stable.

**Evidence.** `src/api/issue-write/relation-writes.ts:28-30` resolves the source
ref, then calls `resolveRelationTargets`, then calls `collectRelations`.
`src/api/issue-write/relations.ts:22-38` resolves each target in a serial loop.
`src/api/issue-write/relations.ts:46-69` reads outgoing relations and inverse
relations in two separate requests. `src/api/issue-write/body.ts:127-142` reads
the body and then writes it.

**Repro and observed output.** The fetch counter counts GraphQL operations.

```text
$ bun --preload /tmp/opencode/count-fetch.ts src/main.ts issue link RATA-107 --blocked-by RATA-104 --dry-run
[fetch 1] IssueId
[fetch 2] IssueId
[fetch 3] IssueRelations
[fetch 4] IssueInverseRelations
[fetch total] 4

$ bun --preload /tmp/opencode/count-fetch.ts src/main.ts issue link RATA-107 --blocked-by RATA-103 --related RATA-104 --dry-run
[fetch 1] IssueId
[fetch 2] IssueId
[fetch 3] IssueId
[fetch 4] IssueRelations
[fetch 5] IssueInverseRelations
[fetch total] 5

$ bun --preload /tmp/opencode/count-fetch.ts src/main.ts issue section replace RATA-83 "Notes" --body x --dry-run
[fetch 1] IssueBody
[fetch total] 1
```

A real `section replace` adds one `IssueUpdate` mutation, so it is 2 requests.
A real `link` adds one mutation per new relation.

Latency from the mission telemetry: `section replace` p50 about 6 s, `link` p50
about 9.5 s and p90 about 32 s, `issue status` p50 about 5 s. A fresh pass over
the local state database gives:

| Command                 | n     | p50      | p90       | max       |
| ----------------------- | ----- | -------- | --------- | --------- |
| `issue section replace` | 181   | 2,358 ms | 8,130 ms  | 25,328 ms |
| `issue link`            | 84    | 3,471 ms | 21,948 ms | 60,946 ms |
| `issue status`          | 52    | 3,940 ms | 11,325 ms | 20,603 ms |
| `issue show`            | 2,113 | 1,641 ms | 4,808 ms  | 62,728 ms |

The absolute values depend on the API. The order is the same: `link` is the
slowest, and it has the most avoidable requests.

**Impact.** A link with 3 targets makes 6 requests before the first mutation. If
each request is 1 to 2 seconds, the pre-read alone is 6 to 12 seconds. The p90 of
32 s leaves room for a large reduction.

**Fix.**

- Batch resolve the source and every target with one query:
  `issues(filter: { id: { in: [...] } }) { nodes { id identifier } }`. This takes
  1 + N resolves to 1.
- Combine `relations` and `inverseRelations` fields in one `issue` query. This
  takes 2 reads to 1.
- The new total is 2 requests for the common case under 250 relations: 1 batch
  resolve and 1 relation check. For one target, 4 to 2. For three targets, 6 to 2. More relation pages add requests, but the target resolution stays at 1.
- Skip the `resolveIssueId` query when the ref is already a UUID. `parseRefOrFail`
  already returns a UUID; `src/api/issue-write/resolvers.ts:57-63` queries
  anyway. This helps every write, not only `link`.
- Add an explicit `--skip-check` for known-new bulk links. It skips the relation
  pre-read and the idempotency check. Keep the check by default. This is an
  owner decision because it trades a safety property for speed.
- For `issue status`, reuse the detail id and take 3 requests to 2.
- For `section replace`, do not add a skip-read flag. The read is required to
  merge the section into the body. Use `issue update --body-file` when the
  caller already has the whole body. It avoids the section merge, but it still
  resolves the ref, so it is 2 requests today and 1 after the UUID skip.
- Return `updatedAt` in the `section replace --dry-run` result. The dry run
  already reads the body, so the field is free. The documented loop can then be
  `--dry-run` followed by `--if-unchanged <updatedAt>`, without the separate
  `issue show --summary` command. This removes one command and one request from
  the loop. It adds a field to the dry-run result object, so update the README
  and the skill.
- Add `updatedAt` to `issue section get` only if agents need to read the section
  content and the timestamp in one call. That changes the section object, so it
  is a separate decision.

**Effort.** Medium for the batch resolve and combined query. Small for the UUID
skip and the status id reuse.

**ADR.** No conflict with ADR-0009 or ADR-0010. The write result shape does not
change. `--skip-check` is a new write option and needs docs.

### 8. Output size

**Finding.** `issue show --json` is large because it includes the body, comments,
children, relations and attachments by default. Agents use it as the session
start even when a smaller read answers the question.

**Evidence.** `src/cli/issue/show.ts:100-116` includes comments in JSON by
default. `src/api/issue-query.ts:32-57` always includes `description`.
`src/api/issue/read.ts:105-138` collects children, relations and attachments
when the caller asks. The local state database gives these output sizes:

| Command      | p50     | p90      | max      |
| ------------ | ------- | -------- | -------- |
| `issue show` | 1,656 B | 13,656 B | 47,458 B |
| `issue view` | 1,493 B | 10,441 B | 28,383 B |

An approximate usage share over 2,114 command rows that name `issue show` or
`issue view`:

| Flag               | Commands |
| ------------------ | -------- |
| `--json`           | 1,367    |
| `--comments`       | 509      |
| `--fields`         | 166      |
| `--no-comments`    | 156      |
| `--summary`        | 127      |
| `--no-relations`   | 13       |
| `--no-children`    | 11       |
| `--no-attachments` | 13       |
| `--no-body`        | 2        |

Measured sizes for `RATA-83`:

```text
issue show RATA-83 --json                                      28,659 B
issue show RATA-83 --json --no-comments                        27,882 B
issue show RATA-83 --json --no-comments --no-relations
  --no-children --no-attachments                               22,373 B
issue show RATA-83 --json --no-comments --no-children
  --no-attachments --fields identifier,title,state.name,
  relations.blockedBy                                              174 B
issue show RATA-83 --json --no-comments --no-body
  --no-relations --no-children --no-attachments --fields comments  780 B
issue show RATA-83 --json --no-comments --no-body
  --no-relations --no-attachments --fields children              4,318 B
issue show RATA-83 --summary --json                                583 B
issue status RATA-83 --json                                      1,418 B
```

**Impact.** For `RATA-83`, a full `issue show --json` is 49 times the summary
and 20 times the status object. At p90, a full show is 13.7 KB per call, about 23
times the summary. That is tokens and context window, and it pushes the agent
toward `--fields` and `jq` after the fact. A session start that uses `issue show
--json` pays for comments and children it may not read.

**Fix.** Do not add a `--brief` flag. It would be a second name for `--summary`,
and ADR-0009 rejects a second name. Do not make `--fields` the default; it
would hide fields and break the one read shape.

Change the docs and the skill instead:

- Session start: `rata issue status <ref> --json`. It is 1,418 B and includes
  blockers, PRs and the next child.
- Header only: `rata issue show <ref> --summary --json`. It is 583 B.
- Body only: `rata issue show <ref> --json --no-comments --no-relations
--no-children --no-attachments`.
- Blockers only: `rata issue show <ref> --json --no-comments --no-body
--no-children --no-attachments --fields
identifier,title,state.name,relations.blockedBy`. It is 174 B.
- Comments only: `rata issue show <ref> --json --comments --no-body
--no-relations --no-children --no-attachments --fields comments`. It is 780 B
  and 2 requests.
- Children only: `rata issue show <ref> --json --no-comments --no-body
--no-relations --no-attachments --fields children`. It is 4.3 KB.
- List with edges: `rata issue list --parent <ref> --all --json --include
relations --fields identifier,title,state.name,relations.blockedBy`. Six rows
  are 11,027 B, against 35,740 B for the full shape.
- Full detail: `rata issue show <ref> --json` only when the body, comments,
  children and attachments are all needed.

Also make `--no-body` skip the `description` field in `showQuery`. The flag
already omits the field from the output. Fetching it is waste. This is a small
change in `src/api/issue-query.ts:32-57` and `src/cli/issue/show.ts:108-113`.

**Effort.** Small for docs and the `description` field. No new flag.

**ADR.** No conflict. The fix documents existing shapes and one existing read.
A `--brief` default would conflict with ADR-0009 and ADR-0010, so do not add it.

### 9. Version and environment

**Finding.** Rata does not report which binary and which migration set it uses.
A dev checkout can fail with a raw Bun resolver error. A missing migration set
prints a raw Effect stack to stdout. The installed `rata` is a wrapper around a
different checkout. The stale team key path is already handled.

**Evidence.**

The installed binary in this environment is a shell wrapper:

```text
$ which rata
/home/ulezot/.local/bin/rata
$ file /home/ulezot/.local/bin/rata
POSIX shell script, ASCII text executable
$ head -2 /home/ulezot/.local/bin/rata
#!/bin/sh
exec bun /home/ulezot/Projects/js/rata/src/main.ts "$@"
$ rata --version
rata v0.9.0
```

The wrapper targets `/home/ulezot/Projects/js/rata`, not the audit worktree at
`/home/ulezot/.t3/worktrees/rata/t3-2d5ad919`. Today both are at commit
`d508686` and both report 0.9.0. The wrapper is still a latent skew: an edit in
the worktree does not reach `rata`. Use `bun run rata -- ...` for source work.

A missing dependency gives a Bun resolver error:

```text
$ cd /tmp/opencode/rata-nodeps
$ bun run rata -- --version
exit 1
$ bun run src/main.ts --version
error: Unexpected while resolving package '@effect/sql-sqlite-bun' from '/tmp/opencode/rata-nodeps/src/db/database.ts'
```

A missing migrations folder gives a raw Effect log on stdout, not the JSON error
object:

```text
$ /tmp/opencode/bun src/main.ts status --json
exit 1
[23:16:58.565] ERROR (#2): DatabaseError: Cannot find the Drizzle migrations folder. Looked in: /tmp/opencode/rata-nodeps/drizzle, /tmp/opencode/rata-nodeps/src/db/drizzle, /tmp/opencode/drizzle, /tmp/share/rata/drizzle.
    at migrationsFolder (/tmp/opencode/rata-nodeps/src/db/database.ts:66:23)
```

`src/db/database.ts:50-54` lists the migration folders in order. The last
candidate is the system package folder. The Arch package owns one:

```text
$ pacman -Q rata
rata 0.9.0-1
$ ls -d /usr/share/rata/drizzle
/usr/share/rata/drizzle
```

A temp copy with no local `drizzle` folder got past the database open because
the system folder exists. That fallback has no version check. A 0.10 source
checkout can run against 0.9.0 migrations and fail later with a missing column.

The stale team key path is handled. `status` keeps the rest of the context and
adds a warning:

```text
$ rata issue list --team NOPE --json
exit 3
{"error":{"code":"not_found","message":"No team with key NOPE.","hint":"A team key and an issue identifier prefix can differ after a rename. Run `rata team list` to see the team keys."}}
```

`src/cli/status.ts:69-103` resolves the stored key and builds the warning.
`src/cli/error-report.ts:38-41` gives the repair hint.

**Impact.** A stale wrapper sends the agent to the wrong source tree. A missing
dependency or migration stops every command with an error the agent cannot parse
as JSON. The migration fallback can corrupt a session with a schema mismatch
that appears later as a query error.

**Fix.**

- Add `version`, `source` and `schema` to `status --json`. `source` is the
  directory of the running `main.ts`. `schema` is the chosen migrations folder
  and its latest migration. This is a context document addition. It gives the
  agent one call to detect a stale binary and a mismatched schema.
- Catch `DatabaseError` at the top level and render it with the normal error
  object. Add `DatabaseError` to `errorRules` with code `internal` and a hint
  that names the missing folder and the repair.
- Compare the latest migration in the chosen folder with a compiled-in expected
  migration. If the folder is older than the code, fail with a clear error that
  names both. Do not silently use a system folder from another version.
- Add a preflight to `bun run rata` or one line to README and the skill: run
  `bun install` before `bun run rata`. The Bun resolver error is not actionable
  for an agent.
- Keep the stale team key behavior. Do not change it.

**Effort.** Small for the status fields and the dependency note. Medium for the
top-level error catch and the migration version check.

**ADR.** No conflict. `status` is a context document, so a new named section is
allowed by ADR-0010.

### 10. Smaller findings

**`why` fetches children and attachments and drops them.** `src/cli/why.ts:18`
calls `show` with `comments: false`, but `children` and `attachments` default to
true. `toIssueSummary` then drops both. Repro:

```text
$ bun --preload /tmp/opencode/count-fetch.ts src/main.ts why RATA-107 --json
[fetch 1] IssueShow
[fetch total] 1
```

The request count is 1 for this issue, but the payload includes every child and
attachment, and a large issue adds pages. Fix: pass `children: false` and
`attachments: false`. Effort: small. ADR: none.

**The section edit loop runs 3 commands and reads the body twice.** The
documented loop is `issue show --summary` for `updatedAt`,
`section replace --dry-run`, then `section replace --if-unchanged`. The dry-run
reads the body and returns a diff, but its JSON has no `updatedAt`
(`src/cli/issue/section.ts:59-78`, `src/api/issue-write/write-types.ts:105-121`).
The agent must run the separate summary read. Fix: add `updatedAt` to the
dry-run result. The value is already in `readIssueBody`. This removes one
command and one request from the loop. Effort: small. ADR: none, but update the
README and the skill.

**`--fields` on a write has no hint.** `src/cli/fields.ts:125-134` returns
`--fields is not supported by this command.` with `hint: null`. Repro:

```text
$ rata issue update RATA-107 --priority low --json --fields identifier --dry-run
exit 2
{"error":{"code":"validation","message":"--fields is not supported by this command.","hint":null}}
```

Fix: add the hint `--fields applies to reads only. Use --json and jq on the
write result.` Effort: small. ADR: none.

## Conflicts

- **ADR-0010 versus RATA-104 on array paths.** ADR-0010 lines 44-46 and line 61
  forbid a path into an array. RATA-104 section 2 requires it and names
  `team show --json --fields states.name` as the discovery call. This is a
  direct conflict, not an implementation gap. The owner must amend ADR-0010 or
  defer the 0.10 rule. Recommended: amend ADR-0010 with the array contract in
  finding 2 and keep one read shape.
- **RATA-104 section 10 says the envelope stays.** It lists `{ "team": ... }`
  and `{ "issue": ... }` as unchanged. ADR-0010 and 0.9.0 already print flat
  reads. The 0.10 decision text is stale on this point. The code follows
  ADR-0010. The owner should correct the decision text, not the code.
- **`--brief` or a smaller default would conflict with ADR-0009 and ADR-0010.**
  Do not add a second name for `--summary`, and do not make `--fields` the
  default. Use docs and the skill.
- **`issue show A B C` would conflict with ADR-0010.** A multi-issue result is a
  collection. Use `issue list --ids` and keep `issue show` for one resource.
- **`--skip-check` on `issue link` trades idempotency for speed.** This needs an
  owner decision. The default should keep the check. The flag is for bulk work
  where the caller knows the edges are new.
- **`--ids` and the default team filter.** The list commands default to the
  linked team. A batch read of exact refs may cross teams. The owner must choose
  whether `--ids` bypasses the default team filter. Recommended: bypass it, and
  let `--team` narrow.

## Not found

- The Linear checkout named in AGENTS.md is absent at `~/Projects/other/linear`.
  The `IssueFilter` and `IssueIdComparator` evidence comes from the published
  `@linear/sdk` 102.0.0 schema in `/tmp/opencode/linear-sdk`. A live
  `issues(filter: { id: { in: [...] } })` query was not run, to avoid an ad hoc
  API call outside the CLI.
- The mission telemetry and the local state database disagree on absolute
  latency. The mission reports `link` p50 9.5 s and p90 32 s; the state database
  reports p50 3.5 s and p90 21.9 s. Both are recorded. The request counts are
  measured and stable.
- The largest observed output is 47,458 bytes in the state database parse, not
  the 51 KB stated in the mission brief. The p90 values match: 13,656 bytes for
  `show` and 10,441 bytes for `view`.
- No telemetry shows whether agents would use `--with-body`, `--comments` or
  `--children` on `issue status`. The request cost of each is measured from the
  code and the fetch counter.
- Linear's behavior for duplicate relations was not tested. A `--skip-check`
  flag assumes Linear accepts a duplicate or returns a clear error. Do not add
  the flag until that is known.
- The local state database query is read-only and spans the stored command
  history. It does not filter by rata version. The p90 output sizes match the
  mission figures for 0.9.0, so the sample is representative, but the command
  counts include older versions.
- The fetch counter is a temporary preload at `/tmp/opencode/count-fetch.ts`. It
  wraps `fetch` and logs each GraphQL operation. It is not committed. The code
  counts are also visible in the source references above.
- The exact cause of the `issue comment --body hi` help dump is the pre-parse
  ref lookup. It is an edge case outside the four checked natural forms.

## References

- `src/cli/pre-parse.ts:98-132`: natural-form interception for `issue` and
  `issue comment`.
- `src/cli/assign-hint.ts:5-15`: assign hint in both argument orders.
- `src/cli/issue/comment.ts:234-237`: comment group with no default action.
- `src/cli/fields.ts:48-134`: field path parsing, array rejection, null stop and
  write rejection.
- `src/cli/issue-page.ts:25-47`: empty page output and `--fields` per row.
- `src/cli/issue/status.ts:13-21`: `issue status` command.
- `src/api/issue.ts:81-119`: list filters.
- `src/api/issue.ts:173-184`: status fetches detail then lists one child.
- `src/api/issue/read.ts:59-139`: show query and detail assembly.
- `src/api/issue-query.ts:32-57`: show query always selects `description`.
- `src/api/issue-model.ts:126-137`: `toIssueSummary` drops description, children,
  relations and attachments.
- `src/api/issue-write/relations.ts:20-71`: serial target resolution and two
  relation reads.
- `src/api/issue-write/relation-writes.ts:23-54`: link plan and writes.
- `src/api/issue-write/body.ts:118-151`: section read then write.
- `src/api/issue-write/resolvers.ts:57-63`: `resolveIssueId` queries even for a
  UUID.
- `src/cli/issue-write/create.ts:56-77`: create flags.
- `src/cli/issue-write/update.ts:102-128`: update flags.
- `src/cli/issue-link.ts:72-125`: link command and missing-flag error.
- `src/cli/error-report.ts:34-68`: error rules and hints.
- `src/cli/error-report.ts:85-151`: classification and internal fallback.
- `src/db/database.ts:50-68`: migration folder candidates and fallback.
- `src/main.ts:77-81`: top-level program and `CliError` catch.
- `src/cli/status.ts:69-103`: stale team warning.
- `src/cli/why.ts:18`: `why` fetches the full detail and drops children and
  attachments.
- `src/api/issue-write/body/query.ts`: `IssueBody` already selects `updatedAt`.
- `src/api/issue-write/write-types.ts:105-121`: the dry-run branch has no
  `updatedAt`.
- `src/cli/issue/section.ts:59-78`: section result JSON.
- `README.md:101-126`: read shapes and `--fields` rules.
- `README.md:850-940`: status and show documentation.
- `README.md:1043-1074`: field selection rules.
- `skills/rata/SKILL.md:99-146`: read-before-write block and session start.
- `skills/rata/reference.md:1-180`: command reference and field rules.
- `docs/agents/issue-tracker.md:59-84`: issue read and section edit workflow.
- `docs/adr/0009-one-canonical-form-per-operation.md:24-47`: one canonical
  form.
- `docs/adr/0010-read-shapes-follow-the-resource.md:41-61`: one read shape and
  the array rule.
- RATA-104 resolution comment, 2026-10-29: `--fields` array walk, `--ids-only`,
  `--count`, error object and exit codes.
- RATA-83 description and comments: 0.10 map context and measured migration
  volume.
- Local state database `~/.t3/userdata/statev2.sqlite`, table
  `orchestration_v2_projection_turn_items`: command counts, durations and output
  sizes. Read-only queries only.
- `@linear/sdk` 102.0.0, `dist/index-BPbyHLYG.d.mts`: `IssueFilter` and
  `IssueIdComparator` schema.
