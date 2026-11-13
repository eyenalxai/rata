import { lastJson, runRoot } from "@test/cli-harness"
import { makeRecorder } from "@test/issue-write/fixtures"
import { afterEach, describe, expect, test } from "bun:test"

const unusedRecorder = () =>
  makeRecorder(() => {
    throw new Error("the invalid form must not request an issue")
  })

const run = (args: readonly string[], lines: string[]) =>
  runRoot(unusedRecorder().handler, args, lines)

const helpOf = async (args: readonly string[]): Promise<string> => {
  const lines: string[] = []
  await run(args, lines)
  return lines.join("\n")
}

afterEach(() => {
  process.exitCode = 0
})

describe("the known wrong flags teach the canonical command", () => {
  test("issue update --label names issue label add", async () => {
    const lines: string[] = []
    await run(["issue", "update", "RAT-1", "--label", "bug"], lines)
    expect(lines).toEqual([
      "error: The --label flag is not supported by issue update.",
      "hint: rata issue label add RAT-1 bug",
    ])
    expect(process.exitCode).toBe(2)
  })

  test("issue update --label keeps every label", async () => {
    const lines: string[] = []
    await run(["issue", "update", "RAT-1", "--label", "bug", "--label", "needs info"], lines)
    expect(lines).toEqual([
      "error: The --label flag is not supported by issue update.",
      'hint: rata issue label add RAT-1 bug "needs info"',
    ])
    expect(process.exitCode).toBe(2)
  })

  test("issue create --blocked-by names the create then link path", async () => {
    const lines: string[] = []
    await run(["issue", "create", "--title", "Fix login", "--blocked-by", "RAT-2"], lines)
    expect(lines).toEqual([
      "error: The --blocked-by flag is not supported by issue create.",
      "hint: Create the issue, then run rata issue link <new-ref> --blocked-by RAT-2.",
    ])
    expect(process.exitCode).toBe(2)
  })

  test("issue update --blocked-by names issue link", async () => {
    const lines: string[] = []
    await run(["issue", "update", "RAT-1", "--blocked-by", "RAT-2"], lines)
    expect(lines).toEqual([
      "error: The --blocked-by flag is not supported by issue update.",
      "hint: rata issue link RAT-1 --blocked-by RAT-2",
    ])
    expect(process.exitCode).toBe(2)
  })

  test("issue link with no relation flag names a relation flag", async () => {
    const lines: string[] = []
    await run(["issue", "link", "RAT-1"], lines)
    expect(lines).toEqual([
      "error: Pass at least one of --blocks, --blocked-by, --related or --duplicate.",
      "hint: rata issue link RAT-1 --blocked-by <blocker>",
    ])
    expect(process.exitCode).toBe(2)
  })

  test("a known wrong flag does not print the full help", async () => {
    const lines: string[] = []
    await run(["issue", "update", "RAT-1", "--label", "bug"], lines)
    expect(lines.join("\n")).not.toContain("USAGE")
  })

  test("a known wrong flag keeps the JSON error shape", async () => {
    const lines: string[] = []
    await run(["--json", "issue", "update", "RAT-1", "--label", "bug"], lines)
    expect(lines).toHaveLength(1)
    expect(lastJson(lines)).toEqual({
      error: {
        code: "validation",
        message: "The --label flag is not supported by issue update.",
        hint: "rata issue label add RAT-1 bug",
      },
    })
    expect(process.exitCode).toBe(2)
  })
})

describe("the write help carries the agent notes block", () => {
  test("issue update", async () => {
    const help = await helpOf(["issue", "update", "--help"])
    expect(help).toContain("AGENT NOTES")
    expect(help).toContain("--json prints one JSON document.")
    expect(help).toContain("--dry-run prints the actions without writing.")
    expect(help).toContain("--body-file - reads the body from standard input.")
    expect(help).toContain("A list returns one page. Use --all to drain every page.")
    expect(process.exitCode).toBe(0)
  })

  test("issue create", async () => {
    expect(await helpOf(["issue", "create", "--help"])).toContain("AGENT NOTES")
    expect(process.exitCode).toBe(0)
  })

  test("the comment group", async () => {
    expect(await helpOf(["issue", "comment", "--help"])).toContain("AGENT NOTES")
    expect(process.exitCode).toBe(0)
  })

  test("the issue group", async () => {
    expect(await helpOf(["issue", "--help"])).toContain("AGENT NOTES")
    expect(process.exitCode).toBe(0)
  })

  test("a read help does not carry the block", async () => {
    expect(await helpOf(["issue", "show", "--help"])).not.toContain("AGENT NOTES")
    expect(process.exitCode).toBe(0)
  })
})
