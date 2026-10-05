import type { PlatformError } from "effect/PlatformError"

import { Context, Effect, FileSystem, Layer, Option, Path, Schema } from "effect"

import type { LinearApiError } from "@/api/errors"
import type { LabelCreateError, LabelEnsureResult } from "@/api/label"
import type { TeamNotFoundError } from "@/api/team"
import type { RepoConfig, RepoConfigError } from "@/config/repo"
import type { InitAction } from "@/domain/init"

import { LabelService } from "@/api/label"
import { TeamService } from "@/api/team"
import { RepoConfigService } from "@/config/repo"
import { planInit } from "@/domain/init"
import { injectAgentSkillsBlock } from "@/matt/agents-block"
import { agentSkillsBlock, trackerDocument } from "@/matt/tracker-doc"

const configPath = ".rata.json"
const trackerDocumentPath = "docs/agents/issue-tracker.md"
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

      const writeFile = Effect.fn("InitService.writeFile")(function* writeFile(
        file: string,
        content: string,
      ) {
        yield* fs
          .writeFileString(file, content)
          .pipe(Effect.mapError(describeFailure("write")(file)))
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

        const configFile = yield* repoConfig.filePath
        const root = path.dirname(configFile)
        const trackerFile = path.join(root, trackerDocumentPath)
        const agentsFile = path.join(root, agentsPath)

        const existingConfig = yield* repoConfig.read
        const team = yield* resolveTeam(options.team, existingConfig)
        const project = Option.orElse(options.project, () =>
          Option.flatMap(existingConfig, projectFrom),
        )
        const config: RepoConfig = Option.isSome(project)
          ? { team, project: project.value }
          : { team }

        const existingTrackerDocument = yield* readIfExists(trackerFile)
        const existingAgents = yield* readIfExists(agentsFile)
        const agentsDocument = injectAgentSkillsBlock(
          Option.getOrElse(existingAgents, () => ""),
          agentSkillsBlock,
        )

        const plan = planInit({
          force: options.force,
          config,
          existingConfig,
          trackerDocument,
          existingTrackerDocument,
          agentsDocument,
          existingAgents,
        })

        const ensured = options.ensureLabels
          ? Option.some(yield* ensureTeamLabels(team))
          : Option.none<LabelEnsureResult>()

        if (plan.config.action === "create" || plan.config.action === "overwrite") {
          yield* repoConfig.write(plan.config.content)
        }

        if (
          plan.trackerDocument.action === "create" ||
          plan.trackerDocument.action === "overwrite"
        ) {
          const directory = path.dirname(trackerFile)
          yield* fs
            .makeDirectory(directory, { recursive: true })
            .pipe(Effect.mapError(describeFailure("create")(directory)))
          yield* writeFile(trackerFile, plan.trackerDocument.content)
        }

        if (plan.agents.action === "create" || plan.agents.action === "overwrite") {
          yield* writeFile(agentsFile, plan.agents.content)
        }

        return {
          document: Option.none<string>(),
          team: Option.some(team),
          files: [
            { path: configPath, action: plan.config.action },
            { path: trackerDocumentPath, action: plan.trackerDocument.action },
            { path: agentsPath, action: plan.agents.action },
          ],
          labels: ensured,
        }
      })

      return InitService.of({ run })
    }),
  )
}

export { InitError, InitService, type InitFileReport, type InitOptions, type InitResult }
