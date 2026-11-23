# ADR-0014: The apply engine owns write planning

## Status

Accepted. This record supersedes the write forms of ADR-0009, the body-edit
command surface of ADR-0008 and the command surface of ADR-0007. The dedupe and
heading rules in those records still hold.

## Context

The 0.10.0 write surface had one command per change: `issue update`,
`issue label`, `issue section`, `issue assign`, `issue unassign`, `issue
reopen`, `issue link` and three comment subcommands. Each command rebuilt its
own state, label, relation and visibility resolution. A caller that changed
several parts of one issue paid several reads and could leave the issue half
changed when a later command failed.

## Decision

`issue apply`, `issue relate` and `issue comment` are the only issue writes.
`issue create` and `issue close` keep their behavior.

- `issue apply <ref> --file -` takes one JSON document. It carries optional
  fields, labels (`add`, `remove`), `sections`, one `comment` and `relations`
  (`blocks`, `blockedBy`, `related`, `duplicate`).
- Planning is pure and serializable. A plan is a list of tagged action steps.
  A step carries data, not a closure. `applyPlan` dispatches each step through
  the `IssueWriter` service. A dry run returns the plan and has no executor.
- The engine plans every action before the first write. A bad state, label,
  heading or relation fails before any mutation.
- `--if-unchanged` compares the snapshot once before the plan result. It applies
  to a dry run too, so a stale snapshot exits 4 even when nothing is written.
- Sections: `replace` needs the heading; `append` creates a missing heading at
  the end. A duplicate heading or a repeated document heading is a conflict.
- A comment needs a stable dedupe key. The key derives the comment id from the
  issue id, so a retry returns `skipped`. Apply does not poll for comment
  visibility: the plan reads `CommentById`, the mutation payload confirms the
  write, and the result has no `visible` field. This is the `waitSeconds: 0`
  case in ADR-0006.
- Relations are sets. An existing edge is skipped. A removal deletes one edge
  per action; a later failure keeps the earlier deletions in the result.
- A partial failure returns the applied actions and the failed action with its
  error code. The result is `{ issue, result }`; `result` carries `action`,
  `status`, `changed`, `dryRun`, `snapshot`, `actions` and, on failure, `failed`
  and `error`. The exit code is the failed action's code.
- `issue apply`, `issue relate` and `issue comment` accept `--select` on a JSON
  result. They reject `--fields`. `issue create` and `issue close` keep `--json`
  and reject field selection.
- Apply has no holder guard and no `--take`. The guard belongs to `issue
start`, which lands with the lifecycle commands. Use `--if-unchanged` when a
  claim must not race.

The removed forms exit 2 with a `usage` error: `issue update`, `issue label`,
`issue section`, `issue assign`, `issue unassign`, `issue reopen`, `issue link`,
`issue unlink` and the old `issue comment` subcommands.

## Consequences

- One document changes several parts of one issue in one plan and one read.
- A partial failure is visible: the caller sees what was applied and what
  failed.
- The apply engine uses the one `IssueWriter`; it does not rebuild resolvers,
  comment writes or visibility checks.
- A dry run costs the planning reads and no write.
- A comment can be missing from a read that follows the write. The mutation
  payload is the source of truth, as ADR-0006 says.
- The old write commands and their tests are gone. They do not become aliases.
