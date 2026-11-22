import { Context, Effect, Layer } from "effect"

import type { TeamNotFoundError, TeamResolutionError } from "@/api/team"
import type {
  ContextLabelNotFoundError,
  ContextStateNotFoundError,
  ResolvedContext,
} from "@/context/model"
import type { ContextResolveError } from "@/context/resolve"
import type { IssueId, TeamId } from "@/domain/id"
import type { InvalidIssueRef } from "@/domain/issue-ref"
import type { Connection } from "@/linear/connection"
import type { IssueSummaryNode } from "@/linear/decode/issue"
import type { LinearApiError } from "@/linear/errors"
import type {
  AssigneeInputError,
  AssigneeNotFoundError,
  FilterNameNotFoundError,
} from "@/tracker/error"
import type {
  IssueDetail,
  IssueListOptions,
  IssuePage,
  IssueSearchOptions,
  IssueShowOptions,
  IssueStatus,
  IssueStatusOptions,
  IssueSummary,
} from "@/tracker/model"
import type { IssueRefNotFoundError } from "@/tracker/read/batch"
import type { PreparedList } from "@/tracker/read/list-input"

import { ContextResolver } from "@/context/resolve"
import { parseRefOrFail } from "@/domain/issue-ref"
import { maxPageSize } from "@/linear/connection"
import { LinearGateway } from "@/linear/gateway"
import { sortAndLimitNodes, toSummary } from "@/tracker/model"
import { parseBatchRefs, requireBatchRefs } from "@/tracker/read/batch"
import { toIssueDetail } from "@/tracker/read/detail"
import { validateNamedFilters } from "@/tracker/read/filter-check"
import { listInput } from "@/tracker/read/list-input"
import { toIssueStatus } from "@/tracker/read/status"
import { requireTeamId, resolveAssigneeId, resolveIssueId } from "@/tracker/resolve"

type IssueListError =
  | AssigneeInputError
  | AssigneeNotFoundError
  | LinearApiError
  | InvalidIssueRef
  | FilterNameNotFoundError
  | ContextLabelNotFoundError
  | ContextResolveError
  | ContextStateNotFoundError
  | TeamNotFoundError
  | TeamResolutionError
  | IssueRefNotFoundError

type IssueSummaryConnection = Connection<IssueSummaryNode>

type IssueReaderShape = {
  readonly list: (
    context: ResolvedContext,
    options: IssueListOptions,
  ) => Effect.Effect<IssuePage, IssueListError>
  readonly search: (
    context: ResolvedContext,
    term: string,
    options: IssueSearchOptions,
  ) => Effect.Effect<IssuePage, LinearApiError | ContextResolveError | TeamResolutionError>
  readonly show: (
    context: ResolvedContext,
    ref: string,
    options: IssueShowOptions,
  ) => Effect.Effect<IssueDetail, LinearApiError | InvalidIssueRef>
  readonly summary: (
    context: ResolvedContext,
    ref: string,
  ) => Effect.Effect<IssueSummary, LinearApiError | InvalidIssueRef>
  readonly status: (
    context: ResolvedContext,
    ref: string,
    options: IssueStatusOptions,
  ) => Effect.Effect<IssueStatus, IssueListError>
}

class IssueReader extends Context.Service<IssueReader, IssueReaderShape>()(
  "rata-cli/tracker/read/IssueReader",
) {
  static readonly layer = Layer.effect(
    IssueReader,
    Effect.gen(function* issueReaderLayer() {
      const gateway = yield* LinearGateway
      const contexts = yield* ContextResolver

      const prepareList = Effect.fn("IssueReader.prepareList")(function* prepareList(
        context: ResolvedContext,
        options: IssueListOptions,
        overrides: {
          readonly parentId?: IssueId | undefined
          readonly teamId?: TeamId | undefined
        } = {},
      ) {
        const requested = options.ids === undefined ? undefined : yield* parseBatchRefs(options.ids)
        const teamId =
          overrides.teamId ??
          (requested !== undefined && options.team === undefined
            ? undefined
            : yield* requireTeamId(context))
        const assigneeId =
          options.assignee === undefined
            ? undefined
            : yield* resolveAssigneeId(gateway, context, options.assignee)
        const parentId =
          overrides.parentId ??
          (options.parent === undefined
            ? undefined
            : yield* parseRefOrFail(options.parent).pipe(
                Effect.flatMap((ref) => resolveIssueId(gateway, ref)),
              ))
        return {
          requested,
          teamId,
          input: listInput(options, { assigneeId, parentId, requested, teamId }),
        }
      })

      const finishList = Effect.fn("IssueReader.finishList")(function* finishList(
        options: IssueListOptions,
        prepared: PreparedList,
        page: IssueSummaryConnection,
      ) {
        const issues = sortAndLimitNodes(page.nodes, options).map(toSummary)
        const result: IssuePage = { issues, pageInfo: page.pageInfo }
        if (result.issues.length === 0 && prepared.teamId !== undefined) {
          yield* validateNamedFilters(gateway, contexts, prepared.teamId, options)
        }
        const whole = options.after === null && !page.pageInfo.hasNextPage
        if (prepared.requested !== undefined && whole) {
          yield* requireBatchRefs(prepared.requested, issues)
        }
        return result
      })

      const listWith = Effect.fn("IssueReader.listWith")(function* listWith(
        context: ResolvedContext,
        options: IssueListOptions,
        overrides: {
          readonly parentId?: IssueId | undefined
          readonly teamId?: TeamId | undefined
        } = {},
      ) {
        const prepared = yield* prepareList(context, options, overrides)
        const page = yield* gateway.issue.list(prepared.input)
        return yield* finishList(options, prepared, page)
      })

      const list = Effect.fn("IssueReader.list")(function* list(
        context: ResolvedContext,
        options: IssueListOptions,
      ) {
        return yield* listWith(context, options)
      })

      const search = Effect.fn("IssueReader.search")(function* search(
        context: ResolvedContext,
        term: string,
        options: IssueSearchOptions,
      ) {
        const teamId = yield* requireTeamId(context)
        const page = yield* gateway.issue.search(term, {
          teamId,
          after: options.after,
          limit: options.limit,
          ...(options.all === undefined ? {} : { all: options.all }),
        })
        return {
          issues: page.nodes.map(toSummary),
          pageInfo: page.pageInfo,
        }
      })

      const show = Effect.fn("IssueReader.show")(function* showIssue(
        _context: ResolvedContext,
        input: string,
        options: IssueShowOptions,
      ) {
        const ref = yield* parseRefOrFail(input)
        return toIssueDetail(yield* gateway.issue.show(ref, options))
      })

      const summary = Effect.fn("IssueReader.summary")(function* readSummary(
        _context: ResolvedContext,
        input: string,
      ) {
        const ref = yield* parseRefOrFail(input)
        return toSummary(yield* gateway.issue.summary(ref))
      })

      const status = Effect.fn("IssueReader.status")(function* status(
        context: ResolvedContext,
        input: string,
        options: IssueStatusOptions,
      ) {
        const issue = yield* show(context, input, {
          comments: options.comments === true,
          children: false,
        })
        const children =
          options.children === true
            ? yield* listWith(
                context,
                {
                  team: issue.team.id,
                  include: "relations",
                  sort: "priority",
                  after: null,
                  limit: maxPageSize,
                  all: true,
                },
                { parentId: issue.id, teamId: issue.team.id },
              )
            : yield* listWith(
                context,
                {
                  team: issue.team.id,
                  unblocked: true,
                  sort: "priority",
                  after: null,
                  limit: 1,
                },
                { parentId: issue.id, teamId: issue.team.id },
              )
        return toIssueStatus(issue, children.issues, options)
      })

      return IssueReader.of({ list, search, show, status, summary })
    }),
  )
}

export { IssueReader, type IssueListError, type IssueReaderShape }
