import { Context, Effect, Layer, Option, Schema } from "effect"

import type { LinearApiError } from "@/api/errors"
import type { LabelNotFoundError } from "@/api/label"
import type { TeamNotFoundError } from "@/api/team"
import type { RepoConfig, RepoConfigError } from "@/config/repo"

import { LabelService } from "@/api/label"
import { RepoTeam } from "@/api/repo-team"
import { TeamResolutionError } from "@/api/team"
import { currentDirectory, RepoConfigService } from "@/config/repo"
import { storedPriority, toPriority } from "@/domain/priority"

const IssueDefaults = Schema.Struct({
  assignee: Schema.NullOr(Schema.String),
  labels: Schema.Array(Schema.String),
  priority: Schema.NullOr(Schema.Int),
})

type IssueDefaults = typeof IssueDefaults.Type

const DefaultsDocument = Schema.Struct({
  assignee: Schema.NullOr(Schema.String),
  labels: Schema.Array(Schema.String),
  priority: Schema.NullOr(Schema.String),
})

type DefaultsDocument = typeof DefaultsDocument.Type

const issueDefaults = (config?: RepoConfig): IssueDefaults => ({
  assignee: config?.defaultAssignee ?? null,
  labels: config?.defaultLabels ?? [],
  priority: config?.defaultPriority ?? null,
})

const defaultsDocument = (defaults: IssueDefaults): DefaultsDocument => ({
  assignee: defaults.assignee,
  labels: defaults.labels,
  priority: defaults.priority === null ? null : toPriority(defaults.priority),
})

const formatDefaults = (document: DefaultsDocument): string => {
  const parts: string[] = []
  if (document.assignee !== null) {
    parts.push(`assignee ${document.assignee}`)
  }
  if (document.labels.length > 0) {
    parts.push(`labels ${document.labels.join(", ")}`)
  }
  if (document.priority !== null) {
    parts.push(`priority ${document.priority}`)
  }
  return parts.length === 0 ? "none" : parts.join(", ")
}

type SetDefaultsOptions = {
  readonly assignee?: string | undefined
  readonly labels?: readonly string[] | undefined
  readonly priority?: number | undefined
  readonly dryRun?: boolean | undefined
}

type UnsetDefaultsOptions = {
  readonly assignee: boolean
  readonly labels: boolean
  readonly priority: boolean
  readonly dryRun?: boolean | undefined
}

type IssueDefaultsError =
  | LabelNotFoundError
  | LinearApiError
  | RepoConfigError
  | TeamNotFoundError
  | TeamResolutionError

type IssueDefaultsServiceShape = {
  readonly show: Effect.Effect<IssueDefaults, RepoConfigError>
  readonly set: (options: SetDefaultsOptions) => Effect.Effect<IssueDefaults, IssueDefaultsError>
  readonly unset: (
    options: UnsetDefaultsOptions,
  ) => Effect.Effect<IssueDefaults, IssueDefaultsError>
}

type DraftRepoConfig = { -readonly [Key in keyof RepoConfig]: RepoConfig[Key] }

const configWithDefaults = (config: RepoConfig, defaults: IssueDefaults): RepoConfig => {
  const next: DraftRepoConfig = { ...config }
  if (defaults.assignee === null) {
    delete next.defaultAssignee
  } else {
    next.defaultAssignee = defaults.assignee
  }
  if (defaults.labels.length === 0) {
    delete next.defaultLabels
  } else {
    next.defaultLabels = defaults.labels
  }
  if (defaults.priority === null) {
    delete next.defaultPriority
  } else {
    next.defaultPriority = defaults.priority
  }
  return next
}

const isNone = (value: string): boolean => value.toLowerCase() === "none"

class IssueDefaultsService extends Context.Service<
  IssueDefaultsService,
  IssueDefaultsServiceShape
>()("rata-cli/config/defaults/IssueDefaultsService") {
  static readonly layer = Layer.effect(
    IssueDefaultsService,
    Effect.gen(function* issueDefaultsLayer() {
      const repoConfig = yield* RepoConfigService
      const repoTeam = yield* RepoTeam
      const labels = yield* LabelService

      const readConfig = Effect.fn("IssueDefaults.readConfig")(function* readStoredConfig() {
        return Option.getOrUndefined(yield* repoConfig.read(yield* currentDirectory))
      })

      const show = readConfig().pipe(Effect.map(issueDefaults))

      const requireLinkedConfig = Effect.fn("IssueDefaults.requireLinked")(function* linked() {
        const config = yield* readConfig()
        if (config === undefined || config.team === undefined) {
          return yield* new TeamResolutionError({
            message: "No repository link. Run `rata link --team <key>` first.",
          })
        }
        const teamId = yield* repoTeam.resolve(config.team)
        return { config, teamId }
      })

      const resolveLabels = Effect.fn("IssueDefaults.resolveLabels")(function* resolveLabelNames(
        teamId: string,
        names: readonly string[],
      ) {
        const resolved: string[] = []
        const seen = new Set<string>()
        for (const name of names) {
          const label = yield* labels.byName(teamId, name)
          if (!seen.has(label.id)) {
            seen.add(label.id)
            resolved.push(label.name)
          }
        }
        return resolved
      })

      const write = Effect.fn("IssueDefaults.write")(function* writeDefaults(
        config: RepoConfig,
        defaults: IssueDefaults,
      ) {
        yield* repoConfig.write(yield* currentDirectory, configWithDefaults(config, defaults))
      })

      const set = Effect.fn("IssueDefaults.set")(function* setDefaults(
        options: SetDefaultsOptions,
      ) {
        const { config, teamId } = yield* requireLinkedConfig()
        const current = issueDefaults(config)
        const resolvedLabels =
          options.labels === undefined
            ? current.labels
            : yield* resolveLabels(teamId, options.labels)
        const next: IssueDefaults = {
          assignee:
            options.assignee === undefined
              ? current.assignee
              : isNone(options.assignee)
                ? null
                : options.assignee,
          labels: resolvedLabels,
          priority:
            options.priority === undefined ? current.priority : storedPriority(options.priority),
        }
        if (options.dryRun !== true) {
          yield* write(config, next)
        }
        return next
      })

      const unset = Effect.fn("IssueDefaults.unset")(function* unsetDefaults(
        options: UnsetDefaultsOptions,
      ) {
        const config = yield* readConfig()
        const current = issueDefaults(config)
        const next: IssueDefaults = {
          assignee: options.assignee ? null : current.assignee,
          labels: options.labels ? [] : current.labels,
          priority: options.priority ? null : current.priority,
        }
        if (options.dryRun !== true && config !== undefined) {
          yield* write(config, next)
        }
        return next
      })

      return IssueDefaultsService.of({ set, show, unset })
    }),
  )
}

export {
  type DefaultsDocument,
  defaultsDocument,
  formatDefaults,
  type IssueDefaults,
  type IssueDefaultsError,
  IssueDefaultsService,
  issueDefaults,
}
