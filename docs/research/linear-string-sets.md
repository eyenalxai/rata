# Hard-coded Linear string sets

Date: 2026-11-28
Status: answered

Scope: `src/` at `57d3f43`. This audit changes documentation only. The duplicate
state fix in `5ee94a8` is already merged and is not changed here.

## Question

Which closed string sets in `src/` mirror Linear, what is the Linear source of
truth for each, what happens when Linear adds a value, and should rata fail fast
or pass through?

## Answer

Three sets decode a Linear value: the workflow state type, the issue relation
type, and the issue priority value. A fourth closed set, the label scope, is
derived from `IssueLabel.team`. A fifth, the triage roles, is owned by this
repository, not by Linear.

The state type, the relation type, and the priority value should fail fast. Each
one selects a behavior or a fixed output shape. The label scope and the triage
roles should pass through. The scope is derived and display-only. A Linear label
is free-form data.

The current failure is a stop, but not a clear one. A decode mismatch becomes
`LinearGraphQLError` with the message "Linear returned an unexpected response
body." Then `TrackerError` maps it to code `internal`, hint `Run with
RATA_DEBUG=1 for details.`, and exit 1. The message does not name the value.

`duplicate` is the precedent. Before `5ee94a8`, an issue in a duplicate state
failed every read. The fix added the value. This audit records the cost of the
next value.

## Inventory

| Set                 | Values                                                                                              | Code                                                                                                       | Linear source of truth                                                                        | Unknown value                                                         | Decision     |
| ------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------ |
| Workflow state type | `triage`, `backlog`, `unstarted`, `started`, `completed`, `canceled`, `duplicate`                   | `src/domain/workflow-state.ts:5-18`; `src/linear/decode/team.ts:32-35`; `src/linear/decode/issue.ts:18-19` | `WorkflowState.type` is `String!`; the description lists the seven values                     | Read fails with a generic error; see below                            | Fail fast    |
| Issue relation type | `blocks`, `duplicate`, `related`, `similar`                                                         | `src/domain/relation.ts:3-6`; `src/linear/decode/issue.ts:66-78`                                           | `IssueRelation.type` is `String!`; the description lists four values and deprecates `similar` | Read fails when relations are requested; see below                    | Fail fast    |
| Priority value      | `0` to `4`, mapped to `none`, `urgent`, `high`, `medium`, `low`                                     | `src/domain/priority.ts:3-18,68-73`; `src/linear/decode/issue.ts:122`                                      | `Issue.priority` is `Float!`; the description maps 0 to 4                                     | Read fails; `team show` accepts the integer; see below                | Fail fast    |
| Label scope         | `team`, `workspace`                                                                                 | `src/linear/decode/team.ts:39-42`; `src/linear/operations/team.ts:113-118`                                 | `IssueLabel.team`: null means a workspace label                                               | No Linear value reaches the set; a bad cache row is a miss; see below | Pass through |
| Triage roles        | `bug`, `enhancement`, `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix` | `src/context/docs.ts:5-13`                                                                                 | `docs/agents/triage-labels.md`, not Linear                                                    | No Linear value; a new canonical doc row is ignored; see below        | Pass through |

## Details

### Workflow state type

`stateTypes` is also the value set for `--state-type` (`src/cli/issue/list.ts:39`).
The closed subset `closedStateTypes` (`src/domain/workflow-state.ts:18`) drives
`isClosedState`, which `close` and the frontier use
(`src/tracker/workflow/close.ts:33-36`, `src/tracker/read/working-set.ts:55`). A
new type needs a closed or open decision. The decode failure forces that
decision.

The failure is broad because `IssueState` is part of every issue summary
(`src/linear/decode/issue.ts:116-131`). A team with the new type cannot be read
until rata accepts it. A warm `status` read uses the cache and may not show the
problem until `--refresh` (`src/local/context-cache.ts:107-110`).

### Issue relation type

`similar` is deprecated in the Linear schema. Rata keeps it because the output
field still lists it. `blockedBy` is not a Linear relation type. It is the
inverse view of `blocks` (`src/domain/relation.ts:8-22`). The decoder set is
only `relationTypes`.

The default `issue <ref>` read requests `inverseRelations`
(`src/linear/documents/issue/fields.ts:89-92`); `--summary` does not.
`issue list --relations` requests both directions. The write plans for `start`,
`close`, `handoff`, and `apply` read the full working set
(`src/tracker/apply.ts:38-49`).

The current decoder stops the read. Keep that. The error should name the type.
Passing an unknown type through as `related` is the alternative. It keeps reads
alive, but it can hide a new blocking edge. The audit rejects that trade.

### Priority value

Every issue read decodes the priority (`src/linear/decode/issue.ts:122`).
`parsePriority` already rejects an unknown input with the valid names
(`src/domain/priority.ts:56-66`). The decode side has no such message. The team
priority list is `Schema.Int` (`src/linear/decode/team.ts:55-58`), so it accepts
a new integer. That split is a consistency gap, not a read failure.

### Label scope

`src/linear/operations/team.ts:113-118` builds `scope` from
`label.team === null`. The `TeamLabel` schema (`src/linear/decode/team.ts:39-42`)
constrains the result when the cache is written and read. `readTeam` turns a
decode failure into a cache miss (`src/local/context-cache.ts:39-40,107-110`),
so a cached row with an unknown scope cannot fail a command. It only forces a
refetch. A code change that adds a scope must update the schema, or the cache
write fails.

### Triage roles

`parseTriageMap` keeps a row only when the canonical cell is in `triageRoles`
(`src/context/docs.ts:90-96`). A new canonical row in
`docs/agents/triage-labels.md` is therefore ignored, and `status` stays green
because `missing` checks only the known roles (`src/context/docs.ts:143-147`).
This is a repo-doc set, not a Linear set. A new Linear label does not affect it.

## Failure path

1. `LinearClient.executeWithKey` decodes the response with the command schema. A
   mismatch becomes `LinearGraphQLError` with message "Linear returned an
   unexpected response body." and an empty `details` list
   (`src/linear/client.ts:134-145`).
2. `toTrackerError` calls `classifyUnclassified`. A `LinearGraphQLError` that
   does not match the duplicate or not-found text becomes `internal` with the
   hint "Run with RATA_DEBUG=1 for details." (`src/cli/error-report.ts:208-224`).
   The exit code is 1 (`src/cli/error-report.ts:95-109`).
3. The parse error is in `cause`. `RATA_DEBUG=1` shows it. The default output
   does not name the state type, relation type, or priority value.

The decoder tests cover the state and priority stop
(`test/linear/documents.test.ts:84-94`). No test covers an unknown relation
type or label scope.

## Open points

- The fail-fast message is generic. A follow-up should name the field and the
  value, for example: "Linear added the workflow state type `X`. Update rata."
  This audit does not change code.
- The relation type decision is the closest call. Passing an unknown type
  through as `related` keeps reads alive. Failing fast names the new value but
  stops every read of an issue with that edge. The audit chooses fail fast
  because a wrong frontier is worse than a failed read.
- The priority list in team detail accepts any integer. If the owner wants one
  failure point, validate it against 0 to 4. This audit keeps the current split.
- The triage role parser ignores a new canonical row without a warning. If the
  owner wants doc health to catch it, `parseTriageMap` must report unknown
  canonical rows. This is repo-owned, not Linear.

## References

- `src/domain/workflow-state.ts`, `src/domain/relation.ts`,
  `src/domain/priority.ts`, `src/domain/label.ts`.
- `src/linear/decode/issue.ts`, `src/linear/decode/team.ts`.
- `src/linear/client.ts`, `src/cli/error-report.ts`.
- `src/context/docs.ts`, `docs/agents/triage-labels.md`.
- Linear GraphQL schema at
  `https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql`:
  `WorkflowState.type`, `IssueRelation.type`, `IssueRelationType`,
  `Issue.priority`, `IssuePriorityValue`, and `IssueLabel.team`. The output
  fields `WorkflowState.type` and `IssueRelation.type` are `String!`; the values
  are in the descriptions.
- `5ee94a8`: the duplicate state fix.
