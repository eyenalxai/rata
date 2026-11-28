import { lastJson, runRoot } from "@test/cli-harness"
import { makeFakeLinear } from "@test/fake-linear"
import { describe, expect, test } from "bun:test"

const fake = () => makeFakeLinear({ teams: [], labels: [] })

const removed = [
  ["auth", "status"],
  ["whoami"],
  ["config", "show"],
  ["link", "--team", "RAT"],
  ["unlink"],
  ["workspace", "list"],
  ["team", "list"],
  ["project", "list"],
  ["label", "list"],
] as const

describe("the root surface", () => {
  test("an empty phase 2 root exits 2", async () => {
    const lines: string[] = []
    const exit = await runRoot(fake().handler, ["triage", "--format", "json"], lines)
    expect(lastJson(lines)).toMatchObject({
      error: {
        code: "usage",
        message: "The triage command is not available yet.",
      },
    })
    expect(exit.code).toBe(2)
  })
})

describe("the removed roots", () => {
  for (const args of removed) {
    test(`rata ${args.join(" ")} exits 2 as an unknown subcommand`, async () => {
      const exit = await runRoot(
        () => {
          throw new Error("a removed root must not call the API")
        },
        args,
        [],
      )
      expect(exit.code).toBe(2)
    })
  }
})
