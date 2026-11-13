---
name: rata
description: Drive Linear from the terminal with the rata CLI — read and write issues, comments, labels, relations, and wayfinding maps. Use when a repository tracks work in Linear, when its docs/agents/issue-tracker.md names rata, or when the user asks to file, triage, comment on, link, block, claim, or close Linear issues.
---

# rata

`rata` is the Linear CLI for agent workflows. Read
`docs/agents/issue-tracker.md` for the repository's team, labels and conventions;
this skill covers the CLI.

## Start here

```bash
command -v rata      # the binary is installed
rata status --json   # repo, workspace, key source, team, defaults and viewer
```

`status` works without a link. Fix a failed first command before you retry:

- `auth`: `printf '%s' "$LINEAR_API_KEY" | rata auth login --with-token`. The
  key resolves as `LINEAR_API_KEY`, the repository workspace, then `default`;
  `workspace list` and `workspace use <name>` manage profiles.
- `not_linked`, or a stale team key: run `rata team list`, then
  `rata link --team <key>`. Pass `--team`; the prompt needs a terminal.
  `LINEAR_API_KEY` changes the profile that `link` writes, and `link` also sets
  the team timezone.
- Do not guess a workflow state name. Read it from `rata team show --json`.

## One spelling per operation

| Operation       | Canonical form                                               | Rejected form                |
| --------------- | ------------------------------------------------------------ | ---------------------------- |
| Read one issue  | `rata issue show <ref>`                                      | `rata issue <ref>`           |
| Comment         | `rata issue comment create <ref> --body-file -`              | `rata issue comment <ref>`   |
| Assign          | `rata issue assign <ref> --assignee me`                      | `rata issue assign <ref> me` |
| Edit a section  | `rata issue section replace <ref> "<heading>" --body-file -` |                              |
| Change an issue | `rata issue update <ref> <flags>`                            |                              |
| Close           | `rata issue close <ref> --comment "..."`                     |                              |

`issue update` also sets `--assignee` and `--state`: one command with several fields, not a second spelling.

## Read loop

```bash
rata issue status <ref> --json
rata issue show <ref> --json
rata issue show <ref> --summary --json
rata issue list --parent <ref> --all --json --include relations
rata next --parent <ref>
rata why <ref>
rata search "<text>" --json
```

One resource prints that object; a collection prints `{ <plural>, pageInfo }`.
`--fields` selects dotted paths from the read object and needs `--json`. A list
returns one page; `--after <cursor>` continues it and `--all` drains it.

## Write loop

```bash
rata issue create --title "<title>" --body-file - --priority <p> --assignee me
rata issue create --title "<title>" --parent <spec> --body-file - --priority <p> --assignee me --label ready-for-agent
rata issue create --title "<map>" --label wayfinder:map --no-default-labels --assignee none --body-file -
rata issue update <ref> --priority <p>
rata issue update <ref> --state "<state from team show>"
rata issue comment create <ref> --body-file - --dedupe-key <key>
rata issue label add <ref> <label...>
rata issue assign <ref> --assignee me
rata issue close <ref> --comment "..."
```

`--body-file -` reads stdin. `--dry-run` previews a write; a body write also
takes `--if-unchanged <updatedAt>` from a read. A write whose desired state
already holds exits 0 with `skipped`. Priorities: `urgent`, `high`, `medium`,
`low`, `none`.

For one section, take `updatedAt` from the read loop, preview, then write:

```bash
rata issue section replace <ref> "<heading>" --body-file - --dry-run
rata issue section replace <ref> "<heading>" --body-file - --if-unchanged <updatedAt>
```

Never rewrite the whole body for one section: `issue update --body-file` drops
every heading that the new body leaves out, with no error.

## Errors

A failed `--json` command writes one object to stderr and exits with the code of
its class: 2 validation, 3 not found, 4 conflict, 5 auth, 6 retryable, 1 internal.
Read `hint` and retry once. Two cases write a partial result to stdout instead:
a bulk write by `--parent`, and a failed `issue update --comment`.

## Pointers

- Commands, flags and JSON shapes: `reference.md`.
- Repo rules and recipes: `docs/agents/issue-tracker.md`; label strings:
  `docs/agents/triage-labels.md`.
- Install, auth profiles and admin: `README.md`.
