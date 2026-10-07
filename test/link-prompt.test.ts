import { makeFakeLinear } from "@test/fake-linear"
import {
  interactive,
  linkError,
  linkTeam,
  makeHarness,
  options,
  rat,
  scratch,
} from "@test/link-harness"
import { key } from "@test/terminal-harness"
import { describe, expect, test } from "bun:test"
import { Option } from "effect"

describe("LinkService.link prompt", () => {
  test("selects a team from the list when --team is absent", async () => {
    const harness = makeHarness(interactive([key("down"), key("enter")]))
    const fake = makeFakeLinear({ teams: [rat, scratch], labels: [] })
    const { result, stored } = await linkTeam(
      fake.handler,
      harness,
      options({ team: Option.none() }),
    )

    expect(result.team).toEqual(scratch)
    expect(stored).toEqual(Option.some({ team: "SCR" }))
    expect(harness.output.some((frame) => frame.includes("RAT  Rata"))).toBe(true)
    expect(harness.output.some((frame) => frame.includes("SCR  Scratch"))).toBe(true)
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
    const moves = Array.from({ length: 50 }, () => key("down"))
    const harness = makeHarness(interactive([...moves, key("enter")]))
    const fake = makeFakeLinear({ teams, labels: [] })
    const { result } = await linkTeam(fake.handler, harness, options({ team: Option.none() }))

    expect(result.team).toEqual(last)
    const pages = fake.requests.filter((request) => request.query.includes("query Teams"))
    expect(pages).toHaveLength(2)
    expect(pages[1]?.variables).toEqual({ first: 50, after: "team-50" })
  })

  test("fails without listing teams when standard input is not a terminal", async () => {
    const harness = makeHarness()
    const fake = makeFakeLinear({ teams: [rat, scratch], labels: [] })
    const { error } = await linkError(fake.handler, harness, options({ team: Option.none() }))
    expect(error._tag).toBe("LinkError")
    if (error._tag === "LinkError") {
      expect(error.message).toContain("--team")
    }
    expect(fake.requests.some((request) => request.query.includes("query Teams"))).toBe(false)
  })
})
