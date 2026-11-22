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

describe("the issue help advertises the read form", () => {
  test("the issue group", async () => {
    const lines: string[] = []
    await run(["issue", "--help"], lines)
    const help = lines.join("\n")
    expect(help).toContain("<ref...>")
    expect(help).toContain("Read and write Linear issues")
  })

  test("the comment group keeps its subcommand help", async () => {
    const lines: string[] = []
    await run(["issue", "comment", "--help"], lines)
    const help = lines.join("\n")
    expect(help).toContain("rata issue comment <subcommand> [flags]")
    expect(help).not.toContain("[<ref>]")
  })
})

describe("explicit action flags bypass the invalid-form detection", () => {
  test("the help flag after a removed read prints the issue help", async () => {
    const lines: string[] = []
    await run(["issue", "show", "RAT-1", "--help"], lines)
    const help = lines.join("\n")
    expect(help).toContain("<ref...>")
    expect(help).not.toContain("The issue show command does not exist.")
    expect(process.exitCode).toBe(0)
  })

  test("the completions action before the issue form prints the completion script", async () => {
    const lines: string[] = []
    await run(["--completions", "zsh", "issue", "RAT-1"], lines)
    const script = lines.join("\n")
    expect(script).toContain("#compdef rata")
    expect(script).not.toContain("The issue show command does not exist.")
    expect(process.exitCode).toBe(0)
  })
})

describe("invalid group forms teach the canonical command", () => {
  test("the bare comment form names issue comment create with the body flag", async () => {
    const lines: string[] = []
    await run(["issue", "comment", "RAT-1"], lines)
    expect(lines).toEqual([
      "error: The comment group needs a subcommand.",
      "hint: rata issue comment create RAT-1 --body-file -",
    ])
    expect(process.exitCode).toBe(2)
  })

  test("the issue form keeps the JSON error shape", async () => {
    const lines: string[] = []
    await run(["issue", "--json", "comment", "RAT-1", "--body-file", "-"], lines)
    expect(lines).toHaveLength(1)
    expect(lastJson(lines)).toEqual({
      error: {
        code: "usage",
        message: "The comment group needs a subcommand.",
        hint: "rata issue comment create RAT-1 --body-file -",
      },
    })
    expect(process.exitCode).toBe(2)
  })
})

describe("removed read forms teach the working-set read", () => {
  test("the old show form names the issue read", async () => {
    const lines: string[] = []
    await run(["issue", "show", "RAT-1"], lines)
    expect(lines).toEqual([
      "error: The issue show command does not exist.",
      "hint: rata issue RAT-1",
    ])
    expect(process.exitCode).toBe(2)
  })

  test("the old status form names the issue read", async () => {
    const lines: string[] = []
    await run(["issue", "status", "RAT-1"], lines)
    expect(lines).toEqual([
      "error: The issue status command does not exist.",
      "hint: rata issue RAT-1",
    ])
    expect(process.exitCode).toBe(2)
  })
})
