import type { Effect } from "effect"

import type { ContextResolveError } from "@/context/resolve"
import type { TeamDetail } from "@/linear/decode/team"
import type { Viewer } from "@/linear/decode/viewer"

type TeamContextTeam = {
  readonly detail: TeamDetail
  readonly ageSeconds: number
  readonly fetchedAt: number
}

type ResolvedTeamContext = {
  readonly team: TeamContextTeam | null
  readonly viewer: Viewer
  readonly warning: string | null
}

type TeamContextError = ContextResolveError

type TeamContextShape = {
  readonly resolve: (options: {
    readonly refresh: boolean
  }) => Effect.Effect<ResolvedTeamContext, TeamContextError>
}

export {
  type ResolvedTeamContext,
  type TeamContextError,
  type TeamContextShape,
  type TeamContextTeam,
}
