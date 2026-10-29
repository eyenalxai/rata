import { lastJson, runRoot } from "@test/cli-harness"
import { body } from "@test/issue-body/fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Result, Schema } from "effect"

import type { MissionState } from "@/domain/mission/state"

import { readSection } from "@/domain/body/section"
import { readMissionSection } from "@/domain/mission/state"

const InitResult = Schema.Struct({
  dryRun: Schema.Boolean,
  status: Schema.Literals(["created", "skipped"]),
  issue: Schema.optional(Schema.Struct({ identifier: Schema.String })),
  target: Schema.optional(Schema.String),
  diff: Schema.optional(Schema.String),
})

const ErrorEnvelope = Schema.Struct({
  error: Schema.Struct({ code: Schema.String, message: Schema.String }),
})

const decodeResult = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(InitResult)(lastJson(lines)))

const decodeError = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(ErrorEnvelope)(lastJson(lines))).error

const stateOf = (text: string): MissionState => {
  const section = Result.getOrThrow(readSection(text, "Mission"))
  const read = readMissionSection(section.content)
  const mission = Result.getOrThrow(read)
  if (mission._tag !== "state") {
    throw new Error("Expected a mission state block.")
  }
  return mission.state
}

const headingCount = (text: string, heading: string): number =>
  text.split("\n").filter((line) => line === `## ${heading}`).length

const updateRequests = (recorder: ReturnType<typeof body>["recorder"]): number =>
  recorder.requests.filter((request) => request.query.includes("mutation UpdateIssue")).length

afterEach(() => {
  process.exitCode = 0
})

describe("mission init", () => {
  test("writes the summary, the block and the missing tables", async () => {
    const { recorder, state } = body(null)
    const lines: string[] = []

    await runRoot(
      recorder.handler,
      ["mission", "init", "RAT-1", "--goal", "ship 0.9.0", "--exit", "merged", "--json"],
      lines,
    )

    expect(process.exitCode ?? 0).toBe(0)
    expect(decodeResult(lines)).toMatchObject({
      dryRun: false,
      status: "created",
      issue: { identifier: "RAT-1" },
    })
    const written = state.description ?? ""
    expect(written).toContain("## Mission")
    expect(written).toContain("Status: active")
    expect(written).toContain("```json")
    expect(headingCount(written, "Session plan")).toBe(1)
    expect(headingCount(written, "References")).toBe(1)
    expect(stateOf(written)).toMatchObject({
      schema: 1,
      status: "active",
      scope: "feature",
      phase: "classify",
      gate: { name: "Scope and understanding", status: "pending", method: "grill" },
      goal: "ship 0.9.0",
      exit: "merged",
      session: 1,
    })
    expect(stateOf(written).gates).toHaveLength(4)
  })

  test("returns skipped when a block already exists", async () => {
    const { recorder, state } = body(null)
    const first: string[] = []

    await runRoot(recorder.handler, ["mission", "init", "RAT-1", "--json"], first)
    const writes = updateRequests(recorder)
    const second: string[] = []

    await runRoot(recorder.handler, ["mission", "init", "RAT-1", "--json"], second)

    expect(decodeResult(second).status).toBe("skipped")
    expect(updateRequests(recorder)).toBe(writes)
    expect(stateOf(state.description ?? "").phase).toBe("classify")
  })

  test("rewrites an existing block with --reset", async () => {
    const { recorder, state } = body(null)
    const first: string[] = []

    await runRoot(recorder.handler, ["mission", "init", "RAT-1"], first)
    const second: string[] = []

    await runRoot(
      recorder.handler,
      ["mission", "init", "RAT-1", "--phase", "implement", "--gate", "PR", "--reset", "--json"],
      second,
    )

    expect(decodeResult(second).status).toBe("created")
    expect(stateOf(state.description ?? "")).toMatchObject({
      phase: "implement",
      gate: { name: "PR", status: "pending", method: "code-review" },
    })
  })

  test("prints a diff and writes nothing with --dry-run", async () => {
    const { recorder, state } = body("## Flow\n\n- [X] classify\n")
    const lines: string[] = []

    await runRoot(recorder.handler, ["mission", "init", "RAT-1", "--dry-run", "--json"], lines)

    const result = decodeResult(lines)
    expect(result.dryRun).toBe(true)
    expect(result.status).toBe("created")
    expect(result.diff).toContain("+## Mission")
    expect(updateRequests(recorder)).toBe(0)
    expect(state.description).toBe("## Flow\n\n- [X] classify\n")
  })

  test("replaces a legacy Mission section and keeps the rest", async () => {
    const { recorder, state } = body("## Mission\n\nOld prose.\n\n## Flow\n\n- [X] classify\n")
    const lines: string[] = []

    await runRoot(recorder.handler, ["mission", "init", "RAT-1"], lines)

    const written = state.description ?? ""
    expect(written).not.toContain("Old prose.")
    expect(written).toContain("## Flow\n\n- [X] classify")
    expect(headingCount(written, "Mission")).toBe(1)
    expect(stateOf(written).phase).toBe("classify")
  })

  test("keeps existing tables and their rows", async () => {
    const { recorder, state } = body(
      [
        "## Session plan",
        "",
        "| Session | Work | Exit |",
        "| -- | -- | -- |",
        "| 1 | classify | approval |",
        "",
        "## References",
        "",
        "| Reference | Why | Path or URL | Phase |",
        "| -- | -- | -- | -- |",
        "| ADR-0008 | parser rules | docs/adr/0008.md | spec |",
        "",
      ].join("\n"),
    )
    const lines: string[] = []

    await runRoot(recorder.handler, ["mission", "init", "RAT-1"], lines)

    const written = state.description ?? ""
    expect(headingCount(written, "Session plan")).toBe(1)
    expect(headingCount(written, "References")).toBe(1)
    expect(written).toContain("| 1 | classify | approval |")
    expect(written).toContain("| ADR-0008 | parser rules | docs/adr/0008.md | spec |")
  })

  test("rejects a malformed block with a validation error", async () => {
    const { recorder, state } = body('## Mission\n\n```json\n{"schema": 1}\n```\n')
    const lines: string[] = []

    await runRoot(recorder.handler, ["mission", "init", "RAT-1", "--json"], lines)

    expect(process.exitCode).toBe(2)
    expect(decodeError(lines).code).toBe("validation")
    expect(updateRequests(recorder)).toBe(0)
    expect(state.description).toBe('## Mission\n\n```json\n{"schema": 1}\n```\n')
  })

  test("rejects a malformed table row with a validation error", async () => {
    const { recorder } = body(
      [
        "## Session plan",
        "",
        "| Session | Work | Exit |",
        "| -- | -- | -- |",
        "| 1 | grill |",
        "",
      ].join("\n"),
    )
    const lines: string[] = []

    await runRoot(recorder.handler, ["mission", "init", "RAT-1", "--json"], lines)

    expect(process.exitCode).toBe(2)
    expect(decodeError(lines).code).toBe("validation")
    expect(updateRequests(recorder)).toBe(0)
  })

  test("rejects an unknown gate", async () => {
    const { recorder } = body(null)
    const lines: string[] = []

    await runRoot(
      recorder.handler,
      ["mission", "init", "RAT-1", "--gate", "Launch", "--json"],
      lines,
    )

    expect(process.exitCode).toBe(2)
    expect(decodeError(lines).code).toBe("validation")
  })

  test("rejects a session below one", async () => {
    const { recorder } = body(null)
    const lines: string[] = []

    await runRoot(recorder.handler, ["mission", "init", "RAT-1", "--session", "0", "--json"], lines)

    expect(process.exitCode).toBe(2)
    expect(decodeError(lines).code).toBe("validation")
  })
})
