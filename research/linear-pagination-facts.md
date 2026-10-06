# Linear API pagination facts

Research for RAT-28, child of RAT-23 "Pagination in rata". Date: 2026-10-06.

Sources:

- Linear SDK checkout: `~/Projects/other/linear`, revision `b37823b`, SDL at
  `packages/sdk/src/schema.graphql`. Line references use that revision and can
  move.
- Public pages:
  - <https://linear.app/developers/pagination>
  - <https://linear.app/developers/filtering>
  - <https://linear.app/developers/graphql>
  - <https://linear.app/developers/rate-limiting>

Method: read the SDL and the SDK source, read the public pages, then run
read-only GraphQL probes against the workspace `utbetdix` (team `RAT`). The
probes read data only. No Linear data changed.

## 1. `IssueFilter.hasBlockedByRelations` semantics

**Answer: it counts blocked-by relations whose blocker is still open. A
completed blocker does not count. It matches "has at least one open blocker".**

Evidence:

- The SDL type is a boolean comparator: "Comparator for relation existence"
  (`schema.graphql:42071`), with `eq` and `neq` fields
  (`schema.graphql:42072-42082`). The `IssueFilter` field doc says "Comparator
  for filtering issues which are blocked" (`schema.graphql:19326-19327`,
  `IssueFilter` starts at `schema.graphql:19219`).
- Probe: `issues(filter: { team: { key: { eq: "RAT" } },
  hasBlockedByRelations: { eq: true } })` returned RAT-30, RAT-29, RAT-27,
  RAT-26, RAT-25, RAT-24. Each of these has at least one blocked-by relation
  whose blocker is in an open state (`backlog`).
- Probe: `{ eq: false }` returned all other issues, including RAT-20 and
  RAT-12. Both are `completed`, and each has a blocked-by relation whose
  blocker is also `completed`. They have relations, but no open blocker, so
  `eq: false` matched them.
- Probe: `{ eq: true }` did **not** return RAT-20 or RAT-12. Therefore the
  filter does not match on relation existence alone.

Consequences:

- `{ eq: false }` has the same blocker meaning as rata's `--unblocked` rule:
  every blocker is completed or canceled.
- `{ eq: false }` does **not** consider the state of the issue itself. It
  returned completed issues.
- rata's `isUnblocked` also requires the issue itself to be open
  (`src/domain/frontier.ts:14-15`). To reproduce rata's rule fully on the
  server, combine the filter with a state filter. Verified:
  `filter: { state: { type: { nin: ["completed", "canceled"] } },
  hasBlockedByRelations: { eq: false } }` returned exactly RAT-28 and RAT-23,
  the open issues with no open blocker.

Limits of the evidence:

- No `canceled` blocker exists in the workspace. The completed case is
  verified; the canceled case is inferred, not verified.
- All observed blocked-by relations have type `blocks`. The SDL has separate
  comparators for duplicates and related issues
  (`hasDuplicateRelations`, `hasRelatedRelations`). The scope "blocks
  relations only" is inferred, not exhaustively tested.

## 2. Maximum `first` on the `issues` connection

**Answer: 250. The SDL does not state it; the server enforces it.**

Evidence:

- The SDL documents only the default: "The number of items to forward paginate
  (used with after). Defaults to 50." (`schema.graphql:40419-40452`).
- Probe `issues(first: 250)` succeeded. Probes `first: 251`, `300` and `1000`
  failed with:
  `"Argument Validation Error"`, code `INVALID_INPUT`, constraint
  `first must not be greater than 250`, user message
  `first must not be greater than 250.`
- `last: 251` fails with the same message for `last`.
- `searchIssues(first: 251)` fails with the same 250 maximum.

Notes:

- This cap comes from server-side argument validation. It is not in the SDL.
  Linear says it evolves limits, so treat 250 as current, not permanent
  (<https://linear.app/developers/rate-limiting>).
- Query complexity limits interact with page size. The public page says each
  connection multiplies its children's complexity points by the pagination
  argument (or the default 50), and that a single query may not exceed 10,000
  points. A 250-wide `issues` page with nested connections can break the
  single-query cap. rata's current nested queries are far below it.

## 3. Cursor stability and `orderBy` dependence

**Answer: Linear documents no stability guarantee. The cursor token itself
does not encode `orderBy`; it identifies the anchor item. The server applies
the current `orderBy` when it resolves the cursor. Callers must not change
`orderBy` between pages. Stability while data changes is not established.**

Evidence:

- Public pagination docs describe Relay cursor pagination and passing
  `pageInfo.endCursor` as `after`. They say nothing about maximum page size,
  cursor lifetime, or cursor reuse across orderings
  (<https://linear.app/developers/pagination>).
- The `PageInfo` type has `endCursor`, `hasNextPage`, `hasPreviousPage` and
  `startCursor` (`schema.graphql:32800-32820`).
- In this workspace, an `issues` `endCursor` is exactly the UUID of the last
  node. `issues(first: 1, orderBy: createdAt)` returned RAT-30 with id
  `0e1ac26f-fe8d-43c2-b231-2c19e209d26b`; the returned `endCursor` was the
  same UUID. The cursor is a 36-character UUID, not base64 data.
- Identical calls return identical cursors. The same page fetched twice gave
  the same cursor string.
- The token does not depend on `orderBy`. `issues(first: 2, orderBy:
  createdAt)` and `issues(first: 2, orderBy: updatedAt)` both ended at
  RAT-29 and returned the same cursor. `issues(first: 1, orderBy: createdAt)`
  ended at RAT-30 and returned a different cursor. The token depends on the
  anchor item, not on the ordering.
- Mixing `orderBy` between pages is accepted silently and gives a different
  slice. A cursor anchored at RAT-29 from `createdAt` order, reused with
  `orderBy: updatedAt`, returned RAT-27 and RAT-26. Page one of `updatedAt`
  order was RAT-28 and RAT-29. The mixed call skipped items that sort before
  the anchor in `updatedAt` order. No error is raised.
- Repeating the same continuation call with the same cursor returned the same
  nodes (idempotent while the data does not change).

What is not established:

- Stability while the data changes. A read-only session cannot insert,
  update or delete data. No documentation describes this case. The
  anchor-UUID behaviour implies that results depend on the anchor row and the
  current order; new or changed items can shift a traversal.
- Whether the cursor is the node UUID for other connections, or for `issues`
  in other workspaces. This is an observation, not a documented contract.
- What happens when the anchor item is archived or deleted.

Practical rule: treat a cursor as valid for one query shape (`orderBy`,
`filter`, connection) and for data that does not change between pages.

## 4. `searchIssues` deterministic paging

**Answer: pin `orderBy` for deterministic results. Relevance paging is stable
in practice for unchanged data, but Linear gives no ranking-stability
guarantee, and ranking can change when the search index changes.**

Evidence:

- The SDL field description says: "Results are ranked by relevance unless an
  orderBy parameter is specified. ... Rate-limited to 30 requests per
  minute." (`schema.graphql:41216-41218`). The `orderBy` argument doc still
  says "createdAt (default)" (`schema.graphql:41250`); the field
  description is authoritative for search: the default is relevance, not
  createdAt.
- Relevance probe, term `pagination`, `first: 2`: RAT-27, RAT-23
  (`totalCount` 8). Continuation with the cursor: RAT-24, RAT-25. A repeated
  first page returned the same nodes and cursor.
- Ordered probe, `orderBy: createdAt`: page one RAT-30, RAT-29, RAT-28; page
  two RAT-27, RAT-26, RAT-25. A single query with `first: 10` returned the
  same eight identifiers in the same order. The pages concatenated exactly.
- Cursors work the same way as for `issues`: the anchor item defines
  `after`, the current ordering resolves it. If relevance ranking changes
  between calls, a continuation can skip or repeat items.
- `IssueSearchPayload` has `totalCount` ("Total number of matching results
  before pagination is applied", `schema.graphql:20990-20992`). No other
  connection rata uses reports a count.

## 5. `orderBy` values and defaults for the connections rata uses

One enum has all values: `PaginationOrderBy { createdAt, updatedAt }`
(`schema.graphql:32837-32840`). Every connection below takes `orderBy` with
this enum, plus `after`, `before`, `first`, `last` and `includeArchived`.
`first` and `last` default to 50. The argument doc is the same on every
connection: "Available options are createdAt (default) and updatedAt."

| rata use | GraphQL field | orderBy values | Default | Source |
| --- | --- | --- | --- | --- |
| issue list | `Query.issues` | createdAt, updatedAt | createdAt | SDL 40419-40452 |
| issue search | `Query.searchIssues` | createdAt, updatedAt | relevance (field description) | SDL 41218-41259 |
| issue show / labels | `Issue.labels` | createdAt, updatedAt | createdAt | SDL 17910-17939 |
| issue show / children | `Issue.children` | createdAt, updatedAt | createdAt | SDL 17586-17615 |
| issue show / relations | `Issue.relations` | createdAt, updatedAt | createdAt | SDL 18024-18049 |
| issue show / inverseRelations | `Issue.inverseRelations` | createdAt, updatedAt | createdAt | SDL 17877-17902 |
| comments | `Issue.comments` | createdAt, updatedAt | createdAt | SDL 17619-17648. rata passes `orderBy: createdAt` (`src/api/issue-query.ts:102`) |
| team states | `Team.states` | createdAt, updatedAt | createdAt | SDL 46708-46737 |
| workflow states | `Query.workflowStates` | createdAt, updatedAt | createdAt | SDL 41724-41753 |
| labels | `Query.issueLabels` | createdAt, updatedAt | createdAt | SDL 40234-40263 |
| projects | `Query.projects` | createdAt, updatedAt | createdAt | SDL 40870-40903 |
| teams | `Query.teams` | createdAt, updatedAt | createdAt | SDL 41402-41431 |

Additional facts:

- The observed direction is descending (newest first) for both `createdAt`
  and `updatedAt` on `issues`. The public docs do not state the direction.
- `Query.issues` and `Query.projects` have an extra `sort` argument marked
  `[INTERNAL]` (`schema.graphql:40451-40452`, `40902-40903`). Do not use it.
- rata's page size is 50 (`src/api/issue-query.ts:1`). The list queries for
  teams, projects and labels use `first: 250` (`src/api/team.ts:37`,
  `src/api/project.ts:31`, `src/api/label.ts:21` and `:31`). 250 is the
  validated maximum, so these calls sit exactly on the cap.

## What remains unknown or uncertain

- Cursor stability while data changes. No documentation, not testable
  read-only.
- Canceled blockers. No canceled blocker exists in the workspace; the
  evidence covers completed only.
- Whether `hasBlockedByRelations` counts relation types other than `blocks`.
  Not exercised; separate comparators suggest it does not.
- Whether the cursor-UUID identity holds for connections other than `issues`.
  Observed for `issues` in one workspace only.
- The exact relevance ranking rules. No formula or stability contract is
  public.
