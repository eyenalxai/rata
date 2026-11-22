import type { MemoryIssue, MemorySeed } from "@test/fake-linear/gateway/model"

import { lastJson, runIssueMemory } from "@test/cli-harness"
import { defaultViewer } from "@test/fake-linear/model"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

import { attachmentId, commentId, issueId, labelId, projectId, teamId, userId } from "@/domain/id"
import { Viewer } from "@/linear/decode/viewer"

const viewer = Option.getOrThrow(Schema.decodeUnknownOption(Viewer)(defaultViewer))
const uuid = "5f0c1f2a-3b4c-4d5e-8f90-1234567890ab"

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
const blocker = {
  id: issueId("i9"),
  identifier: "RAT-9",
  title: "Blocker",
  state: { name: "Done", type: "completed" as const },
}
const attachment = {
  id: attachmentId("a1"),
  title: "Design doc",
  subtitle: "Notion",
  url: "https://example.com/doc",
  sourceType: "link",
  createdAt: "2026-01-01T10:00:00.000Z",
}
const early = {
  id: commentId("c1"),
  body: "First",
  createdAt: "2026-01-01T10:00:00.000Z",
  user,
}
const late = {
  id: commentId("c2"),
  body: "Second",
  createdAt: "2026-01-02T10:00:00.000Z",
  user,
}

const detail: MemoryIssue = {
  summary: {
    id: issueId(uuid),
    identifier: "RAT-42",
    title: "The issue",
    url: "https://linear.app/eyenalx/issue/RAT-42/the-issue",
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
  inverseRelations: [{ type: "blocks", issue: blocker }],
  attachments: [attachment],
  comments: [late, early],
}

const seed = (issue: MemoryIssue = detail): MemorySeed => ({
  viewer,
  teams: [team],
  labels: [],
  issues: [issue],
})

const ShowDocument = Schema.Struct({
  comments: Schema.Array(Schema.Struct({ id: Schema.String })),
  children: Schema.Array(Schema.Struct({ identifier: Schema.String })),
  relations: Schema.Struct({
    blocks: Schema.Array(Schema.Struct({ identifier: Schema.String })),
  }),
  attachments: Schema.Array(Schema.Struct({ id: Schema.String })),
})

const AnyShowDocument = Schema.Record(Schema.String, Schema.Unknown)
const ErrorEnvelope = Schema.Struct({ error: Schema.Struct({ code: Schema.String }) })

afterEach(() => {
  process.exitCode = 0
})

const showId = async (ref: string): Promise<string> => {
  const lines: string[] = []
  await runIssueMemory(seed(), ["show", ref, "--json"], lines)
  const document = Option.getOrThrow(
    Schema.decodeUnknownOption(Schema.Struct({ id: Schema.String }))(lastJson(lines)),
  )
  return document.id
}

describe("IssueApi show", () => {
  test("resolves identifier, UUID and URL references", async () => {
    expect(await showId("RAT-42")).toBe(uuid)
    expect(await showId(uuid)).toBe(uuid)
    expect(await showId("https://linear.app/eyenalx/issue/RAT-42/some-slug")).toBe(uuid)
  })

  test("reads the priority token on the detail record", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["show", "RAT-42", "--json"], lines)

    const document = Option.getOrThrow(
      Schema.decodeUnknownOption(
        Schema.Struct({ priority: Schema.String, updatedAt: Schema.String }),
      )(lastJson(lines)),
    )
    expect(document.priority).toBe("urgent")
    expect(document.updatedAt).toBe("2026-01-01T09:00:00.000Z")
  })

  test("reads the creation time", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["show", "RAT-42", "--json", "--fields", "createdAt"], lines)

    expect(lastJson(lines)).toEqual({ createdAt: "2026-01-01T08:00:00.000Z" })
  })

  test("includes comments in chronological order when requested", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["show", "RAT-42", "--json", "--comments"], lines)

    const document = Option.getOrThrow(Schema.decodeUnknownOption(ShowDocument)(lastJson(lines)))
    expect(document.comments.map((item) => item.id)).toEqual(["c1", "c2"])
  })

  test("exposes blocking relations in both directions", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["show", "RAT-42", "--json"], lines)

    const document = Option.getOrThrow(
      Schema.decodeUnknownOption(
        Schema.Struct({
          relations: Schema.Struct({
            blocks: Schema.Array(Schema.Struct({ identifier: Schema.String })),
            blockedBy: Schema.Array(Schema.Struct({ identifier: Schema.String })),
          }),
        }),
      )(lastJson(lines)),
    )
    expect(document.relations.blocks.map((target) => target.identifier)).toEqual(["RAT-8"])
    expect(document.relations.blockedBy.map((target) => target.identifier)).toEqual(["RAT-9"])
  })

  test("returns every attachment", async () => {
    const second = {
      ...attachment,
      id: attachmentId("a2"),
      title: "Second",
      url: "https://example.com/second",
    }
    const lines: string[] = []
    await runIssueMemory(
      seed({ ...detail, attachments: [attachment, second] }),
      ["show", "RAT-42", "--json"],
      lines,
    )

    const document = Option.getOrThrow(
      Schema.decodeUnknownOption(
        Schema.Struct({ attachments: Schema.Array(Schema.Struct({ id: Schema.String })) }),
      )(lastJson(lines)),
    )
    expect(document.attachments.map((item) => item.id)).toEqual(["a1", "a2"])
  })
})

describe("issue show", () => {
  test("returns comments, children, relations and attachments in one document", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["show", "RAT-42", "--json", "--comments"], lines)

    const document = Option.getOrThrow(Schema.decodeUnknownOption(ShowDocument)(lastJson(lines)))

    expect(document.comments.map((item) => item.id)).toEqual(["c1", "c2"])
    expect(document.children.map((item) => item.identifier)).toEqual(["RAT-2"])
    expect(document.relations.blocks.map((item) => item.identifier)).toEqual(["RAT-8"])
    expect(document.attachments.map((item) => item.id)).toEqual(["a1"])
  })

  test("--fields createdAt selects the creation time from the detail", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["show", "RAT-42", "--json", "--fields", "createdAt"], lines)

    expect(lastJson(lines)).toEqual({ createdAt: "2026-01-01T08:00:00.000Z" })
  })

  test("omits comments by default", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["show", "RAT-42", "--json"], lines)

    const document = Option.getOrThrow(Schema.decodeUnknownOption(AnyShowDocument)(lastJson(lines)))
    expect(document).not.toHaveProperty("comments")
  })

  test("--no-comments omits the comments", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["show", "RAT-42", "--json", "--no-comments"], lines)

    const document = Option.getOrThrow(Schema.decodeUnknownOption(AnyShowDocument)(lastJson(lines)))
    expect(document).not.toHaveProperty("comments")
  })

  test("rejects --comments with --no-comments", async () => {
    const lines: string[] = []
    await runIssueMemory(seed(), ["show", "RAT-42", "--json", "--comments", "--no-comments"], lines)

    expect(
      Option.getOrThrow(Schema.decodeUnknownOption(ErrorEnvelope)(lastJson(lines))).error.code,
    ).toBe("validation")
    expect(process.exitCode).toBe(2)
  })
})
