# Linear batch-write and rate-limit facts for a 300+ issue migration

The RATA-92 premise is mostly right, but one detail is wrong and one is missing. `issueBatchCreate` _is_ documented as "Creates a list of issues atomically" — and it _is_ bounded: "Up to 50 issues can be created in a single batch" (`schema.graphql:18644`). `issueBatchUpdate` carries the same cap. `IssueCreateInput.id` is a client-chosen `String` documented as UUID v4, already used by rata for comments. `rateLimitStatus` returns `limits[]` with exactly the six claimed fields, but `type` is `String!` — there is no `RateLimitType` enum. Budgets: 2,500 requests/hour, 3,000,000 complexity points/hour, 10,000 points per single query. The 25-minute migration was bound by request count and per-subprocess latency, not complexity. Atomicity, same-batch parents, and duplicate-id behaviour are backend semantics the schema does not state.

## 1. Real maximum list size for `issueBatchCreate`

**Answer:** documented bound of 50. No documented payload-size bound.

`~/Projects/other/linear/packages/sdk/src/schema.graphql:18643-18651`:

```
Input for creating multiple issues at once in a batch operation. Up to 50 issues can be created in a single batch.
"""
input IssueBatchCreateInput {
  issues: [IssueCreateInput!]!
```

The changelog dates the wording: `packages/sdk/CHANGELOG.md:4781`. Neither docs page mentions a body-size limit.

Confidence: confirmed by schema (the 50). Whether 50 is validated or advisory, and whether a large body hits a proxy limit (413) first, is **unverified**. Cheapest test: one mutation with 51 issues.

## 2. Can a child name a parent created in the same batch?

**Answer:** syntactically permitted; resolution inside one transaction is undocumented.

`schema.graphql:19216-19218`:

```
The identifier of the parent issue. Can be a UUID or issue identifier (e.g., 'LIN-123').
"""
parentId: String
```

With client-chosen ids (`schema.graphql:19200-19202`), a child can point at the UUID the client gave its sibling. The mutation doc ("Creates a list of issues atomically", `schema.graphql:26560`) says nothing about lookup order. Rata resolves the parent with a read first (`src/api/issue-write/create.ts:93-97`).

Confidence: **unverified**. Cheapest test: one batch of two — parent with `id` = a fresh UUID, child with `parentId` = that UUID — then query `issue(id: childId) { parent { id } }`. If the parent is null or the batch errors, parents must exist first.

## 3. Duplicate `IssueCreateInput.id`

**Answer:** undocumented. The schema states only that the id is optional and UUID v4.

`schema.graphql:19200-19202`:

```
The identifier in UUID v4 format. If none is provided, the backend will generate one.
"""
id: String
```

There is no uniqueness note, and the payload has no per-item field (`schema.graphql:18652-18664`: only `issues: [Issue!]!`, `lastSyncId`, `success`).

Confidence: **unverified**. Cheapest test: same `id` twice in one batch, then again in a second request — error, idempotent return, or duplicate row are distinguishable. Rata already treats client-chosen comment ids as a dedupe key and re-reads on failure (`src/api/issue-write/comments.ts:104-120`).

## 4. All-or-nothing or partial success, and what a failure reports

**Answer:** documented atomic, therefore all-or-nothing; failures arrive as top-level GraphQL errors.

`schema.graphql:26559-26560`:

```
"""
Creates a list of issues atomically.
"""
```

The wording is deliberate — `packages/sdk/CHANGELOG.md:1100` records "description changed from 'Creates a list of issues in one transaction.' to 'Creates a list of issues atomically.'". The payload cannot express partial results: `issues: [Issue!]!` forbids nulls and there is no `errors` field (`schema.graphql:18652-18664`).

Confidence: confirmed by schema (intent). The wire shape of a failure — top-level `errors[]` with `extensions.code`, versus `success: false` with `issues: []` — is **unverified**. Cheapest test: batch two issues, one with a bogus `stateId`, then check whether the valid sibling exists.

## 5. Is 50 a hard bound for `issueBatchUpdate`?

**Answer:** yes — stated as a cap, in the same imperative tone as a limit.

`schema.graphql:26571-26579`:

```
  issueBatchUpdate(
    """
    The id's of the issues to update. Can't be more than 50 at a time.
    """
    ids: [UUID!]!
```

Note the type: `[UUID!]!`, so identifiers like `RATA-92` must be resolved to UUIDs first. Batch create has no such restriction.

Confidence: confirmed by schema (the statement). Whether 51 is rejected or truncated is **unverified**; cheap test: a 51-id call on trashed issues.

## 6. Rate-limit types that apply to mutations

**Answer:** two budgets apply to every mutation — request count and complexity — plus optional per-endpoint request limits. There is **no `RateLimitType` enum** in this schema.

`schema.graphql:42579` — `type: String!`, described at `42577-42578` as "such as query complexity or mutation count". `grep -c RateLimitType schema.graphql schema.json` returns `0` for both. `RateLimitPayload.kind` is also `String!` (`schema.graphql:42544-42546`).

Documented budgets (rate-limiting page): API key — **2,500 requests/hour**, shared per user across keys; **3,000,000 complexity points/hour**; **10,000 points per single query**, which "will always get rejected if it exceeds that". "Some queries and mutations have individual request rate limits that are lower than the global request limit", advertised via `X-RateLimit-Endpoint-*`. Mutation complexity has no published formula.

Confidence: confirmed by docs (budgets) and schema (shapes). Which `type` strings appear is **unverified**. Cheapest test: `{ rateLimitStatus { kind limits { type allowedAmount remainingAmount requestedAmount period reset } } }` right after one batch create — the `requestedAmount` delta names the bucket.

## 7. What a 429 carries

**Answer:** both — a `Retry-After` header and a GraphQL error with `extensions.code: "RATELIMITED"`.

Docs: "GraphQL requests that exceed a rate limit return HTTP status code `429` … the `Retry-After` header gives the number of seconds to wait before retrying." The SDK reads both paths: `packages/sdk/src/error.ts:125` — `headers?.get("retry-after")` — and `error.ts:259-262` maps `status === 429` to `Ratelimited` even with no parseable body.

Rata keeps the value only as far as the error object. `src/api/client.ts:117-122`:

```
if (response.status === 429) {
  return yield* new LinearRateLimitError({
    message: "Linear rate limit reached.",
    retryAfterSeconds: parseRetryAfter(response.headers),
```

The retry schedule honours it (`src/api/client.ts:82-86`) under `maxRetries = 3` (`:76`), but the user-facing mapping drops it — `src/cli/error-report.ts:113-115`:

```
if (tag === "LinearRateLimitError") {
  return { code: "rate_limited", message, hint: "Retry later." }
```

So the ticket is right: the parsed time never reaches the report. Rata also never sees `RATELIMITED`, because its envelope schema keeps only `message` (`src/api/client.ts:18`).

Confidence: confirmed by docs and SDK source; the rata mapping is confirmed by its own source.

## 8. Does one big batch cost less on complexity?

**Answer:** roughly the same; the win is request count, not complexity.

Formula (rate-limiting page): "Each property is 0.1 point, each object is 1 point and any connection multiplies its children's points based on the given pagination argument, or the default 50. The score is then rounded up to the nearest integer." Worked example: 50 nodes × 3 fields = 50 + 15 = 65 points. Applied to rata: one create returning 5 properties ≈ 2 points, so 304 creates ≈ 600 points — 0.02% of the hourly budget. One batch of 50 issues ≈ 75 points, so 7 batches ≈ 525. Same order of magnitude, marginally cheaper. The formula prices the selection set, not the input, so batch size buys no headroom.

Confidence: formula confirmed by docs; whether input contributes points and whether a mutation has fixed overhead is **unverified**. Cheapest test: compare `X-Complexity` on a single create versus a 50-issue batch.

## Headers and the cost of `rateLimitStatus`

Sent on every response: `X-RateLimit-Requests-{Limit,Remaining,Reset}`, `X-Complexity`, `X-RateLimit-Complexity-{Limit,Remaining,Reset}`, plus `X-RateLimit-Endpoint-*` when a per-endpoint limit applies. Resets are UTC epoch **milliseconds**. The SDK parses six of them (`packages/sdk/src/error.ts:126-131`); rata parses only `retry-after`.

`rateLimitStatus` is an ordinary query (`schema.graphql:41698`), so it consumes a request from the 2,500/hour bucket. That it counts is **unverified** by docs; cheap test: read `X-RateLimit-Requests-Remaining` before and after one call.

## Implications for rata

- **Batch creates at 50 per mutation.** 304 creates become 7 requests. Read the cap from the schema description.
- **Order batches parent-first** until Q2 is settled. Plan the tree, emit levels, reference already-created UUIDs.
- **Comments and links stay one-per-request.** No comment or relation batch exists. 194 + 80 = 274 unavoidable requests — this is where a bounded concurrency window belongs.
- **Make ids idempotent before retrying.** Use `IssueCreateInput.id` as the dedupe key, as rata already does for comments (`src/api/issue-write/comments.ts:74-79`), so a resumed migration cannot double-create under any of Q3's outcomes.
- **Surface the retry time.** `src/cli/error-report.ts:114` discards `retryAfterSeconds`; carry it into the hint and `--json` so an agent sleeps instead of guessing.
- **Raise retries for bulk paths only.** `maxRetries = 3` (`src/api/client.ts:76`) suits one issue; with `Retry-After` honoured, more attempts are cheap and safe.
- **Stop treating complexity as the constraint.** 600–900 points of 3,000,000 means the target is requests and latency: 578 sequential spawns at ~2.6s explain the 25 minutes.
- **Treat a failed batch as "nothing or everything".** Re-read by the ids before reporting.
