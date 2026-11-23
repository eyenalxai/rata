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
rata status          # repo, team, states, labels, triage, cache age, docs, viewer (JSON off a TTY)
```

`status` works without a link. Fix a failed first command before you retry:

The admin commands (`auth`, `link`, `unlink`, `workspace`, `config`, `team`,
`project`, `label`, `status`, `whoami`) and the new issue reads (`issue <ref>...`,
`issue list`, `issue search`) accept `--format json|text` and `--select`. JSON is
their default when stdout is not a terminal. The issue writes still accept
`--json` and `--fields` until the apply engine lands. The old read forms (`issue
show`, `issue view`, `issue status`, `next`, `why`) and the old read flags
(`--json`, `--fields`, `--count`, `--ids-only`, `--include`) exit 2.

- `auth`: `printf '%s' "$LINEAR_API_KEY" | rata auth login --with-token`. The key
  resolves as `LINEAR_API_KEY`, the repository workspace, then `default`;
  `workspace use <name>` selects a profile.
- `not_linked`: run `rata team list`, then `rata link --team <key>`. Pass
  `--team`; the prompt needs a terminal. `LINEAR_API_KEY` changes the profile
  that `link` writes, and `link` also sets the team timezone. A stale stored key
  is repaired on read with a warning; if `status` says it is gone, follow the
  repair hint.
- Do not guess a workflow state name. Read it from `rata status`; add
  `--refresh` when `cache.ageSeconds` is stale or the context looks wrong.

Team resolution follows the issue. A repository with a link writes against the
linked team. Without a link, a state or label write falls back to the team of
the issue. A single write on an issue in another team uses that issue's team,
even when the repository is linked. A write that resolves and repairs a stale
link prints the warning. `--assignee me` loads the viewer only when the command
needs it; reads without that flag do not.

## One spelling per operation

| Operation        | Canonical form                                               | Rejected form                |
| ---------------- | ------------------------------------------------------------ | ---------------------------- |
| Read an issue    | `rata issue <ref>`                                           | `rata issue show <ref>`      |
| Read the summary | `rata issue <ref> --summary`                                 | `rata issue status <ref>`    |
| Read many        | `rata issue <ref> <ref> ...`                                 | repeated `issue <ref>` calls |
| Comment          | `rata issue comment create <ref> --body-file -`              | `rata issue comment <ref>`   |
| Assign           | `rata issue assign <ref> --assignee me [--take]`             | `rata issue assign <ref> me` |
| Edit a section   | `rata issue section replace <ref> "<heading>" --body-file -` |                              |
| Batch edit       | `rata issue update <ref> --sections-file -`                  | a loop of section writes     |
| Change an issue  | `rata issue update <ref> <flags>`                            |                              |
| Close            | `rata issue close <ref> --comment "..."`                     |                              |

`issue update` also sets `--assignee` and `--state`: one command with several fields, not a second spelling. An assign to an issue held by another user exits 4 and names the holder; `--take` reassigns it.

## Read loop

```bash
rata issue <ref>                          # one call: body, sections, blockers, PRs, children, frontier, next child
rata issue <ref> --comments                # add the comments
rata issue <ref> --summary                 # summary fields only
rata issue <ref> --full                    # add relations and full child rows
rata issue <ref> <ref> ...                 # one list request per page
rata issue list --parent <ref> --relations # the children with their blocking edges
rata issue search "<text>"                 # ten summary rows by default
rata issue search "<text>" --after <cursor> # the next page of results
```

`issue <ref>` returns the working set: summary fields, `description`, `sections`,
`blocked`, `blockedBy`, `prs`, lean `children` with `blocked` and `blockedBy`,
`frontier`, `nextChild` and `comments: null`. One ref prints the object; many
print `{ "items", "pageInfo" }`. `--select` validates a declared shape and may
cross arrays (`children.identifier`, `frontier.identifier`).

## Write loop

```bash
rata issue create --title "<title>" --body-file - --priority <p> --assignee me
rata issue create --title "<title>" --parent <spec> --body-file - --priority <p> --assignee me --label ready-for-agent
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

For one section, preview with `issue section replace <ref> "<heading>" --dry-run`,
then write with the same command and `--if-unchanged <updatedAt>`.

For several sections, send one document to `issue update --sections-file -`:
`{"sections":[{"heading":"Flow","content":"..."}]}`. The dry run returns
`updatedAt`; the write replaces every heading in one read, one diff and one
write. Never rewrite the whole body for one section: `issue update --body-file`
drops every heading that the new body leaves out, with no error.

## Errors

A failed command with JSON output writes one object to stderr and exits with the code of
its class: 2 usage or validation, 3 not found, 4 conflict, 5 auth, 6 retryable,
1 internal. A parse error writes code `usage`; help prints only for `--help`.
Read `hint` and retry once. Two cases write a partial result to stdout instead:
a bulk write by `--parent`, and a failed `issue update --comment`.

## Pointers

- Commands, flags and shapes: `reference.md`. Repo rules: `docs/agents/issue-tracker.md`; labels: `docs/agents/triage-labels.md`. Install and admin: `README.md`.
