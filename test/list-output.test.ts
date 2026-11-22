import type { MemoryIssue, MemorySeed } from "@test/fake-linear/gateway/model"

import { lastJson, runRootMemory } from "@test/cli-harness"
import { defaultViewer } from "@test/fake-linear/model"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

import { issueId, teamId, userId } from "@/domain/id"
import { Viewer } from "@/linear/decode/viewer"

const viewer = Option.getOrThrow(Schema.decodeUnknownOption(Viewer)(defaultViewer))
const team = { id: teamId("team-1"), key: "RAT", name: "Rata", timezone: "America/Los_Angeles" }
const assignee = { id: userId("u1"), name: "Ada", displayName: "ada" }

const issue = (input: {
  readonly identifier: string
  readonly priority?: "urgent" | "high" | "medium" | "low" | "none"
  readonly description?: string
  readonly parent?: {
    readonly id: ReturnType<typeof issueId>
    readonly identifier: string
    readonly title: string
  } | null
  readonly assignee?: typeof assignee | null
}): MemoryIssue => ({
  summary: {
    id: issueId(`issue-${input.identifier}`),
    identifier: input.identifier,
    title: `Title ${input.identifier}`,
    url: `https://linear.app/acme/issue/${input.identifier}/title`,
    state: { name: "Todo", type: "unstarted" },
    priority: input.priority ?? "none",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    assignee: input.assignee === undefined ? assignee : input.assignee,
    project: null,
    parent: input.parent ?? null,
    labels: { nodes: [] },
  },
  description: input.description ?? `Body ${input.identifier}`,
  team,
})

const seed = (issues: readonly MemoryIssue[]): MemorySeed => ({
  viewer,
  teams: [team],
  labels: [],
  issues,
})

const threeIssues = (): MemorySeed =>
  seed([
    issue({ identifier: "RAT-1" }),
    issue({ identifier: "RAT-2" }),
    issue({ identifier: "RAT-3" }),
  ])

const rankedIssues = (): MemorySeed =>
  seed([
    issue({ identifier: "RAT-2", description: "rate limit" }),
    issue({ identifier: "RAT-1", description: "rate limit" }),
    issue({ identifier: "RAT-3", description: "rate limit" }),
  ])

const parent = { id: issueId("issue-RAT-7"), identifier: "RAT-7", title: "Parent" }

const frontier = (): MemorySeed =>
  seed([
    issue({ identifier: "RAT-7" }),
    issue({ identifier: "RAT-2", priority: "urgent", parent, assignee: null }),
    issue({ identifier: "RAT-3", priority: "medium", parent, assignee: null }),
    issue({ identifier: "RAT-1", priority: "medium", parent, assignee: null }),
  ])

afterEach(() => {
  process.exitCode = 0
})

describe("issue list output flags", () => {
  test("prints one integer and drains every page with --limit as the page size", async () => {
    const lines: string[] = []
    await runRootMemory(threeIssues(), ["issue", "list", "--count", "--limit", "2"], lines)

    expect(lines).toEqual(["3"])
  })

  test("prints a count document with --json", async () => {
    const lines: string[] = []
    await runRootMemory(
      threeIssues(),
      ["issue", "list", "--count", "--limit", "2", "--json"],
      lines,
    )

    expect(lastJson(lines)).toEqual({ count: 3 })
  })

  test("honors --after and accepts --all", async () => {
    const lines: string[] = []
    await runRootMemory(
      threeIssues(),
      ["issue", "list", "--count", "--after", "issue-RAT-1", "--all"],
      lines,
    )

    expect(lines).toEqual(["2"])
  })

  test("composes with --id for the count and the identifier output", async () => {
    const countLines: string[] = []
    await runRootMemory(
      threeIssues(),
      ["issue", "list", "--id", "RAT-1", "--id", "RAT-3", "--count"],
      countLines,
    )
    expect(countLines).toEqual(["2"])

    const idLines: string[] = []
    await runRootMemory(threeIssues(), ["issue", "list", "--id", "RAT-3", "--ids-only"], idLines)
    expect(idLines).toEqual(["RAT-3"])
  })

  test("prints one identifier per line in page order and drains every page", async () => {
    const lines: string[] = []
    await runRootMemory(threeIssues(), ["issue", "list", "--ids-only", "--limit", "2"], lines)

    expect(lines).toEqual(["RAT-1", "RAT-2", "RAT-3"])
  })
})

describe("search output flags", () => {
  test("prints every identifier in relevance order and drains every page", async () => {
    const lines: string[] = []
    await runRootMemory(
      rankedIssues(),
      ["search", "rate limit", "--ids-only", "--limit", "2"],
      lines,
    )

    expect(lines).toEqual(["RAT-2", "RAT-1", "RAT-3"])
  })

  test("drains every page for --count", async () => {
    const lines: string[] = []
    await runRootMemory(rankedIssues(), ["search", "rate limit", "--count", "--limit", "2"], lines)

    expect(lines).toEqual(["3"])
  })
})

describe("next identifier output", () => {
  test("prints the ready identifier", async () => {
    const lines: string[] = []
    await runRootMemory(frontier(), ["next", "--parent", "RAT-7", "--ids-only"], lines)

    expect(lines).toEqual(["RAT-2"])
    expect(process.exitCode).toBe(0)
  })

  test("prints nothing and exits 0 at an empty frontier", async () => {
    const lines: string[] = []
    await runRootMemory(
      seed([issue({ identifier: "RAT-7" })]),
      ["next", "--parent", "RAT-7", "--ids-only"],
      lines,
    )

    expect(lines).toEqual([])
    expect(process.exitCode).toBe(0)
  })
})

describe("list output validation", () => {
  const cases: readonly [string, readonly string[], string][] = [
    [
      "count with ids-only",
      ["issue", "list", "--count", "--ids-only"],
      "The --count and --ids-only flags cannot be combined.",
    ],
    [
      "count with fields",
      ["issue", "list", "--count", "--fields", "identifier", "--json"],
      "The --count flag is not valid with --fields.",
    ],
    [
      "ids-only with json",
      ["issue", "list", "--ids-only", "--json"],
      "The --ids-only flag prints plain text and is not valid with --json or --fields.",
    ],
    [
      "ids-only with fields",
      ["issue", "list", "--ids-only", "--fields", "identifier"],
      "The --ids-only flag prints plain text and is not valid with --json or --fields.",
    ],
  ]

  for (const [name, args, message] of cases) {
    test(`rejects ${name}`, async () => {
      const lines: string[] = []
      await runRootMemory(seed([]), args, lines)

      if (args.includes("--json")) {
        expect(lastJson(lines)).toMatchObject({ error: { code: "validation", message } })
      } else {
        expect(lines[0]).toBe(`error: ${message}`)
      }
      expect(process.exitCode).toBe(2)
    })
  }

  test("rejects ids-only with json on next", async () => {
    const lines: string[] = []
    await runRootMemory(seed([]), ["next", "--parent", "RAT-7", "--ids-only", "--json"], lines)

    expect(lastJson(lines)).toMatchObject({
      error: {
        code: "validation",
        message: "The --ids-only flag prints plain text and is not valid with --json or --fields.",
      },
    })
    expect(process.exitCode).toBe(2)
  })
})
