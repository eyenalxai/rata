import { Context, Effect, Layer } from "effect"

import type { TeamContextShape } from "@/context/team/model"

import { ContextResolver } from "@/context/resolve"

class TeamContext extends Context.Service<TeamContext, TeamContextShape>()(
  "rata-cli/context/team/TeamContext",
) {
  static readonly layer = Layer.effect(
    TeamContext,
    Effect.gen(function* teamContextLayer() {
      const resolver = yield* ContextResolver

      const resolve = Effect.fn("TeamContext.resolve")(function* resolveTeamContext(options: {
        readonly refresh: boolean
      }) {
        const context = yield* resolver.resolve({ refresh: options.refresh })
        const viewer = yield* resolver.viewer(context)
        return {
          team: context.team,
          viewer,
          warning: context.warning,
        }
      })

      return TeamContext.of({ resolve })
    }),
  )
}

export { TeamContext }
