import { describe, expect, test } from "bun:test"
import { Effect, FileSystem, Layer, Option, Path, Stdio } from "effect"
import { HttpClient } from "effect/http"

import type { Team, TeamCreateOptions } from "@/api/team"
import type { InitOptions } from "@/config/init-model"

import { LinearClient } from "@/api/client"
import { LabelService } from "@/api/label"
import { TeamService } from "@/api/team"
import { Auth } from "@/config/auth"
import { InitService } from "@/config/init"
import { RepoConfigService } from "@/config/repo"
import {
  agentSkillsBlock,
  domainDocument,
  trackerDocument,
  triageLabelsDocument,
} from "@/matt/tracker-doc"

const configPath = () => `${process.cwd()}/.rata.json`
const trackerPath = () => `${process.cwd()}/docs/agents/issue-tracker.md`
const triagePath = () => `${process.cwd()}/docs/agents/triage-labels.md`
const domainPath = () => `${process.cwd()}/docs/agents/domain.md`
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
    Stdio.layerTest({}),
  )
  const repoConfigLayer = RepoConfigService.layer.pipe(Layer.provide(platform))
  const authLayer = Auth.layer.pipe(Layer.provide(Layer.mergeAll(repoConfigLayer, platform)))
  const clientLayer = LinearClient.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        authLayer,
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make(() => Effect.die("The init tests do not call Linear.")),
        ),
      ),
    ),
  )
  const teams: TeamService["Service"] = {
    list: Effect.succeed([]),
    byKey: (key: string) =>
      Effect.succeed({ id: "team-1", key, name: "Test", timezone: "America/Los_Angeles" }),
    byId: (id: string) =>
      Effect.succeed({ id, key: "TEST", name: "Test", timezone: "America/Los_Angeles" }),
    create: (createOptions: TeamCreateOptions) =>
      Effect.succeed({
        id: "team-2",
        key: createOptions.key ?? "TEST",
        name: createOptions.name,
        timezone: createOptions.timezone ?? "America/Los_Angeles",
      }),
    updateTimezone: (team: Team, timezone: string) => Effect.succeed({ ...team, timezone }),
    delete: (team: Team) => Effect.succeed({ id: team.id, key: team.key, name: team.name }),
    withKey: () => teams,
  }
  const labels: LabelService["Service"] = {
    list: () => Effect.succeed([]),
    listAvailable: () => Effect.succeed([]),
    ensure: () => Effect.succeed({ created: [], existing: [] }),
    withKey: () => labels,
  }
  return InitService.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        repoConfigLayer,
        Layer.succeed(TeamService, teams),
        Layer.succeed(LabelService, labels),
        platform,
        authLayer,
        clientLayer,
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

  test("creates the config, the agent documents and the agent skills block", async () => {
    const files = new Map<string, string>()
    const writes: string[] = []
    await runInit(files, writes, options({}))
    expect(writes).toEqual([configPath(), trackerPath(), triagePath(), domainPath(), agentsPath()])
    expect(files.get(trackerPath())).toBe(trackerDocument)
    expect(files.get(triagePath())).toBe(triageLabelsDocument)
    expect(files.get(domainPath())).toBe(domainDocument)
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
    expect(result.files.map((file) => file.action)).toEqual([
      "unchanged",
      "unchanged",
      "unchanged",
      "unchanged",
      "unchanged",
    ])
    expect(writes).toHaveLength(0)
    expect(files.has(configPath())).toBe(true)
    expect(files.has(trackerPath())).toBe(true)
    expect(files.has(triagePath())).toBe(true)
    expect(files.has(domainPath())).toBe(true)
    expect(files.has(agentsPath())).toBe(true)
  })

  test("leaves existing agent documents alone without --force", async () => {
    const files = new Map([
      [trackerPath(), "# Issue tracker: GitHub\n"],
      [triagePath(), "# Custom triage\n"],
      [domainPath(), "# Custom domain\n"],
    ])
    const writes: string[] = []
    const result = await runInit(files, writes, options({}))
    expect(result.files.map((file) => file.action)).toEqual([
      "create",
      "skip",
      "skip",
      "skip",
      "create",
    ])
    expect(files.get(trackerPath())).toBe("# Issue tracker: GitHub\n")
    expect(files.get(triagePath())).toBe("# Custom triage\n")
    expect(files.get(domainPath())).toBe("# Custom domain\n")
    expect(writes).not.toContain(trackerPath())
    expect(writes).not.toContain(triagePath())
    expect(writes).not.toContain(domainPath())
  })
})
