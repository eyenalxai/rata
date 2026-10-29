# Migration provenance in Linear: what rata can keep, and what the import job does better

Linear separates migration provenance into two classes. **Dates** are plain input fields on `IssueCreateInput` and `CommentCreateInput`, with no auth gate. **A human author's identity** is gated behind `createAsUser`, which only an OAuth app in `actor=app` mode can use. A plain API key — rata's only credential — can backdate issues and comments but cannot reproduce a comment author. Linear's own `@linear/import` CLI proves it: on a personal API key it passes `createdAt`/`completedAt` and folds comment authors into the description. The import job beats rata on identifiers, bulk deletion and request cost, but its CSV variant is Jira-columns-only and cannot be finished headless.

## 1. Do `createdAt` and `completedAt` work with a plain API key?

**Yes for `issueCreate`. `issueUpdate` has no such fields at all.**

- `schema.graphql:19168` — "The time at which the issue was created (e.g. if importing from another system). **Must be a time in the past.** If none is provided, the backend will generate the time as now."
- `schema.graphql:19160` — "The time at which the issue was completed … **Must be a time in the past and after createdAt.** Cannot be provided with an incompatible workflow state."

Neither field names an auth mode, and Linear's CLI proves the path: `packages/import/src/importIssues.ts:54` builds `new LinearClient({ apiKey, apiUrl })` — a personal key, not an OAuth token — and lines 364–365 pass `createdAt: issue.createdAt, completedAt: issue.completedAt` to `createIssue` (`816094f`, 2024).

`IssueUpdateInput` (`schema.graphql:22920`–`23057`) has no `createdAt`, `completedAt`, `createAsUser` or `displayIconUrl`. Backdating is **create-only**; a wrong date needs delete and recreate.

**Confidence: High.** Ordering and workflow-state rules are backend-enforced — cheapest test: one `issueCreate` with a 2019 `createdAt`, then read back.

## 2. Does `CommentCreateInput.createdAt` work with a plain API key?

**Almost certainly yes, on the same terms.**

`schema.graphql:6198` — "The time at which the comment was created (e.g. if importing from another system). Must be a time in the past. If none is provided, the backend will generate the time as now."

The wording matches `IssueCreateInput.createdAt` and the field carries no OAuth gate, unlike `createAsUser` at `:6192`. `CommentUpdateInput` (`:6362`) has no `createdAt` either. No local code creates a backdated comment, so runtime behavior is unproven.

**Confidence: Medium-high; runtime unverified.** Cheapest test: one `commentCreate` with `createdAt: "2020-01-01T00:00:00Z"` on a scratch issue, then read `comment.createdAt`.

## 3. Can rata keep a comment author?

**No. `createAsUser` needs an OAuth app in `actor=app` mode.**

- `schema.graphql:6192` — "Create comment as a user with the provided name. **This option is only available to OAuth applications creating comments in `actor=app` mode.**"
- `schema.graphql:6204` — "Provide an external user avatar URL. **Can only be used in conjunction with the `createAsUser` options.**"

`IssueCreateInput` repeats both at `:19166` and `:19190`. rata authenticates with a raw API key (`src/api/client.ts:149`); `actor` is authorize-time, so the maintainer must register and authorize an OAuth app.

**Best substitute: a bold prefix line inside a real comment.** Linear's own CLI instead folds comments into the description (`importIssues.ts:397`–`400`), keeping only the date — losing threading, comment counts, subscriptions and per-comment `createdAt`. A rata comment opening with `**Ada Lovelace** · 2019-04-03`, a blank line, then the body keeps those and loses only attribution. A footer reads like a signature and survives quoting badly.

**Confidence: High** (the schema text is explicit).

## 4. What do the import mutations accept, and what columns does CSV take?

**The CSV import is Jira-columns-only. There is no generic mapping, and no `IssueImportMappingInput` type exists.**

`issueImportCreateCSVJira` (`schema.graphql:26665`) takes exactly six arguments: `csvUrl` ("URL for the CSV"), `jiraEmail`, `jiraHostname`, `jiraToken`, `teamId` ("Empty to create new team"), `teamName`. `issueImportCheckCSV` (`:40913`) checks "a CSV file validity against a specific import service" — a service name, not a mapping dialect. `issueImportUpdate` (`:26836`) patches a `mapping: JSONObject!`; `issueImportDelete` (`:26814`) takes an id. The Jira, Github, Clubhouse and Asana mutations all add `instantProcess` ("instantly process the import with the default configuration mapping") and an optional `id`. CSV has neither.

Field coverage from the Jira import doc: title, description, assignee, creator, priority, labels, project, **comments**, estimate, due date, **created date**, **parent/child** and **status**. **Relations are absent**, and custom fields "will not import".

The generic `Title / Description / Priority / Status / Created / Labels` template belongs to the **CLI importer**, not the import job, and its docs warn it "will not import data supported by the import assistant like comments or projects".

**Confidence: High** on arguments and the missing `instantProcess`. **Unverified** on the mapping JSON: `IssueImport.mapping` is `JSONObject` (`:20274`), `IssueImportUpdateInput.mapping` is `JSONObject!` (`:20383`). Cheapest test: run `issueImportCreateCSVJira` on a scratch workspace and read the returned `mapping`.

## 5. Does the job keep identifiers, report progress, target an existing team?

**Identifiers only for a new or empty team; progress is exposed but not re-queryable; `teamId` works.**

- The Jira doc states "For new teams, our importer can preserve Jira issue numbers" and "Importing to an existing team that has issues will not match your IDs." CSV needs a single-project file and a new or empty team. `IssueCreateInput` has no `number` or `identifier`, so **API writes can never preserve source numbers**.
- `progress` (`:20278`) is "Current step progress as a percentage (0-100)"; `status` (`:20290`) is the lifecycle. But **no query returns an `IssueImport`**, so you see progress once, in the creation payload.
- Every import mutation takes `teamId`; `IssueImport` exposes only `teamName` (`:20294`).

**Confidence: High** on schema; **Medium** on identifiers (documented, not schema-visible).

## 6. Can rata drive an import end to end, or is a reachable `csvUrl` required?

**rata can host the file itself, but the CSV job cannot be finished headless.**

Linear supplies the upload host: `importFileUpload` (`:25347`) is "XHR request payload to upload a file for import, **directly to Linear's cloud storage**", returning `uploadUrl` ("The pre-signed URL to which the file should be uploaded via a PUT request", `:49425`), `assetUrl` ("The permanent asset URL", `:49401`) and `headers`. So: upload → `PUT` the bytes → `issueImportCheckCSV(assetUrl)` → `issueImportCreateCSVJira(assetUrl, teamId)`.

Step four breaks automation. Without `instantProcess`, the job stops before processing and needs `issueImportProcess(issueImportId, mapping: JSONObject!)` (`:26823`) against an undocumented mapping schema that the web UI normally fills in. rata can stage an import but cannot reliably finish it.

The headless alternative is `issueImportCreateJira` with `instantProcess: true` (`:26768`), but it needs a Jira token and hostname and makes Linear scrape Jira directly.

**Confidence: High** on uploads; **Unverified** on whether `issueImportProcess` accepts a hand-built mapping.

## 7. Cost: import job versus API writes

An import job is roughly five calls regardless of issue count, and the backend fan-out runs outside the caller's limit.

API writes are one request per entity. An API key gets **2,500 requests per hour per user** and 3,000,000 complexity points per hour. A 5,000-issue migration with two comments each exceeds 15,000 requests — six hours minimum, before retries. The docs warn that "Some queries and mutations have individual request rate limits that are lower than the global request limit", and `importIssues.ts:413` backs that up with a hard-coded 60-second backoff on `Ratelimited`. Imported issues are also deletable in bulk within 7 days; API-created ones are not.

**Confidence: High** on limits; **Unverified** on whether aliased mutations in one HTTP request count as one request against the limiter. Cheapest test: one request with ten aliased `issueCreate` calls, then diff `X-RateLimit-Requests-Remaining`.

## Recommendation

Use rata manifest plus batch writes by default: it keeps comments as real comments, works for any source, and runs on the maintainer's API key.
Reach for Linear's import job only when source issue numbers must survive, which no API write can do.

## Implications for rata

- Add `--created-at`/`--completed-at` to issue create and `createdAt` to comment add. Both are create-only; a wrong date needs delete and recreate.
- State plainly that a comment author cannot be kept on an API key. Write the author into the comment's first line as `**Name** · YYYY-MM-DD`; do not fold comments into the description.
- Send a client-generated `id` on `issueCreate`. rata already does this for comments (`src/api/issue-write/comments.ts`); issues lack the idempotency key a retried migration needs.
- Batch writes as aliased mutations in one request, keep the retry on `RATELIMITED` with `Retry-After`, and treat the per-endpoint limit as unknown until measured.
- Do not ship an import command that halts mid-job: either prove upload plus `issueImportProcess`, or document it as a manual web-UI step.
- Record provenance in the manifest (source key, URL, author, timestamp). Warn that identifier preservation forces a new or empty team.
