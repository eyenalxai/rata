import type { Terminal } from "effect"

import { Context, Effect, Layer, Option, Stdio } from "effect"

import type { LinearApiError } from "@/api/errors"
import type { Team, TeamCreateError, TeamNotFoundError, TeamUpdateError } from "@/api/team"
import type { AuthStoreError } from "@/config/auth"
import type { LinkError, LinkTargetOptions, TimezoneChange } from "@/config/link-team"
import type { RepoConfig, RepoConfigError } from "@/config/repo"

import { LinearClient } from "@/api/client"
import { TeamService } from "@/api/team"
import { Auth } from "@/config/auth"
import { invalidLinkOptions } from "@/config/link-team"
import { resolveLinkTarget } from "@/config/link-workspace"
import { RepoConfigService } from "@/config/repo"

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
    Terminal.Terminal
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
      const auth = yield* Auth
      const client = yield* LinearClient
      const stdio = yield* Stdio.Stdio

      const writeConfig = Effect.fn("LinkService.writeConfig")(function* writeConfig(
        team: string,
        project: Option.Option<string>,
        workspace: Option.Option<string>,
      ) {
        const existing = yield* repoConfig.read
        const resolvedProject = Option.orElse(project, () => Option.flatMap(existing, projectFrom))
        const resolvedWorkspace = Option.orElse(workspace, () =>
          Option.flatMap(existing, (config) => Option.fromUndefinedOr(config.workspace)),
        )
        const config: RepoConfig = {
          team,
          ...(Option.isSome(resolvedProject) ? { project: resolvedProject.value } : {}),
          ...(Option.isSome(resolvedWorkspace) ? { workspace: resolvedWorkspace.value } : {}),
        }
        yield* repoConfig.write(config)
        return { project: resolvedProject, workspace: resolvedWorkspace }
      })

      const link = Effect.fn("LinkService.link")(function* linkRepository(options: LinkOptions) {
        const invalid = invalidLinkOptions(options)
        if (Option.isSome(invalid)) {
          return yield* invalid.value
        }
        const target = yield* resolveLinkTarget(options, { auth, client, stdio, teams })
        const setup = yield* writeConfig(target.team.key, options.project, target.workspace)
        return {
          team: target.team,
          project: setup.project,
          workspace: setup.workspace,
          timezone: target.timezone,
        }
      })

      return LinkService.of({ link })
    }),
  )
}

export { LinkService, type LinkOptions, type LinkResult }
