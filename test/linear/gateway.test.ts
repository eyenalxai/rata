import type { MemoryIssue, MemorySeed } from "@test/fake-linear/gateway/model"

import { makeMemoryGateway } from "@test/fake-linear/gateway/memory"
import { defaultViewer } from "@test/fake-linear/model"
import { describe, expect, test } from "bun:test"
import { Effect, Option, Schema } from "effect"

import {
  attachmentId,
  commentId,
  issueId,
  labelId,
  projectId,
  teamId,
  userId,
  workflowStateId,
} from "@/domain/id"
import { IssueRef } from "@/domain/issue-ref"
import { Viewer } from "@/linear/decode/viewer"

const viewer = Option.getOrThrow(Schema.decodeUnknownOption(Viewer)(defaultViewer))
const issueRef = (value: string) => Option.getOrThrow(Schema.decodeUnknownOption(IssueRef)(value))

const team = {
  id: teamId("00000000-0000-0000-0000-000000000001"),
  key: "RAT",
  name: "Rata",
  timezone: "America/Los_Angeles",
  states: [
    { id: workflowStateId("state-1"), name: "Todo", type: "unstarted", position: 0 },
    { id: workflowStateId("state-2"), name: "In Progress", type: "started", position: 1 },
    { id: workflowStateId("state-3"), name: "Done", type: "completed", position: 2 },
  ],
  members: [{ id: userId("u1"), name: "Ada", displayName: "ada", email: "ada@example.com" }],
  labels: [{ id: labelId("label-1"), name: "ready-for-agent", color: "#111111", scope: "team" }],
  priorities: [
    { priority: 0, label: "No priority" },
    { priority: 1, label: "Urgent" },
    { priority: 2, label: "High" },
    { priority: 3, label: "Medium" },
    { priority: 4, label: "Low" },
  ],
} as const

const assignee = { id: userId("u1"), name: "Ada", displayName: "ada" }
const label = { id: labelId("label-1"), name: "ready-for-agent" }
const project = { id: projectId("project-1"), name: "Tracker" }
const parent = { id: issueId("issue-parent"), identifier: "RAT-0", title: "Map" }

const issue = (input: {
  readonly identifier: string
  readonly priority?: "urgent" | "high" | "medium" | "low" | "none"
  readonly createdAt?: string
  readonly state?: { readonly name: string; readonly type: "unstarted" | "started" | "completed" }
  readonly assignee?: typeof assignee | null
  readonly labels?: readonly { readonly id: ReturnType<typeof labelId>; readonly name: string }[]
  readonly project?: typeof project | null
  readonly parent?: typeof parent | null
  readonly description?: string
}): MemoryIssue => {
  const state = input.state ?? { name: "Todo", type: "unstarted" }
  return {
    summary: {
      id: issueId(`issue-${input.identifier}`),
      identifier: input.identifier,
      title: `Title ${input.identifier}`,
      url: `https://linear.app/acme/issue/${input.identifier}/title`,
      state,
      priority: input.priority ?? "none",
      createdAt: input.createdAt ?? "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      assignee: input.assignee === undefined ? assignee : input.assignee,
      project: input.project === undefined ? project : input.project,
      parent: input.parent === undefined ? parent : input.parent,
      labels: { nodes: input.labels ?? [label] },
    },
    description: input.description ?? `Body ${input.identifier}`,
    team,
  }
}

const blocker = {
  id: issueId("issue-blocker"),
  identifier: "RAT-9",
  title: "Blocker",
  state: { name: "Todo", type: "unstarted" as const },
}

const dependent = {
  id: issueId("issue-dependent"),
  identifier: "RAT-8",
  title: "Dependent",
  state: { name: "Todo", type: "unstarted" as const },
}

const issueWithRelations: MemoryIssue = {
  ...issue({ identifier: "RAT-4" }),
  relations: [{ type: "blocks", relatedIssue: dependent }],
  inverseRelations: [{ type: "blocks", issue: blocker }],
  attachments: [
    {
      id: attachmentId("attachment-1"),
      title: "Design",
      subtitle: null,
      url: "https://example.com/design",
      sourceType: "link",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  comments: [
    {
      id: commentId("comment-2"),
      body: "Second",
      createdAt: "2026-01-03T00:00:00.000Z",
      user: assignee,
    },
    {
      id: commentId("comment-1"),
      body: "First",
      createdAt: "2026-01-01T00:00:00.000Z",
      user: assignee,
    },
  ],
  children: [dependent],
}

const seed: MemorySeed = {
  viewer,
  teams: [team],
  labels: [{ id: labelId("label-1"), name: "ready-for-agent", color: "#111111", teamId: team.id }],
  projects: [
    {
      id: projectId("project-1"),
      name: "Tracker",
      progress: 0.5,
      status: { name: "Started" },
      trashed: false,
    },
  ],
  issues: [
    issue({ identifier: "RAT-1", priority: "low", createdAt: "2026-01-05T00:00:00.000Z" }),
    issue({ identifier: "RAT-2", priority: "urgent", createdAt: "2026-01-05T00:00:00.000Z" }),
    issue({ identifier: "RAT-3", priority: "high", createdAt: "2026-01-04T00:00:00.000Z" }),
    issueWithRelations,
  ],
}

const gateway = makeMemoryGateway(seed)

describe("LinearGateway reads", () => {
  test("filters issues by team, state, label, assignee, project, parent and text", async () => {
    const page = await Effect.runPromise(
      gateway.issue.list({
        teamId: team.id,
        state: "Todo",
        label: "ready-for-agent",
        assigneeId: userId("u1"),
        project: "Tracker",
        parentId: issueId("issue-parent"),
        text: "RAT-4",
        after: null,
        limit: 50,
      }),
    )

    expect(page.nodes.map((node) => node.identifier)).toEqual(["RAT-4"])
  })

  test("sorts on the priority rank and drains every page", async () => {
    const page = await Effect.runPromise(
      gateway.issue.list({ sort: "priority", all: true, after: null, limit: 1 }),
    )

    expect(page.nodes.map((node) => node.identifier)).toEqual(["RAT-2", "RAT-3", "RAT-1", "RAT-4"])
    expect(page.pageInfo).toEqual({ hasNextPage: false, endCursor: null })
  })

  test("returns one page with a cursor", async () => {
    const page = await Effect.runPromise(gateway.issue.list({ after: null, limit: 2 }))

    expect(page.nodes.map((node) => node.identifier)).toEqual(["RAT-1", "RAT-2"])
    expect(page.pageInfo).toEqual({ hasNextPage: true, endCursor: String(issueId("issue-RAT-2")) })
  })

  test("groups blocking relations in both directions in the full read", async () => {
    const page = await Effect.runPromise(
      gateway.issue.workingSet([issueRef("RAT-4")], { comments: false, mode: "full" }),
    )
    expect(page.mode).toBe("full")
    if (page.mode !== "full") {
      throw new Error("expected the full mode")
    }
    const detail = page.nodes[0]

    expect(detail?.relations.nodes.map((relation) => relation.relatedIssue.identifier)).toEqual([
      "RAT-8",
    ])
    expect(detail?.inverseRelations.nodes.map((relation) => relation.issue.identifier)).toEqual([
      "RAT-9",
    ])
  })

  test("omits comments unless requested, then sorts them", async () => {
    const lean = await Effect.runPromise(
      gateway.issue.workingSet([issueRef("RAT-4")], { comments: false, mode: "working" }),
    )
    const full = await Effect.runPromise(
      gateway.issue.workingSet([issueRef("RAT-4")], { comments: true, mode: "working" }),
    )
    if (lean.mode !== "working" || full.mode !== "working") {
      throw new Error("expected the working mode")
    }

    expect(lean.nodes[0]?.comments).toBeUndefined()
    expect(full.nodes[0]?.comments?.nodes.map((comment) => comment.body)).toEqual([
      "First",
      "Second",
    ])
  })

  test("keeps comments off the summary and list rows", async () => {
    const summary = await Effect.runPromise(gateway.issue.summary(issueRef("RAT-4")))
    const page = await Effect.runPromise(gateway.issue.list({ after: null, limit: 1 }))

    expect(summary).not.toHaveProperty("comments")
    expect(page.nodes[0]).not.toHaveProperty("comments")
  })

  test("reads team detail, labels, projects and the viewer", async () => {
    const detail = await Effect.runPromise(gateway.team.details(team))
    const labels = await Effect.runPromise(
      gateway.label.listAvailable(team.id, { after: null, limit: 50 }),
    )
    const projects = await Effect.runPromise(gateway.project.list({ after: null, limit: 50 }))
    const currentViewer = await Effect.runPromise(gateway.viewer)

    expect(detail.states.map((state) => state.name)).toEqual(["Todo", "In Progress", "Done"])
    expect(labels.nodes.map((item) => item.name)).toEqual(["ready-for-agent"])
    expect(projects.nodes.map((item) => item.name)).toEqual(["Tracker"])
    expect(String(currentViewer.id)).toBe(defaultViewer.id)
  })

  test("finds users by id", async () => {
    const found = await Effect.runPromise(gateway.user.byId(userId("u1")))
    const missing = await Effect.runPromise(gateway.user.byId(userId("missing")))

    expect(found).toBe(userId("u1"))
    expect(Option.fromUndefinedOr(missing)).toEqual(Option.none())
  })
})
