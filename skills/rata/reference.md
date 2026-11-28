# rata command reference

Every command, flag and JSON shape. The `rata` skill covers the first command
and the loops. `docs/agents/issue-tracker.md` covers the repository rules.

## Invocation

`rata <command> [subcommand] [flags] [arguments]`

- `<ref>` is an issue identifier (`ABC-42`), a UUID, or a `linear.app` URL.
- The issue reads, the migrated writes (`issue start`, `handoff`, `close`,
  `apply`, `relate`, `publish`, `comment`) and the admin commands accept
  `--format json|text` and `--select <paths>`. JSON is the default when stdout
  is not a terminal. `issue create` still accepts `--json` until its slice.
- The old read forms (`issue show`, `issue view`, `issue status`, `next`, `why`)
  and the old read flags (`--json`, `--fields`, `--count`, `--ids-only`,
  `--include`) exit 2 with a `usage` error.
- `--body-file -` and `--comment-file -` read stdin. `--dry-run` previews.
- `--limit` is the page size: 50 by default, except `issue search` defaults to
  10; 250 at most. `--after` continues a page; `--all` drains every page. The
  repository config supplies the default team and project.
- Write help ends with an agent notes block: JSON, dry run, stdin and paging.

## JSON and errors

A single-resource read prints that object. A list prints `{ <plural>, pageInfo }`.
A context document keeps named sections. A write prints its result.

With JSON output, a failure writes
`{ "error": { "code", "message", "hint" } }` to stderr; `hint` is a string or
`null`; `RATA_DEBUG=1` adds `details`. Human mode prints `error:` and `hint:`.

Codes: `0` success, `1` internal, `2` usage or validation, `3` not found,
`4` conflict, `5` auth, `6` retryable. A parse error writes the normal error
object with code `usage`; help prints only for `--help`. A partial apply writes
one resource document with `result.status: "failed"`, the applied actions, the
failed action and `result.error`, and exits with the failed action's code.

## Setup

`auth login --with-token [--workspace <name>]` saves a key from stdin;
`auth status`, `auth logout`, `workspace list` and `workspace use <name>`
manage it; `whoami` shows the viewer; `unlink` removes the link and defaults.
`status [--refresh]` prints the repo, workspace, key source, team, project,
defaults, states, labels, triage map, cache age, document health, viewer and org.
The team detail is cached in SQLite for seven days. A warm `status` makes no
Linear request; `--refresh` reads Linear and replaces the cache. `link [--team]
[--project] [--workspace] [--create --name]` links the repo and stores the team
UUID; without `--team` it prompts and sets the team timezone. `config show`,
`config set` and `config unset` manage the issue defaults; `--label` replaces
the list.

The key resolves as `LINEAR_API_KEY`, the repository `workspace`, then
`default`. A stored team resolves by UUID, key, then name. A stale UUID or key
that resolves is repaired with a warning; `status` keeps the warning. A warm
cache can serve the stored UUID for up to seven days; `--refresh` revalidates
it. A team that no longer exists fails a read with `not_found` and the repair
hint; `status` exits 0 with `team`, `defaults` and `cache` at `null` and
`states` and `labels` empty. The triage map and the document health stay. A
legacy `.rata.json` is imported and removed on first use; a failed remove warns.

`status` carries `states` and `labels` from the cache, the `triage` map parsed
from `docs/agents/triage-labels.md`, `cache.ageSeconds`, and `docs.tracker` and
`docs.triage` health. The triage document must declare the canonical label
header; a reordered table parses by header name. A headerless or incomplete
document is an unhealthy `docs.triage` with a warning; `status` still prints the
rest. An unknown state or label refreshes the context once, then fails
`not_found` with the valid names.

A command resolves the repository context once: root, profile, team identity
and cached detail, states, labels, defaults and the stale-link warning. The
viewer is lazy. `--assignee me` loads the cached viewer only for that read; a
read without it does not.

Writes follow the issue. A linked repository writes against the linked team.
Without a link, state and label writes fall back to the issue's team. A single
write on an issue in another team uses that issue's team, even when the
repository is linked. A write that repairs a stale link prints the warning, as
`list` and `search` do. Bulk label writes resolve each child team's labels.

## Teams, projects and labels

`team list [--limit] [--after] [--all]`; `team show [<ref>]` gives states, labels,
members and priorities; `team create --name <name> [--key]`; `team delete <key>
[--yes]`. `project list [--team] [--include-archived] [--limit] [--after]
[--all]`; `project create --name <name> [--team]`; `project delete <ref>
[--yes]`; `project restore <ref>`. `label list [--team] [--limit] [--after]
[--all]`; `label create --name <name> [--color] [--team] [--if-not-exists]`;
`label edit <ref> [--name] [--color] [--team]`.

## Issues

### Read shapes

| Command                                   | JSON                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `issue <ref>`                             | The working set: summary fields, `description`, `sections`, `blocked`, `blockedBy`, `prs`, `children`, `frontier`, `nextChild`, `comments: null` |
| `issue <ref> --summary`                   | The summary fields: `id`, `identifier`, `title`, `state`, `priority`, `labels`, `assignee`, `project`, `parent`, `url`, `createdAt`, `updatedAt` |
| `issue <ref> --full`                      | The working set plus `relations` and full child rows                                                                                             |
| `issue <ref> <ref> ...`                   | `{ items, pageInfo }`; one working set per ref, one list request per page                                                                        |
| `team show [<ref>]`                       | The team object                                                                                                                                  |
| `issue list`                              | `{ issues, pageInfo }`; `--relations` adds the six relation groups                                                                               |
| `issue search`                            | `{ issues, pageInfo }`; ten summary rows by default, no description                                                                              |
| `team list`, `project list`, `label list` | `{ <plural>, pageInfo }`                                                                                                                         |
| `status`                                  | Named sections: `repository`, `workspace`, `viewer`, `team`, `project`, `defaults`, `states`, `labels`, `triage`, `cache`, `docs`, `warning`     |
| `config show`                             | `{ defaults }`                                                                                                                                   |
| `auth status`                             | `{ authenticated, source, profile, storePath, viewer }`                                                                                          |
| `link`                                    | `{ team, project, workspace, timezone }`                                                                                                         |

The working set carries the summary fields, the parsed `sections`, `blocked` and
`blockedBy`, the Linear `github` attachments as `prs` (`checks` and `mergeCommit`
are `null`, each PR says `source: "linear"`), lean `children` with `blocked` and
`blockedBy`, `frontier` (open, unblocked, unassigned children), `nextChild` (the
first frontier row) and `comments: null`. `--comments` fills the comments.
`--summary` returns the summary fields only. `--full` adds the six `relations`
groups and full child rows; the summary fields are already in the default
working set. `issue list` and `issue search` rows are summaries with `url`,
timestamps and labels; search rows have no description.

### Field selection

`--select` selects dotted paths from an issue read. It validates the declared
shape of the active mode (summary, working or full) before the read, so an
unknown path is `validation` even on an empty list or a null object; `details`
carries `path` and `validPaths`. It starts at the resource for one ref, at each
row for a list, and at each item for many refs.

A path through a null object returns `null`. An array is selectable whole. A path
may cross an array: a final array segment returns the array; a later segment maps
each element; a scalar leaf returns an array of scalars (`labels.name` ->
`["bug"]`); an object leaf returns an array of objects (`children.state` ->
`[{ "state": ... }]`); paths that cross the same array merge. A path through an
array of scalars is `validation`; an empty array returns `[]`. A list keeps
`pageInfo`.

### `issue <ref>` flags

`--comments` adds comments; the default read returns `comments: null`.
`--summary` returns the summary fields only and rejects `--comments`.
`--full` adds relations and full child rows. `--summary` and `--full` are
mutually exclusive. Many refs print `{ "items", "pageInfo" }`; each page of refs
is one list request, not one detail read per ref. Under Linear's 10,000-point
query cap, a page holds up to 250 refs in summary mode, 5 in working mode and 3
in full mode. Every requested connection is drained: children, relations, labels,
attachments and comments each fetch their remaining pages in one batched request
per connection page.

### `issue list` flags

`--team`, `--state`, `--state-type`, `--priority`, `--label`, `--assignee`,
`--project`, `--parent`, `--text`, `--unblocked` and `--unassigned` filter;
`--limit`, `--after` and `--all` page. `--relations` adds the six relation groups
to every row with one request per page.

On an empty page, `--state`, `--label` and `--project` are checked for
existence. An unknown name is `not_found` with the valid names; a valid name
with no matches stays empty. `--assignee` accepts `me` or a user UUID; a
malformed value is `validation`, an unknown UUID is `not_found`.

`--sort priority` orders urgent first and none last; ties go to the oldest.
`--limit` stays the page size and `--after` continues the sorted result.

### `issue search` flags

`issue search <text> [--team] [--limit] [--after] [--all]` returns ten summary
rows by default. `--limit` changes the page size, `--after` continues from a
cursor and `--all` drains. It keeps relevance order. It does not return
descriptions.

### Paging

Every list prints one page: `--limit` is the page size, `--after` continues from
`pageInfo.endCursor`, and `--all` drains with `pageInfo`
`{ "hasNextPage": false, "endCursor": null }`. Keep the filters and order fixed;
a cursor is bound to its query.

## Issue writes

Every write uses the same plan and result contract. `issue apply` takes the
general document; `issue publish` creates a graph; `issue start`, `issue handoff`
and `issue close` are the lifecycle forms. `issue apply <ref> --file -` reads
one JSON document:

```json
{
  "state": "In Progress",
  "assignee": "me",
  "priority": "high",
  "labels": { "add": ["ready-for-agent"], "remove": ["needs-triage"] },
  "sections": [
    { "heading": "Handoff log", "mode": "append", "content": "PR #42 is open." },
    { "heading": "Flow", "mode": "replace", "content": "..." }
  ],
  "comment": { "body": "Started work.", "dedupeKey": "start-42" },
  "relations": { "blockedBy": ["RAT-41"] }
}
```

The fields are `title`, `state`, `assignee`, `priority`, `project` and `parent`.
`assignee`, `project` and `parent` accept `null` to clear them. The engine plans
every action before it writes. It touches only named fields and objects. A bad
state, label or heading fails before the first write. A partial failure returns
the applied actions, `failed` and `error`; the exit code is the failed action's.

`--dry-run` returns the same `{ issue, result }` with `dryRun: true` and writes
nothing. `--if-unchanged <snapshot>` checks `result.snapshot` once before the
first mutation; a mismatch exits 4. A no-op returns `status: "skipped"`.

Sections: `replace` requires the heading and fails with `not_found` when it is
missing; `append` adds to an existing section or creates a missing `## heading`
at the end. A heading that appears more than once is a `conflict`.

Comment: `issue apply` requires `comment.dedupeKey`. The key is scoped to the
issue; a retry returns `skipped`. `issue comment <ref> --body-file -` posts one
comment and requires `--dedupe-key`.

Relations are a set. An existing edge is `skipped`. Omit a group to leave it
alone. `issue relate <ref> (--blocks|--blocked-by|--related|--duplicate)
<target>...` adds one-off edges; `--remove` removes them.

### Publish

`issue publish --file - [--dry-run]` reads one JSON document with `team`,
`parent`, `defaults` and `nodes`. Each node requires `key`, `kind` and `title`;
`body`, `priority`, `labels`, `assignee`, `state`, `parent` and `blockedBy` are
optional. A parent or a blocker may name a node key or an existing issue
reference. The engine orders the nodes, derives a stable client UUID from the
parent and key (the team scopes a top-level node), reads the existing ids before
it creates, and creates up to 50 nodes per `issueBatchCreate`. It adds only the
missing blocking edges. A cycle or an unknown key fails before the first write.
A retry reuses the nodes and skips the edges that already exist. `kind` is
recorded on the node and in the result; in this slice it does not set labels or
assignees. The result is `{ nodes, edges, result }`; `--dry-run` writes nothing.

### Lifecycle

`issue start <ref> [--state <name>] [--take] [--dry-run]` claims an unassigned
issue, skips a claim the viewer already holds, and exits 4 with the holder when
another user holds it. `--take` reassigns. It moves to the first `started` state
or to `--state`. A retry is `skipped`.

`issue handoff <ref> --file -` reads an apply document plus `pr`, the pull
request URL. It attaches the PR, applies the fields, sections and one deduped
comment, and a retry is `skipped`.

`issue close <ref> [--comment-file -] [--force] [--dry-run]` refuses open
children without `--force` and names them. It moves the issue to the first
`completed` state and skips an already closed issue. The comment comes from the
file; a new comment posts once, and the same comment is `skipped` on a retry. The
old `--comment` string flag is gone.

The old write forms (`issue update`, `issue label`, `issue section`,
`issue assign`, `issue unassign`, `issue reopen`, `issue link`, `issue unlink`
and `issue comment create/update/delete`) exit 2 with a `usage` error.

## Read-after-write

`issue create --parent` checks that the new object appears on a bounded
re-read. The default is 5 seconds; `--wait <seconds>` changes it and `--wait 0`
disables it. A timeout still exits 0: the mutation payload is the source of
truth. JSON adds `visible`: `false` on timeout and `null` when disabled. The
apply comment does not wait; its mutation payload is the source of truth.

## Idempotency

A write that finds the desired state in place exits 0 and reports `skipped`;
this covers `issue apply`, `issue publish`, `issue start`, `issue handoff`,
`issue close`, `issue relate`, `issue comment`, `link` and `unlink`. A closed issue is skipped
by `issue close`; a new comment posts once, and the same comment is skipped. A
`canceled` or `duplicate` issue counts as closed. `issue create` always creates a
new object. `label create` fails on a duplicate name with `conflict` unless
`--if-not-exists` returns it with `created: false`.

## Executable hints

A known wrong form fails with `validation` before any request, keeps the JSON
error shape, and prints one hint that names the command to run. A supplied body,
label or relation value stays in the hint, shell-quoted when needed.

| Wrong form                                 | Hint                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `issue show <ref>`                         | `rata issue <ref>`                                                           |
| `issue status <ref>`                       | `rata issue <ref>`                                                           |
| `issue comment create <ref>`               | `rata issue comment <ref> --body-file - --dedupe-key <key>`                  |
| `issue update <ref> --label <label...>`    | `rata issue apply <ref> --file -` with `labels.add`                          |
| `issue create --blocked-by <ref>`          | `Create the issue, then run rata issue relate <new-ref> --blocked-by <ref>.` |
| `issue update <ref> --blocked-by <ref>`    | `rata issue relate <ref> --blocked-by <ref>`                                 |
| `issue link <ref>` without a relation flag | `rata issue relate <ref> --blocked-by <blocker>`                             |
| an issue read with `--fields`              | `Use --format json; --select replaces --fields.`                             |
| a write with `--fields`                    | `Use --format json; --select replaces --fields.`                             |
