import type { MemoryIssue, MemorySeed } from "@test/fake-linear/gateway/model"

import { memoryApiLayer } from "@test/fake-linear/memory-layer"
import { defaultViewer } from "@test/fake-linear/model"
import { describe, expect, test } from "bun:test"
import { Effect, Option, Schema } from "effect"

import { IssueApi } from "@/api/issue"
import { issueId, labelId, projectId, teamId, userId, workflowStateId } from "@/domain/id"
import { Viewer } from "@/linear/decode/viewer"

const viewer = Option.getOrThrow(Schema.decodeUnknownOption(Viewer)(defaultViewer))
const uuid = "5f0c1f2a-3b4c-4d5e-8f90-1234567890ab"
const team = {
  id: teamId(uuid),
  key: "RAT",
  name: "Rata",
  timezone: "America/Los_Angeles",
  states: [
    { id: workflowStateId("state-1"), name: "Todo", type: "unstarted" as const, position: 0 },
    {
      id: workflowStateId("state-2"),
      name: "In Progress",
      type: "started" as const,
      position: 1,
    },
  ],
}
const user = { id: userId(defaultViewer.id), name: "Ada", displayName: "ada" }
const label = { id: labelId("l1"), name: "ready-for-agent" }
const project = { id: projectId("p1"), name: "Tracker" }
const parent = { id: issueId("issue-RAT-0"), identifier: "RAT-0", title: "Map" }

const issue = (input: {
  readonly identifier: string
  readonly priority?: "urgent" | "high" | "medium" | "low" | "none"
  readonly state?: { readonly name: string; readonly type: "unstarted" | "started" }
  readonly assignee?: typeof user | null
  readonly labels?: readonly { readonly id: ReturnType<typeof labelId>; readonly name: string }[]
  readonly project?: typeof project | null
  readonly parent?: typeof parent | null
  readonly description?: string
  readonly inverseRelations?: MemoryIssue["inverseRelations"]
}): MemoryIssue => ({
  summary: {
    id: issueId(`issue-${input.identifier}`),
    identifier: input.identifier,
    title: `Title ${input.identifier}`,
    url: `https://linear.app/acme/issue/${input.identifier}/title`,
    state: input.state ?? { name: "In Progress", type: "started" },
    priority: input.priority ?? "urgent",
    createdAt: "2026-01-01T08:00:00.000Z",
    updatedAt: "2026-01-01T09:00:00.000Z",
    assignee: input.assignee === undefined ? user : input.assignee,
    project: input.project === undefined ? project : input.project,
    parent: input.parent === undefined ? parent : input.parent,
    labels: { nodes: input.labels ?? [label] },
  },
  description: input.description ?? "A login flow",
  team,
  inverseRelations: input.inverseRelations,
})

const parentIssue = issue({ identifier: "RAT-0", assignee: null, parent: null, project: null })

const seed = (
  issues: readonly MemoryIssue[],
  options: { readonly includeParent?: boolean } = {},
): MemorySeed => ({
  viewer,
  teams: [team],
  labels: [{ id: label.id, name: label.name, color: "#111111", teamId: team.id }],
  projects: [
    {
      id: project.id,
      name: project.name,
      progress: 0.5,
      status: { name: "Started" },
      trashed: false,
    },
  ],
  issues: [...(options.includeParent === true ? [parentIssue] : []), ...issues],
})

const run = <A, E>(memorySeed: MemorySeed, effect: Effect.Effect<A, E, IssueApi>): Promise<A> =>
  effect.pipe(
    Effect.provide(
      memoryApiLayer(memorySeed, {
        repositories: [{ key: process.cwd(), team: "RAT" }],
      }),
    ),
    Effect.runPromise,
  )

const list = (memorySeed: MemorySeed, options: Parameters<IssueApi["Service"]["list"]>[0]) =>
  run(
    memorySeed,
    Effect.gen(function* readPage() {
      const api = yield* IssueApi
      return yield* api.list(options)
    }),
  )

describe("IssueApi list", () => {
  test("composes every list filter", async () => {
    const page = await list(
      seed(
        [
          issue({ identifier: "RAT-1" }),
          issue({
            identifier: "RAT-2",
            state: { name: "Todo", type: "unstarted" },
          }),
          issue({ identifier: "RAT-3", priority: "low" }),
          issue({ identifier: "RAT-4", labels: [] }),
          issue({ identifier: "RAT-5", assignee: null }),
          issue({ identifier: "RAT-6", project: null }),
          issue({ identifier: "RAT-7", description: "No matching text" }),
          issue({
            identifier: "RAT-8",
            inverseRelations: [
              {
                type: "blocks",
                issue: {
                  id: issueId("issue-blocker"),
                  identifier: "RAT-9",
                  title: "Blocker",
                  state: { name: "Todo", type: "unstarted" },
                },
              },
            ],
          }),
        ],
        { includeParent: true },
      ),
      {
        team: "RAT",
        state: "In Progress",
        stateType: "started",
        priority: "urgent",
        label: "ready-for-agent",
        assignee: "me",
        project: "Tracker",
        parent: "RAT-0",
        text: "login",
        unblocked: true,
        after: null,
        limit: 50,
      },
    )

    expect(page.issues.map((entry) => entry.identifier)).toEqual(["RAT-1"])
    expect(page.issues[0]?.createdAt).toBe("2026-01-01T08:00:00.000Z")
    expect(page.issues[0]?.updatedAt).toBe("2026-01-01T09:00:00.000Z")
  })

  test("uses the team id when the value is a UUID", async () => {
    const page = await list(seed([issue({ identifier: "RAT-1" })]), {
      team: uuid,
      after: null,
      limit: 50,
    })

    expect(page.issues.map((entry) => entry.identifier)).toEqual(["RAT-1"])
  })

  test("returns the priority union on the summary records", async () => {
    const page = await list(
      seed([
        issue({ identifier: "RAT-1", priority: "urgent" }),
        issue({ identifier: "RAT-2", priority: "high" }),
        issue({ identifier: "RAT-3", priority: "low" }),
        issue({ identifier: "RAT-4", priority: "none" }),
      ]),
      { after: null, limit: 50 },
    )

    expect(page.issues.map((entry) => entry.priority)).toEqual(["urgent", "high", "low", "none"])
  })

  test("reads one page and returns its page info without draining", async () => {
    const page = await list(
      seed([
        issue({ identifier: "RAT-1" }),
        issue({ identifier: "RAT-2" }),
        issue({ identifier: "RAT-3" }),
      ]),
      { limit: 2, after: null },
    )

    expect(page.issues.map((entry) => entry.identifier)).toEqual(["RAT-1", "RAT-2"])
    expect(page.pageInfo).toEqual({
      hasNextPage: true,
      endCursor: "issue-RAT-2",
    })

    const next = await list(
      seed([
        issue({ identifier: "RAT-1" }),
        issue({ identifier: "RAT-2" }),
        issue({ identifier: "RAT-3" }),
      ]),
      { limit: 2, after: "issue-RAT-2" },
    )

    expect(next.issues.map((entry) => entry.identifier)).toEqual(["RAT-3"])
    expect(next.pageInfo).toEqual({ hasNextPage: false, endCursor: "issue-RAT-3" })
  })

  test("keeps the unblocked filter when it continues from a cursor", async () => {
    const memorySeed = seed([
      issue({ identifier: "RAT-1", assignee: null }),
      issue({ identifier: "RAT-2", assignee: null }),
      issue({
        identifier: "RAT-3",
        assignee: null,
        inverseRelations: [
          {
            type: "blocks",
            issue: {
              id: issueId("issue-blocker"),
              identifier: "RAT-9",
              title: "Blocker",
              state: { name: "Todo", type: "unstarted" },
            },
          },
        ],
      }),
    ])
    const first = await list(memorySeed, {
      unblocked: true,
      unassigned: true,
      after: null,
      limit: 1,
    })
    const cursor = first.pageInfo.endCursor
    expect(cursor).not.toBeNull()
    if (cursor === null) {
      return
    }
    const second = await list(memorySeed, {
      unblocked: true,
      unassigned: true,
      after: cursor,
      limit: 1,
    })

    expect(first.issues.map((entry) => entry.identifier)).toEqual(["RAT-1"])
    expect(first.pageInfo).toEqual({ hasNextPage: true, endCursor: "issue-RAT-1" })
    expect(second.issues.map((entry) => entry.identifier)).toEqual(["RAT-2"])
    expect(second.pageInfo).toEqual({ hasNextPage: false, endCursor: "issue-RAT-2" })
  })
})

describe("IssueApi search", () => {
  test("reads one relevance-ranked page and passes the cursor", async () => {
    const memorySeed = seed([
      issue({ identifier: "RAT-1", description: "login flow" }),
      issue({ identifier: "RAT-2", description: "login screen" }),
      issue({ identifier: "RAT-3", description: "login retry" }),
    ])
    const page = await run(
      memorySeed,
      Effect.gen(function* searchIssues() {
        const api = yield* IssueApi
        return yield* api.search("login", { after: "issue-RAT-1", limit: 10 })
      }),
    )

    expect(page.issues.map((entry) => entry.identifier)).toEqual(["RAT-2", "RAT-3"])
    expect(page.pageInfo).toEqual({ hasNextPage: false, endCursor: "issue-RAT-3" })
  })
})
