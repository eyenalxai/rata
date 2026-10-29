import type { FileSystem, Path, Terminal } from "effect"

import { Context, Effect, Layer, Option, Stdio } from "effect"

import type { LinearApiError } from "@/api/errors"
import type { LabelOperations } from "@/api/label"
import type { Team, TeamCreateError, TeamNotFoundError, TeamUpdateError } from "@/api/team"
import type { AuthStoreError } from "@/config/auth"
import type { LinkTargetOptions, TimezoneChange } from "@/config/link/team"
import type { RepoConfig, RepoConfigError } from "@/config/repo"

import { LinearClient } from "@/api/client"
import { LabelService } from "@/api/label"
import { collectConnection, pageSize } from "@/api/pagination"
import { TeamService } from "@/api/team"
import { Auth } from "@/config/auth"
import { invalidLinkOptions, LinkError, updateTeamTimezone } from "@/config/link/team"
import { resolveLinkTarget } from "@/config/link/workspace"
import { currentDirectory, RepoConfigService } from "@/config/repo"
import { findLabelByName } from "@/domain/labels"

type LinkOptions = LinkTargetOptions & {
  readonly project: Option.Option<string>
}

type LinkResult = {
  readonly team: Team
  readonly project: Option.Option<string>
  readonly workspace: Option.Option<string>
  readonly timezone: Option.Option<TimezoneChange>
}

type LinkServiceShape = {
  readonly link: (
    options: LinkOptions,
  ) => Effect.Effect<
    LinkResult,
    | AuthStoreError
    | LinearApiError
    | LinkError
    | RepoConfigError
    | TeamCreateError
    | TeamNotFoundError
    | TeamUpdateError,
    FileSystem.FileSystem | Path.Path | Terminal.Terminal
  >
}

const projectFrom = (config: RepoConfig): Option.Option<string> =>
  Option.fromUndefinedOr(config.project)

class LinkService extends Context.Service<LinkService, LinkServiceShape>()(
  "rata-cli/config/link/LinkService",
) {
  static readonly layer = Layer.effect(
    LinkService,
    Effect.gen(function* linkServiceLayer() {
      const repoConfig = yield* RepoConfigService
      const teams = yield* TeamService
      const labels = yield* LabelService
      const auth = yield* Auth
      const client = yield* LinearClient
      const stdio = yield* Stdio.Stdio

      const writeConfig = Effect.fn("LinkService.writeConfig")(function* writeConfig(
        team: string,
        project: Option.Option<string>,
        workspace: Option.Option<string>,
      ) {
        const directory = yield* currentDirectory
        const existing = yield* repoConfig.read(directory)
        const resolvedProject = Option.orElse(project, () => Option.flatMap(existing, projectFrom))
        const resolvedWorkspace = Option.orElse(workspace, () =>
          Option.flatMap(existing, (config) => Option.fromUndefinedOr(config.workspace)),
        )
        const config: RepoConfig = {
          ...Option.getOrUndefined(existing),
          team,
          ...(Option.isSome(resolvedProject) ? { project: resolvedProject.value } : {}),
          ...(Option.isSome(resolvedWorkspace) ? { workspace: resolvedWorkspace.value } : {}),
        }
        yield* repoConfig.write(directory, config)
        return { project: resolvedProject, workspace: resolvedWorkspace }
      })

      const validateDefaultLabels = Effect.fn("LinkService.validateDefaultLabels")(
        function* validateStoredLabels(
          team: Team,
          config: Option.Option<RepoConfig>,
          operations: LabelOperations,
        ) {
          if (Option.isNone(config)) {
            return yield* Effect.void
          }
          const stored = config.value
          if (stored.team === team.key) {
            return yield* Effect.void
          }
          const names = stored.defaultLabels ?? []
          if (names.length === 0) {
            return yield* Effect.void
          }
          const available = yield* collectConnection((after) =>
            operations.listAvailable(team.id, { after, limit: pageSize }),
          )
          const missing = names.filter((name) => findLabelByName(available, name) === undefined)
          if (missing.length === 0) {
            return yield* Effect.void
          }
          return yield* new LinkError({
            message: `Team ${team.key} does not have these default labels: ${missing.join(", ")}. Run \`rata config set --label <name>\` with a label of ${team.key}, or \`rata config unset --label\`.`,
          })
        },
      )

      const link = Effect.fn("LinkService.link")(function* linkRepository(options: LinkOptions) {
        const invalid = invalidLinkOptions(options)
        if (Option.isSome(invalid)) {
          return yield* invalid.value
        }
        const target = yield* resolveLinkTarget(options, { auth, client, stdio, teams })
        const existing = yield* repoConfig.read(yield* currentDirectory)
        yield* validateDefaultLabels(target.team, existing, labels.withKey(target.apiKey))
        const updated = yield* updateTeamTimezone(
          target.team,
          options.timezone,
          teams.withKey(target.apiKey),
        )
        const setup = yield* writeConfig(updated.team.key, options.project, target.workspace)
        return {
          team: updated.team,
          project: setup.project,
          workspace: setup.workspace,
          timezone: updated.timezone,
        }
      })

      return LinkService.of({ link })
    }),
  )
}

export { LinkService, type LinkOptions, type LinkResult }
