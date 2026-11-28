import { runRoot } from "@test/cli-harness"
import { makeFakeLinear } from "@test/fake-linear"
import { afterEach, describe, expect, test } from "bun:test"

const fake = () => makeFakeLinear({ teams: [], labels: [] })

const roots = ["status", "issue", "triage", "map", "admin"] as const

const adminCommands = [
  "auth",
  "link",
  "unlink",
  "workspace",
  "config",
  "team",
  "project",
  "label",
  "doctor",
  "api",
] as const

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
  test("lists the five roots", async () => {
    const lines: string[] = []
    await runRoot(fake().handler, ["--help"], lines)
    const help = lines.join("\n")
    for (const root of roots) {
      expect(help).toMatch(new RegExp(`\\n\\s+${root}\\s{2,}`, "u"))
    }
    expect(help).not.toMatch(/\n\s+auth\s{2,}/u)
    expect(help).not.toMatch(/\n\s+whoami\s{2,}/u)
    expect(process.exitCode ?? 0).toBe(0)
  })

  test("shows the phase 2 groups with a description", async () => {
    const lines: string[] = []
    await runRoot(fake().handler, ["triage", "--help"], lines)
    expect(lines.join("\n")).toContain("Phase 2.")
    expect(process.exitCode ?? 0).toBe(0)
  })
})

describe("the admin group", () => {
  test("lists the ten admin commands", async () => {
    const lines: string[] = []
    await runRoot(fake().handler, ["admin", "--help"], lines)
    const help = lines.join("\n")
    for (const command of adminCommands) {
      expect(help).toMatch(new RegExp(`\\n\\s+${command}\\s{2,}`, "u"))
    }
    expect(process.exitCode ?? 0).toBe(0)
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
