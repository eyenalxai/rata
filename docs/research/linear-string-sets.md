# Hard-coded Linear string sets

Date: 2026-11-28
Status: answered

Scope: `src/` at `57d3f43`. This document changes documentation only. The duplicate
state fix in `5ee94a8` is already merged and is not changed here.

## Question

Which closed string sets in `src/` mirror Linear, what is the Linear source of
truth for each, what happens when Linear adds a value, and should rata fail fast
or pass through?

## Answer

Three sets decode a Linear value: the workflow state type, the issue relation
type, and the issue priority value. A fourth set, the label scope, is derived
from `IssueLabel.team`. A fifth, the attachment source type, is compared as a
raw string. Repo-owned sets such as the triage roles are out of scope.

Fail fast for the state type, the relation type, and the priority value. Each
one selects a behavior or a fixed output shape, so an unknown value needs a
decision. Pass through for the label scope and the attachment source type. The
scope is derived from whether the label has a team, and it is display only; the
source type is external data that one filter reads.

The current failure is a stop, but not a clear one. A decode mismatch becomes
`LinearGraphQLError` with the message "Linear returned an unexpected response
body." Then `TrackerError` maps it to code `internal`, hint `Run with
RATA_DEBUG=1 for details.`, and exit 1. The message does not name the value.

`duplicate` is the precedent. Before `5ee94a8`, an issue in a duplicate state
failed every read. The fix added the value. This document records the cost of
the next value.

## Inventory

| Set                 | Values                                                                            | Code                                                                                                       | Linear source of truth                                                                             | Unknown value                                                                                | Decision     |
| ------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------ |
| Workflow state type | `triage`, `backlog`, `unstarted`, `started`, `completed`, `canceled`, `duplicate` | `src/domain/workflow-state.ts:5-18`; `src/linear/decode/team.ts:32-35`; `src/linear/decode/issue.ts:18-19` | `WorkflowState.type` is `String!`; the description lists the seven values                          | Read fails with a generic error; see below                                                   | Fail fast    |
| Issue relation type | `blocks`, `duplicate`, `related`, `similar`                                       | `src/domain/relation.ts:3-6`; `src/linear/decode/issue.ts:66-78`                                           | `IssueRelation.type` is `String!`; the description lists four values and deprecates `similar`      | Read fails when relations are requested; see below                                           | Fail fast    |
| Priority value      | `0` to `4`, mapped to `none`, `urgent`, `high`, `medium`, `low`                   | `src/domain/priority.ts:3-18,68-73`; `src/linear/decode/issue.ts:122`                                      | `Issue.priority` is `Float!`; the description maps 0 to 4                                          | Read fails; `team show` accepts the integer; see below                                       | Fail fast    |
| Label scope         | `team`, `workspace`                                                               | `src/linear/decode/team.ts:39-42`; `src/linear/operations/team.ts:113-118`                                 | `IssueLabel.team`: null means a workspace label                                                    | No Linear value reaches the set; a bad cache row is a miss; see below                        | Pass through |
| Attachment source   | `github` (the only recognized value)                                              | `src/domain/pr.ts:28,77`                                                                                   | `Attachment.sourceType` is a raw string; the description names `github`, `slack` and `oauthClient` | A new or renamed source is ignored; `prs` omits it and `handoff` may attach again; see below | Pass through |

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
problem until `--refresh` (`src/context/resolve.ts:75`,
`src/local/context-cache.ts:107-110`).

### Issue relation type

`similar` is deprecated in the Linear schema. Rata keeps it because the output
field still lists it. `blockedBy` is not a Linear relation type. It is the
inverse view of `blocks` (`src/domain/relation.ts:8-22`). The decoder set is
only `relationTypes`.

The default `issue <ref>` read requests `inverseRelations`
(`src/linear/documents/issue/fields.ts:89-92`); `--summary` does not.
`issue list --relations` requests both directions. The write plans for `start`,
`close`, `handoff`, and `apply` read the full working set
(`src/tracker/apply.ts:38-49`, `src/tracker/workflow/start.ts:10`,
`src/tracker/workflow/close.ts:12`).

The current decoder fails fast. Keep that. The error should name the type.
Passing an unknown type through as `related` is the alternative. It keeps reads
alive, but it can hide a new blocking edge. I reject that trade.

### Priority value

Decision: fail fast. Every issue read decodes the priority
(`src/linear/decode/issue.ts:122`). `parsePriority` already rejects an unknown
input with the valid names (`src/domain/priority.ts:56-66`). The decode side has
no such message yet. The team priority list is `Schema.Int`
(`src/linear/decode/team.ts:55-58`), so it accepts a new integer. That is a gap
in the decision, not a second decision: `team show` is display only, and a later
change should validate it against 0 to 4.

### Label scope

`src/linear/operations/team.ts:113-118` builds `scope` from
`label.team === null`. The `TeamLabel` schema (`src/linear/decode/team.ts:39-42`)
constrains the result when the cache is written and read. `readTeam` turns a
decode failure into a cache miss (`src/local/context-cache.ts:39-40,107-110`),
so a cached row with an unknown scope cannot fail a command. It only forces a
refetch. A code change that adds a scope must update the schema, or the cache
write fails.

### Attachment source type

`pullRequests` recognizes only `github` (`src/domain/pr.ts:28,77`). Linear
documents `Attachment.sourceType` as a raw string such as `github`, `slack` or
`oauthClient`. A new or renamed source is silently ignored. `issue <ref>`
omits the attachment from `prs` (`src/tracker/model.ts:81`), and `handoff` sees
no matching PR, so it attaches the PR again (`src/tracker/apply/pr.ts:38`).

Decision: pass through. A future source type can be added when Linear publishes
it; failing the issue read would hide the whole issue for one attachment. The
cost is a silent omission, so the follow-up is to report an unrecognized
attachment that looks like a pull request.

## Failure path

1. `LinearClient.executeWithKey` decodes the response with the command schema. A
   mismatch becomes `LinearGraphQLError` with message "Linear returned an
   unexpected response body." and an empty `details` list
   (`src/linear/client.ts:134-145`).
2. `toTrackerError` calls `classifyUnclassified`. A `LinearGraphQLError` that
   does not match the duplicate or not-found text becomes `internal` with the
   hint "Run with RATA_DEBUG=1 for details." (`src/cli/error-report.ts:208-224`).
   The exit code is 1 (`src/cli/error-report.ts:95-107`).
3. The parse error is in `cause`. `RATA_DEBUG=1` shows it. The default output
   does not name the state type, relation type, or priority value.

The decoder tests cover the state and priority stop
(`test/linear/documents.test.ts:84-94`). No test covers an unknown relation
type, label scope or attachment source.

## Open points

- The fail-fast decision requires a clear error that names the field and the
  value, for example: "Linear added the workflow state type `X`. Update rata."
  The current decode error does not meet that; it is a known gap, not a behavior
  change in this document.
- The relation type decision is the closest call. Passing an unknown type
  through as `related` keeps reads alive. Failing fast names the new value but
  stops every read of an issue with that edge. I choose fail fast because a
  wrong frontier is worse than a failed read.
- The priority list in team detail accepts any integer. This is the display gap
  described above; it does not change the fail-fast decision.

## References

- `src/domain/workflow-state.ts`, `src/domain/relation.ts`,
  `src/domain/priority.ts`.
- `src/linear/decode/issue.ts`, `src/linear/decode/team.ts`.
- `src/linear/client.ts`, `src/cli/error-report.ts`.
- `src/domain/pr.ts`, `src/tracker/model.ts`, `src/tracker/apply/pr.ts`.
- Linear GraphQL schema at
  `https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql`:
  `WorkflowState.type`, `IssueRelation.type`, `IssueRelationType`,
  `Issue.priority`, `IssuePriorityValue`, and `IssueLabel.team`. The output
  fields `WorkflowState.type` and `IssueRelation.type` are `String!`; the values
  are in the descriptions.
- `5ee94a8`: the duplicate state fix.
