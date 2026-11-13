import type { Handler } from "@test/fake-linear/model"

import { lastJson } from "@test/cli-harness"
import {
  baseDetail,
  jsonResponse,
  pageInfo,
  readBody,
  summaryNode,
  user,
  uuid,
  withTeamLookup,
} from "@test/issue-fixtures"
import { Option, Schema } from "effect"

const PullRequest = Schema.Struct({
  number: Schema.NullOr(Schema.Finite),
  repo: Schema.NullOr(Schema.String),
  url: Schema.String,
  status: Schema.NullOr(Schema.String),
  draft: Schema.NullOr(Schema.Boolean),
  source: Schema.Literal("linear"),
  checks: Schema.Null,
  mergeCommit: Schema.Null,
})

const StatusChild = Schema.Struct({
  identifier: Schema.String,
  state: Schema.Struct({ name: Schema.String, type: Schema.String }),
  blocked: Schema.Boolean,
  blockedBy: Schema.Array(Schema.Struct({ identifier: Schema.String })),
})

const StatusDocument = Schema.Struct({
  identifier: Schema.String,
  title: Schema.String,
  createdAt: Schema.String,
  state: Schema.Struct({ name: Schema.String, type: Schema.String }),
  priority: Schema.String,
  blocked: Schema.Boolean,
  blockedBy: Schema.Array(
    Schema.Struct({
      identifier: Schema.String,
      state: Schema.Struct({ name: Schema.String, type: Schema.String }),
      closed: Schema.Boolean,
    }),
  ),
  prs: Schema.Array(PullRequest),
  nextChild: Schema.NullOr(Schema.Struct({ identifier: Schema.String })),
  description: Schema.optional(Schema.NullOr(Schema.String)),
  comments: Schema.optional(Schema.Array(Schema.Struct({ id: Schema.String }))),
  children: Schema.optional(Schema.Array(StatusChild)),
})

const ErrorEnvelope = Schema.Struct({
  error: Schema.Struct({
    code: Schema.String,
    message: Schema.String,
    hint: Schema.NullOr(Schema.String),
  }),
})

const statusDocument = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(StatusDocument)(lastJson(lines)))

const errorEnvelope = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(ErrorEnvelope)(lastJson(lines)))

const prAttachment = (id: string, number: number, metadata: Record<string, unknown>) => ({
  id,
  title: `Pull request ${number}`,
  subtitle: "eyenalxai/rata",
  url: `https://github.com/eyenalxai/rata/pull/${number}`,
  sourceType: "github",
  createdAt: "2026-01-02T08:00:00.000Z",
  metadata,
})

const merged = prAttachment("pr-25", 25, {
  number: 25,
  repo: "eyenalxai/rata",
  status: "merged",
  draft: false,
  reviews: 2,
  hasConflicts: false,
  mergedAt: "2026-01-03T10:00:00.000Z",
  closedAt: "2026-01-03T10:00:00.000Z",
})

const open = prAttachment("pr-26", 26, {
  number: 26,
  repoLogin: "eyenalxai",
  repoName: "rata",
  status: "open",
})

const draft = prAttachment("pr-27", 27, {
  number: 27,
  repo: "eyenalxai/rata",
  status: "open",
  draft: true,
})

const withoutMetadata = {
  id: "pr-unknown",
  title: "Pull request without metadata",
  subtitle: "eyenalxai/rata",
  url: "https://github.com/eyenalxai/rata/pull/28",
  sourceType: "github",
  createdAt: "2026-01-02T08:00:00.000Z",
}

const linkAttachment = {
  id: "link-1",
  title: "Design doc",
  subtitle: "Notion",
  url: "https://example.com/doc",
  sourceType: "link",
  createdAt: "2026-01-02T08:00:00.000Z",
}

const openBlocker = {
  id: "i9",
  identifier: "RAT-9",
  title: "Open blocker",
  state: { name: "Todo", type: "unstarted" },
}

const closedBlocker = {
  id: "i10",
  identifier: "RAT-10",
  title: "Closed blocker",
  state: { name: "Done", type: "completed" },
}

const comment = {
  id: "c1",
  body: "First",
  createdAt: "2026-01-01T10:00:00.000Z",
  user,
}

const statusDetail = (attachments: readonly unknown[]) => ({
  ...baseDetail,
  team: { id: uuid, key: "RAT", name: "Rata" },
  inverseRelations: {
    nodes: [openBlocker, closedBlocker].map((issue, index) => ({
      id: `relation-${index}`,
      type: "blocks",
      issue,
    })),
    pageInfo,
  },
  attachments: { nodes: attachments, pageInfo },
})

const childRow = (
  identifier: string,
  priority: number,
  state: { readonly name: string; readonly type: string },
  blockedBy: readonly unknown[],
) => ({
  ...summaryNode(identifier),
  priority,
  state,
  relations: { nodes: [], pageInfo },
  inverseRelations: {
    nodes: blockedBy.map((issue, index) => ({
      id: `${identifier}-relation-${index}`,
      type: "blocks",
      issue,
    })),
    pageInfo,
  },
})

type Captured = Record<string, unknown>[]

const statusHandler = (
  detail: unknown,
  children: readonly unknown[],
  captured: Captured,
  queries: string[] = [],
): Handler =>
  withTeamLookup((request) => {
    const body = readBody(request)
    queries.push(body.query)
    if (body.query.includes("query IssueShow")) {
      return jsonResponse({ data: { issue: detail } })
    }
    if (body.query.includes("query IssueComments")) {
      return jsonResponse({ data: { issue: { comments: { nodes: [comment], pageInfo } } } })
    }
    if (body.query.includes("query IssueList")) {
      captured.push(body.variables)
      return jsonResponse({ data: { issues: { nodes: children, pageInfo } } })
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${body.query}` }] }, 400)
  })

const missingIssueHandler: Handler = () =>
  jsonResponse({ data: null, errors: [{ message: "Entity not found" }] })

export {
  type Captured,
  childRow,
  closedBlocker,
  draft,
  errorEnvelope,
  linkAttachment,
  merged,
  missingIssueHandler,
  open,
  openBlocker,
  statusDetail,
  statusDocument,
  statusHandler,
  withoutMetadata,
}
