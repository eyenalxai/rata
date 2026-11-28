import { lastJson, runRoot } from "@test/cli-harness"
import { makeRecorder } from "@test/issue-write/fixtures"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

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

describe("the issue help advertises the working surface", () => {
  test("the issue group", async () => {
    const help = await helpOf(["issue", "--help"])
    expect(help).toContain("<ref...>")
    expect(help).toContain("Read and write Linear issues")
    expect(help).toContain("apply")
    expect(help).toContain("relate")
    expect(help).toContain("comment")
  })

  test("the apply command takes one file", async () => {
    const help = await helpOf(["issue", "apply", "--help"])
    expect(help).toContain("--file")
    expect(help).toContain("--if-unchanged")
    expect(help).toContain("--dry-run")
  })

  test("the relate command names the relation flags", async () => {
    const help = await helpOf(["issue", "relate", "--help"])
    expect(help).toContain("--blocks")
    expect(help).toContain("--blocked-by")
    expect(help).toContain("--related")
    expect(help).toContain("--duplicate")
  })

  test("the comment command takes one ref and a body file", async () => {
    const help = await helpOf(["issue", "comment", "--help"])
    expect(help).toContain("<ref>")
    expect(help).toContain("--body-file")
    expect(help).toContain("--dedupe-key")
  })
})

describe("explicit action flags bypass the invalid-form detection", () => {
  test("the help flag after a removed read prints the issue help", async () => {
    const lines: string[] = []
    const exit = await run(["issue", "show", "RAT-1", "--help"], lines)
    const help = lines.join("\n")
    expect(help).toContain("<ref...>")
    expect(help).not.toContain("The issue show command does not exist.")
    expect(exit.code).toBe(0)
  })

  test("the completions action before the issue form prints the completion script", async () => {
    const lines: string[] = []
    const exit = await run(["--completions", "zsh", "issue", "RAT-1"], lines)
    const script = lines.join("\n")
    expect(script).toContain("#compdef rata")
    expect(script).not.toContain("The issue show command does not exist.")
    expect(exit.code).toBe(0)
  })
})

describe("the old comment subcommands teach the one comment command", () => {
  test("create", async () => {
    const lines: string[] = []
    const exit = await run(["issue", "comment", "create", "RAT-1", "--body-file", "-"], lines)
    expect(lines).toEqual([
      "error: The issue comment subcommands were replaced by one comment command.",
      "hint: rata issue comment <ref> --body-file -",
    ])
    expect(exit.code).toBe(2)
  })

  test("the issue form keeps the JSON error shape", async () => {
    const lines: string[] = []
    const exit = await run(["issue", "--format", "json", "comment", "delete", "RAT-1"], lines)
    expect(lines).toHaveLength(1)
    expect(lastJson(lines)).toEqual({
      error: {
        code: "usage",
        message: "The issue comment subcommands were replaced by one comment command.",
        hint: "rata issue comment <ref> --body-file -",
      },
    })
    expect(exit.code).toBe(2)
  })
})

describe("removed read forms teach the working-set read", () => {
  test("the old show form names the issue read", async () => {
    const lines: string[] = []
    const exit = await run(["issue", "show", "RAT-1"], lines)
    expect(lines).toEqual([
      "error: The issue show command does not exist.",
      "hint: rata issue RAT-1",
    ])
    expect(exit.code).toBe(2)
  })

  test("the old status form names the issue read", async () => {
    const lines: string[] = []
    const exit = await run(["issue", "status", "RAT-1"], lines)
    expect(lines).toEqual([
      "error: The issue status command does not exist.",
      "hint: rata issue RAT-1",
    ])
    expect(exit.code).toBe(2)
  })

  test("a select flag on a terminal keeps the JSON error shape", async () => {
    const lines: string[] = []
    const exit = await runRoot(
      unusedRecorder().handler,
      ["issue", "show", "RAT-1", "--select", "title"],
      lines,
      [],
      { stdio: { stdoutIsTerminal: Effect.succeed(true) } },
    )
    expect(exit.code).toBe(2)
    expect(lines).toHaveLength(1)
    expect(lastJson(lines)).toMatchObject({ error: { code: "usage" } })
  })
})
