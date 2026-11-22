import type { Effect } from "effect"

import type { ResolvedTeam } from "@/context/model"
import type { ContextResolveError } from "@/context/resolve/model"
import type { Viewer } from "@/linear/decode/viewer"

type ResolvedTeamContext = {
  readonly team: ResolvedTeam | null
  readonly viewer: Viewer
  readonly warning: string | null
}

type TeamContextError = ContextResolveError

type TeamContextShape = {
  readonly resolve: (options: {
    readonly refresh: boolean
  }) => Effect.Effect<ResolvedTeamContext, TeamContextError>
}

export { type ResolvedTeamContext, type TeamContextError, type TeamContextShape }
