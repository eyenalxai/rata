# Which established agent-first CLI and API patterns should rata adopt?

Date: 2026-11-12
Status: conflict

## Question

Which established agent-first CLI and API patterns should `rata` adopt, and
which Linear API capabilities most cut the number of calls an agent makes?

Scope: `rata` 0.9.0 at the repository HEAD (`d508686`); Linear GraphQL schema
from `@linear/sdk` 102.0.0, commit `87d638c`; `gh` 2.102.1; `railway` 5.71.0;
`git` 2.56.0; the Vercel, Wrangler, jj and Linear docs fetched on 2026-11-12.
The Linear checkout named in `AGENTS.md` (`~/Projects/other/linear`) is absent,
so the Linear shapes come from the published schema, not from a local checkout.
`vercel`, `wrangler` and `jj` are not installed; their official docs are the
source for those rows.

Confidence: high for the CLI patterns, because each claim comes from the
installed help, the first-party manual, or the source. High for the Linear batch
shapes, because each claim comes from the published schema. Medium for the
relations complexity bound and the priority tie order, because the schema gives
the inputs but no measured result.

## Answer

Adopt five high-value patterns:

1. A batch write behind one snapshot check.
2. A batch read by an explicit set of issue references.
3. Server-side sort and filter pushdown.
4. Retry metadata in the error object.
5. An idempotency key on create.

The existing `--json`, `--fields`, `--dry-run`, `--yes`, paging, exit-code and
config contracts cover the agent need. Keep them; do not add a second mode.

Reject template languages, a built-in jq, a TUI, a raw API escape hatch, a
webhook daemon, a response cache and redundant output switches.

The measured call cost points to one change before the rest: a batch section
write behind one snapshot check. One session used 42 section writes and 42
snapshot reads, which is 84 of its 120 `rata` calls. A batch of four sections per
write turns that into about 8 calls. The local call-cost note estimates a saving
of 76 calls, or 63 percent of that session
(`docs/research/agent-workflow-call-cost.md:192-217`).

The two Linear capabilities most worth using next are `issueBatchUpdate` and
`IssueFilter.id.in`. `issueBatchUpdate` removes the write loop for a parent's
children and can add or remove one label across 50 issues in one transaction. It
needs no new command because the existing `--parent` bulk writes can route
through it. `IssueFilter.id.in` removes the per-child read loop and adds one flag
to `issue list`. `issueBatchCreate` is the next new command; the measured create
count is lower than the read and update counts, but the batch shape is the same.
`IssueSortInput.priority` is the next query change.

### 1. Comparison table

`Adopt` covers a pattern rata already has or should add as-is. `Adapt` changes
an existing pattern. `Reject` adds no surface. `Partial` means the shape exists
but does not cover the case in the row.

| Pattern                               | Who does it                                             | Exact shape                                                                                                                                                                                               | What it solves                      | Rata today                                                               | Recommendation                                              |
| ------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| JSON document plus field selection    | `gh`, rata; Vercel, Railway and Wrangler have JSON only | `gh issue list --json number,title`; `rata issue list --json --fields identifier,title`                                                                                                                   | Parse errors and output tokens      | Yes, global `--json` and `--fields`                                      | Adopt                                                       |
| Built-in jq                           | `gh`                                                    | `gh issue list --json number,title --jq '.[].title'`                                                                                                                                                      | One process for selection           | No; the agent pipes to `jq`                                              | Reject. It adds a query language for no call saving         |
| Template language                     | `gh`, jj                                                | `gh issue list --json title,url --template '{{range .}}{{.title}}{{"\n"}}{{end}}'`; `jj log -T 'commit_id ++ "\n"'`                                                                                       | Custom output                       | No; the README rejects a format language                                 | Reject                                                      |
| Schema or command introspection       | Railway, jj, `gh`                                       | `railway api describe Issue`; `jj util markdown-help`; `gh issue list --json` with no value lists fields                                                                                                  | Discovery without docs              | Partial: `--help`, examples and field-error hints                        | Reject a schema command. Keep the skill and the error hints |
| Batch read by explicit IDs            | `git`, Linear                                           | `git cat-file --batch` reads one object per line; Linear `issues(filter: { id: { in: [...] } })`                                                                                                          | `N` reads and per-child loops       | Partial: only `issue list --parent --all`                                | Adopt as `issue list --id`                                  |
| Transactional batch write             | Linear, `git`                                           | Linear `issueBatchCreate` and `issueBatchUpdate`, 1 to 50; `git update-ref --stdin` with `start/prepare/commit`; Wrangler `secret bulk` shows the bulk input shape but is not documented as transactional | `N` writes and partial failure      | Partial: parent bulk writes loop one child at a time and run best-effort | Adopt                                                       |
| Batch write behind one snapshot check | `git` transactions, Linear `issueUpdate`                | Read one `updatedAt`, apply several section edits, write one description                                                                                                                                  | Repeated read, dry-run, write loops | No; one section per write                                                | Adopt as `issue update --sections-file -`                   |
| Idempotency key                       | rata comments, Linear relations                         | `rata issue comment create ... --dedupe-key <key>`; Linear reuses an identical relation                                                                                                                   | Duplicate writes after a timeout    | Partial: comments only                                                   | Adapt to `issue create`                                     |
| Dry run                               | Wrangler, Vercel, rata                                  | `wrangler deploy --dry-run`; `rata issue update --dry-run`                                                                                                                                                | Destructive mistakes                | Yes, on every issue write                                                | Adapt                                                       |
| Confirmation bypass                   | Railway, Wrangler, `gh`, rata                           | `railway delete --yes`; `wrangler setup --yes`; `rata team delete --yes`                                                                                                                                  | Prompt hangs                        | Yes                                                                      | Adopt                                                       |
| Page default plus drain-all           | `gh`, Linear, rata                                      | `gh issue list --limit 30`; `gh api --paginate`; `rata issue list --limit 50 --after <cursor>`; `--all`                                                                                                   | Truncated or unbounded output       | Yes, default 50, maximum 250, `--all`                                    | Adopt                                                       |
| Output bounds                         | `gh`, rata                                              | `gh issue list --json number,title`; `rata issue list --json --fields identifier,title --limit 50`                                                                                                        | Token blowup                        | Yes, `--fields`, `--summary`, `--no-*`                                   | Adopt                                                       |
| Stable exit codes                     | `gh`, Vercel, rata                                      | `gh` 0, 1, 2, 4; Vercel 0, 1, 2; rata 0 to 6                                                                                                                                                              | Branching on prose                  | Yes, codes 0 to 6                                                        | Adopt                                                       |
| Retry metadata                        | Railway, Linear                                         | Linear `Retry-After` header and `RATELIMITED`; Railway `Ratelimited { retry_after_secs }`                                                                                                                 | Blind retries                       | Partial: `rate_limited` code, no seconds                                 | Adapt                                                       |
| Automation notes in help              | Railway                                                 | `after_help = "Automation notes: ..."`                                                                                                                                                                    | Agents miss non-interactive forms   | Partial: examples, no agent notes                                        | Adopt                                                       |
| Prompt guard for a non-TTY            | Vercel                                                  | `vercel deploy --non-interactive`; agent mode is the default                                                                                                                                              | Hangs in scripts                    | Partial: `--json` plus `--yes`; no explicit TTY guard                    | Adapt                                                       |
| Config discovery                      | `gh`, Vercel, Wrangler, `git`, jj, rata                 | `GH_CONFIG_DIR`; `--cwd`, `--scope`, `.vercel/project.json`; nearest `wrangler.jsonc`; `.git` walk; `.jj` walk; rata git common dir plus XDG data                                                         | Wrong workspace, team or project    | Yes, git common dir, XDG and profiles                                    | Adopt                                                       |
| Update check                          | `gh`, Vercel                                            | `gh` checks once per 24 hours; Vercel prints an update message; `GH_NO_UPDATE_NOTIFIER` disables it                                                                                                       | Knowing about updates               | No, `--version` only                                                     | Reject. It writes noise to stderr                           |
| Non-interactive flag                  | Vercel                                                  | `--non-interactive`                                                                                                                                                                                       | Prompt hangs                        | No; `--json` plus `--yes` is the rule                                    | Reject a new flag. Document the rule                        |
| Versioned machine format              | `git`                                                   | `git status --porcelain=v2`                                                                                                                                                                               | Silent breakage                     | Partial: stable shapes, no version marker                                | Adapt: the major version is the schema version; no envelope |
| Raw API escape hatch                  | `gh`, Railway, Vercel                                   | `gh api graphql`; `railway api`; `vercel api`                                                                                                                                                             | Missing commands                    | No                                                                       | Reject                                                      |
| Resident daemon or webhook listener   | Linear webhooks                                         | Public HTTPS POST endpoint, retries after 1 minute, 1 hour and 6 hours                                                                                                                                    | Real-time updates                   | No                                                                       | Reject                                                      |
| TUI                                   | Official Linear CLI                                     | `lin new` prompts with Ink; Vercel and Railway also use spinners and tables in human mode                                                                                                                 | Human onboarding                    | No; plain text and JSON                                                  | Reject                                                      |
| Installable agent skill               | Railway, Vercel, rata                                   | `railway setup agent`; `vercel setup skills`; `npx skills add eyenalxai/rata`                                                                                                                             | Agents guess forms                  | Yes                                                                      | Adopt                                                       |
| Count, ids-only, quiet                | jj `--quiet`; no first-party count or ids-only example  | `--count`, `--ids-only`, `--quiet`                                                                                                                                                                        | Less output                         | No; `--fields` and `--limit` cover it                                    | Reject                                                      |

### 2. Linear capability table

`N` is the number of issues and `T` the number of matching issues.

| Capability                                                            | Source                                                                     | Agent use case                                                                           | Expected call or token saving                                                                                                                                                | Recommendation                               |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `issueBatchCreate`, 1 to 50, transactional, parent before child       | Schema `IssueBatchCreateInput` 14262-14270; `issueBatchCreate` 21227-21235 | Publish a spec's tickets, import a set, create a parent and children together            | `N` creates become `ceil(N/50)`. Ten tickets become 1 call. A 304-create import becomes 7 calls                                                                              | Adopt now                                    |
| `issueBatchUpdate`, 1 to 50 distinct UUIDs, same patch, transactional | Schema `issueBatchUpdate` 21236-21245; `IssueUpdateInput` 18028-18108      | Assign every child, add one label to every child, set one state or priority across a set | `N` updates become `ceil(N/50)`. Fifty children become 1 call instead of 50                                                                                                  | Adopt now                                    |
| `IssueUpdateInput.addedLabelIds` and `removedLabelIds`                | Schema 18028-18108                                                         | Add or remove one label without replacing the full label set                             | One patch works for 50 issues with different current labels                                                                                                                  | Adopt now with batch update                  |
| `IssueFilter.id.in`                                                   | Schema `IssueFilter.id` 15150-15165; `IssueIDComparator` 15637-15660       | Read a known set of refs in one call                                                     | `N` shows become `ceil(N/250)`. Ten refs become 1 call                                                                                                                       | Adopt now                                    |
| `IssueSortInput.priority`                                             | Schema `IssueSortInput` 17504-17575; `PrioritySort` 27731-27750            | Frontier and `next`; sorted lists                                                        | Current `--sort priority` drains `ceil(T/50)` pages and sorts in the client. Server sort returns 1 page. For the first page, 500 matching issues become 1 call instead of 10 | Adopt now                                    |
| `IssueUpdateInput.description` with a computed body                   | Schema 18054-18056; call-cost note 192-217                                 | Replace four sections after one read and one snapshot check                              | One session used 84 calls for 42 section writes and 42 reads. A four-section batch turns that into about 8 calls                                                             | Adopt now as a CLI composition               |
| `IssueFilter.updatedAt` plus `orderBy: updatedAt`                     | Schema 15271; Linear pagination docs, order by `updatedAt`                 | Resume a session; read what changed since a timestamp                                    | One list call instead of `N` reads, but a changed row still needs a full read                                                                                                | Defer                                        |
| `Issue.history`                                                       | Schema 17005-17025                                                         | Audit a change; find who moved a state                                                   | One extra call per issue; no call reduction                                                                                                                                  | Defer                                        |
| `Issue.documents` and `Document.content`                              | Schema 16890-16910, 6625; Linear documents docs                            | Read a long spec attached to an issue                                                    | Same one call as `issue show`; no call reduction. It may replace a web read                                                                                                  | Defer. A spec is an issue in this repository |
| `Template` and `IssueCreateInput.templateId`                          | Schema 41448, 14904; Linear issue templates docs                           | Apply a team template that creates sub-issues                                            | One create call for a fixed set of sub-issues, but the template is UI-configured and opaque                                                                                  | Defer                                        |
| `Cycle`                                                               | Schema 5751, root query 33335                                              | Sprint planning; current cycle                                                           | No daily agent call. Agents use the parent and priority                                                                                                                      | Reject for now                               |
| `ProjectMilestone`                                                    | Schema 29793, root query 34548                                             | Project phases                                                                           | No daily agent call                                                                                                                                                          | Reject for now                               |
| `Initiative`                                                          | Schema 10259, root query 33800                                             | Roadmap rollups                                                                          | No daily agent call                                                                                                                                                          | Reject for now                               |
| `Notification`                                                        | Schema 23216, root query 34365                                             | Mentions and inbox                                                                       | No call saving. The frontier is the work source                                                                                                                              | Reject                                       |
| `Webhook`                                                             | Schema 44989, create input 45061; Linear webhooks docs                     | Real-time updates                                                                        | No call saving for a one-shot CLI. It needs a public HTTPS listener                                                                                                          | Reject                                       |
| `Attachment`                                                          | Schema 1655, root query 32946; `issue status` already reads GitHub PRs     | Link a PR or a design doc                                                                | One call to create an attachment replaces one comment call. No reduction                                                                                                     | Adapt                                        |
| `Reaction`                                                            | Schema 35694; `Comment.reactions` 2801                                     | Acknowledge a comment                                                                    | No call saving. A comment is clearer                                                                                                                                         | Reject                                       |
| `IssueRelation`                                                       | Schema 16529, 16581-16605                                                  | Blocking edges                                                                           | Already one call per edge. There is no batch relation mutation                                                                                                               | Adopt                                        |
| `rateLimitStatus`                                                     | Schema 34778, 35644-35688                                                  | Read remaining quota                                                                     | It adds one call and consumes quota. The response headers carry the same data                                                                                                | Reject as a command; adapt error metadata    |
| `searchIssues`                                                        | Schema 35105-35145                                                         | Text search                                                                              | Already one call, limited to 30 requests per minute                                                                                                                          | Adapt                                        |

### 3. Patterns rata should reject

1. **A resident daemon or webhook listener.** Linear webhooks need a public HTTPS
   endpoint and retry after 1 minute, 1 hour and 6 hours. A one-shot CLI cannot
   receive them without a server process. `rata` should stay a one-shot command.
2. **A template language.** `gh --template` and `jj -T` each add a language to
   learn, test and document. `--json` plus `--fields`, then `jq` in the shell,
   covers the case with no new surface.
3. **A built-in jq.** `gh --jq` removes the `jq` binary dependency, not a call.
   `rata` already prints JSON to stdout, and the agent can pipe it.
4. **A TUI or interactive form.** The official Linear CLI uses Ink and prompts.
   It has two commands, no documented JSON output and no agent contract. A TUI
   blocks agents and adds a terminal dependency.
5. **A raw API escape hatch.** `gh api`, `railway api` and `vercel api` are useful
   for humans. For `rata`, a raw GraphQL command would bypass the typed queries,
   the one-form rule and `--fields`. Add a typed command instead.
6. **A schema command and an update check.** `railway api schema` and
   `jj util markdown-help` are for a raw API or a documentation build. `rata`
   has a small command surface and an installed skill. A second schema source
   will drift, and an update check writes noise to stderr.
7. **Redundant output switches.** `--count`, `--ids-only`, `--quiet`,
   `--non-interactive` and `--cwd` each add a mode. `--fields`, `--limit`,
   `--json` and `--yes` already cover the needs. `--count` also needs every page,
   so it costs more calls than it saves. `rata` finds the repository from any
   subdirectory, so it does not need `--cwd`.
8. **A response cache.** Linear data changes often. A stale issue read costs more
   than the call it saves. The local SQLite store is for config and auth, not a
   mirror of Linear.

### 4. Proposals

Each proposal keeps one canonical form, one read shape and `--json` as the only
output switch. None reads `process.env` outside the existing `Config` services.

#### P1. Batch section write behind one snapshot check

Add one form:

```bash
rata issue update RAT-42 --sections-file - --dry-run
rata issue update RAT-42 --sections-file - --if-unchanged <updatedAt>
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

The command reads the issue once, applies every heading edit to one body, prints
one unified diff for a dry run, then writes one `issueUpdate` with the new
description and one `--if-unchanged` check. The result is the existing write
shape plus the section actions:

```json
{
  "issue": { "identifier": "RAT-42", "updatedAt": "2026-11-12T12:00:00.000Z" },
  "sections": [
    { "heading": "Flow", "action": "replaced" },
    { "heading": "Gates", "action": "replaced" }
  ]
}
```

`--sections-file` is mutually exclusive with `--body`, `--body-file` and
`--append`. Every heading must exist. A missing heading is `not_found` and names
the available headings. Creating headings in a batch is out of scope for the
first version; use `issue section append` for that.

Why it fits: it is one canonical form for a multi-section write. `issue update
--body-file` can write the whole body in one call, but the agent must reconstruct
it and can drop a heading. `issue section replace` writes one section. A
multi-section write is a distinct operation, so this is not an alias. It returns
one write result and does not add a read shape. The measured saving is 76 calls
in one session (`docs/research/agent-workflow-call-cost.md:192-217`).

Before the batch command, print the new `updatedAt` in human output and document
that the next write can use it. That removes the read half of the loop for
one-section writes.

#### P2. Transactional batch create

Add one form:

```bash
rata issue batch create --input - <<'JSON'
[
  {
    "title": "Add the Stripe client",
    "parent": "RAT-1",
    "labels": ["ready-for-agent"],
    "priority": "medium",
    "assignee": "me",
    "body": "..."
  }
]
JSON
```

The input is a JSON array of 1 to 50 items. Each item uses the `issue create`
field names: `title`, `body`, `team`, `parent`, `labels`, `priority`,
`assignee`, `project`, `state`. `body` is a string. `parent` may be an identifier
because `IssueCreateInput.parentId` accepts a UUID or an identifier.

Rata supplies a UUIDv4 `id` for each item and passes it to
`issueBatchCreate(input: { issues: [...] })`. The client ID maps each result back
to its input even if the API returns the issues in another order.

`--dry-run` prints the planned actions and writes nothing. The result is a write
result, not a read:

```json
{
  "dryRun": false,
  "issues": [{ "id": "b2c3...", "identifier": "RAT-43", "title": "Add the Stripe client" }]
}
```

A GraphQL failure writes one error object. The batch is all-or-nothing, so the
error says that no issues were saved. Include the input index when the CLI can
identify it. A network timeout leaves the outcome unknown; the agent should retry
with a dedupe key. If the input has more than 50 items, fail with `validation`
before the API call.

Why it fits: `issue create` stays the one form for one issue, and `issue batch
create` is the one form for many. It does not add a second set of per-item flags,
and it uses one input format for the batch. `--fields` stays rejected on writes,
and the compact rows bound the output. The API can also create a parent and its children in one
call when the parent has a client ID and comes first. The first version can leave
that to a later change because `parent` already accepts an existing ref.

Call saving: `N` creates become `ceil(N/50)`. Ten tickets become one call. A
304-create import becomes seven calls.

#### P3. Batch read by explicit references

Add one repeatable flag to the existing list command:

```bash
rata issue list --id RAT-42 --id RAT-43 --id RAT-44 --json
```

Internally:

```json
{
  "filter": { "id": { "in": ["RAT-42", "RAT-43", "RAT-44"] } },
  "first": 50,
  "after": null
}
```

The output stays `{ "issues": [...], "pageInfo": ... }`. The rows are in
`createdAt` order, not input order. The agent maps by `identifier`. A path with
more than 250 refs uses `--all` or several calls.

Why it fits: one resource is `issue show`; many resources are `issue list --id`.
No new read shape and no new output switch. The measured case is 18 child reads
in the map chart, which one list call can replace
(`docs/research/agent-workflow-call-cost.md:111-115`).

The field description says the `id` filter accepts a UUID or an identifier.
Verify the `in` list with identifiers on a real workspace before the command
sends them without a resolve step.

#### P4. Route parent bulk writes through `issueBatchUpdate`

Keep the command surface:

```bash
rata issue assign --parent RAT-1 --assignee me
rata issue label add --parent RAT-1 ready-for-agent
rata issue label remove --parent RAT-1 needs-triage
```

Change the implementation:

1. Read the parent's children once, as today.
2. Partition the children into `skipped` and `changed`.
3. Group the changed children by team, because labels are team-scoped.
4. Send one `issueBatchUpdate(ids, input)` per team and per 50 children.
5. Use `assigneeId` for assign, and `addedLabelIds` or `removedLabelIds` for
   labels.

The batch is one transaction per 50. A failure rolls back that chunk. This
changes the current best-effort contract, so update the README and the tracker
doc. Report one error for the chunk with the provider message. Include the issue
when the provider names it, not one result per child after a rollback.

Why it fits: the command surface does not change, so the one-form rule holds. The
API applies the same patch to every ID, and `addedLabelIds` and `removedLabelIds`
do not need the current label set. Fifty children become one call. This is the
second Linear capability to expose.

Add `rata issue batch update --id ...` only when an agent must update an explicit
set that is not a parent's children. Do not add it now.

#### P5. Server-side priority sort

Add a `$sort` variable to the list query and use it when `--sort priority` is
set:

```graphql
query IssueList($filter: IssueFilter, $first: Int!, $after: String, $sort: [IssueSortInput!]) {
  issues(filter: $filter, first: $first, after: $after, sort: $sort) {
    nodes { ... }
    pageInfo { hasNextPage endCursor }
  }
}
```

```json
[
  {
    "priority": {
      "order": "Ascending",
      "noPriorityFirst": false,
      "usePrioritySortOrderTiebreaker": false
    }
  },
  { "createdAt": { "order": "Ascending" } }
]
```

Omit `orderBy` when `sort` is present. The schema says `orderBy` cannot combine
with a custom sort. Remove `sort` from `collectsAllPages`; only `--all` drains.
`rata next` can then request one page with `limit: 1`.

Verify the tie order on a real workspace. If the second key is ignored, keep a
client-side tie sort on the first page only, or document the server order.

Why it fits: `--sort priority` stays the only form. The change is in the query,
not the command surface. The current code fetches every matching page before it
applies `--limit`; the new code fetches one page. For 500 matching issues, that
is 10 calls to 1.

#### P6. Retry metadata in the error object

Add `retryAfterSeconds` to the `rate_limited` error when the header is present:

```json
{
  "error": {
    "code": "rate_limited",
    "message": "Linear rate limit reached.",
    "hint": "Retry after 42 seconds.",
    "retryAfterSeconds": 42
  }
}
```

Preserve the GraphQL `extensions.code` in `details` or a `providerCode` field.
Map only the documented `RATELIMITED` code. Keep unknown codes as `internal` with
the provider code in the details. Do not add a `rate-limit` command; the
`rateLimitStatus` query consumes quota, and the response headers already carry
the data.

Why it fits: the error shape is the existing one, with one optional field. The
exit code stays 6. The agent waits the stated time instead of guessing.

#### P7. Idempotency key on issue create

Add one flag:

```bash
rata issue create --title "Fix login" --dedupe-key mission-42-spec --body-file -
```

Derive a UUIDv4 from `sha256(teamId + "\0" + key)`. Before the create, read
`issue(id: uuid)`. If it exists, return `status: "skipped"` with the existing
issue. If it does not, pass the UUID as `IssueCreateInput.id` and create. The
result gains a `status` field: `created` or `skipped`.

The normal path without `--dedupe-key` stays one call and lets Linear generate
the ID. Linear does not document what happens when a client ID already exists,
so the read check is the guarantee. This is the same pattern as the comment
dedupe in ADR-0007.

Why it fits: it is an option on the one create form, not a second form. The
write result already has its own shape. On a retry, one read replaces a duplicate
create and the cleanup call. The added `status` field is a breaking change to the
create result, so update the README and the skill. A later change can use the
same key per item in `issue batch create`.

#### P8. Measure and bound the relations read

The README and the help say `issue list --include relations` holds up to 250
relations per outgoing or inverse connection. The documented complexity formula
multiplies each connection by its `first` argument or the default 50. By that
formula, an 18-row map read has about `18 x 2 x 250 = 9,000` relation nodes and
fits, while a 50-row page has at least `50 x 2 x 250 = 25,000` relation nodes
before field costs and is above the 10,000 point cap. The current claim is
therefore unproven at the stated bound.

Measure the query at page sizes 10, 25 and 50. Then do one of these:

- Lower the nested relation `first` to a safe value.
- Cap the page size when `--include` is present.
- Use a separate relation read if the API gains a filtered batch query.

Publish the measured cap in the README, the help and the skill. This keeps the
one-call promise true. The call-cost note measured 35,740 bytes for 18 rows with
relations, so token cost is also material
(`docs/research/agent-workflow-call-cost.md:391-393`).

#### P9. Add agent notes to help

Add a short `AGENT NOTES` block to commands with a prompt, a large output or a
batch. Example:

```text
AGENT NOTES
  Use --json for one document. Use --yes to skip the confirmation.
  A batch create is all-or-nothing. Read the error and retry the batch.
  A list returns one page. Use --all to drain it.
```

Keep the block in the CLI help and the skill. Do not add a command. Railway puts
the same idea in `after_help` and names the non-interactive requirement, the
JSON stream and the follow-up command. Also make a prompt fail with a
`validation` error when stdin is not a TTY, and name the non-interactive flag.
A hang is worse than a failed command.

### 5. Recommendation order

1. P1 batch section write. The measured cost is the largest, and the command is
   a composition of existing writes.
2. P4 batch update for parent bulk writes. It removes the largest write loop and
   it is the first of the two Linear capabilities to use.
3. P3 batch read by ID. It removes the per-child read loop and it is the second
   of the two Linear capabilities to use.
4. P2 batch create. It removes the create loop. The measured create count is
   lower, but the batch shape is the same as the other writes.
5. P5 server-side sort. It is a small query change and it removes a full scan
   from every `next`.
6. P6 retry metadata. Small, and it prevents blind waits.
7. P7 idempotency key. Small, and it prevents duplicate specs.
8. P8 relations bound. Measure before the next release.
9. P9 agent notes. Keep it in step with the new forms.

## Evidence

### Linear API

Schema line numbers in this section refer to `packages/sdk/src/schema.graphql`
at commit `87d638c0b151575505d36822839324d2287f2e06` (`@linear/sdk` 102.0.0).

- The Linear GraphQL endpoint is `https://api.linear.app/graphql`, and the API
  supports introspection: Linear, "Getting started", sections "Endpoint" and
  "Getting Started", https://linear.app/developers/graphql, fetched 2026-11-12.
- Linear returns 50 results by default and pages with `first`/`after`:
  Linear, "Pagination", https://linear.app/developers/pagination, fetched
  2026-11-12.
- Linear lists are ordered by `createdAt` by default and can order by
  `updatedAt`: Linear, "Pagination", section "By default results are ordered by
  `createdAt`", https://linear.app/developers/pagination.
- API keys allow 2,500 requests per hour and 3,000,000 complexity points per
  hour; a single query is capped at 10,000 points: Linear, "Rate limiting",
  sections "API request limits" and "Complexity limits",
  https://linear.app/developers/rate-limiting, fetched 2026-11-12.
- A rate-limited request returns HTTP 429, a `RATELIMITED` code and a
  `Retry-After` header: Linear, "Rate limiting", section "Handling rate limit
  errors", https://linear.app/developers/rate-limiting.
- Each property costs 0.1 point, each object 1 point, and each connection
  multiplies its children by the page size or the default 50: Linear, "Rate
  limiting", section "Understanding query complexity",
  https://linear.app/developers/rate-limiting.
- `IssueBatchCreateInput` creates one to 50 issues, rolls back the whole batch
  on one failure, and can create a parent and its children when the parent has
  an `id` and comes first: `packages/sdk/src/schema.graphql` at commit
  `87d638c0b151575505d36822839324d2287f2e06`, lines 14262-14270.
- `issueBatchCreate` repeats the 1 to 50 cap and the rollback rule: schema lines
  21218-21235.
- `issueBatchUpdate` applies the same input to one to 50 distinct issue UUIDs in
  one transaction: schema lines 21236-21245.
- `IssueUpdateInput.addedLabelIds` and `removedLabelIds` add or remove labels
  without replacing the full set: schema lines 18028-18108.
- `IssueFilter.id` matches an issue UUID or a human-readable identifier:
  schema lines 15150-15165. `IssueIDComparator.in` matches any value in a list:
  schema lines 15637-15660.
- `IssueSortInput.priority` is a sort key, and `PrioritySort` has
  `noPriorityFirst` and `usePrioritySortOrderTiebreaker`: schema lines
  17504-17575 and 27731-27750.
- `IssueUpdateInput.description` replaces the full description: schema lines
  18054-18056.
- `IssueFilter.updatedAt` exists: schema line 15271.
- `Issue.history` is a paginated connection: schema lines 17005-17025.
- `Issue.documents` returns a `DocumentConnection`, and `Document.content`
  returns the Markdown body: schema lines 16890-16910 and 6625.
- `Template` carries `content` and `templateData`; `IssueCreateInput.templateId`
  applies a template and creates its sub-issues: schema lines 41448 and
  14904-14909; Linear, "Issue templates", section "Default properties",
  https://linear.app/docs/issue-templates.
- `Cycle`, `ProjectMilestone`, `Initiative`, `Notification`, `Webhook`,
  `Attachment`, `Reaction` and `IssueRelation` are all in the schema at lines
  5751, 29793, 10259, 23216, 44989, 1655, 35694 and 16529.
- The root queries exist for `documents`, `notifications`, `webhooks`,
  `templates`, `cycles`, `projectMilestones`, `initiatives`, `attachments` and
  `issueRelations`: schema lines 33395, 34365, 35573, 35348, 33335, 34548,
  33800, 32946 and 34096.
- `rateLimitStatus` returns the quota snapshot and consumes quota: schema lines
  34778-34788 and 35644-35688.
- `searchIssues` is limited to 30 requests per minute: schema lines 35105-35145.
- `IssueRelationCreateInput` accepts identifiers and reuses an identical
  relation: schema lines 16581-16605.
- Webhooks need a public HTTPS endpoint and retry after 1 minute, 1 hour and 6
  hours: Linear, "Webhooks", sections "How does a Webhook work?" and "Webhook
  Payload", https://linear.app/developers/webhooks, fetched 2026-11-12.
- Linear documents attach to issues, projects, initiatives, teams or cycles:
  Linear, "Documents", section "Overview",
  https://linear.app/docs/documents, fetched 2026-11-12.
- Linear's hosted MCP server is the vendor's agent interface:
  https://linear.app/docs/mcp.md, sections "Setup" and "Common use cases",
  fetched 2026-11-12.

### GitHub CLI

- `gh` converts output to JSON only when the caller names the fields, and
  `--jq` or `--template` formats that JSON: `gh help formatting` (gh 2.102.1),
  section "By default, the result..."; also
  https://cli.github.com/manual/gh_help_formatting.
- `gh api --paginate` requests every page; `--slurp` wraps the pages in one
  array: `gh help api` (gh 2.102.1), section "In --paginate mode..."; also
  https://cli.github.com/manual/gh_api.
- `gh issue list` defaults to `--limit 30` and lists the valid JSON fields
  when `--json` has no value: `gh issue list --help` (gh 2.102.1), "FLAGS" and
  "JSON FIELDS".
- `gh` exits 0 on success, 1 on failure, 2 on cancel and 4 on an auth failure:
  `gh help exit-codes` (gh 2.102.1).
- `gh` reads `GH_CONFIG_DIR`, `GH_REPO`, `GH_HOST` and `GH_TOKEN`, and checks
  for updates once every 24 hours unless `GH_NO_UPDATE_NOTIFIER` is set:
  `gh help environment` (gh 2.102.1), sections "GH_TOKEN", "GH_CONFIG_DIR" and
  "GH_NO_UPDATE_NOTIFIER".
- GitHub search pushes sort to the server with a `sort:` qualifier, for example
  `sort:created-asc`: GitHub Docs, "Sorting search results", section "Sort by
  created date",
  https://docs.github.com/en/search-github/getting-started-with-searching-on-github/sorting-search-results.

### Railway CLI

- `railway status --json` prints one JSON document: `railway status --help`
  (railway 5.71.0).
- `railway up --yes` skips the surrounding prompts, and `railway up --json`
  implies CI mode: `railway up --help` (railway 5.71.0), "Options" and
  "Automation notes".
- `railway delete --yes --json` is the documented non-interactive delete:
  `railway delete --help` (railway 5.71.0), "Examples" and "Automation notes".
- `railway api schema`, `railway api search` and `railway api describe` inspect
  the live GraphQL schema before a raw query: `railway api --help`
  (railway 5.71.0); source `src/commands/api.rs:27-80`.
- Railway turns `Retry-After` into a readable message with a seconds field:
  `~/Projects/other/railway-cli/src/errors.rs:17-23` and `:136-137`.
- Railway keeps stdout pure JSON and sends the human note to stderr:
  `~/Projects/other/railway-cli/src/commands/database/pitr.rs:564-565`.
- Railway disables the spinner when JSON is on:
  `~/Projects/other/railway-cli/src/commands/add.rs:316`.

### Vercel CLI

- Vercel has `--cwd`, `--scope`, `--project`, `--token`, `--no-color`,
  `--version`, `--non-interactive` and documented exit codes 0, 1 and 2:
  Vercel, "CLI Global Options", sections "Current Working Directory", "Scope",
  "Project", "Token", "No Color", "Version", "Non Interactive" and "Exit
  codes", https://vercel.com/docs/cli/global-options, last updated 2026-05-28.
- Vercel resolves a project from the `--project` flag, then
  `VERCEL_PROJECT_ID`, then `.vercel/project.json`: Vercel, "CLI Global
  Options", section "Project".
- Vercel prints an update message when a new release exists: Vercel, "CLI
  Overview", section "Updating Vercel CLI", https://vercel.com/docs/cli, last
  updated 2026-10-07.

### Wrangler

- `wrangler deploy --dry-run` compiles without deploying, and `wrangler delete
--dry-run` reports without deleting: Cloudflare, "Workers commands", sections
  `deploy` and `delete`,
  https://developers.cloudflare.com/workers/wrangler/commands/workers/, last
  updated 2026-10-26.
- `wrangler setup --yes` answers prompts, and `--dry-run` applies no filesystem
  change: Cloudflare, "Workers commands", section `setup`.
- `wrangler secret bulk` accepts up to 100 secrets from a file or stdin in JSON
  or `.env` form: Cloudflare, "Workers commands", section `secret bulk`.
- Wrangler's global flags include `--cwd` and `--config`, and it finds the
  nearest config file from the current directory: Cloudflare, "Workers
  commands", "The following global flags work on every command"; "Configuration",
  section "Sample Wrangler configuration",
  https://developers.cloudflare.com/workers/wrangler/configuration/, last
  updated 2026-11-11.

### Jujutsu

- jj accepts `-T`/`--template` and describes its template system as a functional
  language: jj, "Templates", opening section,
  https://jj-vcs.github.io/jj/latest/templates/, fetched 2026-11-12.
- jj has global `--quiet`, `--no-pager` and `--color`, and reads the closest
  `.jj` directory unless `-R` is given: jj, "CLI reference", `jj` options,
  https://jj-vcs.github.io/jj/latest/cli-reference/, fetched 2026-11-12.
- jj can print Markdown help and a config schema: jj, "CLI reference",
  `jj util markdown-help` and `jj util config-schema`.

### Git

- `git status --porcelain=v2` is a stable, extensible machine format; `-z`
  terminates paths with NUL: Git, "git-status", sections "Porcelain Format
  Version 2" and "Pathname Format Notes and -z",
  https://git-scm.com/docs/git-status, fetched 2026-11-12.
- `git diff --numstat` is machine friendly, and `-z` avoids path quoting: `git
help diff` (git 2.56.0), options `--numstat` and `-z`.
- `git cat-file --batch` reads objects from stdin, one per line, and prints them
  in the same order: `git help cat-file` (git 2.56.0), section "BATCH OUTPUT".
- `git update-ref --stdin` performs all modifications together, with
  `start`, `prepare`, `commit` and `abort`; `--batch-updates` allows individual
  failures: `git help update-ref` (git 2.56.0), section "With --stdin".

### Official Linear CLI

- The official package is `@linear/cli` 0.0.5, last published five years ago,
  with two commands: `lin new` and `lin checkout`. `lin new` takes `--team`,
  `--title` and `--description`; the readme documents no JSON output:
  https://www.npmjs.com/package/@linear/cli, readme sections "Usage" and
  "Options".
- The package depends on `ink`, `ink-form`, `react` and `clipboardy`, so its
  interface is a terminal UI, not a machine protocol:
  https://registry.npmjs.org/@linear/cli/latest, `devDependencies`.
- The package has no public source repository in the metadata, so the compiled
  package and its readme are the available sources.

### Rata current state

- `--json` is one global flag and a failed JSON command writes one `error` object
  to stderr: `README.md` lines 128-158.
- `--fields` selects dotted paths from a read; writes reject it: `README.md`
  lines 178-193 and 1043-1074.
- `--dry-run` covers every issue write: `README.md` lines 1336-1359.
- `--yes` skips delete prompts; JSON delete requires it: `README.md` lines
  458-470 and 1218-1221.
- List commands return one page of 50 by default, 250 at most, and drain with
  `--all`: `README.md` lines 256-303.
- Exit codes are 0 to 6 and map to the error class: `README.md` lines 160-176.
- `issue assign`, `issue label add` and `issue label remove` accept `--parent`
  and write to every child, best-effort: `README.md` lines 1262-1301.
- Idempotency covers comments with `--dedupe-key` and the idempotent writes:
  `README.md` lines 1303-1316.
- `issue list --include relations` claims up to 250 relations per outgoing or
  inverse connection: `README.md` lines 797-811.
- `--sort priority` fetches every matching page before it applies `--limit`:
  `README.md` lines 813-818; source `src/api/issue-model.ts:228-232`.
- Config lives in the git common directory, so every worktree shares it:
  `README.md` lines 630-668.
- One canonical form per operation is ADR-0009:
  `docs/adr/0009-one-canonical-form-per-operation.md:24-37`.
- Read shapes follow the resource, and `--fields` starts at the resource:
  `docs/adr/0010-read-shapes-follow-the-resource.md:26-47`.
- The measured call cost is in this repository:
  `docs/research/agent-workflow-call-cost.md:19-24`, `:111-115`, `:139-149`,
  `:192-217`, `:219-224`, `:391-394`.

## Conflicts

1. **The relations bound against the complexity cap.** The README says
   `issue list --include relations` holds up to 250 relations per outgoing or
   inverse connection (`README.md:797-811`). Linear says a connection multiplies
   its children by the page size or the default 50, and a single query is capped
   at 10,000 points (`https://linear.app/developers/rate-limiting`, sections
   "Complexity limits" and "Understanding query complexity"). An 18-row map read
   has about `18 x 2 x 250 = 9,000` relation nodes and fits under the cap. A
   50-row page has at least `50 x 2 x 250 = 25,000` relation nodes before field
   costs, which is above the 10,000 point cap. That explains why the measured
   18-row read works and why the default 50-row page is at risk. The repository
   has no measured bound. Measure it and publish the real cap, or lower the
   nested `first`.
2. **Best-effort bulk writes against transactional batch updates.** The README
   says a failure mid-batch does not roll back earlier writes
   (`README.md:1277-1280`). `issueBatchUpdate` is one transaction per 50
   (`schema.graphql:21236-21245`). The repo must choose. The recommendation is to
   adopt the transaction per 50, because it removes the write loop and gives a
   clear failure boundary. The README, help and tracker doc must change.
3. **A one-shot CLI against Linear's agent interfaces.** Linear recommends its
   hosted MCP server for agents and webhooks for updates
   (`https://linear.app/docs/mcp.md`, section "Setup";
   `https://linear.app/developers/webhooks`). `rata` is a one-shot CLI driven by
   shell skills. The repository follows the one-shot CLI because the skills
   already call it and because it needs no resident process. The two interfaces
   can coexist.
4. **The official Linear CLI against agent-first CLI practice.** The official
   CLI is a five-year-old two-command Ink tool with no documented JSON output
   (`https://www.npmjs.com/package/@linear/cli`). It is not a model for agent
   UX. The repository should use it only as evidence that Linear has no current
   first-party agent CLI on npm, not as a pattern source.
5. **Post-fetch field selection against API-level selection.** `gh` sends the
   field list to the API and fetches only those fields (`gh help formatting`,
   section "By default, the result..."). `rata --fields` projects after the
   query and fetches the full object. The repo follows projection because the
   query shapes are shared and typed. The tradeoff is a larger API response, not
   a larger agent context. Keep the current rule; revisit only if complexity
   becomes the limit.
6. **A batch section write against the one-section command contract.** ADR-0009
   says one canonical form per operation. `issue section replace` is the form for
   one section. A multi-section write is a new operation, not an alias. The repo
   can add `issue update --sections-file -` as the one form for a multi-section
   write, while `issue section replace` stays the one form for one section. State
   the boundary in the help and the skill.

## Not found

- Linear's behavior when `issueCreate` or `issueBatchCreate` receives an `id`
  that already exists. Checked the GraphQL docs, the schema descriptions and the
  Linear docs index. The schema only says the client may supply a UUID. The
  proposed idempotency key therefore uses a read check, not an API guarantee.
- A Linear example of `IssueFilter.id.in` with human-readable identifiers.
  Checked the filtering docs and the schema. The field description says the
  filter matches a UUID or an identifier, and the comparator says `in` matches a
  list, but no example combines them. Verify on a real workspace before the
  command sends identifiers without a resolve step.
- The exact tie order for `IssueSortInput.priority` when
  `usePrioritySortOrderTiebreaker` is false and a second `createdAt` sort key is
  supplied. Checked the schema and the pagination docs. The list type implies a
  precedence, but no example states it. Measure on a real workspace.
- A batch mutation for issue relations, comments or archives. Checked the
  mutation list. Only `issueBatchCreate` and `issueBatchUpdate` exist. Relations,
  comments and archives remain one call each.
- A public source repository for `@linear/cli` 0.0.5. Checked the npm metadata
  and the readme. The package is compiled and the metadata names no repository.
- The exact Vercel CLI version at the docs date. The global options page does
  not state a version. The page was last updated 2026-05-28.
- The exact Wrangler version at the docs date. The commands page does not state a
  version. The page was last updated 2026-10-26.
- The exact jj version at the docs date. The docs are the "latest" build and say
  the CLI reference is experimental.
- A measured complexity result for `issue list --include relations` at page
  sizes above 10. The local traces measure bytes, not the API complexity score.
  The 10,000 point cap is documented, but the safe row count is not.
- Whether `issueBatchUpdate` accepts `addedLabelIds` and `removedLabelIds` in the
  same input. The schema forbids combining either with `labelIds` but does not
  forbid the two together. Test before the command uses both in one patch.

## References

- `README.md`: the current command surface, output shapes, paging, errors and
  bulk write contract.
- `docs/adr/0009-one-canonical-form-per-operation.md`: one canonical form per
  operation and the hint rule.
- `docs/adr/0010-read-shapes-follow-the-resource.md`: flat reads, list envelopes
  and `--fields`.
- `docs/research/agent-workflow-call-cost.md`: the measured call cost, the
  section loop and the largest savings.
- `docs/research/agent-usage-pain-points.md`: the earlier failure classes and the
  natural-form evidence.
- `src/api/issue-query.ts`: the list and search queries, the single create
  mutation and the per-issue reads.
- `src/api/issue-model.ts`: the client-side priority sort and the `--sort` page
  drain.
- `src/api/issue-write/bulk.ts`: the per-child assign and label loops.
- `src/api/client.ts`: the `Retry-After` retry policy and the hidden error
  details.
- `src/cli/error-report.ts`: the error codes and exit codes.
- Linear, "Getting started": https://linear.app/developers/graphql, the endpoint,
  auth and introspection.
- Linear, "Pagination": https://linear.app/developers/pagination, the page
  default and the cursor shape.
- Linear, "Rate limiting": https://linear.app/developers/rate-limiting, the
  request, complexity and retry rules.
- Linear, "Filtering": https://linear.app/developers/filtering, the `in` and
  `nin` comparators.
- Linear, "Webhooks": https://linear.app/developers/webhooks, the listener and
  retry requirements.
- Linear, "Documents": https://linear.app/docs/documents, the document model.
- Linear, "Issue templates": https://linear.app/docs/issue-templates, the
  template defaults and sub-issues.
- Linear, "MCP server": https://linear.app/docs/mcp.md, the vendor's agent
  interface.
- Linear SDK schema, `packages/sdk/src/schema.graphql`, commit
  `87d638c0b151575505d36822839324d2287f2e06`, version 102.0.0:
  https://github.com/linear/linear/blob/87d638c0b151575505d36822839324d2287f2e06/packages/sdk/src/schema.graphql,
  the exact input and output shapes.
- GitHub CLI, "gh formatting": https://cli.github.com/manual/gh_help_formatting,
  the JSON field list, `--jq` and `--template`.
- GitHub CLI, "gh api": https://cli.github.com/manual/gh_api, `--paginate`,
  `--slurp`, `--input` and the GraphQL mode.
- GitHub Docs, "Sorting search results":
  https://docs.github.com/en/search-github/getting-started-with-searching-on-github/sorting-search-results,
  server-side sort qualifiers.
- Railway CLI help, version 5.71.0: `railway status --help`,
  `railway up --help`, `railway delete --help`, `railway api --help`.
- Railway CLI source: `~/Projects/other/railway-cli/src/errors.rs`,
  `src/commands/api.rs`, `src/commands/add.rs`,
  `src/commands/database/pitr.rs`, the retry message, schema introspection,
  spinner gating and stdout discipline.
- Vercel, "CLI Global Options":
  https://vercel.com/docs/cli/global-options, config precedence, `--scope`,
  `--token`, `--non-interactive` and exit codes.
- Cloudflare, "Workers commands":
  https://developers.cloudflare.com/workers/wrangler/commands/workers/,
  `--dry-run`, `--yes` and `secret bulk`.
- Cloudflare, "Configuration":
  https://developers.cloudflare.com/workers/wrangler/configuration/, the config
  file discovery and formats.
- jj, "CLI reference": https://jj-vcs.github.io/jj/latest/cli-reference/,
  `--quiet`, `--no-pager`, `--color`, `-R`, `util markdown-help`.
- jj, "Templates": https://jj-vcs.github.io/jj/latest/templates/, the functional
  template language.
- Git, "git-status": https://git-scm.com/docs/git-status, porcelain v2 and `-z`.
- Git, `git help diff`, `git help cat-file`, `git help update-ref`, version
  2.56.0: machine formats, batch reads and transactional writes.
- npm, `@linear/cli` 0.0.5: https://www.npmjs.com/package/@linear/cli, the
  official CLI's two commands and no documented JSON output.
- npm registry, `@linear/cli` latest:
  https://registry.npmjs.org/@linear/cli/latest, the Ink/React dependencies.
