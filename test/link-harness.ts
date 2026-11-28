import type { ProfileSeed } from "@test/database-harness"
import type { MemorySeed } from "@test/fake-linear/gateway/model"
import type { Handler } from "@test/fake-linear/model"
import type { Stdio } from "effect"

import { hybridApiLayer } from "@test/fake-linear/hybrid-layer"
import { defaultEnv, defaultViewer } from "@test/fake-linear/model"
import { recordingConsole } from "@test/recording-console"
import { fakeTerminal } from "@test/terminal-harness"
import { Console, Effect, FileSystem, Layer, Option, Path, Schema, Terminal } from "effect"

import type { LinkOptions } from "@/config/link"
import type { RepoConfig } from "@/config/repo/model"

import { LinkService } from "@/config/link"
import { currentDirectory, RepoConfigService } from "@/config/repo"
import { teamId } from "@/domain/id"
import { storedPriority } from "@/domain/priority"
import { Viewer } from "@/linear/decode/viewer"

const ratId = teamId("0f8fad5b-d9cb-469f-a165-70867728950e")

const rat = {
  id: teamId("00000000-0000-0000-0000-000000000001"),
  key: "RAT",
  name: "Rata",
  timezone: "America/Los_Angeles",
}
const scratch = {
  id: teamId("00000000-0000-0000-0000-000000000002"),
  key: "SCR",
  name: "Scratch",
  timezone: "America/Los_Angeles",
}

const authPath = "/home/test/.config/rata/auth.json"
const viewer = Option.getOrThrow(Schema.decodeUnknownOption(Viewer)(defaultViewer))

const makeLinkSeed = (overrides: Partial<MemorySeed> = {}): MemorySeed => ({
  viewer,
  teams: [rat, scratch],
  labels: [],
  ...overrides,
})

const interactive = (input: readonly Terminal.UserInput[]): Pick<Harness, "input" | "stdio"> => ({
  input,
  stdio: { stdinIsTerminal: Effect.succeed(true) },
})

type Harness = {
  readonly config?: RepoConfig
  readonly seed: MemorySeed
  readonly files: Map<string, string>
  readonly profiles: readonly ProfileSeed[]
  readonly stdio: Partial<Stdio.Stdio>
  readonly lines: string[]
  readonly env: Readonly<Record<string, string>>
  readonly input: readonly Terminal.UserInput[]
  readonly output: string[]
}

const makeHarness = (overrides: Partial<Harness> = {}): Harness => ({
  seed: makeLinkSeed(),
  files: new Map(),
  profiles: [],
  stdio: {},
  lines: [],
  env: defaultEnv,
  input: [],
  output: [],
  ...overrides,
})

const options = (overrides: Partial<LinkOptions>): LinkOptions => ({
  team: Option.some("RAT"),
  project: Option.none(),
  workspace: Option.none(),
  create: false,
  name: Option.none(),
  timezone: Option.none(),
  ...overrides,
})

const provide = <A, E>(
  handler: Handler,
  harness: Harness,
  effect: Effect.Effect<
    A,
    E,
    FileSystem.FileSystem | LinkService | Path.Path | RepoConfigService | Terminal.Terminal
  >,
): Promise<A> =>
  effect.pipe(
    Effect.provide(
      Layer.mergeAll(
        hybridApiLayer(handler, harness.seed, {
          files: harness.files,
          profiles: harness.profiles,
          repositories:
            harness.config === undefined
              ? []
              : [
                  {
                    key: process.cwd(),
                    ...harness.config,
                    defaultPriority:
                      harness.config.defaultPriority === undefined
                        ? undefined
                        : (storedPriority(harness.config.defaultPriority) ?? undefined),
                  },
                ],
          stdio: harness.stdio,
          env: harness.env,
        }),
        FileSystem.layerNoop({}),
        Path.layer,
      ),
    ),
    Effect.provideService(Terminal.Terminal, fakeTerminal(harness.input, harness.output)),
    Effect.provideService(Console.Console, recordingConsole(harness.lines)),
    Effect.runPromise,
  )

const linkTeam = (handler: Handler, harness: Harness, linkOptions: LinkOptions) =>
  provide(
    handler,
    harness,
    Effect.gen(function* link() {
      const service = yield* LinkService
      const result = yield* service.link(linkOptions)
      const repoConfig = yield* RepoConfigService
      const directory = yield* currentDirectory
      const stored = yield* repoConfig.read(directory)
      return { result, stored }
    }),
  )

const linkError = (handler: Handler, harness: Harness, linkOptions: LinkOptions) =>
  provide(
    handler,
    harness,
    Effect.gen(function* link() {
      const service = yield* LinkService
      const error = yield* Effect.flip(service.link(linkOptions))
      const repoConfig = yield* RepoConfigService
      const directory = yield* currentDirectory
      const stored = yield* repoConfig.read(directory)
      return { error, stored }
    }),
  )

export {
  authPath,
  interactive,
  linkError,
  linkTeam,
  makeHarness,
  makeLinkSeed,
  options,
  rat,
  ratId,
  scratch,
  type Harness,
}
