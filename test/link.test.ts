import { makeFakeLinear } from "@test/fake-linear"
import {
  configPath,
  linkError,
  linkTeam,
  makeHarness,
  options,
  provide,
  rat,
  ratId,
  readConfig,
  scratch,
} from "@test/link-harness"
import { describe, expect, test } from "bun:test"
import { Effect, Option } from "effect"

import { LabelService } from "@/api/label"
import { InitService } from "@/config/init"
import { canonicalLabels } from "@/domain/labels"
import {
  agentSkillsBlock,
  domainDocument,
  trackerDocument,
  triageLabelsDocument,
} from "@/matt/tracker-doc"

const trackerPath = () => `${process.cwd()}/docs/agents/issue-tracker.md`
const triagePath = () => `${process.cwd()}/docs/agents/triage-labels.md`
const domainPath = () => `${process.cwd()}/docs/agents/domain.md`
const agentsPath = () => `${process.cwd()}/AGENTS.md`

describe("InitService.link", () => {
  test("links an existing team by key and writes the repository files", async () => {
    const harness = makeHarness()
    const fake = makeFakeLinear({ teams: [rat, scratch], labels: [] })
    const result = await linkTeam(fake.handler, harness, options({}))
    expect(result.team).toEqual(rat)
    expect(harness.files.get(trackerPath())).toBe(trackerDocument)
    expect(harness.files.get(triagePath())).toBe(triageLabelsDocument)
    expect(harness.files.get(domainPath())).toBe(domainDocument)
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
        timezone: Option.some("Europe/Amsterdam"),
      }),
    )
    expect(result.team.key).toBe("LINKZ")
    expect(result.team.name).toBe("Link Test")
    const create = fake.requests.find((request) => request.query.includes("mutation TeamCreate"))
    expect(create?.variables.input).toEqual({
      name: "Link Test",
      key: "LINKZ",
      timezone: "Europe/Amsterdam",
    })
    expect(fake.requests.some((request) => request.query.includes("mutation TeamUpdate"))).toBe(
      false,
    )
  })

  test("updates the team timezone when the machine timezone differs", async () => {
    const harness = makeHarness()
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const result = await linkTeam(
      fake.handler,
      harness,
      options({ timezone: Option.some("Europe/Amsterdam") }),
    )
    expect(result.team.timezone).toBe("Europe/Amsterdam")
    expect(result.timezone).toEqual(
      Option.some({ previous: "America/Los_Angeles", current: "Europe/Amsterdam" }),
    )
    const update = fake.requests.find((request) => request.query.includes("mutation TeamUpdate"))
    expect(update?.variables).toEqual({ id: "team-1", input: { timezone: "Europe/Amsterdam" } })
  })

  test("does not update the team timezone when it matches", async () => {
    const harness = makeHarness()
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const result = await linkTeam(
      fake.handler,
      harness,
      options({ timezone: Option.some(rat.timezone) }),
    )
    expect(Option.isNone(result.timezone)).toBe(true)
    expect(fake.requests.some((request) => request.query.includes("mutation TeamUpdate"))).toBe(
      false,
    )
  })

  test("does not update the team timezone when the machine reports none", async () => {
    const harness = makeHarness()
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const result = await linkTeam(fake.handler, harness, options({}))
    expect(Option.isNone(result.timezone)).toBe(true)
    expect(fake.requests.some((request) => request.query.includes("mutation TeamUpdate"))).toBe(
      false,
    )
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

  test("records --workspace in the repository config", async () => {
    const harness = makeHarness()
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const result = await linkTeam(
      fake.handler,
      harness,
      options({ workspace: Option.some("work") }),
    )
    expect(readConfig(harness.files)).toEqual({ team: "RAT", workspace: "work" })
    expect(result.workspace).toEqual(Option.some("work"))
  })

  test("keeps the workspace of an existing config when --workspace is absent", async () => {
    const harness = makeHarness({
      files: new Map([[configPath(), '{\n  "team": "OLD",\n  "workspace": "work"\n}']]),
    })
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const result = await linkTeam(fake.handler, harness, options({}))
    expect(result.workspace).toEqual(Option.some("work"))
    expect(readConfig(harness.files)).toEqual({ team: "RAT", workspace: "work" })
  })

  test("records --workspace over an existing config without --force", async () => {
    const harness = makeHarness({
      files: new Map([[configPath(), '{\n  "team": "RAT",\n  "workspace": "personal"\n}']]),
    })
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const result = await linkTeam(
      fake.handler,
      harness,
      options({ workspace: Option.some("work") }),
    )
    expect(result.files.map((file) => file.action)).toEqual([
      "overwrite",
      "create",
      "create",
      "create",
      "create",
    ])
    expect(readConfig(harness.files)).toEqual({ team: "RAT", workspace: "work" })
  })

  test("records --project over an existing config without --force", async () => {
    const harness = makeHarness({
      files: new Map([[configPath(), '{\n  "team": "RAT"\n}']]),
    })
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const result = await linkTeam(fake.handler, harness, options({ project: Option.some("rata") }))
    expect(result.files.map((file) => file.action)).toEqual([
      "overwrite",
      "create",
      "create",
      "create",
      "create",
    ])
    expect(readConfig(harness.files)).toEqual({ team: "RAT", project: "rata" })
  })

  test("leaves the existing agent documents and AGENTS.md alone without --force", async () => {
    const harness = makeHarness({
      files: new Map([
        [configPath(), '{\n  "team": "OLD"\n}'],
        [trackerPath(), "# Custom tracker\n"],
        [triagePath(), "# Custom triage\n"],
        [domainPath(), "# Custom domain\n"],
        [agentsPath(), "# Agents\n"],
      ]),
    })
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const result = await linkTeam(fake.handler, harness, options({}))
    expect(result.files.map((file) => file.action)).toEqual([
      "overwrite",
      "skip",
      "skip",
      "skip",
      "skip",
    ])
    expect(readConfig(harness.files)).toEqual({ team: "RAT" })
    expect(harness.files.get(trackerPath())).toBe("# Custom tracker\n")
    expect(harness.files.get(triagePath())).toBe("# Custom triage\n")
    expect(harness.files.get(domainPath())).toBe("# Custom domain\n")
    expect(harness.files.get(agentsPath())).toBe("# Agents\n")
  })

  test("overwrites existing files with --force", async () => {
    const harness = makeHarness({
      files: new Map([
        [configPath(), '{\n  "team": "OLD"\n}'],
        [trackerPath(), "# Custom tracker\n"],
        [triagePath(), "# Custom triage\n"],
        [domainPath(), "# Custom domain\n"],
        [agentsPath(), "# Agents\n"],
      ]),
    })
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    await linkTeam(fake.handler, harness, options({ force: true }))
    expect(readConfig(harness.files)).toEqual({ team: "RAT" })
    expect(harness.files.get(trackerPath())).toBe(trackerDocument)
    expect(harness.files.get(triagePath())).toBe(triageLabelsDocument)
    expect(harness.files.get(domainPath())).toBe(domainDocument)
    expect(harness.files.get(agentsPath())).toContain(agentSkillsBlock)
  })
})
