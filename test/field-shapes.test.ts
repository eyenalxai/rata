import type { Handler } from "@test/fake-linear/model"

import { cliLayer, lastJson } from "@test/cli-harness"
import { makeFakeLinear } from "@test/fake-linear"
import { describe, expect, test } from "bun:test"
import { Effect, Result } from "effect"

import { selectFields } from "@/cli/field/select"
import { arrayField, objectField, scalarField } from "@/cli/field/shape"
import { teamCommand } from "@/cli/registry"
import { runCli } from "@/cli/runner"

const team = {
  id: "00000000-0000-0000-0000-000000000001",
  key: "RAT",
  name: "Rata",
  timezone: "America/Los_Angeles",
  states: [
    { id: "state-1", name: "Backlog", type: "backlog", position: 1 },
    { id: "state-2", name: "Todo", type: "unstarted", position: 2 },
  ],
}

const repositories = [{ key: process.cwd(), team: "RAT" }]

const runTeam = (handler: Handler, args: readonly string[], lines: string[]) =>
  runCli("test", teamCommand).pipe(
    Effect.provide(cliLayer(handler, args, lines, repositories)),
    Effect.runPromise,
  )

describe("field shape validation", () => {
  test("rejects a path through an array of scalars", () => {
    const shape = objectField({ labels: arrayField(scalarField) })
    const selected = selectFields(shape, { labels: ["bug"] }, [["labels", "name"]])

    expect(Result.isFailure(selected)).toBe(true)
    if (Result.isFailure(selected)) {
      expect(selected.failure.message).toBe("The field path enters the array of scalars labels.")
    }
  })

  test("rejects an unknown path", () => {
    const shape = objectField({ identifier: scalarField })
    const selected = selectFields(shape, { identifier: "RAT-1" }, [["naem"]])

    expect(Result.isFailure(selected)).toBe(true)
  })
})

describe("field array projection", () => {
  test("returns state names from a team detail", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runTeam(fake.handler, ["show", "--format", "json", "--select", "states.name"], lines)

    expect(lastJson(lines)).toEqual({ states: ["Backlog", "Todo"] })
  })
})
