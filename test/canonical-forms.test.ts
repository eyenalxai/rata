import { lastJson, runRoot } from "@test/cli-harness"
import { makeRecorder } from "@test/issue-write/fixtures"
import { afterEach, describe, expect, test } from "bun:test"

const unusedRecorder = () =>
  makeRecorder(() => {
    throw new Error("the invalid form must not request an issue")
  })

const run = (args: readonly string[], lines: string[]) =>
  runRoot(unusedRecorder().handler, args, lines)

const zshFunction = (script: string, name: string): string => {
  const start = script.indexOf(`${name}() {`)
  const end = script.indexOf("\n}\n", start)
  if (start === -1 || end === -1) {
    throw new Error(`the zsh completion script has no ${name} function`)
  }
  return script.slice(start, end)
}

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

describe("explicit action flags bypass the invalid-form detection", () => {
  test("the help flag after the issue form prints the issue help", async () => {
    const lines: string[] = []
    await run(["issue", "RAT-1", "--help"], lines)
    const help = lines.join("\n")
    expect(help).toContain("USAGE\n  rata issue <subcommand> [flags]")
    expect(help).not.toContain("The issue group needs a subcommand.")
    expect(process.exitCode).toBe(0)
  })

  test("the completions action before the issue form prints the completion script", async () => {
    const lines: string[] = []
    await run(["--completions", "zsh", "issue", "RAT-1"], lines)
    const script = lines.join("\n")
    expect(script).toContain("#compdef rata")
    expect(script).not.toContain("The issue group needs a subcommand.")
    expect(process.exitCode).toBe(0)
  })

  test("an inline action value prints the issue help", async () => {
    const lines: string[] = []
    await run(["issue", "RAT-1", "--help=true"], lines)
    expect(lines.join("\n")).toContain("USAGE\n  rata issue <subcommand> [flags]")
    expect(process.exitCode).toBe(0)
  })

  test("a bundled short action flag prints the issue help", async () => {
    const lines: string[] = []
    await run(["issue", "RAT-1", "-hv"], lines)
    expect(lines.join("\n")).toContain("USAGE\n  rata issue <subcommand> [flags]")
    expect(process.exitCode).toBe(0)
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

  test("a space-separated boolean value after the group does not hide the issue form", async () => {
    const lines: string[] = []
    await run(["issue", "--json", "true", "RAT-1"], lines)
    expect(lastJson(lines)).toEqual({
      error: {
        code: "validation",
        message: "The issue group needs a subcommand.",
        hint: "rata issue show RAT-1",
      },
    })
    expect(process.exitCode).toBe(2)
  })

  test("a leading space-separated boolean value does not hide the issue form", async () => {
    const lines: string[] = []
    await run(["--json", "true", "issue", "RAT-1"], lines)
    expect(lastJson(lines)).toEqual({
      error: {
        code: "validation",
        message: "The issue group needs a subcommand.",
        hint: "rata issue show RAT-1",
      },
    })
    expect(process.exitCode).toBe(2)
  })

  test("a space-separated false boolean value keeps the prose error shape", async () => {
    const lines: string[] = []
    await run(["issue", "RAT-1", "--json", "false"], lines)
    expect(lines).toEqual([
      "error: The issue group needs a subcommand.",
      "hint: rata issue show RAT-1",
    ])
    expect(process.exitCode).toBe(2)
  })

  test("a true literal in the inline form keeps the JSON error shape", async () => {
    const lines: string[] = []
    await run(["issue", "RAT-1", "--json=yes"], lines)
    expect(lastJson(lines)).toEqual({
      error: {
        code: "validation",
        message: "The issue group needs a subcommand.",
        hint: "rata issue show RAT-1",
      },
    })
    expect(process.exitCode).toBe(2)
  })
})

describe("the zsh completion keeps the groups free of a positional ref", () => {
  test("the issue and comment groups", async () => {
    const lines: string[] = []
    await run(["--completions", "zsh"], lines)
    const script = lines.join("\n")
    for (const name of ["_rata_issue", "_rata_issue_comment"]) {
      const body = zshFunction(script, name)
      expect(body).not.toContain(":ref:")
      expect(body).not.toContain("parent-arguments")
    }
  })
})
