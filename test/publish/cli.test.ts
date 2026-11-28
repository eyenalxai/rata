import type { MemorySeed } from "@test/fake-linear/gateway/model"

import { seed, viewer } from "@test/apply/fixtures"
import { lastJson, runIssueMemory } from "@test/cli-harness"
import { makeMemoryGateway } from "@test/fake-linear/gateway/memory"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Predicate, Schema, Stream } from "effect"

import type { LinearGatewayShape } from "@/linear/gateway"

const recordOf = (value: unknown): Record<string, unknown> =>
  Option.getOrThrow(Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown))(value))

const resultOf = (lines: readonly string[]): Record<string, unknown> =>
  recordOf(recordOf(lastJson(lines)).result)

const itemsOf = (lines: readonly string[], key: string): readonly Record<string, unknown>[] => {
  const value = recordOf(lastJson(lines))[key]
  return Array.isArray(value) ? value.map(recordOf) : []
}

const runPublish = async (
  seedValue: MemorySeed,
  gateway: LinearGatewayShape,
  document: unknown,
  extraArgs: readonly string[] = [],
) => {
  const lines: string[] = []
  await runIssueMemory(
    seedValue,
    ["publish", "--file", "-", "--format", "json", ...extraArgs],
    lines,
    undefined,
    {
      gateway,
      stdio: { stdin: Stream.make(new TextEncoder().encode(JSON.stringify(document))) },
    },
  )
  return lines
}

const readDoc = async (seedValue: MemorySeed, gateway: LinearGatewayShape, ref: string) => {
  const lines: string[] = []
  await runIssueMemory(
    seedValue,
    [ref, "--full", "--comments", "--format", "json"],
    lines,
    undefined,
    { gateway },
  )
  return recordOf(lastJson(lines))
}

type CountedGateway = {
  readonly gateway: LinearGatewayShape
  readonly batches: () => number
  readonly batchSizes: () => readonly number[]
  readonly relations: () => number
  readonly reset: () => void
}

const countingGateway = (base: LinearGatewayShape): CountedGateway => {
  let batches = 0
  let relations = 0
  const sizes: number[] = []
  const execute: LinearGatewayShape["client"]["execute"] = (query, variables, schema) => {
    if (query.includes("mutation IssueBatchCreate")) {
      batches += 1
      const input = variables.input
      const issues = Predicate.isObject(input) ? Reflect.get(input, "issues") : undefined
      if (Array.isArray(issues)) {
        sizes.push(issues.length)
      }
    }
    if (query.includes("mutation IssueRelationCreate")) {
      relations += 1
    }
    return base.client.execute(query, variables, schema)
  }
  return {
    gateway: { ...base, client: { ...base.client, execute } },
    batches: () => batches,
    batchSizes: () => sizes,
    relations: () => relations,
    reset: () => {
      batches = 0
      relations = 0
      sizes.length = 0
    },
  }
}

const retryDocument = (specBlocker: boolean) => ({
  team: "RAT",
  parent: "RAT-1",
  defaults: { priority: "medium", labels: ["ready-for-agent"], assignee: "me" },
  nodes: [
    {
      key: "spec",
      kind: "spec",
      title: "The spec",
      ...(specBlocker ? { blockedBy: ["client"] } : {}),
    },
    { key: "client", kind: "ticket", title: "The client" },
    { key: "cache", kind: "ticket", title: "The cache", blockedBy: ["client"] },
  ],
})

afterEach(() => {
  process.exitCode = 0
})

describe("issue publish", () => {
  test("creates a parent, its children and their blocking edges", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const lines = await runPublish(seedValue, gateway, {
      team: "RAT",
      parent: "RAT-1",
      defaults: { priority: "medium", labels: ["ready-for-agent"], assignee: "me" },
      nodes: [
        {
          key: "spec",
          kind: "spec",
          title: "The spec",
          body: "The spec body",
          priority: "high",
        },
        { key: "client", kind: "ticket", title: "The client", body: "Client body" },
        {
          key: "cache",
          kind: "ticket",
          title: "The cache",
          body: "Cache body",
          blockedBy: ["client"],
        },
      ],
    })

    const result = resultOf(lines)
    expect(result).toMatchObject({
      action: "publish",
      status: "updated",
      dryRun: false,
      snapshot: "2026-01-03T00:00:00.000Z",
    })
    expect(result.changed).toEqual(
      expect.arrayContaining(["node:spec", "node:client", "node:cache", "edge:cache:client"]),
    )
    const nodes = itemsOf(lines, "nodes")
    expect(nodes).toHaveLength(3)
    expect(
      nodes
        .map((node) => `${String(node.key)}:${String(node.kind)}:${String(node.action)}`)
        .toSorted(),
    ).toEqual(["spec:spec:created", "client:ticket:created", "cache:ticket:created"].toSorted())
    expect(nodes.every((node) => typeof node.identifier === "string")).toBe(true)
    expect(itemsOf(lines, "edges")).toEqual([
      expect.objectContaining({ from: "client", to: "cache", action: "created" }),
    ])

    const spec = nodes.find((node) => node.key === "spec")
    const client = nodes.find((node) => node.key === "client")
    const cache = nodes.find((node) => node.key === "cache")
    expect(spec?.identifier).toBeDefined()
    expect(client?.identifier).toBeDefined()
    expect(cache?.identifier).toBeDefined()

    const specDoc = await readDoc(seedValue, gateway, String(spec?.identifier))
    expect(recordOf(specDoc.parent)).toMatchObject({ identifier: "RAT-1" })
    expect(recordOf(specDoc.state)).toMatchObject({ name: "Todo", type: "unstarted" })
    expect(recordOf(specDoc.assignee)).toMatchObject({ id: viewer.id })
    expect(specDoc.priority).toBe("high")
    expect(specDoc.labels).toEqual([expect.objectContaining({ name: "ready-for-agent" })])

    const cacheDoc = await readDoc(seedValue, gateway, String(cache?.identifier))
    expect(recordOf(cacheDoc.parent)).toMatchObject({ identifier: "RAT-1" })
    expect(cacheDoc.priority).toBe("medium")
    expect(cacheDoc.blockedBy).toEqual([
      expect.objectContaining({ identifier: client?.identifier }),
    ])

    const parentDoc = await readDoc(seedValue, gateway, "RAT-1")
    const children = Array.isArray(parentDoc.children) ? parentDoc.children.map(recordOf) : []
    expect(children.map((child) => String(child.identifier)).toSorted()).toEqual(
      [spec?.identifier, client?.identifier, cache?.identifier].map(String).toSorted(),
    )
  })

  test("a child names a parent created in the same call", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const lines = await runPublish(seedValue, gateway, {
      team: "RAT",
      defaults: { assignee: "me" },
      nodes: [
        { key: "epic", kind: "spec", title: "The epic" },
        { key: "ticket", kind: "ticket", title: "The ticket", parent: "epic" },
        {
          key: "follow",
          kind: "ticket",
          title: "The follow-up",
          parent: "epic",
          blockedBy: ["ticket"],
        },
      ],
    })

    const nodes = itemsOf(lines, "nodes")
    const epic = nodes.find((node) => node.key === "epic")
    const ticket = nodes.find((node) => node.key === "ticket")
    const follow = nodes.find((node) => node.key === "follow")
    expect(resultOf(lines)).toMatchObject({ status: "updated" })
    expect(epic?.parent).toBeNull()
    expect(ticket?.parent).toBe("epic")
    expect(follow?.parent).toBe("epic")

    const ticketDoc = await readDoc(seedValue, gateway, String(ticket?.identifier))
    expect(recordOf(ticketDoc.parent)).toMatchObject({ identifier: epic?.identifier })
    const followDoc = await readDoc(seedValue, gateway, String(follow?.identifier))
    expect(recordOf(followDoc.parent)).toMatchObject({ identifier: epic?.identifier })
    expect(followDoc.blockedBy).toEqual([
      expect.objectContaining({ identifier: ticket?.identifier }),
    ])
  })

  test("a node parent and a blocker may name existing issue references", async () => {
    const seedValue = seed()
    const gateway = makeMemoryGateway(seedValue)
    const lines = await runPublish(seedValue, gateway, {
      team: "RAT",
      nodes: [
        {
          key: "ticket",
          kind: "ticket",
          title: "The ticket",
          parent: "RAT-1",
          blockedBy: ["RAT-9"],
        },
      ],
    })

    expect(resultOf(lines)).toMatchObject({ status: "updated", snapshot: null })
    const ticket = itemsOf(lines, "nodes")[0]
    expect(ticket?.parent).toBe("RAT-1")
    expect(itemsOf(lines, "edges")).toEqual([
      expect.objectContaining({ from: "RAT-9", to: "ticket", action: "created" }),
    ])
    const ticketDoc = await readDoc(seedValue, gateway, String(ticket?.identifier))
    expect(recordOf(ticketDoc.parent)).toMatchObject({ identifier: "RAT-1" })
    expect(ticketDoc.blockedBy).toEqual([expect.objectContaining({ identifier: "RAT-9" })])
  })

  test("a retry reuses the nodes and adds only the missing edge", async () => {
    const seedValue = seed()
    const counted = countingGateway(makeMemoryGateway(seedValue))
    const first = await runPublish(seedValue, counted.gateway, retryDocument(false))
    expect(counted.batches()).toBe(1)
    expect(counted.relations()).toBe(1)
    const firstIdentifiers = new Map(
      itemsOf(first, "nodes").map((node) => [node.key, node.identifier]),
    )

    counted.reset()
    const second = await runPublish(seedValue, counted.gateway, retryDocument(true))
    expect(counted.batches()).toBe(0)
    expect(counted.relations()).toBe(1)
    expect(resultOf(second)).toMatchObject({ status: "updated", changed: ["edge:spec:client"] })
    expect(
      itemsOf(second, "nodes")
        .map((node) => `${String(node.key)}:${String(node.action)}`)
        .toSorted(),
    ).toEqual(["spec:reused", "client:reused", "cache:reused"].toSorted())
    expect(new Map(itemsOf(second, "nodes").map((node) => [node.key, node.identifier]))).toEqual(
      firstIdentifiers,
    )
    expect(
      itemsOf(second, "edges")
        .map((edge) => `${String(edge.from)}->${String(edge.to)}:${String(edge.action)}`)
        .toSorted(),
    ).toEqual(["client->cache:skipped", "client->spec:created"].toSorted())

    const third = await runPublish(seedValue, counted.gateway, retryDocument(true))
    expect(resultOf(third)).toMatchObject({ status: "skipped", changed: [] })
    expect(counted.batches()).toBe(0)
    expect(counted.relations()).toBe(1)
  })

  test("a dry run returns the plan and writes nothing", async () => {
    const seedValue = seed()
    const counted = countingGateway(makeMemoryGateway(seedValue))
    const lines = await runPublish(
      seedValue,
      counted.gateway,
      {
        team: "RAT",
        parent: "RAT-1",
        defaults: { priority: "medium", labels: ["ready-for-agent"], assignee: "me" },
        nodes: [
          { key: "spec", kind: "spec", title: "The spec" },
          { key: "client", kind: "ticket", title: "The client", blockedBy: ["spec"] },
        ],
      },
      ["--dry-run"],
    )

    expect(resultOf(lines)).toMatchObject({ status: "updated", dryRun: true })
    expect(counted.batches()).toBe(0)
    expect(counted.relations()).toBe(0)
    expect(itemsOf(lines, "nodes")).toEqual([
      expect.objectContaining({ key: "spec", action: "create", identifier: null }),
      expect.objectContaining({ key: "client", action: "create", identifier: null }),
    ])
    expect(itemsOf(lines, "edges")).toEqual([
      expect.objectContaining({ from: "spec", to: "client", action: "create" }),
    ])
    expect(resultOf(lines).changed).toEqual(["node:spec", "node:client", "edge:client:spec"])

    const parentDoc = await readDoc(seedValue, counted.gateway, "RAT-1")
    expect(parentDoc.children).toEqual([])
  })

  test("a cycle and a missing key fail before the first write", async () => {
    const seedValue = seed()
    const counted = countingGateway(makeMemoryGateway(seedValue))

    const cycle = await runPublish(seedValue, counted.gateway, {
      team: "RAT",
      nodes: [
        { key: "a", kind: "ticket", title: "A", parent: "b" },
        { key: "b", kind: "ticket", title: "B", parent: "a" },
      ],
    })
    expect(process.exitCode).toBe(2)
    expect(lastJson(cycle)).toMatchObject({ error: { code: "validation" } })
    expect(counted.batches()).toBe(0)
    expect(counted.relations()).toBe(0)

    process.exitCode = 0
    const missing = await runPublish(seedValue, counted.gateway, {
      team: "RAT",
      nodes: [{ key: "a", kind: "ticket", title: "A", blockedBy: ["missing"] }],
    })
    expect(process.exitCode).toBe(2)
    expect(lastJson(missing)).toMatchObject({ error: { code: "validation" } })
    expect(counted.batches()).toBe(0)
    expect(counted.relations()).toBe(0)
  })

  test("a partial edge failure reports the created nodes and the failed edge", async () => {
    const seedValue = seed({ failOn: ["mutation IssueRelationCreate"] })
    const gateway = makeMemoryGateway(seedValue)
    const lines = await runPublish(seedValue, gateway, {
      team: "RAT",
      parent: "RAT-1",
      defaults: { priority: "medium", labels: ["ready-for-agent"], assignee: "me" },
      nodes: [
        { key: "spec", kind: "spec", title: "The spec" },
        { key: "client", kind: "ticket", title: "The client", blockedBy: ["spec"] },
      ],
    })

    const result = resultOf(lines)
    expect(result).toMatchObject({
      status: "failed",
      dryRun: false,
      failed: { action: "link", target: "client <- spec", status: "failed" },
      error: { code: "internal" },
    })
    expect(result.changed).toEqual(["node:spec", "node:client"])
    expect(itemsOf(lines, "nodes")).toEqual([
      expect.objectContaining({ key: "spec", action: "created" }),
      expect.objectContaining({ key: "client", action: "created" }),
    ])
    expect(itemsOf(lines, "edges")).toEqual([
      expect.objectContaining({ from: "spec", to: "client", action: "failed" }),
    ])
    expect(process.exitCode).toBe(1)

    const spec = itemsOf(lines, "nodes").find((node) => node.key === "spec")
    const specDoc = await readDoc(seedValue, gateway, String(spec?.identifier))
    expect(recordOf(specDoc.parent)).toMatchObject({ identifier: "RAT-1" })
  })

  test("a failed batch reports the failed nodes and no created nodes", async () => {
    const seedValue = seed({ failOn: ["mutation IssueBatchCreate"] })
    const gateway = makeMemoryGateway(seedValue)
    const lines = await runPublish(seedValue, gateway, {
      team: "RAT",
      parent: "RAT-1",
      nodes: [
        { key: "spec", kind: "spec", title: "The spec" },
        { key: "client", kind: "ticket", title: "The client", blockedBy: ["spec"] },
      ],
    })

    expect(resultOf(lines)).toMatchObject({
      status: "failed",
      changed: [],
      failed: { action: "create", target: "spec, client", status: "failed" },
      error: { code: "internal" },
    })
    expect(itemsOf(lines, "nodes")).toEqual([
      expect.objectContaining({ key: "spec", action: "failed", identifier: null }),
      expect.objectContaining({ key: "client", action: "failed", identifier: null }),
    ])
    expect(itemsOf(lines, "edges")).toEqual([
      expect.objectContaining({ from: "spec", to: "client", action: "create" }),
    ])
    expect(process.exitCode).toBe(1)
  })

  test("creates at most fifty nodes per batch", async () => {
    const seedValue = seed()
    const counted = countingGateway(makeMemoryGateway(seedValue))
    const lines = await runPublish(seedValue, counted.gateway, {
      team: "RAT",
      nodes: Array.from({ length: 51 }, (_, index) => ({
        key: `node-${index}`,
        kind: "ticket",
        title: `Node ${index}`,
      })),
    })

    expect(counted.batches()).toBe(2)
    expect(counted.batchSizes()).toEqual([50, 1])
    expect(itemsOf(lines, "nodes")).toHaveLength(51)
    expect(itemsOf(lines, "nodes").every((node) => node.action === "created")).toBe(true)
  })
})
