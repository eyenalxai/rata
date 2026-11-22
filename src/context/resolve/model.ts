import type { Effect } from "effect"

import type { TeamNotFoundError, TeamResolutionError } from "@/api/team"
import type { AuthStoreError } from "@/config/auth/error"
import type { RepoConfigError } from "@/config/repo"
import type { ResolvedContext, ResolvedTeam } from "@/context/model"
import type { DatabaseError } from "@/db/database"
import type { LinearApiError } from "@/linear/errors"
import type { ContextCacheError } from "@/local/context-cache"

type ContextResolveError =
  | AuthStoreError
  | ContextCacheError
  | DatabaseError
  | LinearApiError
  | RepoConfigError
  | TeamNotFoundError
  | TeamResolutionError

type ResolveOptions = {
  readonly refresh?: boolean | undefined
  readonly team?: string | undefined
  readonly requireTeam?: boolean | undefined
  readonly viewer?: boolean | undefined
  readonly withTeam?: boolean | undefined
}

type ContextResolverShape = {
  readonly resolve: (
    options?: ResolveOptions,
  ) => Effect.Effect<ResolvedContext, ContextResolveError>
}

type LinkedTeam = {
  readonly team: ResolvedTeam | null
  readonly missing: boolean
  readonly warning: string | null
}

export { type ContextResolveError, type ContextResolverShape, type LinkedTeam, type ResolveOptions }
