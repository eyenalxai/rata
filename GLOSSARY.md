# rata: domain vocabulary

The shared language of the project. The engineering skills read this file before
they explore the codebase. Use these terms; do not drift to synonyms.

## Issue tracking

- **Workspace**: a Linear workspace. One API key belongs to one workspace. A
  workspace has a **url key**: a short slug, for example `acme`.
- **Viewer**: the user that owns the API key.
- **Team**: the Linear team that owns issues. It has a short **key** (for
  example `RAT`) and a name. An issue needs a team.
- **Project**: a Linear project that groups issues, possibly across teams.
- **Issue**: a Linear issue. Avoid: task, card, ticket, when the general Linear
  object is meant.
- **Issue reference** (short: **ref**): the string that names an issue in a
  command. Accepted forms: the identifier (`RAT-42`), the UUID, or a Linear URL.
- **Identifier**: the human-readable issue key, `<team key>-<number>`.
- **Workflow state** (short: **state**): a team's status for an issue, for
  example `Triage`, `Backlog`, `Todo`, `In Progress`, `Done`, `Canceled`. Each
  state has a **state type**: `triage`, `backlog`, `unstarted`, `started`,
  `completed`, `canceled`. Avoid: status.
- **Open** / **closed**: an issue is **open** when its state type is not
  `completed` and not `canceled`; otherwise it is **closed**.
- **Priority**: how urgent an issue is. Values, most urgent first: `urgent`,
  `high`, `medium`, `low`; `none` means no priority is set. Avoid: severity,
  importance.
- **Label**: a Linear label attached to an issue. A label is **team-scoped** or
  **workspace-scoped**. A workspace-scoped label has no team and every team can
  use it. The triage roles are labels.
- **Comment**: a markdown comment on an issue.
- **Relation**: a directional link between two issues. Linear types: `blocks`,
  `duplicate`, `related`, `similar`. "Blocked by" is the inverse of `blocks`; it
  is not a separate relation type.
- **Parent** / **child**: the sub-issue link. A map holds its tickets as child
  issues.

## Skill workflow

- **Triage role**: one of the five canonical states, or a category. States:
  `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`,
  `wontfix`. Categories: `bug`, `enhancement`.
- **Spec**: an issue that holds a spec, published by `/to-spec`.
- **Ticket**: a tracer-bullet issue created by `/to-tickets`. It carries its
  **blocking edges** as Linear relations.
- **Blocking edge**: a relation that gates a ticket. A ticket is **unblocked**
  when every issue that blocks it is closed.
- **Map**: a `wayfinder:map` issue that indexes a wayfinding effort. Its body
  holds Destination, Notes, Decisions so far, Not yet specified, and Out of
  scope.
- **Decision ticket**: a wayfinder child issue that resolves one decision. Its
  type label is `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`
  or `wayfinder:task`.
- **Frontier**: the open, unblocked, unclaimed child issues of a map.
- **Claim**: assigning a ticket to yourself before any work. The assignee is the
  claim.
- **Tracker document**: `docs/agents/issue-tracker.md`, the per-repo file that
  tells the skills how to use the tracker.
- **Agent documents**: the per-repo files under `docs/agents/` that configure
  the skills: the tracker document, `triage-labels.md` and `domain.md`.

## rata

- **rata**: this CLI. The binary name is `rata`; the package name is `rata-cli`.
- **Repository config**: the team, project and workspace profile that rata
  applies to one repository. `rata link` writes it to the local database, and
  commands read it from any subdirectory.
- **Repository root**: the directory that identifies the repository config.
  Inside Git it is the Git common directory, so the main checkout and every
  worktree share one config. Outside Git it is the directory where `rata link`
  ran.
- **Profile** (or **workspace profile**): an API key in the local database,
  named after the Linear workspace url key. The name selects the workspace.
  Avoid: account, credential.
- **Default profile**: the profile marked as the default in the local database.
  `rata auth login` and `rata workspace use` set it.
- **Resolution order**: the order rata uses to select the API key:
  `LINEAR_API_KEY`, the repository `workspace`, the default profile.
- **Page**: one call's slice of a list. Every list command returns one page.
  `--limit` sets the page size: 50 by default, 250 at most.
- **Cursor**: the value that continues a list. Pass the `endCursor` of a page
  to `--after`. A cursor is bound to its query: keep the filters and the order
  fixed across pages.
- **Page info**: the `pageInfo` object on every list result:
  `{ hasNextPage, endCursor }`. `hasNextPage` says whether a next page exists.
