import { runIssue } from "@test/cli-harness"
import { makeRecorder } from "@test/issue-write/fixtures"
import { afterEach, describe, expect, test } from "bun:test"

const unusedRecorder = () =>
  makeRecorder(() => {
    throw new Error("the invalid form must not request an issue")
  })

afterEach(() => {
  process.exitCode = 0
})

describe("invalid group forms teach the canonical command", () => {
  test("the bare issue form names issue show", async () => {
    const recorder = unusedRecorder()
    const lines: string[] = []
    await runIssue(recorder.handler, ["RAT-1"], lines)
    expect(lines).toEqual([
      "error: The issue group needs a subcommand.",
      "hint: rata issue show RAT-1",
    ])
    expect(recorder.requests).toHaveLength(0)
    expect(process.exitCode).toBe(2)
  })

  test("the bare comment form names issue comment create", async () => {
    const recorder = unusedRecorder()
    const lines: string[] = []
    await runIssue(recorder.handler, ["comment", "RAT-1"], lines)
    expect(lines).toEqual([
      "error: The comment group needs a subcommand.",
      "hint: rata issue comment create RAT-1",
    ])
    expect(recorder.requests).toHaveLength(0)
    expect(process.exitCode).toBe(2)
  })
})
