import { makeFakeLinear } from "@test/fake-linear"
import {
  encode,
  linkError,
  linkTeam,
  makeHarness,
  options,
  rat,
  readConfig,
  scratch,
} from "@test/link-harness"
import { describe, expect, test } from "bun:test"
import { Effect, Option, Stream } from "effect"

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
