import type { MemoryIssue, MemorySeed } from "@test/fake-linear/gateway/model"

import { lastJson, runRootMemory } from "@test/cli-harness"
import { defaultViewer } from "@test/fake-linear/model"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

import { issueId, labelId, projectId, teamId, userId } from "@/domain/id"
import { Viewer } from "@/linear/decode/viewer"

const viewer = Option.getOrThrow(Schema.decodeUnknownOption(Viewer)(defaultViewer))

const team = { id: teamId("team-1"), key: "RAT", name: "Rata", timezone: "America/Los_Angeles" }
const otherTeam = {
  id: teamId("team-2"),
  key: "OPS",
  name: "Operations",
  timezone: "America/New_York",
}

const labels = [
  { id: labelId("label-1"), name: "ready-for-agent", color: "#111111", teamId: team.id },
  { id: labelId("label-2"), name: "bug", color: "#EB5757", teamId: team.id },
]

const projects = [
  {
    id: projectId("project-1"),
    name: "Tracker",
    progress: 0.5,
    status: { name: "Started" },
    trashed: false,
  },
  {
    id: projectId("project-2"),
    name: "Login",
    progress: 0,
    status: { name: "Backlog" },
    trashed: false,
  },
]

const assignee = { id: userId("u1"), name: "Ada", displayName: "ada" }

const issue = (input: {
  readonly identifier: string
  readonly priority: "urgent" | "low" | "none"
  readonly description?: string
}): MemoryIssue => ({
  summary: {
    id: issueId(`issue-${input.identifier}`),
    identifier: input.identifier,
    title: `Title ${input.identifier}`,
    url: `https://linear.app/acme/issue/${input.identifier}/title`,
    state: { name: "Todo", type: "unstarted" },
    priority: input.priority,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    assignee,
    project: null,
    parent: null,
    labels: { nodes: [] },
  },
  description: input.description ?? `Body ${input.identifier}`,
  team,
})

const seed = (issues: readonly MemoryIssue[]): MemorySeed => ({
  viewer,
  teams: [team, otherTeam],
  labels,
  projects,
  issues,
})

const syntheticPageInfo = { hasNextPage: false, endCursor: null }

const IssuePageDocument = Schema.Struct({
  issues: Schema.Array(Schema.Struct({ identifier: Schema.String })),
  pageInfo: Schema.Unknown,
})

const pageDocumentOf = (lines: readonly string[]) =>
  Option.getOrThrow(Schema.decodeUnknownOption(IssuePageDocument)(lastJson(lines)))

afterEach(() => {
  process.exitCode = 0
})

describe("team list --all", () => {
  test("drains every page and returns synthetic pageInfo", async () => {
    const lines: string[] = []
    await runRootMemory(
      seed([]),
      ["team", "list", "--all", "--limit", "1", "--format", "json"],
      lines,
    )

    expect(lastJson(lines)).toEqual({
      teams: [team, otherTeam],
      pageInfo: syntheticPageInfo,
    })
  })

  test("suppresses the human next-page hint", async () => {
    const lines: string[] = []
    await runRootMemory(seed([]), ["team", "list", "--all", "--limit", "1"], lines)

    expect(lines.flatMap((line) => line.split("\n"))).toEqual([
      "RAT\tRata\tteam-1",
      "OPS\tOperations\tteam-2",
    ])
  })

  test("drains from --after", async () => {
    const lines: string[] = []
    await runRootMemory(
      seed([]),
      ["team", "list", "--all", "--after", "team-1", "--limit", "1", "--format", "json"],
      lines,
    )

    expect(lastJson(lines)).toEqual({ teams: [otherTeam], pageInfo: syntheticPageInfo })
  })
})

describe("project list --all", () => {
  test("drains every page and returns synthetic pageInfo", async () => {
    const lines: string[] = []
    await runRootMemory(
      seed([]),
      ["project", "list", "--all", "--limit", "1", "--format", "json"],
      lines,
    )

    expect(lastJson(lines)).toEqual({ projects, pageInfo: syntheticPageInfo })
  })
})

describe("label list --all", () => {
  test("drains every page and returns synthetic pageInfo", async () => {
    const lines: string[] = []
    await runRootMemory(
      seed([]),
      ["label", "list", "--team", "RAT", "--all", "--limit", "1", "--format", "json"],
      lines,
    )

    expect(lastJson(lines)).toEqual({
      labels: labels.map(({ id, name, color }) => ({ id, name, color })),
      pageInfo: syntheticPageInfo,
    })
  })
})

describe("issue list --all", () => {
  test("drains every page and returns synthetic pageInfo", async () => {
    const lines: string[] = []
    await runRootMemory(
      seed([
        issue({ identifier: "RAT-1", priority: "low" }),
        issue({ identifier: "RAT-2", priority: "urgent" }),
      ]),
      ["issue", "list", "--all", "--limit", "1", "--json"],
      lines,
    )

    const document = pageDocumentOf(lines)
    expect(document.issues.map((entry) => entry.identifier)).toEqual(["RAT-1", "RAT-2"])
    expect(document.pageInfo).toEqual(syntheticPageInfo)
  })

  test("drains from --after", async () => {
    const lines: string[] = []
    await runRootMemory(
      seed([
        issue({ identifier: "RAT-1", priority: "low" }),
        issue({ identifier: "RAT-2", priority: "urgent" }),
      ]),
      ["issue", "list", "--all", "--after", "issue-RAT-1", "--json"],
      lines,
    )

    expect(pageDocumentOf(lines).issues.map((entry) => entry.identifier)).toEqual(["RAT-2"])
  })

  test("suppresses the human next-page hint", async () => {
    const lines: string[] = []
    await runRootMemory(
      seed([
        issue({ identifier: "RAT-1", priority: "low" }),
        issue({ identifier: "RAT-2", priority: "urgent" }),
      ]),
      ["issue", "list", "--all", "--limit", "1"],
      lines,
    )

    expect(lines.flatMap((line) => line.split("\n"))).toHaveLength(2)
    expect(lines.join("\n")).not.toContain("More issues available")
  })

  test("composes with --sort without limiting the total", async () => {
    const lines: string[] = []
    await runRootMemory(
      seed([
        issue({ identifier: "RAT-1", priority: "low" }),
        issue({ identifier: "RAT-2", priority: "urgent" }),
      ]),
      ["issue", "list", "--all", "--sort", "priority", "--limit", "1", "--json"],
      lines,
    )

    expect(pageDocumentOf(lines).issues.map((entry) => entry.identifier)).toEqual([
      "RAT-2",
      "RAT-1",
    ])
  })
})

describe("search --all", () => {
  test("drains every page and returns synthetic pageInfo", async () => {
    const lines: string[] = []
    await runRootMemory(
      seed([
        issue({ identifier: "RAT-1", priority: "low", description: "login flow" }),
        issue({ identifier: "RAT-2", priority: "urgent", description: "login screen" }),
      ]),
      ["search", "login", "--all", "--limit", "1", "--json"],
      lines,
    )

    const document = pageDocumentOf(lines)
    expect(document.issues.map((entry) => entry.identifier)).toEqual(["RAT-1", "RAT-2"])
    expect(document.pageInfo).toEqual(syntheticPageInfo)
  })
})
