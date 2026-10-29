# Pull request awareness for a Linear issue

Linear already stores the pull request, its state and its review state on the issue as an Attachment, and the GraphQL API exposes all of it in one request. rata reads attachments today but drops the field that matters: `metadata`. `--with-prs` can therefore project data rata already fetches, with no GitHub auth, no `gh` dependency and no extra round trip. Reading GitHub directly is weaker: the PR text no longer names the current identifier.

## 1. Does Linear hold PR state on the issue, or only as an Attachment?

**Only as an Attachment**, in the public API.

- `Issue` has no pull-request field: counting `pullRequest` inside the `Issue` type block returns `0`. The closest link field is `branchName: String!` (`schema.graphql:4768`).
- A `PullRequest` type exists (`schema.graphql:39024`) but is unreachable from `Issue`. It hangs off `AgentSession.pullRequests` (`:845`) and an internal git-scan payload (`:43378`), and is `[Internal]`.
- The source type is a free string, not an enum: `sourceType: String` (`schema.graphql:4766`), "the integration type (e.g., 'github', 'slack', 'zendesk') or 'unknown'". `AttachmentSourceType` does not exist. Observed live value: `github`.

Confidence: high.

## 2. Does an attachment carry a state, a review state, or only text and a URL?

**It carries state and review state, in `metadata`.**

- `Attachment.metadata: JSONObject!` (`schema.graphql:4754`): "Integration-specific metadata … may include fields such as pull request status, review counts, commit information…". Also `title` (`:4779`), `subtitle` (`:4770`), `url` (`:4783`), `sourceType` (`:4766`), `source: JSONObject` (`:4762`).
- A live read-only probe (stored API key, never printed) for `RATA-90` → `github.com/eyenalxai/rata/pull/22` returned `status: "merged"`, `draft: false`, `linkKind: "closes"`, `reviews: []`, `reviewerDetails: []`, `number: 22`, `branch`, `repoLogin`, `repoName`, `hasConflicts: false`, `isPullRequestProjection: true`, `mergedAt`, `closedAt`. Observed `status`: `open`, `merged`. GitLab shape unverified.

rata requests none of it. `src/api/issue-query.ts:33`:
`const attachmentFields = "id title subtitle url sourceType createdAt"`
and `src/api/issue-schema.ts:88-96` mirrors those six fields.

Confidence: high for GitHub; unverified for GitLab.

## 3. Does the GitHub integration fill those attachments, and is installing it required?

**Yes to both.** The docs require a GitHub org owner (or repo admin for repo-only access) to install the app under Settings → Integrations → GitHub. Without it an issue has no attachments.

Live: `RATA-95` returns `"attachments": []` (no PR yet) while `RATA-84`…`RATA-90` each carry a `github` attachment. A query for `integrations(first: 10) { nodes { service } }` returns `github` and `githubCodeAccessPersonal`.

Confidence: high.

## 4. If rata read GitHub directly, what auth exists?

**Only the `gh` CLI.** rata stores no GitHub credential.

- `profiles` holds Linear API keys only (`src/db/schema.ts:4-7`). `repositories` holds `key, team, project, workspace, defaultAssignee, defaultLabels, defaultPriority` (`:9-16`). `RepoConfig` matches, with no GitHub field (`src/config/repo.ts:13-20`).
- Auth reads `LINEAR_API_KEY` or a stored profile (`src/config/auth.ts:92`); all calls go to `https://api.linear.app/graphql` (`src/api/client.ts:15`).
- Runtime: `gh auth status` → logged in as `eyenalxai` (keyring), scopes `gist`, `read:org`, `repo`. `GH_TOKEN` and `GITHUB_TOKEN` are unset. `gh repo view` resolves `eyenalxai/rata`.
- Host: `gh` speaks GitHub only. GitLab would need `glab`, absent here. Linear covers both hosts.
- Requests: the attachment path is **1 Linear request** (`pageSize = 50`, `src/api/pagination.ts:25`). Today `issue show` costs 6 — show, labels, children, relations, inverseRelations, attachments (`src/api/issue/read.ts:97-103`). The `gh` path costs 1 search plus 1 per PR.

Confidence: high.

## 5. What maps an issue to its PR, and which is reliable?

**The Linear attachment. Nothing else survives this repository's workflow.**

- `gh pr view 22` → title `docs: describe the 0.8.0 surface and release it`, head ref `docs/release-0-8-0`, body naming `RATA-82` and `RATA-77`. Linear attached it to **RATA-90** ("Document rata v0.8.0 surface and ship the release").
- `gh pr view 21` → body naming `RATA-81`, branch `feat/show-output-all`; attached to **RATA-89** ("Add issue show output modes and --all pagination").
- `gh pr list --state all --search "RATA-90"` → `[]`. `--search "RATA-89 in:title"` → `[]`.

Identifiers were renumbered. Linear re-pointed the attachments; the PR text kept the old numbers. Body, title and branch matching are stale by construction.

The repo convention ignores identifiers: `git branch` shows `feat/agent-friendly-cli`, `docs/release-0-8-0`, `chore/remove-rift-mentions`, `research/linear-pagination-facts`. `git log --all --format='%s' | grep -o 'RATA-[0-9]*'` returns nothing. There is no `Fixes RATA-42` convention to rely on.

Confidence: high.

## 6. Does Linear's GitHub integration already report the PR for a branch that references the identifier?

**Yes, when the integration is installed.** The docs state that a branch name containing the issue ID auto-links, and that an unlink returns on the next push unless the description says `skip ENG-123`. Runtime shows both `closes` and `contributes` `linkKind` values. The link binds to the issue identity, not the typed identifier — which is why it outlived the renumbering above.

Confidence: high.

## 7. Does the API expose an issue→PR link anywhere besides Attachment?

**No.** `gitHubIssueLink`, `linkedPullRequests`, `Issue.pullRequests` and a top-level `pullRequest` query all return nothing. Adjacent helpers do not replace it: `Query.attachment(id:)` (`:39809`), `Query.attachments` (`:39836`), `Query.attachmentsForURL` (`:39869`). `AttachmentCollectionFilter.sourceType` and `IssueFilter.attachments` do allow a server-side filter — verified working live: `attachments(filter: { sourceType: { eq: "github" } })`. `Integration.service: String!` (`:17035`) tells rata whether `github` is installed, so an empty list can be explained.

Confidence: high.

## Options

| Option                     | Auth                            | Requests per issue                | Reliability                                                 | Setup cost                                 |
| -------------------------- | ------------------------------- | --------------------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| Linear attachment only     | existing Linear API key         | 0 extra (same 1 attachment query) | High on GitHub; unverified on GitLab; needs the integration | None for rata; org installs the GitHub app |
| Linear + `gh` CLI fallback | Linear key + `gh` login         | 1 search + 1 per PR               | Low: identifier search returned `[]` for both real PRs      | Medium; machine-bound, GitHub only         |
| GitHub token in config/db  | new secret schema and migration | 1–2 per issue                     | Medium; still needs the issue→repo mapping                  | High; new credential surface               |
| None (status quo)          | Linear key                      | 0                                 | n/a: attachments fetched, `metadata` dropped                | None                                       |

## Recommendation

Project `Attachment.metadata` and never call GitHub. Add `metadata` to `attachmentFields` and filter the connection to `sourceType: { eq: "github" }`. Derive state from `metadata.status`, `draft`, `reviews` and `linkKind`, and treat a missing `status` as unknown, not "open". Keep `gh` out of the read path.

## Implications for rata

- `rata issue show RATA-42 --with-prs` — add a `pullRequests` array from attachments where `sourceType === "github"`: `{ number, url, state, draft, linkKind, branch, repo, reviews }`.
- Extend `src/api/issue-query.ts:33` to include `metadata`, and add `filter: { sourceType: { eq: "github" } }` at line 40; extend `IssueAttachment` (`src/api/issue-schema.ts:88`) with a defensively decoded metadata field.
- `rata pr status RATA-42` — read-only, one request, prints `merged`/`open`/`draft` and review counts; `--json` emits the same object.
- `rata next --parent RATA-1 --with-prs` — add `attachments(first: 3, filter: { sourceType: { eq: "github" } })` to the list query at `src/cli/next.ts:26`.
- Keep `--no-attachments` (`src/cli/issue/show.ts:45`) as the escape hatch; `--with-prs` must not re-fetch.
- Update `formatIssueDetail` (`src/cli/issue/format.ts:58`) to print `PR #22 merged`, not a bare title and URL.
- Document in `README.md` and `docs/agents/issue-tracker.md` that PR state comes from Linear attachments and needs the GitHub integration; `rata status` can distinguish "no linked PR" from "no integration". Never use `gh pr list --search "<ID>"`; both real PRs here prove it misses.
