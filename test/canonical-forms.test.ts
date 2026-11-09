import { lastJson, runRoot } from "@test/cli-harness"
import { makeRecorder } from "@test/issue-write/fixtures"
import { afterEach, describe, expect, test } from "bun:test"

const unusedRecorder = () =>
  makeRecorder(() => {
    throw new Error("the invalid form must not request an issue")
  })

const run = (args: readonly string[], lines: string[]) =>
  runRoot(unusedRecorder().handler, args, lines)

afterEach(() => {
  process.exitCode = 0
})

describe("the group help advertises no stray ref argument", () => {
  test("the issue group", async () => {
    const lines: string[] = []
    await run(["issue", "--help"], lines)
    const help = lines.join("\n")
    expect(help).toContain("USAGE\n  rata issue <subcommand> [flags]")
    expect(help).not.toContain("[<ref>]")
    expect(help).not.toContain("ARGUMENTS")
    expect(help).not.toContain("ref string")
  })

  test("the comment group", async () => {
    const lines: string[] = []
    await run(["issue", "comment", "--help"], lines)
    const help = lines.join("\n")
    expect(help).toContain("USAGE\n  rata issue comment <subcommand> [flags]")
    expect(help).not.toContain("[<ref>]")
    expect(help).not.toContain("ARGUMENTS")
    expect(help).not.toContain("ref string")
  })
})

describe("invalid group forms teach the canonical command", () => {
  test("the bare issue form names issue show", async () => {
    const lines: string[] = []
    await run(["issue", "RAT-1"], lines)
    expect(lines).toEqual([
      "error: The issue group needs a subcommand.",
      "hint: rata issue show RAT-1",
    ])
    expect(process.exitCode).toBe(2)
  })

  test("the bare comment form names issue comment create", async () => {
    const lines: string[] = []
    await run(["issue", "comment", "RAT-1"], lines)
    expect(lines).toEqual([
      "error: The comment group needs a subcommand.",
      "hint: rata issue comment create RAT-1",
    ])
    expect(process.exitCode).toBe(2)
  })

  test("a flag-bearing issue form names issue show", async () => {
    const lines: string[] = []
    await run(["issue", "RAT-1", "--summary"], lines)
    expect(lines).toEqual([
      "error: The issue group needs a subcommand.",
      "hint: rata issue show RAT-1",
    ])
    expect(process.exitCode).toBe(2)
  })

  test("a global flag with a value does not hide the issue form", async () => {
    const lines: string[] = []
    await run(["--fields", "identifier", "issue", "RAT-1"], lines)
    expect(lines).toEqual([
      "error: The issue group needs a subcommand.",
      "hint: rata issue show RAT-1",
    ])
    expect(process.exitCode).toBe(2)
  })

  test("a flag-bearing comment form names issue comment create", async () => {
    const lines: string[] = []
    await run(["issue", "comment", "RAT-1", "--body-file", "-"], lines)
    expect(lines).toEqual([
      "error: The comment group needs a subcommand.",
      "hint: rata issue comment create RAT-1",
    ])
    expect(process.exitCode).toBe(2)
  })

  test("the issue form keeps the JSON error shape", async () => {
    const lines: string[] = []
    await run(["issue", "--json", "RAT-1", "--summary"], lines)
    expect(lines).toHaveLength(1)
    expect(lastJson(lines)).toEqual({
      error: {
        code: "validation",
        message: "The issue group needs a subcommand.",
        hint: "rata issue show RAT-1",
      },
    })
    expect(process.exitCode).toBe(2)
  })

  test("the comment form keeps the JSON error shape", async () => {
    const lines: string[] = []
    await run(["--json", "issue", "comment", "RAT-1", "--body-file", "-"], lines)
    expect(lines).toHaveLength(1)
    expect(lastJson(lines)).toEqual({
      error: {
        code: "validation",
        message: "The comment group needs a subcommand.",
        hint: "rata issue comment create RAT-1",
      },
    })
    expect(process.exitCode).toBe(2)
  })
})
