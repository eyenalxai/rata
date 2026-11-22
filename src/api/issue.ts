import { Context, Effect, Layer } from "effect"

import type {
  IssueDetail,
  IssueListOptions,
  IssuePage,
  IssueSearchOptions,
  IssueShowOptions,
  IssueStatus,
  IssueStatusOptions,
  IssueSummary,
} from "@/api/issue-model"
import type { IssueRefNotFoundError } from "@/api/issue/batch"
import type {
  AssigneeInputError,
  AssigneeNotFoundError,
  FilterNameNotFoundError,
} from "@/api/issue/filter-check"
import type { TeamNotFoundError, TeamResolutionError } from "@/api/team"
import type { RepoConfigError } from "@/config/repo"
import type {
  ContextLabelNotFoundError,
  ContextStateNotFoundError,
  TeamContextError,
} from "@/context/team/model"
import type { TeamId, UserId } from "@/domain/id"
import type { InvalidIssueRef, IssueRef } from "@/domain/issue-ref"
import type { Connection } from "@/linear/connection"
import type { IssueSummaryNode } from "@/linear/decode/issue"
import type { LinearApiError } from "@/linear/errors"
import type { IssueListOptions as LinearIssueListOptions } from "@/linear/operations/issue/filter"

import { sortAndLimitNodes, toSummary } from "@/api/issue-model"
import { parseBatchRefs, requireBatchRefs } from "@/api/issue/batch"
import { resolveAssignee, validateNamedFilters } from "@/api/issue/filter-check"
import { toIssueDetail } from "@/api/issue/read"
import { toIssueStatus } from "@/api/issue/status"
import { RepoTeam } from "@/api/repo-team"
import { TeamContext } from "@/context/team"
import { isUuid, issueId } from "@/domain/id"
import { parseRefOrFail } from "@/domain/issue-ref"
import { maxPageSize } from "@/linear/connection"
import { LinearGateway } from "@/linear/gateway"

type IssueListError =
  | LinearApiError
  | InvalidIssueRef
  | RepoConfigError
  | TeamNotFoundError
  | TeamResolutionError
  | FilterNameNotFoundError
  | ContextLabelNotFoundError
  | ContextStateNotFoundError
  | TeamContextError
  | AssigneeInputError
  | AssigneeNotFoundError
  | IssueRefNotFoundError

type PreparedList = {
  readonly requested: readonly IssueRef[] | undefined
  readonly teamId: TeamId | undefined
  readonly input: LinearIssueListOptions
}

type MutableListInput = {
  -readonly [K in keyof LinearIssueListOptions]: LinearIssueListOptions[K]
}

const listInput = (
  options: IssueListOptions,
  values: {
    readonly teamId: TeamId | undefined
    readonly assigneeId: UserId | undefined
    readonly parentId: ReturnType<typeof issueId> | undefined
    readonly requested: readonly IssueRef[] | undefined
  },
): LinearIssueListOptions => {
  const input: MutableListInput = { after: options.after, limit: options.limit }
  if (values.teamId !== undefined) {
    input.teamId = values.teamId
  }
  if (options.state !== undefined) {
    input.state = options.state
  }
  if (options.stateType !== undefined) {
    input.stateType = options.stateType
  }
  if (options.priority !== undefined) {
    input.priority = options.priority
  }
  if (options.label !== undefined) {
    input.label = options.label
  }
  if (values.assigneeId !== undefined) {
    input.assigneeId = values.assigneeId
  }
  if (options.unassigned !== undefined) {
    input.unassigned = options.unassigned
  }
  if (options.project !== undefined) {
    input.project = options.project
  }
  if (values.parentId !== undefined) {
    input.parentId = values.parentId
  }
  if (options.text !== undefined) {
    input.text = options.text
  }
  if (options.unblocked !== undefined) {
    input.unblocked = options.unblocked
  }
  if (values.requested !== undefined) {
    input.ids = values.requested
  }
  if (options.include !== undefined) {
    input.include = options.include
  }
  if (options.sort !== undefined) {
    input.sort = options.sort
  }
  if (options.all !== undefined) {
    input.all = options.all
  }
  return input
}

type IssueSummaryConnection = Connection<IssueSummaryNode>

type IssueApiShape = {
  readonly list: (options: IssueListOptions) => Effect.Effect<IssuePage, IssueListError>
  readonly search: (
    term: string,
    options: IssueSearchOptions,
  ) => Effect.Effect<
    IssuePage,
    LinearApiError | RepoConfigError | TeamNotFoundError | TeamResolutionError
  >
  readonly show: (
    ref: string,
    options: IssueShowOptions,
  ) => Effect.Effect<IssueDetail, LinearApiError | InvalidIssueRef>
  readonly summary: (ref: string) => Effect.Effect<IssueSummary, LinearApiError | InvalidIssueRef>
  readonly status: (
    ref: string,
    options: IssueStatusOptions,
  ) => Effect.Effect<IssueStatus, IssueListError>
}

class IssueApi extends Context.Service<IssueApi, IssueApiShape>()("rata-cli/api/issue/IssueApi") {
  static readonly layer = Layer.effect(
    IssueApi,
    Effect.gen(function* issueApiLayer() {
      const gateway = yield* LinearGateway
      const repoTeam = yield* RepoTeam
      const context = yield* TeamContext

      const resolveAssigneeId = (
        value: string,
      ): Effect.Effect<UserId, LinearApiError | AssigneeInputError | AssigneeNotFoundError> =>
        value.toLowerCase() === "me"
          ? gateway.viewer.pipe(Effect.map((viewer) => viewer.id))
          : resolveAssignee(gateway, value)

      const resolveIssueId = Effect.fn("IssueApi.resolveIssueId")(function* resolveIssueId(
        input: string,
      ) {
        const ref = yield* parseRefOrFail(input)
        if (isUuid(ref)) {
          return issueId(ref)
        }
        return yield* gateway.issue.id(ref)
      })

      const prepareList = Effect.fn("IssueApi.prepareList")(function* prepareList(
        options: IssueListOptions,
      ) {
        const requested = options.ids === undefined ? undefined : yield* parseBatchRefs(options.ids)
        const teamId =
          requested !== undefined && options.team === undefined
            ? undefined
            : yield* repoTeam.resolve(options.team)
        const assigneeId =
          options.assignee === undefined ? undefined : yield* resolveAssigneeId(options.assignee)
        const parentId =
          options.parent === undefined ? undefined : yield* resolveIssueId(options.parent)
        return {
          requested,
          teamId,
          input: listInput(options, { assigneeId, parentId, requested, teamId }),
        }
      })

      const finishList = (
        options: IssueListOptions,
        prepared: PreparedList,
        page: IssueSummaryConnection,
      ) => {
        const issues = sortAndLimitNodes(page.nodes, options).map(toSummary)
        const result: IssuePage = { issues, pageInfo: page.pageInfo }
        const checkNames =
          result.issues.length === 0 && prepared.teamId !== undefined
            ? validateNamedFilters(gateway, context, prepared.teamId, options).pipe(
                Effect.map(() => result),
              )
            : Effect.succeed(result)
        const whole = options.after === null && !page.pageInfo.hasNextPage
        return prepared.requested === undefined || !whole
          ? checkNames
          : requireBatchRefs(prepared.requested, issues).pipe(Effect.andThen(checkNames))
      }

      const list = Effect.fn("IssueApi.list")(function* list(options: IssueListOptions) {
        const prepared = yield* prepareList(options)
        const page = yield* gateway.issue.list(prepared.input)
        return yield* finishList(options, prepared, page)
      })

      const search = Effect.fn("IssueApi.search")(function* search(
        term: string,
        options: IssueSearchOptions,
      ) {
        const teamId = yield* repoTeam.resolve(options.team)
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

      const show = Effect.fn("IssueApi.show")(function* showIssue(
        input: string,
        options: IssueShowOptions,
      ) {
        const ref = yield* parseRefOrFail(input)
        return toIssueDetail(yield* gateway.issue.show(ref, options))
      })

      const summary = Effect.fn("IssueApi.summary")(function* readSummary(input: string) {
        const ref = yield* parseRefOrFail(input)
        return toSummary(yield* gateway.issue.summary(ref))
      })

      const status = Effect.fn("IssueApi.status")(function* status(
        input: string,
        options: IssueStatusOptions,
      ) {
        const issue = yield* show(input, {
          comments: options.comments === true,
          children: false,
        })
        const children =
          options.children === true
            ? yield* list({
                team: issue.team.id,
                parent: issue.id,
                include: "relations",
                sort: "priority",
                after: null,
                limit: maxPageSize,
                all: true,
              })
            : yield* list({
                team: issue.team.id,
                parent: issue.id,
                unblocked: true,
                sort: "priority",
                after: null,
                limit: 1,
              })
        return toIssueStatus(issue, children.issues, options)
      })

      return IssueApi.of({ list, search, show, status, summary })
    }),
  )
}

export { IssueApi }
