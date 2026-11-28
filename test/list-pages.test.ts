import type { MemoryIssue, MemorySeed } from "@test/fake-linear/gateway/model"

import { lastJson, runRootMemory } from "@test/cli-harness"
import { defaultViewer } from "@test/fake-linear/model"
import { describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

import { issueId, labelId, projectId, teamId, userId } from "@/domain/id"
import { Viewer } from "@/linear/decode/viewer"

const viewer = Option.getOrThrow(Schema.decodeUnknownOption(Viewer)(defaultViewer))

const team = {
  id: teamId("00000000-0000-0000-0000-000000000001"),
  key: "RAT",
  name: "Rata",
  timezone: "America/Los_Angeles",
}
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

const tracker = {
  id: projectId("project-1"),
  name: "Tracker",
  progress: 0.5,
  status: { name: "Started" },
  trashed: false,
}
const login = {
  id: projectId("project-2"),
  name: "Login",
  progress: 0,
  status: { name: "Backlog" },
  trashed: false,
}

const projects = [tracker, login]
const trashedProjects = [tracker, { ...login, trashed: true }]

const assignee = { id: userId("u1"), name: "Ada", displayName: "ada" }

const issue = (identifier: string): MemoryIssue => ({
  summary: {
    id: issueId(`issue-${identifier}`),
    identifier,
    title: `Title ${identifier}`,
    url: `https://linear.app/acme/issue/${identifier}/title`,
    state: { name: "Todo", type: "unstarted" },
    priority: "none",
    createdAt: "2026-01-01T08:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    assignee,
    project: null,
    parent: null,
    labels: { nodes: [] },
  },
  description: `Body ${identifier}`,
  team,
})

const seed = (input: Partial<MemorySeed> = {}): MemorySeed => ({
  viewer,
  teams: [team, otherTeam],
  labels,
  projects,
  issues: [issue("RAT-1"), issue("RAT-2")],
  ...input,
})

describe("team list pages", () => {
  test("returns one page with pageInfo and continues from --after", async () => {
    const first: string[] = []
    await runRootMemory(
      seed(),
      ["admin", "team", "list", "--limit", "1", "--format", "json"],
      first,
    )
    expect(lastJson(first)).toEqual({
      teams: [team],
      pageInfo: { hasNextPage: true, endCursor: "00000000-0000-0000-0000-000000000001" },
    })

    const second: string[] = []
    await runRootMemory(
      seed(),
      [
        "admin",
        "team",
        "list",
        "--limit",
        "1",
        "--after",
        "00000000-0000-0000-0000-000000000001",
        "--format",
        "json",
      ],
      second,
    )
    expect(lastJson(second)).toEqual({
      teams: [otherTeam],
      pageInfo: { hasNextPage: false, endCursor: "team-2" },
    })
  })

  test("prints a next-page hint in the human output", async () => {
    const lines: string[] = []
    await runRootMemory(seed(), ["admin", "team", "list", "--limit", "1"], lines)
    expect(lines.flatMap((line) => line.split("\n"))).toEqual([
      "RAT\tRata\t00000000-0000-0000-0000-000000000001",
      "More teams available. Continue with --after 00000000-0000-0000-0000-000000000001",
    ])
  })

  test("rejects --limit above 250 before the API call", async () => {
    const lines: string[] = []
    await runRootMemory(seed(), ["admin", "team", "list", "--limit", "500"], lines)
    expect(lines).toContain("error: The --limit flag must be at most 250.")
  })
})

describe("project list pages", () => {
  test("returns one page with pageInfo", async () => {
    const lines: string[] = []
    await runRootMemory(
      seed(),
      ["admin", "project", "list", "--limit", "1", "--format", "json"],
      lines,
    )
    expect(lastJson(lines)).toEqual({
      projects: [projects[0]],
      pageInfo: { hasNextPage: true, endCursor: "project-1" },
    })
  })

  test("includes trashed projects with --include-archived and marks them", async () => {
    const lines: string[] = []
    await runRootMemory(
      seed({ projects: trashedProjects }),
      ["admin", "project", "list", "--include-archived"],
      lines,
    )
    expect(lines.flatMap((line) => line.split("\n"))).toEqual([
      "Tracker\tStarted\t50%\tproject-1",
      "Login (deleted)\tBacklog\t0%\tproject-2",
    ])
  })

  test("carries the trashed flag in --include-archived JSON", async () => {
    const lines: string[] = []
    await runRootMemory(
      seed({ projects: trashedProjects }),
      ["admin", "project", "list", "--include-archived", "--format", "json"],
      lines,
    )
    expect(lastJson(lines)).toEqual({
      projects: trashedProjects,
      pageInfo: { hasNextPage: false, endCursor: "project-2" },
    })
  })

  test("hides trashed projects without the flag", async () => {
    const lines: string[] = []
    await runRootMemory(seed({ projects: trashedProjects }), ["admin", "project", "list"], lines)
    expect(lines.flatMap((line) => line.split("\n"))).toEqual(["Tracker\tStarted\t50%\tproject-1"])
  })
})

describe("label list pages", () => {
  test("returns one page with pageInfo", async () => {
    const lines: string[] = []
    await runRootMemory(
      seed(),
      ["admin", "label", "list", "--team", "RAT", "--limit", "1", "--format", "json"],
      lines,
    )
    expect(lastJson(lines)).toEqual({
      labels: [{ id: labelId("label-1"), name: "ready-for-agent", color: "#111111" }],
      pageInfo: { hasNextPage: true, endCursor: "label-1" },
    })
  })

  test("prints the color in the human output", async () => {
    const lines: string[] = []
    await runRootMemory(seed(), ["admin", "label", "list", "--team", "RAT"], lines)
    expect(lines.flatMap((line) => line.split("\n"))).toEqual([
      "ready-for-agent\tlabel-1\t#111111",
      "bug\tlabel-2\t#EB5757",
    ])
  })
})

describe("issue list pages", () => {
  test("prints pure JSON when a next page exists", async () => {
    const lines: string[] = []
    await runRootMemory(seed(), ["issue", "list", "--limit", "1", "--format", "json"], lines)
    expect(lines).toHaveLength(1)
    expect(lastJson(lines)).toEqual({
      issues: [expect.objectContaining({ identifier: "RAT-1" })],
      pageInfo: { hasNextPage: true, endCursor: "issue-RAT-1" },
    })
  })

  test("selects the creation time with --fields createdAt", async () => {
    const lines: string[] = []
    await runRootMemory(
      seed(),
      ["issue", "list", "--limit", "1", "--format", "json", "--select", "createdAt"],
      lines,
    )
    expect(lastJson(lines)).toEqual({
      issues: [{ createdAt: "2026-01-01T08:00:00.000Z" }],
      pageInfo: { hasNextPage: true, endCursor: "issue-RAT-1" },
    })
  })

  test("drains every page with --all and keeps the limit as the page size", async () => {
    const lines: string[] = []
    await runRootMemory(
      seed(),
      ["issue", "list", "--all", "--limit", "1", "--format", "json"],
      lines,
    )
    expect(lastJson(lines)).toEqual({
      issues: [
        expect.objectContaining({ identifier: "RAT-1" }),
        expect.objectContaining({ identifier: "RAT-2" }),
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    })
  })
})
