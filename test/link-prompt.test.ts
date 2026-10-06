import { makeFakeLinear } from "@test/fake-linear"
import {
  interactive,
  linkError,
  linkTeam,
  makeHarness,
  options,
  rat,
  readConfig,
  scratch,
} from "@test/link-harness"
import { describe, expect, test } from "bun:test"
import { Option } from "effect"

describe("LinkService.link prompt", () => {
  test("prompts with the team list when --team is absent", async () => {
    const harness = makeHarness(interactive("2\n"))
    const fake = makeFakeLinear({ teams: [rat, scratch], labels: [] })
    const result = await linkTeam(fake.handler, harness, options({ team: Option.none() }))
    expect(result.team).toEqual(scratch)
    expect(readConfig(harness.files)).toEqual({ team: "SCR" })
    expect(harness.lines.some((line) => line.includes("1. RAT"))).toBe(true)
    expect(harness.lines.some((line) => line.includes("2. SCR"))).toBe(true)
  })

  test("accepts a team key and re-prompts on an invalid answer", async () => {
    const harness = makeHarness(interactive("banana\nscr\n"))
    const fake = makeFakeLinear({ teams: [rat, scratch], labels: [] })
    const result = await linkTeam(fake.handler, harness, options({ team: Option.none() }))
    expect(result.team).toEqual(scratch)
    expect(harness.lines).toContain("Not a team: banana.")
  })

  test("fails after three invalid answers", async () => {
    const harness = makeHarness(interactive("a\nb\nc\n"))
    const fake = makeFakeLinear({ teams: [rat, scratch], labels: [] })
    const error = await linkError(fake.handler, harness, options({ team: Option.none() }))
    expect(error._tag).toBe("LinkError")
    if (error._tag === "LinkError") {
      expect(error.message).toContain("No valid team")
    }
  })

  test("lists a team from the next page", async () => {
    const last = { id: "team-51", key: "T51", name: "Team 51", timezone: "America/Los_Angeles" }
    const teams = [
      ...Array.from({ length: 50 }, (_, index) => ({
        id: `team-${index + 1}`,
        key: `T${index + 1}`,
        name: `Team ${index + 1}`,
        timezone: "America/Los_Angeles",
      })),
      last,
    ]
    const harness = makeHarness(interactive("51\n"))
    const fake = makeFakeLinear({ teams, labels: [] })
    const result = await linkTeam(fake.handler, harness, options({ team: Option.none() }))

    expect(result.team).toEqual(last)
    const pages = fake.requests.filter((request) => request.query.includes("query Teams"))
    expect(pages).toHaveLength(2)
    expect(pages[1]?.variables).toEqual({ first: 50, after: "team-50" })
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
})
