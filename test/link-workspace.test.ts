import type { ProfileSeed } from "@test/database-harness"
import type { FakeViewer } from "@test/fake-linear-model"

import { makeFakeLinear } from "@test/fake-linear"
import { defaultViewer } from "@test/fake-linear-model"
import {
  authPath,
  interactive,
  linkError,
  linkTeam,
  makeHarness,
  options,
  rat,
  scratch,
} from "@test/link-harness"
import { describe, expect, test } from "bun:test"
import { Option } from "effect"

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

const twoProfiles: readonly ProfileSeed[] = [
  { name: "default", apiKey: "default-key", isDefault: true },
  { name: "work", apiKey: "work-key" },
]

const twoWorkspaces = () => ({
  "default-key": { viewer: defaultViewer, teams: [rat] },
  "work-key": { viewer: bob, teams: [scratch] },
})

describe("LinkService.link workspace", () => {
  test("prompts for the workspace, then lists that workspace's teams", async () => {
    const harness = makeHarness({
      env: noEnv,
      profiles: twoProfiles,
      ...interactive("2\nscr\n"),
    })
    const fake = makeFakeLinear({ teams: [rat], labels: [], workspaces: twoWorkspaces() })
    const { result, stored } = await linkTeam(
      fake.handler,
      harness,
      options({ team: Option.none() }),
    )

    expect(result.team).toEqual(scratch)
    expect(stored).toEqual(Option.some({ team: "SCR", workspace: "work" }))
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
  })

  test("re-prompts after an invalid workspace answer", async () => {
    const harness = makeHarness({
      env: noEnv,
      profiles: twoProfiles,
      ...interactive("banana\n1\nRAT\n"),
    })
    const fake = makeFakeLinear({ teams: [rat], labels: [], workspaces: twoWorkspaces() })
    const { result, stored } = await linkTeam(
      fake.handler,
      harness,
      options({ team: Option.none() }),
    )

    expect(result.team).toEqual(rat)
    expect(harness.lines).toContain("Not a workspace: banana.")
    expect(stored).toEqual(Option.some({ team: "RAT", workspace: "default" }))
  })

  test("resolves --team across the stored workspaces and records the match", async () => {
    const harness = makeHarness({ env: noEnv, profiles: twoProfiles })
    const fake = makeFakeLinear({ teams: [rat], labels: [], workspaces: twoWorkspaces() })
    const { result, stored } = await linkTeam(fake.handler, harness, options({}))

    expect(result.team).toEqual(rat)
    expect(stored).toEqual(Option.some({ team: "RAT", workspace: "default" }))
    const lookups = fake.requests.filter((request) => request.query.includes("query TeamByKey"))
    expect(lookups.map((request) => request.authorization)).toEqual(["default-key", "work-key"])
  })

  test("fails when --team exists in several workspaces", async () => {
    const harness = makeHarness({ env: noEnv, profiles: twoProfiles })
    const fake = makeFakeLinear({
      teams: [rat],
      labels: [],
      workspaces: {
        "default-key": { viewer: defaultViewer, teams: [rat] },
        "work-key": { viewer: bob, teams: [rat] },
      },
    })
    const { error, stored } = await linkError(fake.handler, harness, options({}))

    expect(error._tag).toBe("LinkError")
    if (error._tag === "LinkError") {
      expect(error.message).toContain("default, work")
      expect(error.message).toContain("--workspace")
    }
    expect(Option.isNone(stored)).toBe(true)
  })

  test("creates a missing team in the resolved profile", async () => {
    const harness = makeHarness({
      env: noEnv,
      profiles: twoProfiles,
      config: { workspace: "work" },
    })
    const fake = makeFakeLinear({ teams: [rat], labels: [], workspaces: twoWorkspaces() })
    const { result, stored } = await linkTeam(
      fake.handler,
      harness,
      options({ team: Option.some("LINKZ"), create: true, name: Option.some("Link Test") }),
    )

    expect(result.team.key).toBe("LINKZ")
    expect(stored).toEqual(Option.some({ team: "LINKZ", workspace: "work" }))
    const create = fake.requests.find((request) => request.query.includes("mutation TeamCreate"))
    expect(create?.authorization).toBe("work-key")
  })

  test("treats profiles with the same key as one workspace", async () => {
    const harness = makeHarness({
      env: noEnv,
      profiles: [
        { name: "default", apiKey: "shared-key", isDefault: true },
        { name: "work", apiKey: "shared-key" },
      ],
    })
    const fake = makeFakeLinear({
      teams: [rat],
      labels: [],
      workspaces: { "shared-key": { viewer: defaultViewer, teams: [rat] } },
    })
    const { result, stored } = await linkTeam(fake.handler, harness, options({}))

    expect(result.team).toEqual(rat)
    expect(stored).toEqual(Option.some({ team: "RAT", workspace: "default" }))
  })

  test("skips the workspace prompt when LINEAR_API_KEY is set", async () => {
    const harness = makeHarness({ profiles: twoProfiles, ...interactive("RAT\n") })
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const { result, stored } = await linkTeam(
      fake.handler,
      harness,
      options({ team: Option.none() }),
    )

    expect(result.team).toEqual(rat)
    expect(stored).toEqual(Option.some({ team: "RAT" }))
    expect(harness.lines.some((line) => line.includes("Select a workspace"))).toBe(false)
    expect(harness.lines.some((line) => line.includes("Select a team"))).toBe(true)
  })

  test("records --workspace in the repository config and uses its key", async () => {
    const harness = makeHarness({ env: noEnv, profiles: twoProfiles })
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const { result, stored } = await linkTeam(
      fake.handler,
      harness,
      options({ workspace: Option.some("work") }),
    )

    expect(stored).toEqual(Option.some({ team: "RAT", workspace: "work" }))
    expect(result.workspace).toEqual(Option.some("work"))
    const lookup = fake.requests.find((request) => request.query.includes("query TeamByKey"))
    expect(lookup?.authorization).toBe("work-key")
  })

  test("fails when --workspace names a missing profile", async () => {
    const harness = makeHarness({ env: noEnv })
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const { error, stored } = await linkError(
      fake.handler,
      harness,
      options({ workspace: Option.some("nope") }),
    )

    expect(error._tag).toBe("LinkError")
    if (error._tag === "LinkError") {
      expect(error.message).toContain("nope")
    }
    expect(Option.isNone(stored)).toBe(true)
  })

  test("records --workspace over an existing config", async () => {
    const harness = makeHarness({
      env: noEnv,
      profiles: twoProfiles,
      config: { team: "RAT", workspace: "personal" },
    })
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const { result, stored } = await linkTeam(
      fake.handler,
      harness,
      options({ workspace: Option.some("work") }),
    )

    expect(result.workspace).toEqual(Option.some("work"))
    expect(stored).toEqual(Option.some({ team: "RAT", workspace: "work" }))
  })

  test("ignores a corrupt legacy auth file when LINEAR_API_KEY is set", async () => {
    const harness = makeHarness({
      files: new Map([[authPath, "{ not json"]]),
    })
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const { result, stored } = await linkTeam(fake.handler, harness, options({}))

    expect(result.team).toEqual(rat)
    expect(stored).toEqual(Option.some({ team: "RAT" }))
  })

  test("lists a profile with a rejected key in the prompt and links the others", async () => {
    const harness = makeHarness({
      env: noEnv,
      profiles: twoProfiles,
      ...interactive("2\nSCR\n"),
    })
    const fake = makeFakeLinear({
      teams: [rat],
      labels: [],
      workspaces: twoWorkspaces(),
      rejectedKeys: ["default-key"],
    })
    const { result, stored } = await linkTeam(
      fake.handler,
      harness,
      options({ team: Option.none() }),
    )

    expect(result.team).toEqual(scratch)
    expect(stored).toEqual(Option.some({ team: "SCR", workspace: "work" }))
    expect(harness.lines.some((line) => line.includes("1. default") && line.includes("!"))).toBe(
      true,
    )
    expect(
      harness.lines.some(
        (line) => line.includes("work") && line.includes("Bob") && line.includes("Globex"),
      ),
    ).toBe(true)
  })
})
