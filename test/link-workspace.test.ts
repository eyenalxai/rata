import type { FakeViewer } from "@test/fake-linear-model"

import { makeFakeLinear } from "@test/fake-linear"
import {
  authPath,
  configPath,
  encode,
  linkError,
  linkTeam,
  makeHarness,
  options,
  profileFile,
  rat,
  readConfig,
  scratch,
} from "@test/link-harness"
import { describe, expect, test } from "bun:test"
import { Effect, Option, Stream } from "effect"

const ada: FakeViewer = {
  id: "user-1",
  name: "Ada",
  displayName: "ada",
  email: "ada@example.com",
  active: true,
  admin: true,
  organization: { id: "org-1", name: "Acme", urlKey: "acme" },
}

const bob: FakeViewer = {
  id: "user-2",
  name: "Bob",
  displayName: "bob",
  email: "bob@example.com",
  active: true,
  admin: true,
  organization: { id: "org-2", name: "Globex", urlKey: "globex" },
}

const noEnv = { HOME: "/home/test" }

const profiles = () =>
  new Map([[authPath, profileFile({ default: "default-key", work: "work-key" }, "default")]])

const twoWorkspaces = () => ({
  "default-key": { viewer: ada, teams: [rat] },
  "work-key": { viewer: bob, teams: [scratch] },
})

const interactive = (input: string) => ({
  stdin: Stream.fromIterable([encode(input)]),
  stdinIsTerminal: Effect.succeed(true),
})

describe("InitService.link workspace", () => {
  test("prompts for the workspace, then lists that workspace's teams", async () => {
    const harness = makeHarness({
      env: noEnv,
      files: profiles(),
      stdio: interactive("2\nscr\n"),
    })
    const fake = makeFakeLinear({ teams: [rat], labels: [], workspaces: twoWorkspaces() })
    const result = await linkTeam(fake.handler, harness, options({ team: Option.none() }))

    expect(result.team).toEqual(scratch)
    expect(readConfig(harness.files)).toEqual({ team: "SCR", workspace: "work" })
    expect(harness.lines.some((line) => line.includes("* 1. default"))).toBe(true)
    expect(
      harness.lines.some(
        (line) => line.includes("default") && line.includes("Ada") && line.includes("Acme"),
      ),
    ).toBe(true)
    expect(
      harness.lines.some(
        (line) => line.includes("work") && line.includes("Bob") && line.includes("Globex"),
      ),
    ).toBe(true)

    const workspacePrompt = harness.lines.indexOf("Select a workspace:")
    const teamPrompt = harness.lines.indexOf("Select a team:")
    expect(workspacePrompt).toBeGreaterThanOrEqual(0)
    expect(teamPrompt).toBeGreaterThan(workspacePrompt)
    expect(harness.lines.some((line) => line.includes("1. SCR"))).toBe(true)
    expect(harness.lines.some((line) => line.includes("RAT"))).toBe(false)

    expect(
      fake.requests.some(
        (request) =>
          request.query.includes("query AvailableLabels") && request.authorization === "work-key",
      ),
    ).toBe(true)
  })

  test("re-prompts after an invalid workspace answer", async () => {
    const harness = makeHarness({
      env: noEnv,
      files: profiles(),
      stdio: interactive("banana\n1\nRAT\n"),
    })
    const fake = makeFakeLinear({ teams: [rat], labels: [], workspaces: twoWorkspaces() })
    const result = await linkTeam(fake.handler, harness, options({ team: Option.none() }))

    expect(result.team).toEqual(rat)
    expect(harness.lines).toContain("Not a workspace: banana.")
    expect(readConfig(harness.files)).toEqual({ team: "RAT", workspace: "default" })
  })

  test("resolves --team across the stored workspaces and records the match", async () => {
    const harness = makeHarness({ env: noEnv, files: profiles() })
    const fake = makeFakeLinear({ teams: [rat], labels: [], workspaces: twoWorkspaces() })
    const result = await linkTeam(fake.handler, harness, options({}))

    expect(result.team).toEqual(rat)
    expect(readConfig(harness.files)).toEqual({ team: "RAT", workspace: "default" })
    const lookups = fake.requests.filter((request) => request.query.includes("query TeamByKey"))
    expect(lookups.map((request) => request.authorization)).toEqual(["default-key", "work-key"])
  })

  test("fails when --team exists in several workspaces", async () => {
    const harness = makeHarness({ env: noEnv, files: profiles() })
    const fake = makeFakeLinear({
      teams: [rat],
      labels: [],
      workspaces: {
        "default-key": { viewer: ada, teams: [rat] },
        "work-key": { viewer: bob, teams: [rat] },
      },
    })
    const error = await linkError(fake.handler, harness, options({}))

    expect(error._tag).toBe("LinkError")
    if (error._tag === "LinkError") {
      expect(error.message).toContain("default, work")
      expect(error.message).toContain("--workspace")
    }
    expect(harness.files.has(configPath())).toBe(false)
  })

  test("fails when --team is in no stored workspace", async () => {
    const harness = makeHarness({ env: noEnv, files: profiles() })
    const fake = makeFakeLinear({
      teams: [scratch],
      labels: [],
      workspaces: {
        "default-key": { viewer: ada, teams: [scratch] },
        "work-key": { viewer: bob, teams: [scratch] },
      },
    })
    const error = await linkError(fake.handler, harness, options({}))

    expect(error._tag).toBe("TeamNotFoundError")
    if (error._tag === "TeamNotFoundError") {
      expect(error.key).toBe("RAT")
      expect(error.message).toContain("default, work")
    }
  })

  test("creates a missing team in the resolved profile", async () => {
    const harness = makeHarness({
      env: noEnv,
      files: new Map([
        [authPath, profileFile({ default: "default-key", work: "work-key" }, "default")],
        [configPath(), JSON.stringify({ workspace: "work" })],
      ]),
    })
    const fake = makeFakeLinear({ teams: [rat], labels: [], workspaces: twoWorkspaces() })
    const result = await linkTeam(
      fake.handler,
      harness,
      options({ team: Option.some("LINKZ"), create: true, name: Option.some("Link Test") }),
    )

    expect(result.team.key).toBe("LINKZ")
    expect(readConfig(harness.files)).toEqual({ team: "LINKZ", workspace: "work" })
    const create = fake.requests.find((request) => request.query.includes("mutation TeamCreate"))
    expect(create?.authorization).toBe("work-key")
  })

  test("treats profiles with the same key as one workspace", async () => {
    const harness = makeHarness({
      env: noEnv,
      files: new Map([
        [authPath, profileFile({ default: "shared-key", work: "shared-key" }, "default")],
      ]),
    })
    const fake = makeFakeLinear({
      teams: [rat],
      labels: [],
      workspaces: { "shared-key": { viewer: ada, teams: [rat] } },
    })
    const result = await linkTeam(fake.handler, harness, options({}))

    expect(result.team).toEqual(rat)
    expect(readConfig(harness.files)).toEqual({ team: "RAT", workspace: "default" })
  })

  test("skips the workspace prompt when LINEAR_API_KEY is set", async () => {
    const harness = makeHarness({ files: profiles(), stdio: interactive("RAT\n") })
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const result = await linkTeam(fake.handler, harness, options({ team: Option.none() }))

    expect(result.team).toEqual(rat)
    expect(readConfig(harness.files)).toEqual({ team: "RAT" })
    expect(harness.lines.some((line) => line.includes("Select a workspace"))).toBe(false)
    expect(harness.lines.some((line) => line.includes("Select a team"))).toBe(true)
  })

  test("fails clearly without an environment key or stored profiles", async () => {
    const harness = makeHarness({ env: noEnv })
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const error = await linkError(fake.handler, harness, options({}))

    expect(error._tag).toBe("AuthStoreError")
  })

  test("records --workspace in the repository config and uses its key", async () => {
    const harness = makeHarness({ env: noEnv, files: profiles() })
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const result = await linkTeam(
      fake.handler,
      harness,
      options({ workspace: Option.some("work") }),
    )

    expect(readConfig(harness.files)).toEqual({ team: "RAT", workspace: "work" })
    expect(result.workspace).toEqual(Option.some("work"))
    const lookup = fake.requests.find((request) => request.query.includes("query TeamByKey"))
    expect(lookup?.authorization).toBe("work-key")
  })

  test("fails when --workspace names a missing profile", async () => {
    const harness = makeHarness({ env: noEnv })
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const error = await linkError(
      fake.handler,
      harness,
      options({ workspace: Option.some("nope") }),
    )

    expect(error._tag).toBe("LinkError")
    if (error._tag === "LinkError") {
      expect(error.message).toContain("nope")
    }
    expect(harness.files.has(configPath())).toBe(false)
  })

  test("records --workspace over an existing config without --force", async () => {
    const harness = makeHarness({
      env: noEnv,
      files: new Map([
        [authPath, profileFile({ default: "default-key", work: "work-key" }, "default")],
        [configPath(), JSON.stringify({ team: "RAT", workspace: "personal" })],
      ]),
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
})
