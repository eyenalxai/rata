# ADR-0002: Interactive login with Linear-derived profile names

## Status

Accepted.

## Context

`rata auth login --with-token` reads the API key from a pipe and stores it
unverified under a user-chosen name (default `default`). A person in a terminal
must build a pipeline to log in, a mistyped key fails on the next command
instead of at login, and profile names do not identify the Linear workspace
they point at. `auth logout` with no flag removes a profile literally named
`default`, a name that new logins no longer create.

## Decision

`rata auth login` prompts for the API key in a terminal, masked, verifies it
with the viewer query, and stores it as a workspace profile named after the
workspace url key. The profile becomes the default. `--with-token` remains the
non-interactive path and `LINEAR_API_KEY` the environment path. Login cannot
choose a name; a later login replaces the key silently. `auth logout` with no
flag removes the default profile.

Rejected alternatives: prompting for the profile name (an extra step, and names
drift from the workspaces they point at) and naming profiles from the
organization display name (readable, but display names are not unique and can
change).

## Consequences

- One profile per Linear workspace. Custom profile names no longer exist;
  legacy names keep resolving, and new logins never create them.
- Url keys can be opaque for personal workspaces (for example `utbetdix`).
  `rata workspace list` shows the viewer and organization for humans.
- A rejected key writes nothing: the auth file only holds keys Linear accepted.
