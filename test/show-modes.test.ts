import type { MemoryIssue, MemorySeed } from "@test/fake-linear/gateway/model"

import { lastJson, runIssueMemory } from "@test/cli-harness"
import { defaultViewer } from "@test/fake-linear/model"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

import { attachmentId, commentId, issueId, labelId, projectId, teamId, userId } from "@/domain/id"
import { Viewer } from "@/linear/decode/viewer"

const viewer = Option.getOrThrow(Schema.decodeUnknownOption(Viewer)(defaultViewer))
const team = { id: teamId("team-1"), key: "RAT", name: "Rata", timezone: "America/Los_Angeles" }
const user = { id: userId("u1"), name: "Ada", displayName: "ada" }
const label = { id: labelId("l1"), name: "ready-for-agent" }
const project = { id: projectId("p1"), name: "Tracker" }
const parent = { id: issueId("i0"), identifier: "RAT-0", title: "Map" }

const child = {
  id: issueId("i2"),
  identifier: "RAT-2",
  title: "Child",
  state: { name: "Todo", type: "unstarted" as const },
}
const dependent = {
  id: issueId("i8"),
  identifier: "RAT-8",
  title: "Dependent",
  state: { name: "Todo", type: "unstarted" as const },
}
const attachment = {
  id: attachmentId("a1"),
  title: "Design doc",
  subtitle: "Notion",
  url: "https://example.com/doc",
  sourceType: "link",
  createdAt: "2026-01-01T10:00:00.000Z",
}
const comment = {
  id: commentId("c1"),
  body: "First",
  createdAt: "2026-01-01T10:00:00.000Z",
  user,
}

const issue = (overrides: Partial<MemoryIssue> = {}): MemoryIssue => ({
  summary: {
    id: issueId("5f0c1f2a-3b4c-4d5e-8f90-1234567890ab"),
    identifier: "RAT-1",
    title: "Title RAT-1",
    url: "https://linear.app/eyenalx/issue/RAT-1/title",
    state: { name: "In Progress", type: "started" },
    priority: "urgent",
    createdAt: "2026-01-01T08:00:00.000Z",
    updatedAt: "2026-01-01T09:00:00.000Z",
    assignee: user,
    project,
    parent,
    labels: { nodes: [label] },
  },
  description: "Body",
  team,
  children: [child],
  relations: [{ type: "blocks", relatedIssue: dependent }],
  attachments: [attachment],
  comments: [comment],
  ...overrides,
})

const seed = (entry: MemoryIssue = issue()): MemorySeed => ({
  viewer,
  teams: [team],
  labels: [],
  issues: [entry],
})

const AnyShowDocument = Schema.Record(Schema.String, Schema.Unknown)
const ErrorEnvelope = Schema.Struct({ error: Schema.Struct({ code: Schema.String }) })

const documentOf = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(AnyShowDocument)(lastJson(lines)))

afterEach(() => {
  process.exitCode = 0
})

describe("issue show output modes", () => {
  test("--summary returns the lean document and skips the connections", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["show", "RAT-1", "--summary", "--json"], lines)

    const document = documentOf(lines)
    expect(Object.keys(document).toSorted()).toEqual([
      "assignee",
      "createdAt",
      "id",
      "identifier",
      "labels",
      "parent",
      "priority",
      "project",
      "state",
      "title",
      "updatedAt",
      "url",
    ])
  })

  test("hints the valid paths at the failing level of --fields", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed(),
      ["show", "RAT-1", "--summary", "--json", "--fields", "state.nope"],
      lines,
    )
    const error = Option.getOrThrow(
      Schema.decodeUnknownOption(
        Schema.Struct({ error: Schema.Struct({ code: Schema.String, hint: Schema.String }) }),
      )(lastJson(lines)),
    )
    expect(error.error.code).toBe("validation")
    expect(error.error.hint).toBe("Valid paths: name, type.")
  })

  test("rejects a prototype key in --fields", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed(),
      ["show", "RAT-1", "--summary", "--json", "--fields", "constructor"],
      lines,
    )
    const error = Option.getOrThrow(
      Schema.decodeUnknownOption(
        Schema.Struct({ error: Schema.Struct({ code: Schema.String, hint: Schema.String }) }),
      )(lastJson(lines)),
    )
    expect(error.error.code).toBe("validation")
    expect(error.error.hint).toBe(
      "Valid paths: assignee, createdAt, id, identifier, labels, parent, priority, project, state, title, updatedAt, url.",
    )
  })

  test("returns null when a field path crosses a null object", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed(issue({ summary: { ...issue().summary, assignee: null, parent: null } })),
      ["show", "RAT-1", "--summary", "--json", "--fields", "assignee.name,parent.identifier"],
      lines,
    )

    expect(lastJson(lines)).toEqual({ assignee: null, parent: null })
  })

  test("selects an array leaf as a whole", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed(),
      ["show", "RAT-1", "--summary", "--json", "--fields", "labels"],
      lines,
    )

    expect(lastJson(lines)).toEqual({ labels: [{ id: labelId("l1"), name: "ready-for-agent" }] })
  })

  test("projects a scalar leaf through an array", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed(),
      ["show", "RAT-1", "--summary", "--json", "--fields", "labels.name"],
      lines,
    )

    expect(lastJson(lines)).toEqual({ labels: ["ready-for-agent"] })
  })

  test("--no-body omits the description but keeps the full read", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["show", "RAT-1", "--json", "--no-body"], lines)

    const document = documentOf(lines)
    expect(document).not.toHaveProperty("description")
    expect(document).toHaveProperty("children")
  })

  test("--summary human output prints the header without the body", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["show", "RAT-1", "--summary"], lines)

    const output = lines.join("\n")
    expect(output).toContain("RAT-1: Title RAT-1")
    expect(output).toContain("url: https://linear.app/eyenalx/issue/RAT-1/title")
    expect(output).toContain("updatedAt: 2026-01-01T09:00:00.000Z")
    expect(output).not.toContain("Body")
  })

  test("--no-body human output omits the body and keeps the connections", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["show", "RAT-1", "--no-body"], lines)

    const output = lines.join("\n")
    expect(output).not.toContain("Body")
    expect(output).toContain("children:")
  })

  test("--no-relations --comments keeps the body, children, attachments and comments", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["show", "RAT-1", "--json", "--no-relations", "--comments"], lines)

    const document = documentOf(lines)
    expect(document).not.toHaveProperty("relations")
    expect(document).toHaveProperty("children")
    expect(document).toHaveProperty("attachments")
    expect(document).toHaveProperty("comments")
  })

  test("--no-children and --no-attachments skip their connections", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed(),
      ["show", "RAT-1", "--json", "--no-children", "--no-attachments"],
      lines,
    )

    const document = documentOf(lines)
    expect(document).not.toHaveProperty("children")
    expect(document).not.toHaveProperty("attachments")
  })

  test("rejects --summary with --comments before any fetch", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["show", "RAT-1", "--json", "--summary", "--comments"], lines)

    expect(
      Option.getOrThrow(Schema.decodeUnknownOption(ErrorEnvelope)(lastJson(lines))).error.code,
    ).toBe("validation")
    expect(process.exitCode).toBe(2)
  })

  test("view is an alias for show", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["view", "RAT-1", "--json"], lines)

    expect(documentOf(lines).identifier).toBe("RAT-1")
  })

  test("help lists the view alias", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["--help"], lines)

    expect(lines.join("\n")).toContain("show, view")
  })
})
