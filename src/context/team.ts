import { Context, Effect, Layer } from "effect"

import type { TeamContextShape } from "@/context/team/model"

import { ContextViewerMissingError as ContextViewerMissingErrorClass } from "@/context/model"
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
        if (context.viewer === null) {
          return yield* new ContextViewerMissingErrorClass({
            message: "The viewer did not resolve for the team context.",
          })
        }
        return {
          team: context.team,
          viewer: context.viewer,
          warning: context.warning,
        }
      })

      return TeamContext.of({ resolve })
    }),
  )
}

export { TeamContext }
