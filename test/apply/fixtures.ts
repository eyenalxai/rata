import type {
  MemoryIssue,
  MemoryLabel,
  MemoryProject,
  MemorySeed,
  MemoryTeam,
} from "@test/fake-linear/gateway/model"

import { defaultPriorities, defaultViewer } from "@test/fake-linear/model"
import { Option, Schema } from "effect"

import type { IssueChild } from "@/linear/decode/issue"

import {
  commentId,
  issueId,
  labelId,
  projectId,
  teamId,
  userId,
  workflowStateId,
} from "@/domain/id"
import { Viewer } from "@/linear/decode/viewer"

const viewer = Option.getOrThrow(Schema.decodeUnknownOption(Viewer)(defaultViewer))

const readyLabel: MemoryLabel = {
  id: labelId("l-ready"),
  name: "ready-for-agent",
  color: "#111111",
  teamId: teamId("team-1"),
}

const bugLabel: MemoryLabel = {
  id: labelId("l-bug"),
  name: "bug",
  color: "#EB5757",
  teamId: teamId("team-1"),
}

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
  labels: [readyLabel, bugLabel].map((label) => ({
    id: label.id,
    name: label.name,
    color: label.color,
    scope: "team" as const,
  })),
  members: [],
  priorities: [...defaultPriorities],
}

const project: MemoryProject = {
  id: projectId("p1"),
  name: "Tracker",
  progress: 0,
  status: { name: "Backlog" },
  trashed: false,
  teams: [team.id],
}

type IssueInput = {
  readonly identifier: string
  readonly title?: string
  readonly state?: { readonly name: string; readonly type: "unstarted" | "started" | "completed" }
  readonly priority?: "urgent" | "high" | "medium" | "low" | "none"
  readonly assignee?: typeof viewer | null
  readonly description?: string
  readonly labels?: readonly MemoryLabel[]
}

const issueChild = (issue: MemoryIssue): IssueChild => ({
  id: issue.summary.id,
  identifier: issue.summary.identifier,
  title: issue.summary.title,
  state: issue.summary.state,
})

const makeIssue = (input: IssueInput): MemoryIssue => ({
  summary: {
    id: issueId(`issue-${input.identifier}`),
    identifier: input.identifier,
    title: input.title ?? `Title ${input.identifier}`,
    url: `https://linear.app/acme/issue/${input.identifier}/title`,
    state: input.state ?? { name: "Todo", type: "unstarted" },
    priority: input.priority ?? "medium",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
    assignee: input.assignee === undefined ? null : input.assignee,
    project: null,
    parent: null,
    labels: { nodes: input.labels ?? [] },
  },
  description: input.description ?? null,
  team: { id: team.id, key: team.key, name: team.name },
})

const map = makeIssue({
  identifier: "RAT-1",
  title: "The map",
  state: { name: "In Progress", type: "started" },
  priority: "high",
  description: "# Destination\nShip the write.\n\n## Notes\nA note.",
  labels: [readyLabel],
})

const ready = makeIssue({
  identifier: "RAT-2",
  title: "Ready child",
  labels: [readyLabel],
})

const related = makeIssue({
  identifier: "RAT-3",
  title: "Related issue",
  labels: [readyLabel],
})

const blocker = makeIssue({
  identifier: "RAT-9",
  title: "Blocker",
})

const blocked = makeIssue({
  identifier: "RAT-4",
  title: "Blocked issue",
})

const mapWithRelations: MemoryIssue = {
  ...map,
  relations: [{ type: "blocks", relatedIssue: issueChild(ready) }],
  inverseRelations: [{ type: "blocks", issue: issueChild(blocker) }],
}

const blockedIssue: MemoryIssue = {
  ...blocked,
  inverseRelations: [{ type: "blocks", issue: issueChild(blocker) }],
}

const seed = (
  options: {
    readonly failOn?: readonly string[] | undefined
    readonly issues?: readonly MemoryIssue[] | undefined
  } = {},
): MemorySeed => ({
  viewer,
  teams: [team],
  labels: [readyLabel, bugLabel],
  projects: [project],
  issues: [mapWithRelations, ready, related, blocker, blockedIssue, ...(options.issues ?? [])],
  ...(options.failOn === undefined ? {} : { failOn: options.failOn }),
})

const comment = (body: string) => ({
  id: commentId(`comment-${body.length}`),
  body,
  createdAt: "2026-01-06T00:00:00.000Z",
  user: { id: userId(viewer.id), name: viewer.name, displayName: viewer.displayName },
})

const issueWithDuplicateHeading = makeIssue({
  identifier: "RAT-20",
  title: "Duplicate heading",
  description: "## Notes\nFirst.\n\n## Notes\nSecond.",
  labels: [readyLabel],
})

export {
  blocker,
  bugLabel,
  comment,
  issueChild,
  issueWithDuplicateHeading,
  makeIssue,
  map,
  project,
  ready,
  readyLabel,
  related,
  seed,
  team,
  viewer,
}
