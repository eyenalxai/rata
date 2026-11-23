import { Console, Context, Effect, Layer, Option, Ref } from "effect"

import type { IssueWriteApiShape } from "@/api/issue-write/shape"
import type { ResolvedContext } from "@/context/model"
import type { ContextResolveError, ResolveOptions } from "@/context/resolve/model"

import { ContextResolver } from "@/context/resolve"
import { IssueWriter } from "@/tracker/write"

const team: ResolveOptions = { viewer: false }

const covers = (context: ResolvedContext, options: ResolveOptions): boolean => {
  if (options.withTeam !== false && context.team === null) {
    return false
  }
  if (options.viewer !== false && context.viewer === null) {
    return false
  }
  if (options.team !== undefined && context.team !== null) {
    return context.team.identity.id === options.team || context.team.identity.key === options.team
  }
  return options.team === undefined
}

const reportWarning = (context: ResolvedContext): Effect.Effect<void> =>
  context.warning === null ? Effect.void : Console.error(`warning: ${context.warning}`)

class IssueWriteApi extends Context.Service<IssueWriteApi, IssueWriteApiShape>()(
  "rata-cli/api/issue-write/IssueWriteApi",
) {
  static readonly layer = Layer.effect(
    IssueWriteApi,
    Effect.gen(function* issueWriteApiLayer() {
      const contexts = yield* ContextResolver
      const writer = yield* IssueWriter
      const cached = yield* Ref.make<Option.Option<ResolvedContext>>(Option.none())
      const warned = yield* Ref.make(false)

      const withContext = <A, E>(
        options: ResolveOptions,
        run: (context: ResolvedContext) => Effect.Effect<A, E>,
        report = false,
      ): Effect.Effect<A, E | ContextResolveError> =>
        Effect.gen(function* runWithContext() {
          const current = yield* Ref.get(cached)
          const context =
            Option.isSome(current) && covers(current.value, options)
              ? current.value
              : yield* contexts.resolve(options)
          if (Option.isNone(current) || !covers(current.value, options)) {
            yield* Ref.set(cached, Option.some(context))
            yield* Ref.set(warned, false)
          }
          if (report && context.warning !== null && !(yield* Ref.get(warned))) {
            yield* reportWarning(context)
            yield* Ref.set(warned, true)
          }
          return yield* run(context)
        })

      return IssueWriteApi.of({
        close: (ref, body, options) =>
          withContext(team, (context) => writer.close(context, ref, body, options), true),
        create: (options) =>
          withContext(
            { requireTeam: true, team: options.team, viewer: false },
            (context) => writer.create(context, options),
            true,
          ),
        planCreate: (options) =>
          withContext(
            { requireTeam: true, team: options.team, viewer: false },
            (context) => writer.planCreate(context, options),
            true,
          ),
      })
    }),
  )
}

export { IssueWriteApi }
