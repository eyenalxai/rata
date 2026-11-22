# ADR-0012: ContextResolver owns team resolution

## Status

Accepted. Supersedes ADR-0005.

## Context

ADR-0005 made `RepoTeam` the one team resolver for reads and writes. Every
command that needed a team called `RepoTeam.resolve` and read the repository
link again. Issue writes also read the issue team to find a state, label or
assignee. A command could therefore resolve the same team several times, and a
write could bypass the repository link.

The tracker now takes one `ResolvedContext` per command. The context holds the
root, profile, viewer, team identity and detail, states, labels, defaults,
project and the stale-link warning. `ContextResolver` builds it from the
`--team` flag, the repository link and the context cache once per command.

## Decision

`ContextResolver` owns team resolution. `IssueReader` and `IssueWriter` take a
`ResolvedContext` and do not resolve the team from the repository link.
`RepoTeam` stays as an adapter for the old `label`, `project` and `config`
commands until their surface tickets move them.

Writes use `gateway.client` as the explicit raw transport. The write documents
stay in `tracker/write/documents.ts`; they do not move into the read gateway.

Write operations resolve state and label names against `context.states` and
`context.labels`. An unknown name refreshes the context once and then fails with
the valid names. A write does not read the issue team. `requireTeamId` fails
with `not_found` when the linked team is gone; it never returns a stored team id
for a missing team.

The stale-link warning travels on the context. The read adapters print it where
the old `RepoTeam.resolve` printed it. `issue show`, `summary` and `why` build a
context without a viewer and without the repository link, because they ignored
both before.

## Consequences

- One context resolution serves a command. The team is not resolved again for
  each issue.
- A write cannot write to a team other than the linked or explicit one by
  reading the issue team first.
- `issue create --dry-run` keeps printing the stored `config.team` text.
- `RepoTeam` remains only as a compatibility adapter for old command groups.
