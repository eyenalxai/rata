import type { MemoryIssue, MemorySeed, MemoryTeam } from "@test/fake-linear/gateway/model"

import { countingGateway } from "@test/fake-linear/gateway/counting"
import { memoryApiLayer } from "@test/fake-linear/memory-layer"
import { defaultPriorities, defaultViewer } from "@test/fake-linear/model"
import { summaryNode } from "@test/issue-fixtures"
import { recordingConsoleWithErrors } from "@test/recording-console"
import { describe, expect, test } from "bun:test"
import { Console, Effect, Option, Schema } from "effect"

import { resolveIssueContext } from "@/cli/issue/context"
import { ContextResolver } from "@/context/resolve"
import { labelId, teamId, workflowStateId } from "@/domain/id"
import { IssueSummaryNode } from "@/linear/decode/issue"
import { Viewer } from "@/linear/decode/viewer"
import { IssueReader } from "@/tracker/read"

const viewer = Option.getOrThrow(Schema.decodeOption(Viewer)(defaultViewer))

const team: MemoryTeam = {
  id: teamId("team-1"),
  key: "RAT",
  name: "Rata",
  timezone: "America/Los_Angeles",
  states: [
    { id: workflowStateId("s-todo"), name: "Todo", type: "unstarted", position: 1 },
    { id: workflowStateId("s-done"), name: "Done", type: "completed", position: 2 },
  ],
  labels: [
    { id: labelId("l1"), name: "ready-for-agent", color: "#111111", scope: "team" },
    { id: labelId("l2"), name: "bug", color: "#EB5757", scope: "workspace" },
  ],
  members: [],
  priorities: [...defaultPriorities],
}

const otherTeam: MemoryTeam = {
  id: teamId("team-2"),
  key: "OPS",
  name: "Operations",
  timezone: "America/New_York",
  states: [],
  labels: [],
  members: [],
  priorities: [...defaultPriorities],
}

const issue = (identifier: string, owner: MemoryTeam): MemoryIssue => ({
  summary: Option.getOrThrow(Schema.decodeUnknownOption(IssueSummaryNode)(summaryNode(identifier))),
  description: `Body ${identifier}`,
  team: { id: owner.id, key: owner.key, name: owner.name },
})

const seed: MemorySeed = {
  viewer,
  teams: [team, otherTeam],
  labels: [],
  issues: [issue("RAT-1", team), issue("RAT-2", team), issue("OPS-1", otherTeam)],
}

const repositories = [{ key: process.cwd(), team: "RAT", teamId: "team-1" }]
const env = { HOME: "/home/test", LINEAR_API_KEY: "test-key" }

const program = <A, E>(
  counting: ReturnType<typeof countingGateway>,
  effect: Effect.Effect<A, E, ContextResolver | IssueReader>,
) =>
  effect.pipe(
    Effect.provide(memoryApiLayer(seed, { env, gateway: counting.gateway, repositories })),
    Effect.runPromise,
  )

const readList = (options: Parameters<IssueReader["Service"]["list"]>[1]) =>
  Effect.gen(function* listIssues() {
    const resolver = yield* ContextResolver
    const reader = yield* IssueReader
    const context = yield* resolver.resolve({ team: options.team, viewer: false })
    return yield* reader.list(context, options)
  })

const readWorkingSet = (refs: readonly string[]) =>
  Effect.gen(function* readWorkingSetIssues() {
    const reader = yield* IssueReader
    return yield* reader.workingSet(refs, { comments: false, mode: "working" })
  })

describe("IssueReader", () => {
  test("reads a list, a search and a working set from the context", async () => {
    const counting = countingGateway(seed)
    const result = await program(
      counting,
      Effect.gen(function* readIssues() {
        const resolver = yield* ContextResolver
        const reader = yield* IssueReader
        const context = yield* resolver.resolve({})
        const list = yield* reader.list(context, { after: null, limit: 50 })
        const workingSet = yield* reader.workingSet(["RAT-1"], {
          comments: false,
          mode: "working",
        })
        const search = yield* reader.search(context, "Body", { after: null, limit: 10 })
        return { list, search, workingSet }
      }),
    )

    expect(result.list.issues.map((row) => row.identifier)).toEqual(["RAT-1", "RAT-2"])
    expect(result.workingSet.items[0]?.identifier).toBe("RAT-1")
    const item = result.workingSet.items[0]
    expect(item !== undefined && "description" in item ? item.description : undefined).toBe(
      "Body RAT-1",
    )
    expect(result.search.issues.map((row) => row.identifier)).toEqual(["RAT-1", "RAT-2"])
  })

  test("uses an explicit team context for the list and search", async () => {
    const counting = countingGateway(seed)
    const result = await program(
      counting,
      Effect.gen(function* readOtherTeam() {
        const resolver = yield* ContextResolver
        const reader = yield* IssueReader
        const context = yield* resolver.resolve({ team: "OPS" })
        const list = yield* reader.list(context, { after: null, limit: 50 })
        const search = yield* reader.search(context, "Body", { after: null, limit: 10 })
        return { list, search }
      }),
    )

    expect(result.list.issues.map((row) => row.identifier)).toEqual(["OPS-1"])
    expect(result.search.issues.map((row) => row.identifier)).toEqual(["OPS-1"])
  })
})

describe("IssueReader context use", () => {
  test("list resolves the viewer only for --assignee me", async () => {
    const counting = countingGateway(seed)
    await program(counting, readList({ after: null, assignee: "me", limit: 50 }))

    expect(counting.counts.viewer()).toBe(1)
    expect(counting.counts.details()).toBe(1)
  })

  test("the working set does not resolve the viewer or the link", async () => {
    const counting = countingGateway(seed)
    await program(counting, readWorkingSet(["RAT-1"]))

    expect(counting.counts.viewer()).toBe(0)
    expect(counting.counts.details()).toBe(0)
    expect(counting.counts.byId()).toBe(0)
    expect(counting.counts.workingSets()).toBe(1)
  })

  test("list prints the stale-link warning", async () => {
    const counting = countingGateway(seed)
    const errors: string[] = []
    await Effect.gen(function* listStale() {
      const reader = yield* IssueReader
      const context = yield* resolveIssueContext({ viewer: false })
      yield* reader.list(context, { after: null, limit: 50 })
    }).pipe(
      Effect.provide(
        memoryApiLayer(seed, {
          env,
          gateway: counting.gateway,
          repositories: [{ key: process.cwd(), team: "OLD", teamId: "team-1" }],
        }),
      ),
      Effect.provideService(Console.Console, recordingConsoleWithErrors([], errors)),
      Effect.runPromise,
    )

    expect(errors).toEqual(["warning: The stored team key OLD is stale. Repaired the link to RAT."])
  })

  test("the adapter resolves once for two list calls", async () => {
    const counting = countingGateway(seed)
    await program(
      counting,
      Effect.gen(function* listTwice() {
        yield* readList({ after: null, limit: 50 })
        yield* readList({ after: null, limit: 50 })
      }),
    )

    expect(counting.counts.viewer()).toBe(0)
    expect(counting.counts.details()).toBe(1)
    expect(counting.counts.byId()).toBe(1)
  })

  test("the adapter resolves once for a working-set read", async () => {
    const counting = countingGateway(seed)
    await program(counting, readWorkingSet(["RAT-1"]))

    expect(counting.counts.viewer()).toBe(0)
    expect(counting.counts.details()).toBe(0)
    expect(counting.counts.byId()).toBe(0)
    expect(counting.counts.workingSets()).toBe(1)
  })

  test("an unknown state filter refreshes the team detail once", async () => {
    const counting = countingGateway(seed)
    const error = await program(
      counting,
      Effect.flip(readList({ after: null, limit: 50, state: "Nope" })),
    )

    expect(error._tag).toBe("ContextStateNotFoundError")
    expect(counting.counts.details()).toBe(2)
  })
})
