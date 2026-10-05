import { describe, expect, test } from "bun:test"
import { Effect, FileSystem, Layer, Option, Path } from "effect"

import type { Team, TeamCreateOptions } from "@/api/team"
import type { InitOptions } from "@/config/init"

import { LabelService } from "@/api/label"
import { TeamService } from "@/api/team"
import { InitService } from "@/config/init"
import { RepoConfigService } from "@/config/repo"
import { agentSkillsBlock, trackerDocument } from "@/matt/tracker-doc"

const configPath = () => `${process.cwd()}/.rata.json`
const trackerPath = () => `${process.cwd()}/docs/agents/issue-tracker.md`
const agentsPath = () => `${process.cwd()}/AGENTS.md`

const makeLayer = (files: Map<string, string>, writes: string[]) => {
  const platform = Layer.mergeAll(
    FileSystem.layerNoop({
      exists: (file) => Effect.succeed(files.has(file)),
      readFileString: (file) => Effect.succeed(files.get(file) ?? ""),
      writeFileString: (file, data) => {
        files.set(file, data)
        writes.push(file)
        return Effect.void
      },
      makeDirectory: () => Effect.void,
    }),
    Path.layer,
  )
  const repoConfigLayer = RepoConfigService.layer.pipe(Layer.provide(platform))
  return InitService.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        repoConfigLayer,
        Layer.succeed(TeamService, {
          list: Effect.succeed([]),
          byKey: (key: string) => Effect.succeed({ id: "team-1", key, name: "Test" }),
          create: (options: TeamCreateOptions) =>
            Effect.succeed({ id: "team-2", key: options.key ?? "TEST", name: options.name }),
          delete: (team: Team) => Effect.succeed({ id: team.id, key: team.key, name: team.name }),
        }),
        Layer.succeed(LabelService, {
          list: () => Effect.succeed([]),
          ensure: () => Effect.succeed({ created: [], existing: [] }),
        }),
        platform,
      ),
    ),
  )
}

const options = (overrides: Partial<InitOptions>): InitOptions => ({
  team: Option.some("RAT"),
  project: Option.none(),
  force: false,
  print: false,
  ensureLabels: false,
  ...overrides,
})

const runInit = (files: Map<string, string>, writes: string[], initOptions: InitOptions) =>
  Effect.gen(function* run() {
    const service = yield* InitService
    return yield* service.run(initOptions)
  }).pipe(Effect.provide(makeLayer(files, writes)), Effect.runPromise)

describe("InitService", () => {
  test("--print returns the tracker document and writes nothing", async () => {
    const files = new Map<string, string>()
    const writes: string[] = []
    const result = await runInit(files, writes, options({ print: true, team: Option.none() }))
    expect(Option.getOrUndefined(result.document)).toContain("# Issue tracker: Linear")
    expect(result.files).toHaveLength(0)
    expect(Option.isNone(result.labels)).toBe(true)
    expect(writes).toHaveLength(0)
    expect(files.size).toBe(0)
  })

  test("creates the config, the tracker document and the agent skills block", async () => {
    const files = new Map<string, string>()
    const writes: string[] = []
    await runInit(files, writes, options({}))
    expect(writes).toEqual([configPath(), trackerPath(), agentsPath()])
    expect(files.get(trackerPath())).toBe(trackerDocument)
    expect(files.get(agentsPath())).toBe(agentSkillsBlock)
    const config: unknown = JSON.parse(files.get(configPath()) ?? "")
    expect(config).toEqual({ team: "RAT" })
  })

  test("a second run with no --force changes nothing", async () => {
    const files = new Map<string, string>()
    const writes: string[] = []
    await runInit(files, writes, options({}))
    writes.length = 0
    const result = await runInit(files, writes, options({}))
    expect(result.files.map((file) => file.action)).toEqual(["unchanged", "unchanged", "unchanged"])
    expect(writes).toHaveLength(0)
    expect(files.has(configPath())).toBe(true)
    expect(files.has(trackerPath())).toBe(true)
    expect(files.has(agentsPath())).toBe(true)
  })

  test("leaves an existing tracker document alone without --force", async () => {
    const files = new Map([[trackerPath(), "# Issue tracker: GitHub\n"]])
    const writes: string[] = []
    const result = await runInit(files, writes, options({}))
    const tracker = result.files.find((file) => file.path === "docs/agents/issue-tracker.md")
    expect(tracker?.action).toBe("skip")
    expect(files.get(trackerPath())).toBe("# Issue tracker: GitHub\n")
    expect(writes).not.toContain(trackerPath())
  })

  test("fails with a clear error when no team is available", async () => {
    const error = await Effect.gen(function* run() {
      const service = yield* InitService
      return yield* service.run(options({ team: Option.none() }))
    }).pipe(Effect.provide(makeLayer(new Map(), [])), Effect.flip, Effect.runPromise)
    expect(error._tag).toBe("InitError")
    if (error._tag === "InitError") {
      expect(error.message).toContain("--team")
    }
  })
})
