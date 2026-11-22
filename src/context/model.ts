import { Schema } from "effect"

import type { KeySource } from "@/config/auth"
import type { IssueDefaults } from "@/domain/issue-defaults"
import type { Team, TeamDetail, TeamLabel, TeamState } from "@/linear/decode/team"
import type { Viewer } from "@/linear/decode/viewer"

import { TeamId as TeamIdSchema } from "@/domain/id"

class ContextStateNotFoundError extends Schema.TaggedError<ContextStateNotFoundError>()(
  "ContextStateNotFoundError",
  {
    value: Schema.String,
    teamId: TeamIdSchema,
    valid: Schema.Array(Schema.String),
    message: Schema.String,
  },
) {}

class ContextLabelNotFoundError extends Schema.TaggedError<ContextLabelNotFoundError>()(
  "ContextLabelNotFoundError",
  {
    value: Schema.String,
    teamId: TeamIdSchema,
    valid: Schema.Array(Schema.String),
    message: Schema.String,
  },
) {}

class ContextViewerMissingError extends Schema.TaggedError<ContextViewerMissingError>()(
  "ContextViewerMissingError",
  {
    message: Schema.String,
  },
) {}

type ResolvedTeam = {
  readonly identity: Team
  readonly detail: TeamDetail
  readonly ageSeconds: number
  readonly fetchedAt: number
}

type ResolvedContext = {
  readonly root: string
  readonly profile: string | null
  readonly keySource: KeySource
  readonly viewer: Viewer | null
  readonly team: ResolvedTeam | null
  readonly states: readonly TeamState[]
  readonly labels: readonly TeamLabel[]
  readonly defaults: IssueDefaults
  readonly project: string | null
  readonly storedTeam: string | null
  readonly teamMissing: boolean
  readonly warning: string | null
}

const findStateByName = (states: readonly TeamState[], name: string): TeamState | undefined =>
  states.find((state) => state.name.toLowerCase() === name.toLowerCase())

const findLabelByName = (labels: readonly TeamLabel[], name: string): TeamLabel | undefined =>
  labels.find((label) => label.name.toLowerCase() === name.toLowerCase())

const teamAge = (fetchedAt: number, now: number): number =>
  Math.max(0, Math.floor((now - fetchedAt) / 1000))

const validNameText = (subject: "labels" | "states", names: readonly string[]): string =>
  names.length === 0 ? `The team has no ${subject}.` : `Valid ${subject}: ${names.join(", ")}.`

export {
  ContextLabelNotFoundError,
  ContextStateNotFoundError,
  ContextViewerMissingError,
  findLabelByName,
  findStateByName,
  type ResolvedContext,
  type ResolvedTeam,
  teamAge,
  validNameText,
}
