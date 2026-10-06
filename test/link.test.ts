import { makeFakeLinear } from "@test/fake-linear"
import { linkError, linkTeam, makeHarness, options, rat, ratId, scratch } from "@test/link-harness"
import { describe, expect, test } from "bun:test"
import { Option } from "effect"

describe("LinkService.link", () => {
  test("resolves a team given by id and stores the key", async () => {
    const harness = makeHarness()
    const fake = makeFakeLinear({ teams: [{ ...rat, id: ratId }, scratch], labels: [] })
    const { result, stored } = await linkTeam(
      fake.handler,
      harness,
      options({ team: Option.some(ratId) }),
    )
    expect(result.team).toEqual({ ...rat, id: ratId })
    expect(stored).toEqual(Option.some({ team: "RAT" }))
    expect(fake.requests.some((request) => request.query.includes("query TeamById"))).toBe(true)
  })

  test("fails with TeamNotFoundError when the team is missing", async () => {
    const harness = makeHarness()
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const { error, stored } = await linkError(
      fake.handler,
      harness,
      options({ team: Option.some("NOPE") }),
    )
    expect(error._tag).toBe("TeamNotFoundError")
    if (error._tag === "TeamNotFoundError") {
      expect(error.key).toBe("NOPE")
    }
    expect(Option.isNone(stored)).toBe(true)
  })

  test("creates the missing team before linking when --create is passed", async () => {
    const harness = makeHarness()
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const { result } = await linkTeam(
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
    const { result } = await linkTeam(
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
    const { result } = await linkTeam(
      fake.handler,
      harness,
      options({ timezone: Option.some(rat.timezone) }),
    )
    expect(Option.isNone(result.timezone)).toBe(true)
    expect(fake.requests.some((request) => request.query.includes("mutation TeamUpdate"))).toBe(
      false,
    )
  })

  test("rejects --create with a team id", async () => {
    const harness = makeHarness()
    const fake = makeFakeLinear({ teams: [{ ...rat, id: ratId }], labels: [] })
    const { error } = await linkError(
      fake.handler,
      harness,
      options({ team: Option.some(ratId), create: true, name: Option.some("Link Test") }),
    )
    expect(error._tag).toBe("LinkError")
  })

  test("rejects --create without --name and --name without --create", async () => {
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const { error: missingName } = await linkError(
      fake.handler,
      makeHarness(),
      options({ create: true }),
    )
    const { error: strayName } = await linkError(
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
    const { result, stored } = await linkTeam(
      fake.handler,
      harness,
      options({ project: Option.some("rata") }),
    )
    expect(stored).toEqual(Option.some({ team: "RAT", project: "rata" }))
    expect(result.project).toEqual(Option.some("rata"))
  })

  test("keeps the project of an existing config when --project is absent", async () => {
    const harness = makeHarness({ config: { team: "OLD", project: "rata" } })
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const { result, stored } = await linkTeam(fake.handler, harness, options({}))
    expect(result.project).toEqual(Option.some("rata"))
    expect(stored).toEqual(Option.some({ team: "RAT", project: "rata" }))
  })

  test("keeps the workspace of an existing config when --workspace is absent", async () => {
    const harness = makeHarness({ config: { team: "OLD", workspace: "work" } })
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const { result, stored } = await linkTeam(fake.handler, harness, options({}))
    expect(result.workspace).toEqual(Option.some("work"))
    expect(stored).toEqual(Option.some({ team: "RAT", workspace: "work" }))
  })

  test("records --project over an existing config", async () => {
    const harness = makeHarness({ config: { team: "RAT" } })
    const fake = makeFakeLinear({ teams: [rat], labels: [] })
    const { result, stored } = await linkTeam(
      fake.handler,
      harness,
      options({ project: Option.some("rata") }),
    )
    expect(result.project).toEqual(Option.some("rata"))
    expect(stored).toEqual(Option.some({ team: "RAT", project: "rata" }))
  })
})
