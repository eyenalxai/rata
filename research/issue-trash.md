# Linear issue trash and restore: what the API exposes

Linear models deletion as a trash inside the archive. `issueDelete` is the delete entry point, `issueArchive(trash: true)` reaches the same state, and `issueUnarchive` is the only issue restore mutation. Each claim is documented, inferred, or checked with read-only GraphQL on 2026-10-29. No mutations were called.

## 1. `issueDelete` trashes; the 30-day grace is documented; permanent delete is admin-only

> "Deletes (trashes) an issue."
> `id: String!` — "The identifier of the issue to delete."
> `permanentlyDelete: Boolean` — "Whether to permanently delete the issue and skip the grace period of 30 days. Available only to admins!"

Evidence: `~/Projects/other/linear/packages/sdk/src/schema.graphql:26590-26602`. The [25 July 2024 changelog](https://linear.app/changelog/page/8): "Added `deletePermanently` option … to allow workspace admins the option to permanently delete the issue and skip the recovery period of 30 days." The [docs](https://linear.app/docs/delete-archive-issues) confirm the 30-day window. The argument is `permanentlyDelete`; the changelog says `deletePermanently` — naming drift. **High.**

## 2. `issueUnarchive` is the inverse of `issueDelete`, but the docs only imply it

`issueRestore` does not exist; archive, delete and unarchive are the only calls. `issueUnarchive` returns the same `IssueArchivePayload!` as `issueDelete`, and its doc is only "Unarchives an issue" (`schema.graphql:27034-27042`). `projectUnarchive` says "Restores a previously trashed or archived project" (`:27803-27811`); Linear tightened that wording but not the issue one.
The only explicit trash-restore text is `IssueUpdateInput.trashed`: "Set to true to trash, or null to restore." (`:23050-23052`). That makes `issueUpdate(id, input: { trashed: null })` a documented fallback. **Medium-high for `issueUnarchive`, high for the fallback.** Neither was called.

## 3. `issueArchive(trash: true)` and `issueDelete`: same state, different entry point

`issueArchive` takes `id: String!` plus `trash: Boolean` — "Whether to trash the issue." — and returns `IssueArchivePayload!` (`schema.graphql:26546-26558`). `issueDelete` takes the same `id`, returns the same payload, and adds only `permanentlyDelete`. There is no `IssueArchiveInput`; both take inline arguments.

Trash is a flag on an archived issue, not a separate state. `Issue.archivedAt` is "The time at which the entity was archived. Null if the entity has not been archived." (`:17808-17811`); `Issue.trashed` is "A flag that indicates whether the issue is in the trash bin." (`:18547-18550`). The probe confirmed it: `JYOT-43` returned `trashed: true` with `archivedAt: "2026-10-29T14:19:49.605Z"`. `GLOSSARY.md:17-24` agrees. Archive without `trash` hides an issue; `archive(trash: true)` and `delete` both trash it, differing only by `permanentlyDelete`. **High for archived ⊃ trashed; medium for the calls being otherwise identical, which no document states.**

## 4. `trashed` is selectable on the normal queries and is `null` on a live issue

`Issue.trashed` is nullable `Boolean`. `Query.issue(id: String!)` has no `includeArchived` argument and still returns trashed issues: the probe resolved `JYOT-43` by identifier and by UUID, both with `trashed: true`. `Query.issues` selects the same field (`schema.graphql:41154-41187`). Of 250 live issues, 249 returned `trashed: null` and none returned `false`, so live issues return `null`, not `false`. **High (live-verified).** A plain archived-not-trashed issue was not observed, so its value is unverified.

## 5. `IssueFilter` cannot select trash; `includeArchived` returns both; `trashed` separates them

`IssueFilter` has no `trashed` field; the block runs from `schema.graphql:19516` to `updatedAt` at `:19796`. `includeArchived` is a query argument: "Should archived resources be included (default: false)" (`:41172-41174`). `IssueFilter.id` is an `IssueIDComparator` with `eq: ID` (`:20216-20233`) and accepted an identifier: `filter: { id: { eq: "JYOT-43" } }` with `includeArchived: true` returned the trashed issue.

Probe: `issues(includeArchived: true)` returned the trashed issue; the same filter **without** `includeArchived` returned nothing. Paging found 21 trashed issues. `filter: { archivedAt: { null: false } }` plus `includeArchived: true` returned exactly those 21, because every archived issue here is also trashed. Callers tell them apart by `trashed`, since trashed issues also carry `archivedAt`. **High (live-verified); other workspaces may differ.**

## 6. `issueUnarchive` on an archived issue that was never trashed

It unarchives a plain archived issue; that is its documented purpose. Trash is a sub-state of archive, so the same call restores both. The CLI needs one `issue restore` command. **Medium; untested because restoring is a write.**

## 7. Children, relations, comments and attachments of trashed issues

Children survive and are trashed with the parent. The probe found `RATA-8` trashed with children `RATA-4`–`RATA-7`, all `trashed: true`. A trashed parent's `children` connection is empty by default and returns them only with `children(includeArchived: true)` (`schema.graphql:17883-17903`). Each child still reports `parent { identifier: "RATA-8", trashed: true }`. This matches the live Apollo schema text "Deletes (trashes) an issue and its sub-issues"; the pinned schema at `:26590-26591` says only "Deletes (trashes) an issue".

Relations survive archiving: the [30 May 2024 changelog](https://linear.app/changelog/page/8) says "We now preserve issue relations when archiving issues." No trashed issue here had relations, so that is unverified. Comments and attachments: none of the 21 trashed issues had any, and no document states the behaviour. **High for child cascade and preservation; medium for relations; unverified for comments, attachments, and subtree restore.**

## 8. Restore by identifier, and how rata resolves refs

Both mutation inputs and the query accept an identifier. `issueUnarchive(id: String!)` is documented as "The identifier of the issue to unarchive" (`schema.graphql:27037-27042`), the same `String!` shape as `issueDelete` (`:26597`). Contrast `issueBatchUpdate(ids: [UUID!]!)` (`:26575`): `String!` is the identifier-capable form. `Query.issue(id: String!)` resolved both `JYOT-43` and its UUID for a trashed issue, and the [GraphQL docs](https://linear.app/developers/graphql) show `issue(id: "BLA-123")` and say `issueUpdate`'s id may be "the uuid … or the shorthand id like `BLA-123`". Identifier restore is supported but untested.

rata already has the primitive. `parseRefOrFail` accepts an identifier, UUID, or linear.app URL (`src/domain/ref.ts:63-74`); `resolveIssueId` sends that ref to `IssueId` and returns the UUID (`src/api/issue.ts:64-70`, `src/api/issue-write/resolvers.ts:57-63`; query at `src/api/issue-query.ts:75-79`). Trashed issues resolve the same way. Resolve first, pass the UUID: consistent with every other write. **High for reads, medium-high for mutations.**

## Mutation surface

| Mutation         | Signature                                 | Payload                | Entity                                         |
| ---------------- | ----------------------------------------- | ---------------------- | ---------------------------------------------- |
| `issueArchive`   | `id: String!, trash: Boolean`             | `IssueArchivePayload!` | `entity: Issue`                                |
| `issueDelete`    | `id: String!, permanentlyDelete: Boolean` | `IssueArchivePayload!` | `entity: Issue`, null when permanently deleted |
| `issueUnarchive` | `id: String!`                             | `IssueArchivePayload!` | `entity: Issue`                                |
| `issueUpdate`    | `id: String!, input: IssueUpdateInput!`   | `IssuePayload!`        | `issue: Issue`                                 |

`IssueArchivePayload` is `{ entity: Issue, lastSyncId: Float!, success: Boolean! }` with "The archived/unarchived entity. Null if entity was deleted." (`schema.graphql:18573-18586`). `IssuePayload` is `{ issue, lastSyncId, success }` (`:21104-21117`).

## Implications for rata

- Add `trashed` to the issue summary selection and schema (`src/api/issue-query.ts:1-23`, `src/api/issue-schema.ts`), decoded nullable-to-boolean like projects (`src/api/project/model.ts:13-21`). `rata issue show` already works on trashed issues but hides that fact.
- Implement `rata issue trash list` as `issues(includeArchived: true, filter: …)` plus a client-side `trashed === true` filter; no separate query or `trashed` filter exists. Support `--team`, `--limit`, `--after`, `--all` like `rata project list`.
- Add `--include-archived` to `rata issue list`, mirroring `src/cli/project.ts:22-25`, and mark rows `(deleted)` as in `src/cli/project.ts:69`.
- Add `rata issue delete <ref>` mapped to `issueDelete` with a confirmation prompt, plus admin-only `--permanent`.
- Add `rata issue restore <ref>` mapped to `issueUnarchive`, resolving through `parseRefOrFail` + `IssueId` first; mirror `rata project restore`.
- Add `rata issue archive <ref>` for `issueArchive` without `trash`, and a separate `issue trash <ref>` (or `--trash`), keeping vocabulary aligned with `GLOSSARY.md:17-24`.
- Warn when restoring a trashed parent that sub-issues were trashed too; subtree restore is unverified (test `issueBatchUpdate(ids, input: { trashed: null })`).
