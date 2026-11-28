import { lastJson, runRoot } from "@test/cli-harness"
import { makeRecorder } from "@test/issue-write/fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Effect } from "effect"

const unusedRecorder = () =>
  makeRecorder(() => {
    throw new Error("the invalid form must not request an issue")
  })

const run = (args: readonly string[], lines: string[]) =>
  runRoot(unusedRecorder().handler, args, lines)

afterEach(() => {
  process.exitCode = 0
})

describe("the removed write forms teach the apply engine", () => {
  test("issue update names issue apply", async () => {
    const lines: string[] = []
    await run(["issue", "update", "RAT-1", "--state", "Done"], lines)
    expect(lines).toEqual([
      "error: The issue update command was replaced by issue apply.",
      "hint: rata issue apply RAT-1 --file -",
    ])
    expect(process.exitCode).toBe(2)
  })

  test("issue label names issue apply", async () => {
    const lines: string[] = []
    await run(["issue", "label", "add", "RAT-1", "bug"], lines)
    expect(lines).toEqual([
      "error: The issue label command was replaced by issue apply.",
      "hint: rata issue apply RAT-1 --file -",
    ])
    expect(process.exitCode).toBe(2)
  })

  test("issue link names issue relate", async () => {
    const lines: string[] = []
    await run(["issue", "link", "RAT-1", "--blocks", "RAT-2"], lines)
    expect(lines).toEqual([
      "error: The issue link command was replaced by issue relate.",
      "hint: rata issue relate RAT-1 --blocked-by <target>",
    ])
    expect(process.exitCode).toBe(2)
  })

  test("issue create --blocked-by names issue relate", async () => {
    const lines: string[] = []
    await run(["issue", "create", "--title", "Fix login", "--blocked-by", "RAT-2"], lines)
    expect(lines).toEqual([
      "error: The --blocked-by flag is not supported by issue create.",
      "hint: Create the issue, then run rata issue relate <new-ref> --blocked-by RAT-2.",
    ])
    expect(process.exitCode).toBe(2)
  })

  test("issue create --body names --body-file", async () => {
    const lines: string[] = []
    await run(["issue", "create", "--title", "Fix login", "--body", "Inline"], lines)
    expect(lines).toEqual([
      "error: The --body flag was removed from issue create.",
      "hint: Use --body-file - and pipe the body on standard input.",
    ])
    expect(process.exitCode).toBe(2)
  })

  test("a leading --format keeps the canonical JSON error", async () => {
    const lines: string[] = []
    await run(["--format", "json", "issue", "label", "add", "RAT-1", "bug"], lines)
    expect(lastJson(lines)).toEqual({
      error: {
        code: "usage",
        message: "The issue label command was replaced by issue apply.",
        hint: "rata issue apply RAT-1 --file -",
      },
    })
    expect(process.exitCode).toBe(2)
  })
})

describe("the new write commands keep the modern output flags", () => {
  test("issue apply help names --format and --select", async () => {
    const lines: string[] = []
    await run(["issue", "apply", "--help"], lines)
    const help = lines.join("\n")
    expect(help).toContain("--format")
    expect(help).toContain("--select")
  })

  test("a bare invocation prints help off a terminal", async () => {
    const lines: string[] = []
    await runRoot(unusedRecorder().handler, [], lines, [], {
      stdio: { stdoutIsTerminal: Effect.succeed(false) },
    })
    expect(lines.join("\n")).toContain("USAGE")
    expect(process.exitCode).toBe(0)
  })

  test("a bare issue group without refs exits 2", async () => {
    const lines: string[] = []
    await runRoot(unusedRecorder().handler, ["issue"], lines, [], {
      stdio: { stdoutIsTerminal: Effect.succeed(false) },
    })
    expect(lines.join("\n")).toContain("ref")
    expect(process.exitCode).toBe(2)
  })

  test("the issue group help carries the agent notes", async () => {
    const lines: string[] = []
    await run(["issue", "--help"], lines)
    expect(lines.join("\n")).toContain("AGENT NOTES")
    expect(process.exitCode).toBe(0)
  })
})
