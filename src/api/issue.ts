import { Context, Effect, Layer } from "effect"

import type { ResolvedContext } from "@/context/model"
import type { ContextResolveError } from "@/context/resolve"
import type { InvalidIssueRef } from "@/domain/issue-ref"
import type { LinearApiError } from "@/linear/errors"
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
import type { IssueListError } from "@/tracker/read"

import { ContextResolver } from "@/context/resolve"
import { IssueReader } from "@/tracker/read"

type IssueApiShape = {
  readonly list: (options: IssueListOptions) => Effect.Effect<IssuePage, IssueListError>
  readonly search: (
    term: string,
    options: IssueSearchOptions,
  ) => Effect.Effect<IssuePage, ContextResolveError | LinearApiError>
  readonly show: (
    ref: string,
    options: IssueShowOptions,
  ) => Effect.Effect<IssueDetail, ContextResolveError | InvalidIssueRef>
  readonly summary: (
    ref: string,
  ) => Effect.Effect<IssueSummary, ContextResolveError | InvalidIssueRef>
  readonly status: (
    ref: string,
    options: IssueStatusOptions,
  ) => Effect.Effect<IssueStatus, IssueListError>
}

class IssueApi extends Context.Service<IssueApi, IssueApiShape>()("rata-cli/api/issue/IssueApi") {
  static readonly layer = Layer.effect(
    IssueApi,
    Effect.gen(function* issueApiLayer() {
      const contexts = yield* ContextResolver
      const reader = yield* IssueReader

      const withContext = <A, E>(
        options: { readonly team?: string | undefined },
        run: (context: ResolvedContext) => Effect.Effect<A, E>,
      ) => contexts.resolve(options).pipe(Effect.flatMap(run))

      return IssueApi.of({
        list: (options) =>
          withContext({ team: options.team }, (context) => reader.list(context, options)),
        search: (term, options) =>
          withContext({ team: options.team }, (context) => reader.search(context, term, options)),
        show: (ref, options) => withContext({}, (context) => reader.show(context, ref, options)),
        status: (ref, options) =>
          withContext({}, (context) => reader.status(context, ref, options)),
        summary: (ref) => withContext({}, (context) => reader.summary(context, ref)),
      })
    }),
  )
}

export { IssueApi, type IssueApiShape }
