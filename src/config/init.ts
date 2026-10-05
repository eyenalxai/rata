import type { PlatformError } from "effect/PlatformError"

import { Context, Effect, FileSystem, Layer, Option, Path, Schema, Stdio } from "effect"

import type { LinearApiError } from "@/api/errors"
import type { LabelCreateError, LabelEnsureResult } from "@/api/label"
import type { Team, TeamCreateError, TeamNotFoundError, TeamUpdateError } from "@/api/team"
import type { LinkError, LinkTargetOptions, TimezoneChange } from "@/config/link-team"
import type { RepoConfig, RepoConfigError } from "@/config/repo"
import type { InitAction } from "@/domain/init"

import { LabelService } from "@/api/label"
import { TeamService } from "@/api/team"
import { invalidLinkOptions, resolveLinkTeam } from "@/config/link-team"
import { RepoConfigService } from "@/config/repo"
import { planInit } from "@/domain/init"
import { injectAgentSkillsBlock } from "@/matt/agents-block"
import { agentSkillDocuments, agentSkillsBlock, trackerDocument } from "@/matt/tracker-doc"

const configPath = ".rata.json"
const agentsPath = "AGENTS.md"

type InitOptions = {
  readonly team: Option.Option<string>
  readonly project: Option.Option<string>
  readonly force: boolean
  readonly print: boolean
  readonly ensureLabels: boolean
}

type InitFileReport = {
  readonly path: string
  readonly action: InitAction
}

type InitResult = {
  readonly document: Option.Option<string>
  readonly team: Option.Option<string>
  readonly files: readonly InitFileReport[]
  readonly labels: Option.Option<LabelEnsureResult>
}

type LinkOptions = LinkTargetOptions & {
  readonly project: Option.Option<string>
  readonly force: boolean
}

type LinkResult = {
  readonly team: Team
  readonly project: Option.Option<string>
  readonly timezone: Option.Option<TimezoneChange>
  readonly files: readonly InitFileReport[]
  readonly labels: LabelEnsureResult
}

type SetupInput = {
  readonly team: string
  readonly project: Option.Option<string>
  readonly force: boolean
  readonly overwriteConfig: boolean
}

type SetupResult = {
  readonly project: Option.Option<string>
  readonly files: readonly InitFileReport[]
}

class InitError extends Schema.TaggedError<InitError>()("InitError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

const describeFailure =
  (action: string) =>
  (target: string) =>
  (cause: PlatformError): InitError =>
    new InitError({ message: `Could not ${action} ${target}.`, cause })

type InitServiceShape = {
  readonly run: (
    options: InitOptions,
  ) => Effect.Effect<
    InitResult,
    InitError | LabelCreateError | LinearApiError | RepoConfigError | TeamNotFoundError
  >
  readonly link: (
    options: LinkOptions,
  ) => Effect.Effect<
    LinkResult,
    | InitError
    | LabelCreateError
    | LinearApiError
    | LinkError
    | RepoConfigError
    | TeamCreateError
    | TeamNotFoundError
    | TeamUpdateError
  >
}

const projectFrom = (config: RepoConfig): Option.Option<string> =>
  Option.fromUndefinedOr(config.project)

class InitService extends Context.Service<InitService, InitServiceShape>()(
  "rata-cli/config/init/InitService",
) {
  static readonly layer = Layer.effect(
    InitService,
    Effect.gen(function* initServiceLayer() {
      const repoConfig = yield* RepoConfigService
      const teams = yield* TeamService
      const labels = yield* LabelService
      const stdio = yield* Stdio.Stdio
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const readIfExists = Effect.fn("InitService.readIfExists")(function* readIfExists(
        file: string,
      ) {
        const exists = yield* fs.exists(file).pipe(Effect.mapError(describeFailure("read")(file)))
        if (!exists) {
          return Option.none<string>()
        }
        const content = yield* fs
          .readFileString(file)
          .pipe(Effect.mapError(describeFailure("read")(file)))
        return Option.some(content)
      })

      const writeFile = Effect.fn("InitService.writeFile")(function* writeFile(
        file: string,
        content: string,
      ) {
        yield* fs
          .writeFileString(file, content)
          .pipe(Effect.mapError(describeFailure("write")(file)))
      })

      const applySetup = Effect.fn("InitService.applySetup")(function* applySetup(
        input: SetupInput,
      ): Effect.fn.Return<SetupResult, InitError | RepoConfigError> {
        const configFile = yield* repoConfig.filePath
        const root = path.dirname(configFile)
        const agentsFile = path.join(root, agentsPath)

        const existingConfig = yield* repoConfig.read
        const project = Option.orElse(input.project, () =>
          Option.flatMap(existingConfig, projectFrom),
        )
        const config: RepoConfig = Option.isSome(project)
          ? { team: input.team, project: project.value }
          : { team: input.team }

        const documents = yield* Effect.forEach(agentSkillDocuments, (document) =>
          readIfExists(path.join(root, document.path)).pipe(
            Effect.map((existing) => ({ ...document, existing })),
          ),
        )
        const existingAgents = yield* readIfExists(agentsFile)
        const agentsDocument = injectAgentSkillsBlock(
          Option.getOrElse(existingAgents, () => ""),
          agentSkillsBlock,
        )

        const plan = planInit({
          force: input.force,
          config,
          existingConfig,
          documents,
          agentsDocument,
          existingAgents,
        })

        const configAction =
          input.overwriteConfig && plan.config.action === "skip" ? "overwrite" : plan.config.action

        if (configAction === "create" || configAction === "overwrite") {
          yield* repoConfig.write(plan.config.content)
        }

        const changed = plan.documents.filter(
          (document) => document.action === "create" || document.action === "overwrite",
        )
        yield* Effect.forEach(
          changed,
          (document) =>
            Effect.gen(function* writeDocument() {
              const file = path.join(root, document.path)
              const directory = path.dirname(file)
              yield* fs
                .makeDirectory(directory, { recursive: true })
                .pipe(Effect.mapError(describeFailure("create")(directory)))
              yield* writeFile(file, document.content)
            }),
          { discard: true },
        )

        if (plan.agents.action === "create" || plan.agents.action === "overwrite") {
          yield* writeFile(agentsFile, plan.agents.content)
        }

        return {
          project,
          files: [
            { path: configPath, action: configAction },
            ...plan.documents.map((document) => ({
              path: document.path,
              action: document.action,
            })),
            { path: agentsPath, action: plan.agents.action },
          ],
        }
      })

      const resolveTeam = Effect.fn("InitService.resolveTeam")(function* resolveTeam(
        flag: Option.Option<string>,
        existing: Option.Option<RepoConfig>,
      ) {
        const stored = Option.flatMap(existing, (config) => Option.fromUndefinedOr(config.team))
        const team = Option.orElse(flag, () => stored)
        if (Option.isNone(team)) {
          return yield* new InitError({
            message:
              "No team: pass --team <key>, or add a team to .rata.json. Run `rata team list` to see the team keys.",
          })
        }
        return team.value
      })

      const ensureTeamLabels = Effect.fn("InitService.ensureLabels")(function* ensureTeamLabels(
        key: string,
      ) {
        const team = yield* teams.byKey(key)
        return yield* labels.ensure(team.id)
      })

      const run = Effect.fn("InitService.run")(function* runInit(options: InitOptions) {
        if (options.print) {
          return {
            document: Option.some(trackerDocument),
            team: Option.none<string>(),
            files: [],
            labels: Option.none<LabelEnsureResult>(),
          }
        }

        const existingConfig = yield* repoConfig.read
        const team = yield* resolveTeam(options.team, existingConfig)
        const ensured = options.ensureLabels
          ? Option.some(yield* ensureTeamLabels(team))
          : Option.none<LabelEnsureResult>()
        const setup = yield* applySetup({
          team,
          project: options.project,
          force: options.force,
          overwriteConfig: false,
        })

        return {
          document: Option.none<string>(),
          team: Option.some(team),
          files: setup.files,
          labels: ensured,
        }
      })

      const link = Effect.fn("InitService.link")(function* linkRepository(options: LinkOptions) {
        const invalid = invalidLinkOptions(options)
        if (Option.isSome(invalid)) {
          return yield* invalid.value
        }
        const { team, timezone } = yield* resolveLinkTeam(options, { stdio, teams })
        const ensured = yield* labels.ensure(team.id)
        const setup = yield* applySetup({
          team: team.key,
          project: options.project,
          force: options.force,
          overwriteConfig: true,
        })
        return { team, project: setup.project, timezone, files: setup.files, labels: ensured }
      })

      return InitService.of({ link, run })
    }),
  )
}

export {
  InitError,
  InitService,
  type InitFileReport,
  type InitOptions,
  type InitResult,
  type LinkOptions,
  type LinkResult,
}
