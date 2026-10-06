import type { ProfileSeed } from "@test/database-harness"
import type { Handler } from "@test/fake-linear-model"
import type { Stdio } from "effect"

import { apiLayer } from "@test/fake-linear"
import { defaultEnv } from "@test/fake-linear-model"
import { recordingConsole } from "@test/recording-console"
import { Console, Effect, Option, Terminal } from "effect"

import type { LinkOptions } from "@/config/link"
import type { RepoConfig } from "@/config/repo"

import { LinkService } from "@/config/link"
import { currentDirectory, RepoConfigService } from "@/config/repo"

const ratId = "0f8fad5b-d9cb-469f-a165-70867728950e"

const rat = { id: "team-1", key: "RAT", name: "Rata", timezone: "America/Los_Angeles" }
const scratch = { id: "team-2", key: "SCR", name: "Scratch", timezone: "America/Los_Angeles" }

const authPath = "/home/test/.config/rata/auth.json"

const fakeTerminal = (input: readonly string[]): Terminal.Terminal => {
  let index = 0
  return Terminal.make({
    columns: Effect.succeed(80),
    rows: Effect.succeed(24),
    readInput: Effect.die("unused"),
    readLine: Effect.suspend(() => {
      const line = input[index] ?? ""
      index += 1
      return Effect.succeed(line)
    }),
    display: () => Effect.void,
  })
}

const interactive = (input: string): Pick<Harness, "input" | "stdio"> => ({
  input: input.endsWith("\n") ? input.slice(0, -1).split("\n") : input.split("\n"),
  stdio: { stdinIsTerminal: Effect.succeed(true) },
})

type Harness = {
  readonly config?: RepoConfig
  readonly files: Map<string, string>
  readonly profiles: readonly ProfileSeed[]
  readonly stdio: Partial<Stdio.Stdio>
  readonly lines: string[]
  readonly env: Readonly<Record<string, string>>
  readonly input: readonly string[]
}

const makeHarness = (overrides: Partial<Harness> = {}): Harness => ({
  files: new Map(),
  profiles: [],
  stdio: {},
  lines: [],
  env: defaultEnv,
  input: [],
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
  effect: Effect.Effect<A, E, LinkService | RepoConfigService | Terminal.Terminal>,
): Promise<A> =>
  effect.pipe(
    Effect.provide(
      apiLayer(handler, {
        files: harness.files,
        profiles: harness.profiles,
        repositories:
          harness.config === undefined ? [] : [{ key: process.cwd(), ...harness.config }],
        stdio: harness.stdio,
        env: harness.env,
      }),
    ),
    Effect.provideService(Terminal.Terminal, fakeTerminal(harness.input)),
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
  options,
  rat,
  ratId,
  scratch,
  type Harness,
}
