# ADR-0001: Linear is the issue tracker, driven by rata

## Status

Accepted.

## Context

The ask-matt engineering skills drive an issue tracker: the five triage roles,
tracer-bullet tickets with blocking edges, specs, and wayfinding maps. The
skills default to GitHub Issues. The maintainer tracks work in Linear, and this
repository builds `rata`, a Linear CLI for exactly those workflows.

## Decision

This repository uses Linear as its issue tracker, through the `rata` CLI. The
tracker document at `docs/agents/issue-tracker.md` names the commands the
skills use. The canonical triage and wayfinding labels live in the Linear team
named in the repository config.

## Consequences

- The skills run against Linear with `rata` commands.
- This repository is the first user of its own tracker. Usability findings
  become Linear issues.
- GitHub issues stop being the source of truth. The open tickets move to Linear
  with their blocking relations; the closed history stays on GitHub.
- `rata` carries the tracker vocabulary: triage roles as labels, blocking as
  native relations, maps as parent issues.
