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
their default when stdout is not a terminal. The in-place writes (`issue apply`,
`issue relate`, `issue comment`) accept `--format` and `--select`; `issue create`
and `issue close` accept `--json` and reject field selection. The old read forms
(`issue show`, `issue view`, `issue status`, `next`, `why`) and the old read
flags (`--json`, `--fields`, `--count`, `--ids-only`, `--include`) exit 2.

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

| Operation     | Canonical form                                          | Rejected form                                                                                    |
| ------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Read an issue | `rata issue <ref>`                                      | `rata issue show <ref>`                                                                          |
| Read many     | `rata issue <ref> <ref> ...`                            | repeated `issue <ref>` calls                                                                     |
| Apply a write | `rata issue apply <ref> --file -`                       | `issue update`, `issue label`, `issue section`, `issue assign`, `issue unassign`, `issue reopen` |
| Add an edge   | `rata issue relate <ref> --blocked-by <ref>`            | `issue link`, `issue unlink`                                                                     |
| Comment       | `rata issue comment <ref> --body-file - --dedupe-key k` | `issue comment create`                                                                           |
| Close         | `rata issue close <ref> --comment "..."`                |                                                                                                  |

`issue apply` is the in-place write. It plans first, then applies. `--dry-run` returns
the plan and writes nothing. `--if-unchanged <snapshot>` exits 4 when the issue
changed. A no-op returns `skipped`. A partial failure returns the applied
actions and the failed action.

## Write loop

```bash
rata issue create --title "<title>" --body-file - --priority <p> --assignee me
printf '%s' "$APPLY_JSON" | rata issue apply <ref> --file -
printf '%s' "$APPLY_JSON" | rata issue apply <ref> --file - --dry-run
printf '%s' "$APPLY_JSON" | rata issue apply <ref> --file - --if-unchanged <snapshot>
rata issue relate <ref> --blocked-by <blocker>
rata issue relate <ref> --blocked-by <blocker> --remove
printf 'Started work.' | rata issue comment <ref> --body-file - --dedupe-key start-42
rata issue close <ref> --comment "..."
```

The apply document has optional `title`, `state`, `assignee`, `priority`,
`project`, `parent`, `labels: { add, remove }`, `sections`, `comment` and
`relations: { blocks, blockedBy, related, duplicate }`. Sections take
`mode: "replace" | "append"`. `replace` needs the heading; `append` creates a
missing heading at the end. A duplicate heading is a conflict. A comment carries
a `dedupeKey` in `issue apply`; a retry returns `skipped`. Relations are a set;
an existing edge is skipped. Omit a field to leave it alone.

The write result is `{ issue, result }`. `result` carries `action`, `status`,
`changed`, `dryRun`, `snapshot`, `actions`, and on failure `failed` and `error`.
`issue apply`, `issue relate` and `issue comment` accept `--select`; `issue
create` and `issue close` do not.

## Errors

A failed command with JSON output writes one object to stderr and exits with the code of
its class: 2 usage or validation, 3 not found, 4 conflict, 5 auth, 6 retryable,
1 internal. A parse error writes code `usage`; help prints only for `--help`.
Read `hint` and retry once. A partial apply writes `{ issue, result }` to stdout
with `failed` and `error`, so the applied actions are visible.

## Pointers

- Commands, flags and shapes: `reference.md`. Repo rules: `docs/agents/issue-tracker.md`; labels: `docs/agents/triage-labels.md`. Install and admin: `README.md`.
