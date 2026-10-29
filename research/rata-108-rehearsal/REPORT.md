# RATA-108: a 30-issue round trip on a scratch team

The candidate batch path works. A 30-issue slice with parents, labels, blockers,
comments and `createdAt` took **26 requests and 10.4 seconds** on a scratch team
and landed complete and correct. The second import of the same slice took **17
requests and 3.3 seconds** and wrote nothing: 51 of 51 items came back `skipped`.
A child can name a parent created in the same batch.

Measured on 2026-10-29 against team `RHR` (`Rata Rehearsal`), created with
`rata team create --copy-settings-from RATA`.

## The slice

| Item                            |                    Value |
| ------------------------------- | -----------------------: |
| Issues                          |                       30 |
| Levels (top, child, grandchild) |              5 / 15 / 10 |
| Comments                        |                        7 |
| `blocks` edges                  |                       14 |
| Label names                     |                        6 |
| Manifest size, JSON, 2-space    |                 20,660 B |
| `createdAt` range               | 2025-03-01 .. 2025-03-29 |

`manifest.json` is the slice. The keys are stable names. The issue id is
`sha256("issue\0" + teamId + "\0" + key)` with the version and variant nibbles
forced to UUIDv4, as RATA-96 specifies. The comment id uses the same derivation
over the issue id and the comment key, as ADR-0007 does.

## The protocol

One process, sequential requests, no concurrency:

1. Probe the chunk ids with `issues(filter: { id: { in: [...] } })`.
2. Create one `issueBatchCreate` per level, at most 50 issues.
3. Create comments one per request with `createdAt` and the derived id.
4. Create `blocks` relations one per request.
5. Re-probe the ids to confirm the write is visible.

## Round 1: the first import

| Phase                            |  Calls |  Wall time |
| -------------------------------- | -----: | ---------: |
| Existence probe                  |      1 |      0.2 s |
| `issueBatchCreate`, level 0 (5)  |      1 |      0.6 s |
| `issueBatchCreate`, level 1 (15) |      1 |      2.5 s |
| `issueBatchCreate`, level 2 (10) |      1 |      1.4 s |
| Comments                         |      7 |      1.7 s |
| `blocks` relations               |     14 |      3.6 s |
| Post-run probe                   |      1 |      0.2 s |
| **Total**                        | **26** | **10.4 s** |

Result: 30 created, 7 comments created, 14 relations created, 0 failures. All 30
ids are present on the re-probe.

The 24 writes replace what would be 30 creates plus 7 comments plus 14 links as
separate commands, 51 subprocesses, with 24 HTTP requests.

Latency over all 52 calls: median 225 ms, p90 399 ms, maximum 2,535 ms.

## Round 2: the same import again

| Phase                               |  Calls | Result                   |
| ----------------------------------- | -----: | ------------------------ |
| Issue probe, all 30 ids             |      1 | 30 hits                  |
| Comments probe, `id: { in: [...] }` |      1 | 7 hits                   |
| Relation read, one per blocker      |     14 | 14 edges present         |
| Post-run probe                      |      1 | 30 present               |
| **Total**                           | **17** | **0 writes, 51 skipped** |

Result: 0 created, 0 failed, 51 skipped (30 issues + 7 comments + 14 relations),
3.3 s.

Verification after both rounds: 30 of 30 ids match the manifest on title,
`createdAt`, parent, state, labels, priority and comment count; 14 of 14 edges
exist; no duplicate title; the team holds 33 issues (the 30 slice issues, the
same-batch pair, and the duplicate seed).

The no-op run is cheaper than the first run but not free. The 14 relation reads
are the largest block, because `issue link` reads relations before it writes. A
batched relation read would cut the no-op run to 3 or 4 requests.

## Same-batch parent and child

One `issueBatchCreate` held two issues: parent `RHR-5` and child `RHR-6` with
`parentId` set to the parent's client-chosen id. The mutation returned the child
with its parent. A re-read returned `RHR-6` with `parent { id, identifier }` =
`RHR-5`.

**The rule holds.** A child can name a parent created in the same batch. RATA-97
ordered creates level by level because this rule was unverified; it is now
verified, so level order is a choice and not a requirement. RATA-101 can fold a
tree into one batch. This report does not make that decision.

## Failures and settled facts

| Probe                        | Result                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Same id in a second request  | Error `INPUT_ERROR`, HTTP 400: "Entity Issue with id … already exists." Not `skipped`.                                |
| Same id twice in one batch   | Same error. Atomic: 0 issues created, checked by id and by title.                                                     |
| 51 issues in one batch       | `INVALID_INPUT`: "issues must contain no more than 50 elements." Atomic: 0 created. The 50 cap is hard, not advisory. |
| `issue(id:)` on a missing id | Error `INPUT_ERROR`: "Could not find referenced Issue." Not `null`.                                                   |
| 429                          | None. The backoff path is untested.                                                                                   |

Two consequences for the import contract:

- **Read before create is mandatory.** A duplicate id is an error, not a skip.
  The probe must be `issues(filter: { id: { in: [...] } })`: it returns an empty
  set on a miss, and it costs one request per chunk.
- **A failed chunk writes nothing.** A hit after a failure is `skipped`; a miss
  is a retry. RATA-97's rule holds.

## Rate limits

| Budget                     |   Allowed |          Used by the whole rehearsal |
| -------------------------- | --------: | -----------------------------------: |
| Requests per hour          |     2,500 |         50 (remaining 2,499 → 2,449) |
| Complexity points per hour | 3,000,000 | 77 (remaining 2,999,997 → 2,999,920) |

The `X-Complexity` header summed to 1,167 over the same 52 calls, and one
relation read reports `X-Complexity: 71` while the bucket does not fall. A
control probe of exactly that shape saw the bucket **rise** by 2. The header is a
per-response estimate; the charge is the bucket delta. Budget on the bucket.

Complexity is not the constraint. Requests and latency are.

## Extrapolation to the harbagsa shape

304 creates, 194 comments, 80 links:

| Path                                            | Calls |       Time |
| ----------------------------------------------- | ----: | ---------: |
| 578 subprocesses, as measured by harbagsa       |   578 |     25 min |
| Batch path, RATA-97 estimate                    |   281 |  1.5–4 min |
| Batch path, measured here (+ 1 probe per chunk) |   288 | ~1.5–2 min |

The probe adds 7 requests. At the measured medians, 194 comments cost ~47 s, 80
links ~21 s and 7 batch creates ~11 s.

## Recommendation for RATA-101

- Keep `issueBatchCreate` at 50 and level order as the default, but treat level
  order as an optimization, not a constraint.
- Allocate one existence probe per chunk. The 281 estimate is 288.
- Probe with `issues(filter: { id: { in } })`, never `issue(id:)`.
- Expect the no-op run to cost about one request per comment plus one per
  linked issue, unless the relation read is batched.

## Files

- `rehearse.ts`: the whole rehearsal. One process, no subprocess work.
- `verify.ts`: reads the team back and diffs it against the manifest.
- `limit-probe.ts`: the controlled complexity measurement.
- `manifest.json`: the 30-issue slice.
- `evidence.json`: every call, its latency, headers and error, plus per-phase
  totals. The full error bodies are in `/tmp` only; the messages and codes here
  are exact.

## Cleanup

Team `RHR` is deleted after this report, as it was created only for the
rehearsal.
