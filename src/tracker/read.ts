import { Context, Effect, Layer } from "effect"

import type { TeamNotFoundError, TeamResolutionError } from "@/api/team"
import type {
  ContextLabelNotFoundError,
  ContextStateNotFoundError,
  ResolvedContext,
} from "@/context/model"
import type { ContextResolveError } from "@/context/resolve/model"
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
  IssueListOptions,
  IssuePage,
  IssueReadDocument,
  IssueSearchOptions,
  IssueWorkingSetOptions,
} from "@/tracker/model"
import type { IssueRefNotFoundError } from "@/tracker/read/batch"
import type { PreparedList } from "@/tracker/read/list-input"

import { ContextResolver } from "@/context/resolve"
import { parseRefOrFail } from "@/domain/issue-ref"
import { LinearGateway } from "@/linear/gateway"
import { sortAndLimitNodes, toSummary } from "@/tracker/model"
import { parseBatchRefs, requireBatchRefs } from "@/tracker/read/batch"
import { validateNamedFilters } from "@/tracker/read/filter-check"
import { listInput } from "@/tracker/read/list-input"
import { toFullWorkingSet, toWorkingSet } from "@/tracker/read/working-set"
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

type IssueWorkingSetError = InvalidIssueRef | IssueRefNotFoundError | LinearApiError

type IssueSummaryConnection = Connection<IssueSummaryNode>

type IssueWorkingSetPage = {
  readonly items: readonly IssueReadDocument[]
  readonly pageInfo: IssuePage["pageInfo"]
}

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
  readonly workingSet: (
    refs: readonly string[],
    options: IssueWorkingSetOptions,
  ) => Effect.Effect<IssueWorkingSetPage, IssueWorkingSetError>
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
      ) {
        const teamId = yield* requireTeamId(context)
        const assigneeId =
          options.assignee === undefined
            ? undefined
            : yield* resolveAssigneeId(gateway, contexts, context, options.assignee)
        const parentId =
          options.parent === undefined
            ? undefined
            : yield* parseRefOrFail(options.parent).pipe(
                Effect.flatMap((ref) => resolveIssueId(gateway, ref)),
              )
        return {
          teamId,
          input: listInput(options, { assigneeId, parentId, teamId }),
        }
      })

      const finishList = Effect.fn("IssueReader.finishList")(function* finishList(
        context: ResolvedContext,
        options: IssueListOptions,
        prepared: PreparedList,
        page: IssueSummaryConnection,
      ) {
        const issues = sortAndLimitNodes(page.nodes, options).map(toSummary)
        const result: IssuePage = { issues, pageInfo: page.pageInfo }
        if (result.issues.length === 0 && prepared.teamId !== undefined) {
          yield* validateNamedFilters(gateway, contexts, context, options)
        }
        return result
      })

      const list = Effect.fn("IssueReader.list")(function* list(
        context: ResolvedContext,
        options: IssueListOptions,
      ) {
        const prepared = yield* prepareList(context, options)
        const page = yield* gateway.issue.list(prepared.input)
        return yield* finishList(context, options, prepared, page)
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

      const workingSet = Effect.fn("IssueReader.workingSet")(function* readWorkingSet(
        refs: readonly string[],
        options: IssueWorkingSetOptions,
      ) {
        const requested = yield* parseBatchRefs(refs)
        const page = yield* gateway.issue.workingSet(requested, options)
        yield* requireBatchRefs(requested, page.nodes)
        const order = <Node extends { readonly id: string; readonly identifier: string }>(
          nodes: readonly Node[],
        ) =>
          Effect.gen(function* orderWorkingNodes() {
            const byRef = new Map(
              nodes.flatMap((node) => [[node.id, node] as const, [node.identifier, node] as const]),
            )
            const ordered: Node[] = []
            for (const ref of requested) {
              const node = byRef.get(ref)
              if (node === undefined) {
                return yield* Effect.die(`The working-set read lost the issue ${ref}.`)
              }
              ordered.push(node)
            }
            return ordered
          })
        if (page.mode === "summary") {
          const nodes = yield* order(page.nodes)
          return { items: nodes.map(toSummary), pageInfo: page.pageInfo }
        }
        if (page.mode === "full") {
          const nodes = yield* order(page.nodes)
          return { items: nodes.map(toFullWorkingSet), pageInfo: page.pageInfo }
        }
        const nodes = yield* order(page.nodes)
        return { items: nodes.map(toWorkingSet), pageInfo: page.pageInfo }
      })

      return IssueReader.of({ list, search, workingSet })
    }),
  )
}

export {
  IssueReader,
  type IssueListError,
  type IssueReaderShape,
  type IssueWorkingSetError,
  type IssueWorkingSetPage,
}
