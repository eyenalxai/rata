import { lastJson, runIssue } from "@test/cli-harness"
import { inputOf } from "@test/fake-linear/model"
import { body } from "@test/issue-body/fixtures"
import { requestOf } from "@test/issue-write/fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

const ErrorEnvelope = Schema.Struct({
  error: Schema.Struct({ code: Schema.String, hint: Schema.NullOr(Schema.String) }),
})

const UpdateDryRun = Schema.Struct({
  dryRun: Schema.Boolean,
  actions: Schema.Array(
    Schema.Struct({
      action: Schema.String,
      target: Schema.String,
      changes: Schema.Record(Schema.String, Schema.Unknown),
      diff: Schema.optional(Schema.String),
    }),
  ),
})

const decodeError = (value: unknown) =>
  Option.getOrThrow(Schema.decodeUnknownOption(ErrorEnvelope)(value)).error

afterEach(() => {
  process.exitCode = 0
})

describe("issue update --append", () => {
  test("appends to a non-empty description with a blank line", async () => {
    const { recorder, state } = body("Intro.")
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      ["update", "RAT-1", "--body", "Next.", "--append", "--json"],
      lines,
    )

    expect(state.description).toBe("Intro.\n\nNext.")
    expect(lastJson(lines)).toMatchObject({
      issue: { identifier: "RAT-1", updatedAt: "2026-01-02T09:00:00.000Z" },
    })
  })

  test("sets the body when the description is empty", async () => {
    const { recorder, state } = body(null)
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      ["update", "RAT-1", "--body", "First.", "--append", "--json"],
      lines,
    )

    expect(state.description).toBe("First.")
  })

  test("requires a body", async () => {
    const { recorder } = body("Intro.")
    const lines: string[] = []

    await runIssue(recorder.handler, ["update", "RAT-1", "--append"], lines)

    expect(lines).toContain("error: The --append flag needs --body or --body-file.")
    expect(recorder.requests).toHaveLength(0)
    expect(process.exitCode).toBe(1)
  })

  test("rejects an empty body", async () => {
    const { recorder } = body("Intro.")
    const lines: string[] = []

    await runIssue(recorder.handler, ["update", "RAT-1", "--body", "  ", "--append"], lines)

    expect(lines).toContain("error: The body to append is empty.")
    expect(recorder.requests).toHaveLength(0)
  })

  test("previews the diff without writing", async () => {
    const { recorder, state } = body("Intro.")
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      ["update", "RAT-1", "--body", "Next.", "--append", "--dry-run", "--json"],
      lines,
    )

    const payload = Option.getOrThrow(Schema.decodeUnknownOption(UpdateDryRun)(lastJson(lines)))
    expect(payload.dryRun).toBe(true)
    expect(payload.actions[0]).toMatchObject({
      action: "update",
      target: "RAT-1",
      changes: { body: "append" },
    })
    expect(payload.actions[0]?.diff).toContain("+Next.")
    expect(state.description).toBe("Intro.")
    expect(requestOf(recorder, "mutation UpdateIssue")).toBeUndefined()
  })
})

describe("issue update dry run", () => {
  test("prints the planned changes without writing", async () => {
    const { recorder } = body("Intro.")
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      ["update", "RAT-1", "--title", "New title", "--dry-run", "--json"],
      lines,
    )

    expect(lastJson(lines)).toMatchObject({
      dryRun: true,
      actions: [{ action: "update", target: "RAT-1", changes: { title: "New title" } }],
    })
    expect(requestOf(recorder, "mutation UpdateIssue")).toBeUndefined()
  })
})

describe("issue update --if-unchanged", () => {
  test("writes when updatedAt still matches", async () => {
    const { recorder } = body("Intro.")
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      [
        "update",
        "RAT-1",
        "--priority",
        "high",
        "--if-unchanged",
        "2026-01-01T09:00:00.000Z",
        "--json",
      ],
      lines,
    )

    expect(inputOf(requestOf(recorder, "mutation UpdateIssue")?.variables ?? {})).toEqual({
      priority: 2,
    })
    expect(lastJson(lines)).toMatchObject({
      issue: { identifier: "RAT-1", updatedAt: "2026-01-02T09:00:00.000Z" },
    })
  })

  test("fails with conflict and names the current updatedAt", async () => {
    const { recorder } = body("Intro.")
    const lines: string[] = []

    await runIssue(
      recorder.handler,
      [
        "update",
        "RAT-1",
        "--priority",
        "high",
        "--if-unchanged",
        "2025-01-01T09:00:00.000Z",
        "--json",
      ],
      lines,
    )

    const error = decodeError(lastJson(lines))
    expect(error.code).toBe("conflict")
    expect(error.hint).toBe(
      "The current updatedAt is 2026-01-01T09:00:00.000Z. Re-read the issue and retry.",
    )
    expect(requestOf(recorder, "mutation UpdateIssue")).toBeUndefined()
  })
})
