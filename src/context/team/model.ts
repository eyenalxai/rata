import type { Effect } from "effect"

import { Schema } from "effect"

import type { TeamNotFoundError, TeamResolutionError } from "@/api/team"
import type { AuthStoreError } from "@/config/auth/error"
import type { RepoConfigError } from "@/config/repo"
import type { TeamDetail, TeamLabel, TeamState } from "@/linear/decode/team"
import type { Viewer } from "@/linear/decode/viewer"
import type { LinearApiError } from "@/linear/errors"
import type { ContextCacheError } from "@/local/context-cache"

import { TeamId } from "@/domain/id"

class ContextStateNotFoundError extends Schema.TaggedError<ContextStateNotFoundError>()(
  "ContextStateNotFoundError",
  {
    value: Schema.String,
    teamId: TeamId,
    valid: Schema.Array(Schema.String),
    message: Schema.String,
  },
) {}

class ContextLabelNotFoundError extends Schema.TaggedError<ContextLabelNotFoundError>()(
  "ContextLabelNotFoundError",
  {
    value: Schema.String,
    teamId: TeamId,
    valid: Schema.Array(Schema.String),
    message: Schema.String,
  },
) {}

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

type TeamDetailSnapshot = {
  readonly detail: TeamDetail
  readonly ageSeconds: number
  readonly fetchedAt: number
}

type TeamContextError = AuthStoreError | LinearApiError | RepoConfigError | ContextCacheError

type TeamContextShape = {
  readonly resolve: (options: {
    readonly refresh: boolean
  }) => Effect.Effect<ResolvedTeamContext, TeamContextError | TeamResolutionError>
  readonly resolveState: (
    name: string,
    teamId?: TeamId,
  ) => Effect.Effect<
    TeamState,
    TeamContextError | TeamResolutionError | TeamNotFoundError | ContextStateNotFoundError
  >
  readonly resolveLabel: (
    name: string,
    teamId?: TeamId,
  ) => Effect.Effect<
    TeamLabel,
    TeamContextError | TeamResolutionError | TeamNotFoundError | ContextLabelNotFoundError
  >
}

const findStateByName = (states: readonly TeamState[], name: string): TeamState | undefined =>
  states.find((state) => state.name.toLowerCase() === name.toLowerCase())

const teamAge = (fetchedAt: number, now: number): number =>
  Math.max(0, Math.floor((now - fetchedAt) / 1000))

const validNameText = (subject: "labels" | "states", names: readonly string[]): string =>
  names.length === 0 ? `The team has no ${subject}.` : `Valid ${subject}: ${names.join(", ")}.`

export {
  ContextLabelNotFoundError,
  ContextStateNotFoundError,
  findStateByName,
  type ResolvedTeamContext,
  type TeamContextError,
  type TeamContextShape,
  type TeamDetailSnapshot,
  teamAge,
  validNameText,
}
