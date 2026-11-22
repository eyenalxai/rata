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
`RepoTeam` stays only as a migration adapter for the old `label`, `project` and
`config` commands until their surface tickets move them. It is not a
compatibility guarantee.

Writes use `gateway.client` as the explicit raw transport. The write documents
stay in `tracker/write/documents.ts`; they do not move into the read gateway.

Write operations resolve state and label names against `context.states` and
`context.labels`. An unknown name refreshes the context once and then fails with
the valid names. A single write resolves the issue's team for a state or label lookup when that
team differs from the linked team, and when the context has no linked team.
This is the documented exception to the one-context rule; commands that operate
on the linked team keep the one-context guarantee. Bulk label writes resolve
each label name against the team of each child, so a mixed-team batch uses each
team's label ids.

`requireTeamId` and the other team lookups share one error rule: a missing
linked team is `not_found` and no link is `not_linked`. `issue create` without a
link keeps exit code 2.

The viewer is lazy. A context may carry no viewer; `ContextResolver.viewer`
loads the cached viewer only when a command asks for it, such as
`issue list --assignee me` or an assignee write. `issue show`, `summary` and
`why` build a context without a viewer and without the repository link, because
they ignored both before.

The stale-link warning travels on the context. `list` and `search` print it, as
the old `RepoTeam.resolve` path did. `close`, `reopen`, the label writes,
`issue update --state` and `issue update --sections-file --state` print it when
they resolve the repository link.

## Consequences

- One context resolution serves a command when the team is linked. A single
  write on an issue in another team, and an unlinked write, resolve the issue's
  team for the state or label lookup. That is the documented exception.
- A write on an issue in the linked team uses it. A single write on an issue in
  another team uses that issue's team. An unlinked write falls back to the issue
  team, so existing command behavior survives.
- A mixed-team bulk label write cannot reuse the linked team's label ids.
- `issue create --dry-run` keeps printing the stored `config.team` text.
- `RepoTeam` remains only as a migration adapter for old command groups.
