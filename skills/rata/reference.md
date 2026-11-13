# rata command reference

Every command, flag and JSON shape. The `rata` skill covers the first command
and the loops. `docs/agents/issue-tracker.md` covers the repository rules.

## Invocation

`rata <command> [subcommand] [flags] [arguments]`

- `<ref>` is an issue identifier (`ABC-42`), a UUID, or a `linear.app` URL.
- `--json` is global: it works before or after the subcommand.
- `--fields <paths>` selects dotted paths from a read; it needs `--json`.
- `--body-file -` and `--comment-file -` read stdin. `--dry-run` previews.
- `--limit` is the page size: 50 by default, 250 at most. `--after <cursor>`
  continues a page; `--all` drains every page. The repository config from
  `rata link` supplies the team and the project; list commands default to the
  linked team.

## JSON and errors

A read of one resource prints that object. A list prints `{ <plural>, pageInfo }`.
A context document keeps its named sections. A write prints its result object.

With `--json`, a failure writes one object to stderr:
`{ "error": { "code", "message", "hint" } }`. `hint` is a string or `null`.
`RATA_DEBUG=1` adds `details`. In human mode the error prints `error: <message>`
and, when present, `hint: <hint>` on stderr.

The codes: `0` success (including a skipped write), `1` internal, `2` validation,
`3` not found, `4` conflict, `5` auth, `6` retryable. A bulk write exits with the
code of its first failed result, or `0`.

Two cases write a partial result to stdout instead: a bulk write reports one
result per issue, and a failed `issue update --comment` reports the issue update,
`"comment": null` and the `error` object.

## Setup

- `auth login --with-token [--workspace <name>]`: save a key from stdin as a
  profile. `default` without the flag. `auth status` and `auth logout` take the
  same `--workspace`; they show or remove one profile.
- `workspace list` and `workspace use <name>` manage profiles. `whoami` shows
  the viewer. `unlink` removes the stored link and defaults.
- `status`: the repo, workspace, key source, team, project, defaults, viewer and
  org. It exits 0 with a `warning` when the stored team key is stale.
- `link [--team <key>] [--project <name>] [--workspace <name>] [--create --name <name>]`:
  link the repository. Without `--team` it prompts; the prompt needs a terminal.
  It sets the team timezone.
- `config show`: the issue defaults. `config set --assignee me --label <name> ...`
  sets them; `--label` replaces the list. `config unset --label` clears one.

The key resolves as `LINEAR_API_KEY`, the repository `workspace`, then the
`default` profile. `link --workspace <name>` selects that profile directly.

A stale team key leaves `team` and `defaults` at `null` and puts the repair in
`warning`: run `rata team list`, then `rata link --team <key>`. On first use,
rata imports a legacy `.rata.json` and removes it; a failed remove prints a
warning and the command proceeds.

## Teams, projects and labels

- `team list [--limit] [--after] [--all]`. `team show [<ref>]`: states, labels,
  members and priorities; defaults to the linked team.
  `team create --name <name> [--key <key>]`. `team delete <key> [--yes]`.
- `project list [--team] [--include-archived] [--limit] [--after] [--all]`.
  `project create --name <name> [--team]` (`--team` repeatable).
  `project delete <ref> [--yes]`. `project restore <ref>`.
- `label list [--team] [--limit] [--after] [--all]`.
  `label create --name <name> [--color] [--team] [--if-not-exists]`.
  `label edit <ref> [--name] [--color] [--team]`.

## Issues

### Read shapes

| Command                                   | JSON                                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| `issue show <ref>`                        | The issue object with `description`, `children`, `relations`, `attachments` and `comments`    |
| `issue show <ref> --summary`              | The summary object                                                                            |
| `issue status <ref>`                      | The summary plus `blocked`, `blockedBy`, `prs` and `nextChild`                                |
| `next --parent <ref>`                     | The summary of the ready child, or `null`                                                     |
| `why <ref>`                               | The summary plus `blocked` and `blockedBy`                                                    |
| `team show [<ref>]`                       | The team object                                                                               |
| `issue section get <ref> <heading>`       | `{ "heading", "level", "content" }`                                                           |
| `issue list`, `search`                    | `{ issues, pageInfo }`                                                                        |
| `team list`, `project list`, `label list` | `{ <plural>, pageInfo }`                                                                      |
| `status`                                  | Named sections: `repository`, `workspace`, `viewer`, `team`, `project`, `defaults`, `warning` |
| `config show`                             | `{ defaults }`                                                                                |
| `auth status`                             | `{ authenticated, source, profile, storePath, viewer }`                                       |
| `link`                                    | `{ team, project, workspace, timezone }`                                                      |

Every issue read carries `createdAt` and `updatedAt`. The summary carries the
identifier, title, state, priority, labels, assignee, project, parent and url.
`issue status` carries the Linear `github` attachments as `prs`; `checks` and
`mergeCommit` are `null`, and each PR says `source: "linear"`.

### Field selection

`--fields` selects dotted paths from a read and needs `--json`. The path starts
at the resource for a read and at each row for a list. For `config show` it
starts at `defaults`; for `status` it starts at the whole document. Writes
reject the flag with `validation`.

A path through a null object returns `null`; `assignee.name` on an unassigned
issue gives `{ "assignee": null }`. An array is selectable as a whole, such as
`labels`; a path into an array is `validation`. An unknown path is `validation`
and the hint lists the valid keys at that level. A list result keeps `pageInfo`.
The flag is valid on `status`, `issue show`, `issue status`, `next`, `why`,
`issue section get`, `issue list`, `search`, `team show`, `team list`,
`label list`, `project list` and `config show`.

### `issue show` flags

`--comments` adds comments; `--no-comments` skips the fetch and omits the key.
The two are mutually exclusive. `--summary` reads the header fields only and
rejects `--comments`.

`--no-body` drops the description from the output only; the read still fetches
it. `--no-relations`, `--no-children` and `--no-attachments` drop those parts and
skip their fetches. JSON is the issue object, not a wrapper; `view` aliases
`show`. Every collection page is read, so `issue show` is complete.

### `issue list` flags

`--team`, `--state`, `--state-type`, `--priority`, `--label`, `--assignee`,
`--project`, `--parent`, `--text`, `--unblocked` and `--unassigned` filter the
list. `--limit`, `--after` and `--all` page it.

`--sort priority` orders urgent first and none last; ties go to the oldest. It
fetches every matching issue across all pages before `--limit` applies. With
`--unblocked`, blocked issues are dropped first.

`--include relations` adds `blocks`, `blockedBy`, `duplicates`, `duplicatedBy`,
`related` and `similar` to every row. It sends one list request per page and no
per-child read; each outgoing or inverse connection holds up to 250 relations,
and `related` and `similar` merge both. A full page measures 2,462 complexity
points at page sizes 10, 25 and 50, under the 10,000-point single-query cap.
Read a row with more relations with `issue show`. Without the flag, a row has no
`relations` key. Another value is `validation` and the hint lists `relations`.

### `next`, `why` and `search`

`next --parent <ref>` returns the first open, unblocked, unassigned child:
priority first, then the oldest `createdAt`. It reads every page before it picks.
JSON is the summary or `null`; both exit 0.

`why <ref>` returns the summary plus `blocked` and `blockedBy`. Each blocker
carries its state and a `closed` flag; `blocked` is true when any is open.

`search <text>` takes `--team`, `--limit`, `--after` and `--all`. It keeps
Linear's relevance ranking, so its paging is best effort.

### Paging

Every list command prints one page per call: `--limit` is the page size and
`--after` continues from `pageInfo.endCursor`. The JSON is
`{ "issues": [], "pageInfo": { "hasNextPage": true, "endCursor": "b2c3..." } }`.
With `--all`, `pageInfo` is `{ "hasNextPage": false, "endCursor": null }`. Keep
the filters and the order fixed across pages: a cursor is bound to its query.

## Issue writes

The focused writes: `issue assign [<ref>...] --assignee <me|none|id> [--parent]`,
`issue unassign <ref>`, `issue label add|remove [<ref>] <label...> [--parent]`,
`issue close <ref> [--comment <text>] [--comment-file -]`, `issue reopen <ref>`.
All take `--dry-run`.

### `issue create` flags

`--title` is required. `--body` or `--body-file -` sets the description.
`--team` and `--project` default to the repository config. `--label` is
repeatable and adds to the default labels; `--no-default-labels` drops them for
one call. Also `--parent`, `--state`, `--assignee` (`me`, a user id, or `none`),
`--priority` (`none`, `urgent`, `high`, `medium`, `low`, or `0`-`4`), `--wait`
(seconds to wait for the new child, default 5, 0 disables) and `--dry-run`.

### `issue update` flags

`--title`, `--body` or `--body-file -`, `--state`, `--assignee`, `--project`,
`--parent`, `--priority`, `--append`, `--comment` or `--comment-file -`,
`--dry-run` and `--if-unchanged`.

`--append` adds the body to the end with a blank separator.
`--if-unchanged <updatedAt>` fails with `conflict` when the issue changed since
that read. `--comment` validates first, applies the update, then creates the
comment; when the comment fails, the update stays, JSON carries
`"comment": null` and the `error` object, and the exit code is the error's code.

### `issue section` flags

`get` takes `--with-heading`. `append` and `replace` take `--body` or
`--body-file -`, `--dry-run` and `--if-unchanged`; `append` also takes `--level`
(default 2). A missing heading read or replace is `not_found` and lists the
available headings. A duplicate heading is `ambiguous` and lists the line
numbers. JSON of `get` is the section object at the top level.

`replace` is the safe body write for one section. The body holds the content,
without the heading line, and includes any deeper heading in the section. Take
`updatedAt` from a summary read, preview with `--dry-run`, then write with
`--if-unchanged`. Do not rewrite the whole body for one section:
`issue update --body-file` drops every heading that the new body leaves out,
with no error. A duplicate heading is the one exception: rename one first.

### `issue comment` flags

`create` takes `--body` or `--body-file -`, `--dedupe-key`, `--wait` and
`--dry-run`. The key is scoped to the issue: rata derives a UUIDv4 from
`sha256(issueId + "\0" + key)` and skips an existing comment. JSON is
`{ "status": "created" | "skipped", "comment": ..., "visible": ... }`. A dry run
runs the dedupe check, so it can report `skipped`.

`update <comment-id>` takes `--body` or `--body-file -` and `--dry-run`; a
missing comment is `not_found`, and JSON is `{ "comment": ... }`.
`delete <comment-id>` takes `--yes` and `--dry-run`; JSON mode requires `--yes`
and prints `{ "deleted": true, "id": ... }`.

### `issue link` and `issue unlink` flags

`--blocks`, `--blocked-by`, `--related` and `--duplicate` are repeatable.
`--blocks X` records that the issue blocks X; `--blocked-by X` records that X
blocks the issue; `--duplicate X` means the issue duplicates X; `--related X`
links the two with no direction. The command resolves the source and every
target in one id query, reads both relation directions in one query, and needs
no id query for a UUID reference. One target and three targets each cost two
read requests in the common case. A missing relation on `unlink` is a skipped
success. Both commands are idempotent.

## Dry runs

Every issue write accepts `--dry-run`: `issue create`, `issue update`, both
section writes, the three comment commands, `issue link`, `issue unlink`,
`issue assign`, `issue unassign`, both label commands, `issue close`,
`issue reopen`, `config set` and `config unset`. No mutation runs.

| Command                                                                                                                                                                                              | JSON                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `issue create`, `issue update`, `issue link`, `issue unlink`, `issue assign`, `issue unassign`, `issue label add`, `issue label remove`, `issue close`, `issue reopen`, `config set`, `config unset` | `{ "dryRun": true, "actions": [...] }`                        |
| `issue comment create`                                                                                                                                                                               | `{ "dryRun": true, "action", "target", "status", "changes" }` |
| `issue comment update`                                                                                                                                                                               | `{ "dryRun": true, "action", "target", "diff" }`              |
| `issue comment delete`                                                                                                                                                                               | `{ "dryRun": true, "action", "target", "comment" }`           |
| `issue section append`, `issue section replace`                                                                                                                                                      | `{ "dryRun": true, "action", "target", "heading", "diff" }`   |
| Bulk `issue assign`, `issue label add`, `issue label remove`                                                                                                                                         | `{ "dryRun": true, "results": [...] }`                        |

Each generic action carries `action`, `target` and `changes`. Body writes print
a unified diff in human mode; `issue update --comment` prints the planned update
and the comment action.

## Write results

| Command                                                                                  | JSON                                                                            |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `issue create`                                                                           | `{ "issue": { ... }, "visible": true \| false \| null }`                        |
| `issue update`                                                                           | `{ "issue": { ... } }`; with `--comment`, `{ "issue", "comment" }`              |
| `issue close`, `issue assign`, `issue unassign`, `issue label add`, `issue label remove` | `{ "dryRun": false, "status": "updated" \| "skipped", "issue": { ... } }`       |
| `issue reopen`                                                                           | `{ "issue": { ... } }`                                                          |
| `issue link`, `issue unlink`                                                             | `{ "dryRun": false, "status", "relations": [...] }`                             |
| `issue comment create`                                                                   | `{ "status", "comment", "visible" }`                                            |
| `issue comment update`                                                                   | `{ "comment": { ... } }`                                                        |
| `issue comment delete`                                                                   | `{ "deleted": true, "id": ... }`                                                |
| `issue section append`, `issue section replace`                                          | `{ "issue": { "identifier", "updatedAt" }, "section": { "heading", "level" } }` |
| `config set`, `config unset`                                                             | `{ "dryRun": false, "defaults": { ... } }`                                      |

The summary in a write result carries `id`, `identifier`, `title`, `url`,
`state`, `priority`, `assignee`, `project`, `parent`, `labels`, `createdAt` and
`updatedAt`. A link result carries `status` and one `relations` entry per change:
`{ "action", "kind", "target" }`, where `action` is `created` or `skipped`.

## Read-after-write

`issue comment create` and `issue create --parent` check that the new object
appears on a bounded re-read. The default is 5 seconds; `--wait <seconds>`
changes it and `--wait 0` disables it. A timed-out check still exits 0: the
mutation payload is the source of truth. JSON adds `visible`: `false` on timeout
and `null` when disabled. `issue create` without `--parent` reports `null`.

## Bulk writes by parent

`issue assign`, `issue label add` and `issue label remove` accept `--parent`.
Pass exactly one of the positional reference and `--parent`. With `--parent`,
every positional of a label command is a label, and the command targets every
child of the parent, open and closed, in creation order.

Rata validates every target and label before the first write: a bad reference or
a missing label aborts the batch with zero changes. The writes then run
best-effort and the command exits with the first failed result's code.

```json
{ "dryRun": false, "results": [{ "identifier": "ABC-3", "status": "updated" }] }
```

A failed result carries `error` instead of `issue`. `status` is `updated`,
`skipped` or `failed`.

`--dry-run` reports the same results with `"dryRun": true` and writes nothing.

## Idempotency

A write that finds the desired state in place exits 0 and reports `skipped`;
this covers `link`, `unlink`, `assign`, `unassign`, both label commands, `close`
and `reopen`. A `canceled` issue still moves to a completed state. A close with a
comment still posts it when the issue is already completed; the state write is
skipped. `issue create` always creates a new object. `label create` fails on a
duplicate name with `conflict` unless `--if-not-exists` returns the existing
label with `created: false`.
