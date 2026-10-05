import type { Handler } from "@test/fake-linear"
import type { Stdio } from "effect"

import { apiLayer, makeFakeLinear } from "@test/fake-linear"
import { recordingConsole } from "@test/recording-console"
import { describe, expect, test } from "bun:test"
import { Console, Effect, Option, Stream } from "effect"

import type { LinkOptions } from "@/config/init"

import { LabelService } from "@/api/label"
import { InitService } from "@/config/init"
import { canonicalLabels } from "@/domain/labels"
import { agentSkillsBlock, trackerDocument } from "@/matt/tracker-doc"

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

const ratId = "0f8fad5b-d9cb-469f-a165-70867728950e"

const rat = { id: "team-1", key: "RAT", name: "Rata" }
const scratch = { id: "team-2", key: "SCR", name: "Scratch" }

const configPath = () => `${process.cwd()}/.rata.json`
const trackerPath = () => `${process.cwd()}/docs/agents/issue-tracker.md`
const agentsPath = () => `${process.cwd()}/AGENTS.md`

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
  create: false,
  name: Option.none(),
  force: false,
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

describe("InitService.link", () => {
  test("links an existing team by key and writes the repository files", async () => {
    const harness = makeHarness()
    const fake = makeFakeLinear({ teams: [rat, scratch], labels: [] })
    const result = await linkTeam(fake.handler, harness, options({}))
    expect(result.team).toEqual(rat)
    expect(readConfig(harness.files)).toEqual({ team: "RAT" })
    expect(harness.files.get(trackerPath())).toBe(trackerDocument)
    expect(harness.files.get(agentsPath())).toBe(agentSkillsBlock)
  })

  test("creates the canonical labels in the linked team", async () => {
    const harness = makeHarness()
    const fake = makeFakeLinear({ teams: [rat, scratch], labels: [] })
    const names = await provide(
      fake.handler,
      harness,
      Effect.gen(function* link() {
        const service = yield* InitService
        const labels = yield* LabelService
        const result = yield* service.link(options({}))
        const all = yield* labels.list(result.team.id)
        return all.map((label) => label.name)
      }),
    )
    expect(names.toSorted()).toEqual([...canonicalLabels].toSorted())
  })

  test("resolves a team given by id and stores the key", async () => {
    const harness = makeHarness()
    const fake = makeFakeLinear({ teams: [{ ...rat, id: ratId }, scratch], labels: [] })
    const result = await linkTeam(fake.handler, harness, options({ team: Option.some(ratId) }))
    expect(result.team).toEqual({ ...rat, id: ratId })
    expect(readConfig(harness.files)).toEqual({ team: "RAT" })
    expect(fake.requests.some((request) => request.query.includes("query TeamById"))).toBe(true)
  })

  test("fails with TeamNotFoundError when the team is missing", async () => {
    const harness = makeHarness()
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const error = await linkError(fake.handler, harness, options({ team: Option.some("NOPE") }))
    expect(error._tag).toBe("TeamNotFoundError")
    if (error._tag === "TeamNotFoundError") {
      expect(error.key).toBe("NOPE")
    }
    expect(harness.files.size).toBe(0)
  })

  test("creates the missing team before linking when --create is passed", async () => {
    const harness = makeHarness()
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const result = await linkTeam(
      fake.handler,
      harness,
      options({
        team: Option.some("LINKZ"),
        create: true,
        name: Option.some("Link Test"),
      }),
    )
    expect(result.team.key).toBe("LINKZ")
    expect(result.team.name).toBe("Link Test")
    expect(readConfig(harness.files)).toEqual({ team: "LINKZ" })
    const create = fake.requests.find((request) => request.query.includes("mutation TeamCreate"))
    expect(create?.variables.input).toEqual({ name: "Link Test", key: "LINKZ" })
  })

  test("rejects --create with a team id", async () => {
    const harness = makeHarness()
    const fake = makeFakeLinear({ teams: [{ ...rat, id: ratId }], labels: [] })
    const error = await linkError(
      fake.handler,
      harness,
      options({ team: Option.some(ratId), create: true, name: Option.some("Link Test") }),
    )
    expect(error._tag).toBe("LinkError")
  })

  test("rejects --create without --name and --name without --create", async () => {
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const missingName = await linkError(fake.handler, makeHarness(), options({ create: true }))
    const strayName = await linkError(
      fake.handler,
      makeHarness(),
      options({ name: Option.some("Rata") }),
    )
    expect(missingName._tag).toBe("LinkError")
    expect(strayName._tag).toBe("LinkError")
  })

  test("records --project in the repository config", async () => {
    const harness = makeHarness()
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const result = await linkTeam(fake.handler, harness, options({ project: Option.some("rata") }))
    expect(readConfig(harness.files)).toEqual({ team: "RAT", project: "rata" })
    expect(result.project).toEqual(Option.some("rata"))
  })

  test("keeps the project of an existing config when --project is absent", async () => {
    const harness = makeHarness({
      files: new Map([[configPath(), '{\n  "team": "OLD",\n  "project": "rata"\n}']]),
    })
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const result = await linkTeam(fake.handler, harness, options({}))
    expect(result.project).toEqual(Option.some("rata"))
    expect(readConfig(harness.files)).toEqual({ team: "RAT", project: "rata" })
  })

  test("records --project over an existing config without --force", async () => {
    const harness = makeHarness({
      files: new Map([[configPath(), '{\n  "team": "RAT"\n}']]),
    })
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const result = await linkTeam(fake.handler, harness, options({ project: Option.some("rata") }))
    expect(result.files.map((file) => file.action)).toEqual(["overwrite", "create", "create"])
    expect(readConfig(harness.files)).toEqual({ team: "RAT", project: "rata" })
  })

  test("leaves the tracker document and AGENTS.md alone without --force", async () => {
    const harness = makeHarness({
      files: new Map([
        [configPath(), '{\n  "team": "OLD"\n}'],
        [trackerPath(), "# Custom tracker\n"],
        [agentsPath(), "# Agents\n"],
      ]),
    })
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const result = await linkTeam(fake.handler, harness, options({}))
    expect(result.files.map((file) => file.action)).toEqual(["overwrite", "skip", "skip"])
    expect(readConfig(harness.files)).toEqual({ team: "RAT" })
    expect(harness.files.get(trackerPath())).toBe("# Custom tracker\n")
    expect(harness.files.get(agentsPath())).toBe("# Agents\n")
  })

  test("overwrites existing files with --force", async () => {
    const harness = makeHarness({
      files: new Map([
        [configPath(), '{\n  "team": "OLD"\n}'],
        [trackerPath(), "# Custom tracker\n"],
        [agentsPath(), "# Agents\n"],
      ]),
    })
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    await linkTeam(fake.handler, harness, options({ force: true }))
    expect(readConfig(harness.files)).toEqual({ team: "RAT" })
    expect(harness.files.get(trackerPath())).toBe(trackerDocument)
    expect(harness.files.get(agentsPath())).toContain(agentSkillsBlock)
  })
})

describe("InitService.link prompt", () => {
  test("prompts with the team list when --team is absent", async () => {
    const harness = makeHarness({
      stdio: {
        stdin: Stream.fromIterable([encode("2\n")]),
        stdinIsTerminal: Effect.succeed(true),
      },
    })
    const fake = makeFakeLinear({ teams: [rat, scratch], labels: [] })
    const result = await linkTeam(fake.handler, harness, options({ team: Option.none() }))
    expect(result.team).toEqual(scratch)
    expect(readConfig(harness.files)).toEqual({ team: "SCR" })
    expect(harness.lines.some((line) => line.includes("1. RAT"))).toBe(true)
    expect(harness.lines.some((line) => line.includes("2. SCR"))).toBe(true)
  })

  test("accepts a team key and re-prompts on an invalid answer", async () => {
    const harness = makeHarness({
      stdio: {
        stdin: Stream.fromIterable([encode("banana\n"), encode("scr\n")]),
        stdinIsTerminal: Effect.succeed(true),
      },
    })
    const fake = makeFakeLinear({ teams: [rat, scratch], labels: [] })
    const result = await linkTeam(fake.handler, harness, options({ team: Option.none() }))
    expect(result.team).toEqual(scratch)
    expect(harness.lines).toContain("Not a team: banana.")
  })

  test("fails after three invalid answers", async () => {
    const harness = makeHarness({
      stdio: {
        stdin: Stream.fromIterable([encode("a\nb\nc\n")]),
        stdinIsTerminal: Effect.succeed(true),
      },
    })
    const fake = makeFakeLinear({ teams: [rat, scratch], labels: [] })
    const error = await linkError(fake.handler, harness, options({ team: Option.none() }))
    expect(error._tag).toBe("LinkError")
    if (error._tag === "LinkError") {
      expect(error.message).toContain("No valid team")
    }
  })

  test("fails without listing teams when standard input is not a terminal", async () => {
    const harness = makeHarness()
    const fake = makeFakeLinear({ teams: [rat, scratch], labels: [] })
    const error = await linkError(fake.handler, harness, options({ team: Option.none() }))
    expect(error._tag).toBe("LinkError")
    if (error._tag === "LinkError") {
      expect(error.message).toContain("--team")
    }
    expect(fake.requests.some((request) => request.query.includes("query Teams"))).toBe(false)
  })

  test("fails when the workspace has no teams", async () => {
    const harness = makeHarness({
      stdio: { stdinIsTerminal: Effect.succeed(true) },
    })
    const fake = makeFakeLinear({ teams: [], labels: [] })
    const error = await linkError(fake.handler, harness, options({ team: Option.none() }))
    expect(error._tag).toBe("LinkError")
    if (error._tag === "LinkError") {
      expect(error.message).toContain("No teams")
    }
  })
})
