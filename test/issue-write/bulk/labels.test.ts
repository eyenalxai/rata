import { lastJson, runIssue } from "@test/cli-harness"
import { labels, mutations, recorderFor, seed } from "@test/issue-write/bulk/fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Result } from "effect"

import { parseLabelTarget } from "@/cli/issue-label"

afterEach(() => {
  process.exitCode = 0
})

describe("parseLabelTarget", () => {
  test("reads the first positional as the ref without --parent", () => {
    expect(Result.getOrThrow(parseLabelTarget("add", undefined, ["RAT-1", "bug"]))).toEqual({
      kind: "single",
      ref: "RAT-1",
      labels: ["bug"],
    })
  })

  test("reads every positional as a label with --parent", () => {
    expect(Result.getOrThrow(parseLabelTarget("add", "RAT-1", ["bug", "enhancement"]))).toEqual({
      kind: "bulk",
      parent: "RAT-1",
      labels: ["bug", "enhancement"],
    })
  })

  test("requires a label with --parent", () => {
    expect(Result.isFailure(parseLabelTarget("remove", "RAT-1", []))).toBe(true)
  })

  test("requires a ref and a label without --parent", () => {
    expect(Result.isFailure(parseLabelTarget("add", undefined, []))).toBe(true)
    expect(Result.isFailure(parseLabelTarget("add", undefined, ["RAT-1"]))).toBe(true)
  })
})

describe("bulk labels by parent", () => {
  test("treats every positional as a label with --parent", async () => {
    const recorder = recorderFor([seed("RAT-3")])
    const lines: string[] = []
    await runIssue(recorder.handler, ["label", "add", "--parent", "RAT-1", "bug", "--json"], lines)
    expect(lastJson(lines)).toMatchObject({
      results: [{ identifier: "RAT-3", status: "updated" }],
    })
    const [request] = mutations(recorder, "mutation AddLabel")
    expect(request?.variables.labelId).toBe("l-bug")
    expect(request?.variables.id).toBe("id-RAT-3")
  })

  test("adds several labels to every child", async () => {
    const recorder = recorderFor([seed("RAT-3"), seed("RAT-4")])
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      ["label", "add", "--parent", "RAT-1", "bug", "enhancement", "--json"],
      lines,
    )
    expect(lastJson(lines)).toMatchObject({
      results: [
        { identifier: "RAT-3", status: "updated" },
        { identifier: "RAT-4", status: "updated" },
      ],
    })
    expect(mutations(recorder, "mutation AddLabel")).toHaveLength(4)
  })

  test("skips a label that the child already has", async () => {
    const recorder = recorderFor([seed("RAT-3", { labels: [labels.bug] })])
    const lines: string[] = []
    await runIssue(recorder.handler, ["label", "add", "--parent", "RAT-1", "bug", "--json"], lines)
    expect(lastJson(lines)).toMatchObject({
      results: [{ identifier: "RAT-3", status: "skipped" }],
    })
    expect(mutations(recorder, "mutation AddLabel")).toHaveLength(0)
  })

  test("aborts the whole batch when a label is missing", async () => {
    const recorder = recorderFor([seed("RAT-3"), seed("RAT-4")])
    const lines: string[] = []
    await runIssue(recorder.handler, ["label", "add", "--parent", "RAT-1", "nope", "--json"], lines)
    expect(lines.join("\n")).toContain('"code": "not_found"')
    expect(mutations(recorder, "mutation AddLabel")).toHaveLength(0)
    expect(process.exitCode).toBe(1)
  })

  test("reports a mid-batch failure and exits 1", async () => {
    const recorder = recorderFor([seed("RAT-3"), seed("RAT-4")], { failOn: "id-RAT-4" })
    const lines: string[] = []
    await runIssue(recorder.handler, ["label", "add", "--parent", "RAT-1", "bug", "--json"], lines)
    expect(lastJson(lines)).toMatchObject({
      results: [
        { identifier: "RAT-3", status: "updated" },
        { identifier: "RAT-4", status: "failed" },
      ],
    })
    expect(process.exitCode).toBe(1)
  })

  test("dry-run reports the labels without writing", async () => {
    const recorder = recorderFor([seed("RAT-3")])
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      ["label", "add", "--parent", "RAT-1", "bug", "--dry-run", "--json"],
      lines,
    )
    expect(lastJson(lines)).toMatchObject({
      dryRun: true,
      results: [{ identifier: "RAT-3", status: "updated" }],
    })
    expect(mutations(recorder, "mutation AddLabel")).toHaveLength(0)
  })

  test("prints one human line per child", async () => {
    const recorder = recorderFor([seed("RAT-3", { labels: [labels.bug] }), seed("RAT-4")])
    const lines: string[] = []
    await runIssue(recorder.handler, ["label", "add", "--parent", "RAT-1", "bug"], lines)
    expect(lines).toEqual(["RAT-3 already has bug.", "Added bug to RAT-4."])
  })

  test("removes a label from every child", async () => {
    const recorder = recorderFor([
      seed("RAT-3", { labels: [labels.ready] }),
      seed("RAT-4", { labels: [labels.ready] }),
    ])
    const lines: string[] = []
    await runIssue(
      recorder.handler,
      ["label", "remove", "--parent", "RAT-1", "ready-for-agent", "--json"],
      lines,
    )
    expect(lastJson(lines)).toMatchObject({
      results: [
        { identifier: "RAT-3", status: "updated" },
        { identifier: "RAT-4", status: "updated" },
      ],
    })
    expect(mutations(recorder, "mutation RemoveLabel")).toHaveLength(2)
  })

  test("requires a label with --parent", async () => {
    const recorder = recorderFor([seed("RAT-3")])
    const lines: string[] = []
    await runIssue(recorder.handler, ["label", "add", "--parent", "RAT-1"], lines)
    expect(lines).toContain("error: At least one label is required.")
    expect(recorder.requests).toHaveLength(0)
    expect(process.exitCode).toBe(1)
  })
})
