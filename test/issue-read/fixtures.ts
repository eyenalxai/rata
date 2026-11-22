import type { MemoryIssue, MemorySeed, MemoryTeam } from "@test/fake-linear/gateway/model"

import { lastJson } from "@test/cli-harness"
import { defaultPriorities, defaultViewer } from "@test/fake-linear/model"
import { Option, Schema } from "effect"

import {
  attachmentId,
  commentId,
  issueId,
  labelId,
  teamId,
  userId,
  workflowStateId,
} from "@/domain/id"
import { Viewer } from "@/linear/decode/viewer"

const viewer = Option.getOrThrow(Schema.decodeUnknownOption(Viewer)(defaultViewer))
const user = { id: userId("u1"), name: "Ada", displayName: "ada" }
const label = { id: labelId("l1"), name: "ready-for-agent" }
const team: MemoryTeam = {
  id: teamId("team-1"),
  key: "RAT",
  name: "Rata",
  timezone: "America/Los_Angeles",
  states: [
    { id: workflowStateId("s-todo"), name: "Todo", type: "unstarted", position: 1 },
    { id: workflowStateId("s-doing"), name: "In Progress", type: "started", position: 2 },
    { id: workflowStateId("s-done"), name: "Done", type: "completed", position: 3 },
  ],
  labels: [{ id: label.id, name: label.name, color: "#111111", scope: "team" }],
  members: [],
  priorities: [...defaultPriorities],
}

type IssueInput = {
  readonly identifier: string
  readonly title?: string
  readonly state?: { readonly name: string; readonly type: "unstarted" | "started" | "completed" }
  readonly priority?: "urgent" | "high" | "medium" | "low" | "none"
  readonly assignee?: typeof user | null
  readonly description?: string
}

const makeIssue = (input: IssueInput): MemoryIssue => ({
  summary: {
    id: issueId(`issue-${input.identifier}`),
    identifier: input.identifier,
    title: input.title ?? `Title ${input.identifier}`,
    url: `https://linear.app/acme/issue/${input.identifier}/title`,
    state: input.state ?? { name: "Todo", type: "unstarted" },
    priority: input.priority ?? "medium",
    createdAt: `2026-01-0${input.identifier === "RAT-2" ? 1 : 2}T00:00:00.000Z`,
    updatedAt: "2026-01-03T00:00:00.000Z",
    assignee: input.assignee === undefined ? null : input.assignee,
    project: null,
    parent: null,
    labels: { nodes: [label] },
  },
  description: input.description ?? `Body ${input.identifier}`,
  team,
})

const child = (issue: MemoryIssue) => ({
  id: issue.summary.id,
  identifier: issue.summary.identifier,
  title: issue.summary.title,
  state: issue.summary.state,
})

const blocker = makeIssue({
  identifier: "RAT-9",
  title: "Blocker",
  state: { name: "Todo", type: "unstarted" },
})
const ready = makeIssue({
  identifier: "RAT-2",
  title: "Ready child",
  priority: "urgent",
  description: "Ready body",
})
const nextReady = makeIssue({
  identifier: "RAT-6",
  title: "Another ready child",
  priority: "high",
})
const blocked = makeIssue({
  identifier: "RAT-3",
  title: "Blocked child",
})
const claimed = makeIssue({ identifier: "RAT-4", title: "Claimed child", assignee: user })
const done = makeIssue({
  identifier: "RAT-5",
  title: "Done child",
  state: { name: "Done", type: "completed" },
})

const withBlockers = (issue: MemoryIssue, blockedBy: readonly MemoryIssue[]): MemoryIssue => ({
  ...issue,
  inverseRelations: blockedBy.map((each) => ({ type: "blocks", issue: child(each) })),
})

const comment = {
  id: commentId("c1"),
  body: "First comment",
  createdAt: "2026-01-04T00:00:00.000Z",
  user,
}

const pullRequest = {
  id: attachmentId("a1"),
  title: "Fix the read",
  subtitle: "GitHub",
  url: "https://github.com/acme/rata/pull/42",
  sourceType: "github",
  createdAt: "2026-01-05T00:00:00.000Z",
  metadata: { number: 42, repo: "acme/rata", status: "open" },
}

const map: MemoryIssue = {
  summary: {
    id: issueId("issue-RAT-1"),
    identifier: "RAT-1",
    title: "The map",
    url: "https://linear.app/acme/issue/RAT-1/the-map",
    state: { name: "In Progress", type: "started" },
    priority: "high",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    assignee: user,
    project: null,
    parent: null,
    labels: { nodes: [label] },
  },
  description: "# Destination\nShip the read.\n\n## Notes\nA note.",
  team,
  children: [ready, nextReady, blocked, claimed, done].map(child),
  relations: [{ type: "blocks", relatedIssue: child(nextReady) }],
  inverseRelations: [{ type: "blocks", issue: child(blocker) }],
  attachments: [pullRequest],
  comments: [comment],
}

const seed = (issues: readonly MemoryIssue[] = []): MemorySeed => ({
  viewer,
  teams: [team],
  labels: [{ id: label.id, name: label.name, color: "#111111", teamId: team.id }],
  issues: [
    map,
    blocker,
    ready,
    nextReady,
    withBlockers(blocked, [blocker]),
    claimed,
    done,
    ...issues,
  ],
})

const documents = Schema.Record(Schema.String, Schema.Unknown)
const documentOf = (lines: readonly string[]): Record<string, unknown> =>
  Option.getOrThrow(Schema.decodeUnknownOption(documents)(lastJson(lines)))

export {
  blocked,
  child,
  claimed,
  comment,
  documentOf,
  done,
  label,
  makeIssue,
  map,
  nextReady,
  pullRequest,
  ready,
  seed,
  team,
  user,
  viewer,
}
