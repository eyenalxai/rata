import { describe, expect, test } from "bun:test"
import { Option } from "effect"

import { parseTeamAnswer } from "@/domain/link"

const rat = { id: "team-1", key: "RAT", name: "Rata" }
const scratch = { id: "team-2", key: "SCR", name: "Scratch" }
const teams = [rat, scratch]

describe("parseTeamAnswer", () => {
  test("selects by list position", () => {
    expect(Option.getOrNull(parseTeamAnswer(teams, " 2 "))).toEqual(scratch)
    expect(Option.isNone(parseTeamAnswer(teams, "0"))).toBe(true)
    expect(Option.isNone(parseTeamAnswer(teams, "3"))).toBe(true)
  })

  test("selects by key, ignoring case", () => {
    expect(Option.getOrNull(parseTeamAnswer(teams, "scr"))).toEqual(scratch)
    expect(Option.getOrNull(parseTeamAnswer(teams, "RAT"))).toEqual(rat)
  })

  test("rejects an empty or unknown answer", () => {
    expect(Option.isNone(parseTeamAnswer(teams, "  "))).toBe(true)
    expect(Option.isNone(parseTeamAnswer(teams, "NOPE"))).toBe(true)
  })
})
