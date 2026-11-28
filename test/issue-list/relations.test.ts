import type { MemoryIssue, MemorySeed } from "@test/fake-linear/gateway/model"

import { lastJson, runIssueMemory } from "@test/cli-harness"
import { defaultViewer } from "@test/fake-linear/model"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

import { issueId, projectId, teamId, userId } from "@/domain/id"
import { Viewer } from "@/linear/decode/viewer"

const viewer = Option.getOrThrow(Schema.decodeUnknownOption(Viewer)(defaultViewer))

const team = {
  id: teamId("00000000-0000-0000-0000-000000000001"),
  key: "RAT",
  name: "Rata",
  timezone: "America/Los_Angeles",
}

const assignee = { id: userId("u1"), name: "Ada", displayName: "ada" }
const project = { id: projectId("project-1"), name: "Tracker" }
const parent = { id: issueId("issue-parent"), identifier: "RAT-0", title: "Map" }

const child = {
  id: issueId("issue-8"),
  identifier: "RAT-8",
  title: "Dependent",
  state: { name: "Todo", type: "unstarted" as const },
}
const blocker = {
  id: issueId("issue-9"),
  identifier: "RAT-9",
  title: "Blocker",
  state: { name: "Done", type: "completed" as const },
}
const duplicate = {
  id: issueId("issue-10"),
  identifier: "RAT-10",
  title: "Duplicate",
  state: { name: "Backlog", type: "backlog" as const },
}
const original = {
  id: issueId("issue-11"),
  identifier: "RAT-11",
  title: "Original",
  state: { name: "Todo", type: "unstarted" as const },
}
const related = {
  id: issueId("issue-12"),
  identifier: "RAT-12",
  title: "Related",
  state: { name: "In Progress", type: "started" as const },
}
const relatedSource = {
  id: issueId("issue-13"),
  identifier: "RAT-13",
  title: "Related source",
  state: { name: "Todo", type: "unstarted" as const },
}
const similar = {
  id: issueId("issue-14"),
  identifier: "RAT-14",
  title: "Similar",
  state: { name: "Backlog", type: "backlog" as const },
}
const similarSource = {
  id: issueId("issue-15"),
  identifier: "RAT-15",
  title: "Similar source",
  state: { name: "Todo", type: "unstarted" as const },
}

const relationsOf = () => ({
  blocks: [child],
  blockedBy: [blocker],
  duplicates: [duplicate],
  duplicatedBy: [original],
  related: [related, relatedSource],
  similar: [similar, similarSource],
})

const rowWithRelations = (
  identifier: string,
  inverseRelations: MemoryIssue["inverseRelations"] = [
    { type: "blocks", issue: blocker },
    { type: "duplicate", issue: original },
    { type: "related", issue: relatedSource },
    { type: "similar", issue: similarSource },
  ],
): MemoryIssue => ({
  summary: {
    id: issueId(`issue-${identifier}`),
    identifier,
    title: `Title ${identifier}`,
    url: `https://linear.app/acme/issue/${identifier}/title`,
    state: { name: "Todo", type: "unstarted" },
    priority: "none",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    assignee,
    project,
    parent,
    labels: { nodes: [] },
  },
  description: `Body ${identifier}`,
  team,
  relations: [
    { type: "blocks", relatedIssue: child },
    { type: "duplicate", relatedIssue: duplicate },
    { type: "related", relatedIssue: related },
    { type: "similar", relatedIssue: similar },
  ],
  inverseRelations,
})

const mapIssue: MemoryIssue = {
  summary: {
    id: issueId("issue-parent"),
    identifier: "RAT-0",
    title: "Map",
    url: "https://linear.app/acme/issue/RAT-0/map",
    state: { name: "Todo", type: "unstarted" },
    priority: "none",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    assignee,
    project,
    parent: null,
    labels: { nodes: [] },
  },
  description: "Map",
  team,
}

const seed = (issues: readonly MemoryIssue[]): MemorySeed => ({
  viewer,
  teams: [team],
  labels: [],
  projects: [
    {
      id: project.id,
      name: project.name,
      progress: 0.5,
      status: { name: "Started" },
      trashed: false,
    },
  ],
  issues,
})

const RelationChild = Schema.Struct({
  id: Schema.String,
  identifier: Schema.String,
  title: Schema.String,
  state: Schema.Struct({ name: Schema.String, type: Schema.String }),
})

const IssuePageDocument = Schema.Struct({
  issues: Schema.Array(
    Schema.Struct({
      identifier: Schema.String,
      relations: Schema.optional(
        Schema.Struct({
          blocks: Schema.Array(RelationChild),
          blockedBy: Schema.Array(RelationChild),
          duplicates: Schema.Array(RelationChild),
          duplicatedBy: Schema.Array(RelationChild),
          related: Schema.Array(RelationChild),
          similar: Schema.Array(RelationChild),
        }),
      ),
    }),
  ),
  pageInfo: Schema.Unknown,
})

const pageOf = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(IssuePageDocument)(lastJson(lines)))

afterEach(() => {
  process.exitCode = 0
})

describe("issue list --relations", () => {
  test("adds every relation group to the rows", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed([rowWithRelations("RAT-1")]),
      ["list", "--relations", "--format", "json"],
      lines,
    )

    const page = pageOf(lines)
    expect(page.issues.map((issue) => issue.identifier)).toEqual(["RAT-1"])
    expect(page.issues[0]?.relations).toEqual(relationsOf())
  })

  test("omits the relations key without the flag", async () => {
    const lines: string[] = []
    await runIssueMemory(seed([rowWithRelations("RAT-1")]), ["list", "--format", "json"], lines)

    expect(pageOf(lines).issues[0]?.relations).toBeUndefined()
  })

  test("composes with --select", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed([rowWithRelations("RAT-1")]),
      ["list", "--relations", "--format", "json", "--select", "relations.blocks"],
      lines,
    )

    expect(lastJson(lines)).toEqual({
      issues: [{ relations: { blocks: [child] } }],
      pageInfo: { hasNextPage: false, endCursor: "issue-RAT-1" },
    })
  })

  test("composes with filters and --all", async () => {
    const lines: string[] = []
    await runIssueMemory(
      seed([mapIssue, rowWithRelations("RAT-1", []), rowWithRelations("RAT-2", [])]),
      ["list", "--parent", "RAT-0", "--unblocked", "--relations", "--all", "--format", "json"],
      lines,
    )

    const page = pageOf(lines)
    expect(page.issues.map((issue) => issue.identifier)).toEqual(["RAT-1", "RAT-2"])
    expect(page.issues.every((issue) => issue.relations !== undefined)).toBe(true)
  })
})
