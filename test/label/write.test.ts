import type { Handler } from "@test/fake-linear/model"

import { cliLayer, lastJson } from "@test/cli-harness"
import { inputOf } from "@test/fake-linear/model"
import { jsonResponse, pageInfo } from "@test/issue-fixtures"
import { makeRecorder, requestOf, team } from "@test/issue-write-fixtures"
import { afterEach, describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Command } from "effect/cli"

import { labelCommand } from "@/cli/label"

const runLabel = (
  handler: Handler,
  args: readonly string[],
  lines: string[],
  repositories: { key: string; team?: string }[] = [{ key: process.cwd(), team: "RAT" }],
) =>
  Command.run(labelCommand, { version: "test" }).pipe(
    Effect.provide(cliLayer(handler, args, lines, repositories)),
    Effect.runPromise,
  )

afterEach(() => {
  process.exitCode = 0
})

const createHandler = () =>
  makeRecorder((request) => {
    if (request.query.includes("query TeamByKey")) {
      return jsonResponse({ data: { teams: { nodes: [team], pageInfo } } })
    }
    if (request.query.includes("mutation CreateLabel")) {
      const input = inputOf(request.variables)
      return jsonResponse({
        data: {
          issueLabelCreate: {
            success: true,
            issueLabel: {
              id: "label-9",
              name: input.name,
              color: typeof input.color === "string" ? input.color : "#5E6AD2",
            },
          },
        },
      })
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

describe("rata label create", () => {
  test("creates a team label with a normalized color", async () => {
    const recorder = createHandler()
    const lines: string[] = []
    await runLabel(
      recorder.handler,
      ["create", "--team", "RAT", "--name", "bug", "--color", "eb5757", "--json"],
      lines,
    )
    expect(requestOf(recorder, "mutation CreateLabel")?.variables).toEqual({
      input: { name: "bug", color: "#eb5757", teamId: "team-1" },
    })
    expect(lastJson(lines)).toEqual({ label: { id: "label-9", name: "bug", color: "#eb5757" } })
  })

  test("uses the repository team and omits a missing color", async () => {
    const recorder = createHandler()
    const lines: string[] = []
    await runLabel(recorder.handler, ["create", "--name", "bug"], lines)
    expect(requestOf(recorder, "mutation CreateLabel")?.variables).toEqual({
      input: { name: "bug", teamId: "team-1" },
    })
    expect(lines).toContain("Created label bug.")
  })

  test("rejects an invalid color before any request", async () => {
    const recorder = createHandler()
    const lines: string[] = []
    await runLabel(recorder.handler, ["create", "--name", "bug", "--color", "red"], lines)
    expect(lines).toContain("error: Expected a 6-digit hex color like #EB5757, got red.")
    expect(recorder.requests).toHaveLength(0)
    expect(process.exitCode).toBe(1)
  })

  test("fails without a team when the repository has no team", async () => {
    const recorder = createHandler()
    const lines: string[] = []
    await runLabel(recorder.handler, ["create", "--name", "bug"], lines, [])
    expect(lines).toContain("error: No team. Pass --team, or run `rata link`.")
    expect(recorder.requests).toHaveLength(0)
    expect(process.exitCode).toBe(1)
  })
})

const bug = { id: "label-2", name: "bug", color: "#EB5757" }

const editHandler = () =>
  makeRecorder((request) => {
    if (request.query.includes("query TeamByKey")) {
      const nodes = request.variables.key === team.key ? [team] : []
      return jsonResponse({ data: { teams: { nodes, pageInfo } } })
    }
    if (request.query.includes("query AvailableLabels")) {
      return jsonResponse({ data: { issueLabels: { nodes: [bug], pageInfo } } })
    }
    if (request.query.includes("mutation UpdateLabel")) {
      const input = inputOf(request.variables)
      return jsonResponse({
        data: {
          issueLabelUpdate: {
            success: true,
            issueLabel: {
              id: "label-2",
              name: typeof input.name === "string" ? input.name : bug.name,
              color: typeof input.color === "string" ? input.color : bug.color,
            },
          },
        },
      })
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

describe("rata label edit", () => {
  test("edits a label by name, ignoring case", async () => {
    const recorder = editHandler()
    const lines: string[] = []
    await runLabel(recorder.handler, ["edit", "BUG", "--color", "#00ff00", "--json"], lines)
    expect(requestOf(recorder, "mutation UpdateLabel")?.variables).toEqual({
      id: "label-2",
      input: { color: "#00ff00" },
    })
    expect(requestOf(recorder, "query AvailableLabels")?.query).toContain("team: { null: true }")
    expect(lastJson(lines)).toEqual({ label: { id: "label-2", name: "bug", color: "#00ff00" } })
  })

  test("edits a label by UUID without a name lookup", async () => {
    const ref = "11111111-2222-3333-4444-555555555555"
    const recorder = editHandler()
    const lines: string[] = []
    await runLabel(recorder.handler, ["edit", ref, "--name", "regression"], lines)
    expect(
      recorder.requests.some((request) => request.query.includes("query AvailableLabels")),
    ).toBe(false)
    expect(requestOf(recorder, "mutation UpdateLabel")?.variables).toEqual({
      id: ref,
      input: { name: "regression" },
    })
    expect(lines).toContain("Updated label regression.")
  })

  test("rejects an unknown team when editing by UUID", async () => {
    const ref = "11111111-2222-3333-4444-555555555555"
    const recorder = editHandler()
    const lines: string[] = []
    await runLabel(recorder.handler, ["edit", ref, "--color", "#ffffff", "--team", "NOPE"], lines)
    expect(lines.join("\n")).toContain("No team with key NOPE")
    expect(requestOf(recorder, "mutation UpdateLabel")).toBeUndefined()
    expect(process.exitCode).toBe(1)
  })

  test("fails when the name does not resolve", async () => {
    const recorder = editHandler()
    const lines: string[] = []
    await runLabel(recorder.handler, ["edit", "nope", "--color", "#00ff00"], lines)
    expect(lines.join("\n")).toContain("No label named nope")
    expect(requestOf(recorder, "mutation UpdateLabel")).toBeUndefined()
    expect(process.exitCode).toBe(1)
  })

  test("requires --name or --color", async () => {
    const recorder = editHandler()
    const lines: string[] = []
    await runLabel(recorder.handler, ["edit", "bug"], lines)
    expect(lines).toContain("error: Pass at least one of --name or --color.")
    expect(recorder.requests).toHaveLength(0)
    expect(process.exitCode).toBe(1)
  })
})
