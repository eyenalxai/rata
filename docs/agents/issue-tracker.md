# Issue tracker: Linear

Issues and specs for this repository live in Linear. Use the `rata` CLI for all
operations.

## Conventions

- **Read the context**: `rata status --json` shows the repository, workspace,
  team, project, issue defaults and viewer in one call. It works without a link.
- **Shape the output**: `--json` is global and works before or after the
  subcommand. `--fields` trims a read command to dotted paths, for example
  `rata issue list --json --fields identifier,title,state.name`; it needs
  `--json` and is valid on `status`, `issue show`, `issue section get`,
  `issue list`, `search`, `team show`, `team list`, `label list`,
  `project list` and `config show`. A failed `--json` command writes one
  `error` object to stderr and exits 1. Its fields are `code`, `message` and
  `hint`. Parse that object instead of the prose.
- **Discover the workflow states**: `rata team show --json` lists every state
  with its name and type, plus the labels, members and priorities. Do not guess
  a state name.
- **Create an issue**: `rata issue create --title "..." --body-file -`. Pipe the
  body with a heredoc. `create` applies the repository issue defaults. Pass
  `--label` to add labels to the defaults, or `--no-default-labels` to drop
  them for one call. `create --parent` waits up to 5 seconds for the child to
  appear under the parent; `--wait <seconds>` changes the bound.
- **Set the priority**: every issue must carry a priority. Pass `--priority`
  when you create the issue; triage sets it for issues that arrive without one.
  Values: `urgent` (breaks production or blocks a release), `high` (blocks other
  work), `medium` (the fallback), `low` (nice-to-have). Change it with
  `rata issue update <ref> --priority <value>`.
- **Assign the issue**: every issue must be assigned to the authenticated user.
  Pass `--assignee me` when you create the issue; triage assigns `me` to issues
  that arrive without an assignee. Change it with `rata issue assign <ref> --assignee me`,
  or clear it with `rata issue unassign <ref>`. Wayfinder maps and children are
  the exception: they stay unassigned until the claim step. Use
  `--assignee none` to skip the repository default for one call.
- **Set the repository defaults**: `rata config set --assignee me --label enhancement --priority medium`
  makes them the defaults for every new issue in this repository.
  `rata config show --json` reads them. `rata config unset --label` clears one
  field.
- **Preview a write**: add `--dry-run` to any issue write: `issue create`,
  `issue update`, `issue section append`, `issue section replace`,
  `issue comment create`, `issue comment update`, `issue comment delete`,
  `issue link`, `unlink`, `assign`, `unassign`, `label add`, `label remove`,
  `close` or `reopen`, or to `config set` and `config unset`. A repeated
  idempotent write exits 0 and reports `skipped`.
- **Read an issue**: `rata issue show <ref> --json`. One call returns the issue,
  its comments, children, relations and attachments. Add `--no-comments` to
  skip the comment fetch; `--comments` and `--no-comments` are mutually
  exclusive. `--summary` reads the header fields only; it rejects `--comments`.
  `--no-body`, `--no-relations`, `--no-children` and `--no-attachments` drop
  those parts and skip their fetches. `view` is an alias for `show`. The issue
  carries `updatedAt`; pass it to `--if-unchanged` before a body write.
- **Edit one section**: `rata issue section get <ref> "<heading>"`,
  `issue section append <ref> "<heading>" --body-file -`, and
  `issue section replace <ref> "<heading>" --body-file -`. The heading match is
  exact and case-sensitive. Add `--dry-run` to preview the unified diff, or
  `--if-unchanged <updatedAt>` to fail with `conflict` when the issue changed.
  `append` creates a missing heading at the end; `--level` sets its level.
- **Append to the body**: `rata issue update <ref> --body-file - --append`. A
  blank line separates the old and the new content.
- **List issues**: `rata issue list` with the filters you need. Useful filters:
  `--team`, `--project`, `--state`, `--state-type`, `--priority`, `--label`,
  `--assignee`, `--parent`, `--text`, `--unblocked`, `--unassigned`. Every list
  command returns one page: `--limit` is the page size (default 50, maximum
  250), and `--after <cursor>` continues a list. Add `--all` to drain every
  page. See **Paging lists**.
- **Comment on an issue**: `rata issue comment create <ref> --body-file -`. The
  command waits up to 5 seconds for the comment to appear on a re-read. Use
  `--wait <seconds>` to change the bound, or `--wait 0` to skip the check. A
  timeout still exits 0; the write succeeded. Add `--dedupe-key <key>` to make a
  retried comment idempotent: the same key on the same issue returns `skipped`
  with the existing comment. Use `issue comment update <comment-id>` and
  `issue comment delete <comment-id> --yes` to change or remove one. Combine an
  issue update and a comment with `issue update <ref> --comment "..."`.
- **Apply / remove labels**: `rata issue label add <ref> <label...>` and
  `rata issue label remove <ref> <label...>`
- **Repair a parent's children**: `rata issue assign --parent <ref> --assignee me`
  and `rata issue label add|remove --parent <ref> <label...>` write to every
  child, open and closed. With `--parent`, every positional of a label command is
  a label. A bad reference or a missing label aborts the batch before any write;
  add `--dry-run` to preview the results. This is for a spec's tickets, not a
  wayfinder map: claim a map's children one by one as the frontier moves.
- **Close**: `rata issue close <ref> --comment "..."`
- **Search**: `rata search "..."`

An issue reference accepts an identifier (`ABC-42`), a UUID, or a linear.app
issue URL. The repository config names the default team, project and workspace
profile, so most commands need no `--team`. `issue list` and the other list
commands default to the linked team; without a link they fail and ask for
`--team` or `rata link`. Run `rata link` once to set it: every subdirectory and
every worktree of the repository finds it.

## Paging lists

Every user-facing list command returns one page per call: `issue list`,
`search`, `team list`, `project list` and `label list`. `--limit` is the page
size (default 50, maximum 250). `--after <cursor>` continues a list. Add `--all`
to drain every page; `--limit` stays the page size and `--after` starts from the
cursor. JSON is `{ <plural>, pageInfo }`: `pageInfo.hasNextPage` says whether a
next page exists, and `pageInfo.endCursor` is the cursor for `--after`. With
`--all`, `pageInfo` is `{ "hasNextPage": false, "endCursor": null }`. Keep the
filters and the order fixed across pages: a cursor is bound to its query. Lists
are ordered by creation time (`createdAt`); `search` keeps Linear's relevance
ranking, so its paging is best effort. Internal reads drain every page, so
`issue show` is complete.

## Pull requests as a triage surface

**PRs as a request surface: no.** Linear holds issues only. When this repository
treats external pull requests as feature requests, triage them where they live
and mirror the outcome here.

## When a skill says "publish to the issue tracker"

Create a Linear issue with `rata issue create`. A spec is an issue too: see
**Specs and tickets**.

## When a skill says "fetch the relevant ticket"

Run `rata issue show <ref> --json`.

## Specs and tickets

A **spec** is an issue. Do not create a project for it and do not put `Spec:`
in its title. The spec's **tickets** are its child issues, so the set stays
together under the spec. This repository does not use Linear projects.

- **Publish a spec**: `rata issue create --title "<title>" --label ready-for-agent --priority medium --assignee me --body-file -`.
- **Publish the tickets**: create each ticket as a child of the spec:
  `rata issue create --title "..." --parent <spec-ref> --label ready-for-agent --priority medium --assignee me --body-file -`.
  Wire the blocking edges with
  `rata issue link <ticket-ref> --blocked-by <blocker-ref>`.
- **Implement the spec**: `/implement-spec` fetches the whole set in one call:
  `rata issue list --parent <spec-ref> --all --json`. `rata issue show
<spec-ref> --json` also lists the children.
- **Close the spec**: when every ticket is Done, close the spec with a comment
  that points at the result: `rata issue close <spec-ref> --comment "..."`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue labelled `wayfinder:map`,
with **child** issues as tickets.

- **Map**: `rata issue create --title "..." --label wayfinder:map --no-default-labels --assignee none --body-file -`.
- **Child ticket**: `rata issue create --title "..." --parent <map-ref> --label wayfinder:<type> --no-default-labels --assignee none --body-file -`.
  The type labels are `wayfinder:research`, `wayfinder:prototype`,
  `wayfinder:grilling` and `wayfinder:task`. Leave map and children
  unassigned: the claim step assigns them. The priority default still applies.
- **Blocking**: native Linear relations. Wire an edge with
  `rata issue link <child-ref> --blocked-by <blocker-ref>`, or the inverse with
  `rata issue link <blocker-ref> --blocks <child-ref>`. A ticket is unblocked
  when every issue that blocks it is closed.
- **Frontier**: `rata next --parent <map-ref>` returns the first open, unblocked,
  unclaimed child. The order is priority (urgent first), then the oldest
  `createdAt`. The JSON is `{ issue }`; `issue` is `null` when no child is
  ready, and the command exits 0. It reads every matching page before it picks.
- **Why blocked**: `rata why <ref>` prints one level of `blockedBy`. Each
  blocker carries its state and a `closed` flag; `blocked` is true when any
  blocker is open. A blocker is closed when its state type is `completed` or
  `canceled`. Human output prints `RATA-42 is ready.` when nothing blocks.
- **Claim**: `rata issue assign <ref> --assignee me`, the session's first write. The
  assignee is the claim; this is what assigns a wayfinder child.
- **Resolve**: `rata issue comment create <ref> --body-file -`, then
  `rata issue close <ref>`, then append the context pointer (gist plus link) to
  the map's `Decisions so far` section with
  `rata issue section append <map-ref> "Decisions so far" --body-file -`. Add
  `--dry-run` to preview the unified diff, or `--if-unchanged <updatedAt>` to
  fail with `conflict` when the map changed since the read. A missing heading is
  created at the end of the body; `--level` sets its level.
