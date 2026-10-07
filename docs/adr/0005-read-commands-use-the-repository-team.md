# ADR-0005: Read commands resolve the team from the repository link

## Status

Accepted.

## Context

`rata link` records a team, a project and a workspace profile for one
repository. The write commands already resolved the team from that record.
`issue create` and `project create` used the linked team when `--team` was
absent. Without a link they failed and asked for `--team` or `rata link`.

The read commands did not. `rata issue list` sent no team filter. Linear then
returned every issue of the workspace, ordered by creation time. In a
repository linked to a quiet team, the recent issues of another team filled the
first page. The link was correct; the read path ignored it.

The alternative was a silent fallback to the whole workspace. That fallback
hides a missing link and keeps the surprise. An explicit failure tells the user
what to do, and it matches the write commands.

## Decision

Every command that reads or writes team-scoped data resolves the team the same
way: the `--team` flag first, then the repository link, then a failure with
`No team. Pass --team, or run rata link.` One API-layer service, `RepoTeam`,
owns that resolution. `issue list`, `issue create`, `project create`,
`label create` and `label edit` use it.

## Consequences

- `rata issue list` in a linked repository lists only the issues of the linked
  team.
- In a repository without a link, `rata issue list` fails and points at
  `rata link` or `--team`. It no longer lists the whole workspace.
- A command that takes `--team` keeps the flag as the override.
- One mechanism serves reads and writes, so the behavior cannot drift.
