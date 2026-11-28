import { lastJson, runRoot } from "@test/cli-harness"
import { makeFakeLinear } from "@test/fake-linear"
import { afterEach, describe, expect, test } from "bun:test"

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

afterEach(() => {
  process.exitCode = 0
})

describe("the root surface", () => {
  test("an empty phase 2 root exits 2", async () => {
    const lines: string[] = []
    await runRoot(fake().handler, ["triage", "--format", "json"], lines)
    expect(lastJson(lines)).toMatchObject({
      error: {
        code: "usage",
        message: "The triage command is not available yet.",
      },
    })
    expect(process.exitCode).toBe(2)
  })
})

describe("the removed roots", () => {
  for (const args of removed) {
    test(`rata ${args.join(" ")} exits 2 as an unknown subcommand`, async () => {
      await runRoot(
        () => {
          throw new Error("a removed root must not call the API")
        },
        args,
        [],
      )
      expect(process.exitCode).toBe(2)
    })
  }
})
