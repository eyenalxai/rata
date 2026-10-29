import { lastJson, runIssue } from "@test/cli-harness"
import { commentHandler, commentNode } from "@test/issue-comment/fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

const ErrorEnvelope = Schema.Struct({
  error: Schema.Struct({ code: Schema.String, hint: Schema.NullOr(Schema.String) }),
})

const decodeError = (value: unknown) =>
  Option.getOrThrow(Schema.decodeUnknownOption(ErrorEnvelope)(value)).error

afterEach(() => {
  process.exitCode = 0
})

describe("issue comment update", () => {
  test("replaces the body", async () => {
    const { recorder, state } = commentHandler({ seeds: [commentNode("c1", "Old.")] })
    const lines: string[] = []
    await runIssue(recorder.handler, ["comment", "update", "c1", "--body", "New.", "--json"], lines)
    expect(state.updates).toBe(1)
    expect(lastJson(lines)).toMatchObject({ comment: { body: "New." } })
  })

  test("a missing id is not_found and writes nothing", async () => {
    const { recorder, state } = commentHandler()
    const lines: string[] = []
    await runIssue(recorder.handler, ["comment", "update", "c9", "--body", "New.", "--json"], lines)
    expect(decodeError(lastJson(lines)).code).toBe("not_found")
    expect(state.updates).toBe(0)
    expect(process.exitCode).toBe(1)
  })

  test("a dry run prints a diff and writes nothing", async () => {
    const { recorder, state } = commentHandler({ seeds: [commentNode("c1", "Old.")] })
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      ["comment", "update", "c1", "--body", "New.", "--dry-run", "--json"],
      lines,
    )
    expect(lastJson(lines)).toMatchObject({
      dryRun: true,
      action: "comment-update",
      target: "c1",
    })
    expect(JSON.stringify(lastJson(lines))).toContain("+New.")
    expect(state.updates).toBe(0)
  })
})

describe("issue comment delete", () => {
  test("deletes with --yes", async () => {
    const { recorder, state } = commentHandler({ seeds: [commentNode("c1", "Old.")] })
    const lines: string[] = []
    await runIssue(recorder.handler, ["comment", "delete", "c1", "--yes", "--json"], lines)
    expect(state.deletes).toBe(1)
    expect(state.comments.has("c1")).toBe(false)
    expect(lastJson(lines)).toEqual({ deleted: true, id: "c1" })
  })

  test("JSON without --yes is a validation error and writes nothing", async () => {
    const { recorder, state } = commentHandler({ seeds: [commentNode("c1", "Old.")] })
    const lines: string[] = []
    await runIssue(recorder.handler, ["comment", "delete", "c1", "--json"], lines)
    expect(decodeError(lastJson(lines))).toMatchObject({
      code: "validation",
      hint: "Pass --yes to delete a comment in JSON mode.",
    })
    expect(state.deletes).toBe(0)
    expect(process.exitCode).toBe(1)
  })

  test("a dry run writes nothing", async () => {
    const { recorder, state } = commentHandler({ seeds: [commentNode("c1", "Old.")] })
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      ["comment", "delete", "c1", "--dry-run", "--yes", "--json"],
      lines,
    )
    expect(lastJson(lines)).toMatchObject({
      dryRun: true,
      action: "comment-delete",
      target: "c1",
      comment: { id: "c1", body: "Old." },
    })
    expect(state.deletes).toBe(0)
  })

  test("a missing id is not_found", async () => {
    const { recorder, state } = commentHandler()
    const lines: string[] = []
    await runIssue(recorder.handler, ["comment", "delete", "c9", "--yes", "--json"], lines)
    expect(decodeError(lastJson(lines)).code).toBe("not_found")
    expect(state.deletes).toBe(0)
  })
})
