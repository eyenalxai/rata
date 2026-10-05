import type { Handler } from "@test/fake-linear"
import type { Stdio } from "effect"

import { apiLayer } from "@test/fake-linear"
import { recordingConsole } from "@test/recording-console"
import { Console, Effect, Option } from "effect"

import type { LabelService } from "@/api/label"
import type { LinkOptions } from "@/config/init-model"

import { InitService } from "@/config/init"

const ratId = "0f8fad5b-d9cb-469f-a165-70867728950e"

const rat = { id: "team-1", key: "RAT", name: "Rata", timezone: "America/Los_Angeles" }
const scratch = { id: "team-2", key: "SCR", name: "Scratch", timezone: "America/Los_Angeles" }

const configPath = () => `${process.cwd()}/.rata.json`

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

type Harness = {
  readonly files: Map<string, string>
  readonly stdio: Partial<Stdio.Stdio>
  readonly lines: string[]
}

const makeHarness = (overrides: Partial<Harness> = {}): Harness => ({
  files: new Map(),
  stdio: {},
  lines: [],
  ...overrides,
})

const options = (overrides: Partial<LinkOptions>): LinkOptions => ({
  team: Option.some("RAT"),
  project: Option.none(),
  workspace: Option.none(),
  create: false,
  name: Option.none(),
  force: false,
  timezone: Option.none(),
  ...overrides,
})

const provide = <A, E>(
  handler: Handler,
  harness: Harness,
  effect: Effect.Effect<A, E, InitService | LabelService>,
): Promise<A> =>
  effect.pipe(
    Effect.provide(apiLayer(handler, { files: harness.files, stdio: harness.stdio })),
    Effect.provideService(Console.Console, recordingConsole(harness.lines)),
    Effect.runPromise,
  )

const linkTeam = (handler: Handler, harness: Harness, linkOptions: LinkOptions) =>
  provide(
    handler,
    harness,
    Effect.gen(function* link() {
      const service = yield* InitService
      return yield* service.link(linkOptions)
    }),
  )

const linkError = (handler: Handler, harness: Harness, linkOptions: LinkOptions) =>
  provide(
    handler,
    harness,
    Effect.gen(function* link() {
      const service = yield* InitService
      return yield* service.link(linkOptions)
    }).pipe(Effect.flip),
  )

const readConfig = (files: Map<string, string>): unknown =>
  JSON.parse(files.get(configPath()) ?? "")

export {
  configPath,
  encode,
  linkError,
  linkTeam,
  makeHarness,
  options,
  provide,
  rat,
  ratId,
  readConfig,
  scratch,
  type Harness,
}
