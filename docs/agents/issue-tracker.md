# Issue tracker: Linear

Issues and specs for this repository live in Linear. Use the `rata` CLI for all
operations.

## Conventions

- **Create an issue**: `rata issue create --title "..." --body-file -`. Pipe the
  body with a heredoc.
- **Read an issue**: `rata issue show <ref> --comments --json`
- **List issues**: `rata issue list` with the filters you need. Useful filters:
  `--team`, `--project`, `--state`, `--state-type`, `--label`, `--assignee`,
  `--parent`, `--text`, `--limit`.
- **Comment on an issue**: `rata issue comment <ref> --body-file -`
- **Apply / remove labels**: `rata issue label add <ref> <label...>` and
  `rata issue label remove <ref> <label...>`
- **Close**: `rata issue close <ref> --comment "..."`
- **Search**: `rata search "..."`
- **Create a project**: `rata project create --name "Spec: <title>"`. A spec
  and its tickets live in one project. See **Specs as projects**.

An issue reference accepts an identifier (`ABC-42`), a UUID, or a linear.app
issue URL. The repository config `.rata.json` names the default team, project
and workspace profile, so most commands need no `--team`.

## Pull requests as a triage surface

**PRs as a request surface: no.** Linear holds issues only. When this repository
treats external pull requests as feature requests, triage them where they live
and mirror the outcome here.

## When a skill says "publish to the issue tracker"

Create a Linear issue with `rata issue create`. When the issue is a spec, give
it a project: see **Specs as projects**.

## When a skill says "fetch the relevant ticket"

Run `rata issue show <ref> --comments`.

## Specs as projects

A **spec** is an issue that holds a spec. A Linear **project** groups the spec
issue with its tickets, so the progress rolls up. Projects group specs, not
maps: a map stays an issue with child issues.

- **Publish a spec**: create the project first, then the spec issue in it.
  `rata project create --name "Spec: <title>"`, then
  `rata issue create --title "<title>" --project "Spec: <title>" --body-file -`.
- **Publish the tickets**: `/to-tickets` creates each ticket in the same
  project:
  `rata issue create --title "..." --project "Spec: <title>" --label ready-for-agent --body-file -`.
  Wire the blocking edges with
  `rata issue link <ticket-ref> --blocked-by <blocker-ref>`.
- **Implement the spec**: `/implement-spec` fetches the whole set with
  `rata issue list --project "Spec: <title>" --json`.
- **Read the progress**: `rata project list` prints each project's state and
  the percentage of its issues that are done.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue labelled `wayfinder:map`,
with **child** issues as tickets.

- **Map**: `rata issue create --title "..." --label wayfinder:map --body-file -`.
- **Child ticket**: `rata issue create --title "..." --parent <map-ref> --label wayfinder:<type> --body-file -`.
  The type labels are `wayfinder:research`, `wayfinder:prototype`,
  `wayfinder:grilling` and `wayfinder:task`.
- **Blocking**: native Linear relations. Wire an edge with
  `rata issue link <child-ref> --blocked-by <blocker-ref>`, or the inverse with
  `rata issue link <blocker-ref> --blocks <child-ref>`. A ticket is unblocked
  when every issue that blocks it is closed.
- **Frontier query**: `rata issue list --parent <map-ref> --unblocked --unassigned --json`.
  The first result in map order wins.
- **Claim**: `rata issue assign me <ref>`, the session's first write. The
  assignee is the claim.
- **Resolve**: `rata issue comment <ref> --body-file -`, then
  `rata issue close <ref>`, then append a context pointer (gist plus link) to
  the map's Decisions-so-far with `rata issue update <map-ref> --body-file -`.
