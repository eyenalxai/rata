/* oxlint-disable max-lines, typescript/no-unsafe-return, typescript/no-unsafe-call, typescript/no-unsafe-type-assertion -- the in-memory write adapter decodes unknown GraphQL input at the test seam. */
import type {
  MemoryIssue,
  MemoryLabel,
  MemoryProject,
  MemoryTeam,
} from "@test/fake-linear/gateway/model"

import { Option, Schema } from "effect"

import type { RelationType } from "@/domain/relation"
import type { IssueChild, IssueComment, IssueUser } from "@/linear/decode/issue"
import type { Viewer } from "@/linear/decode/viewer"

import { commentId, userId } from "@/domain/id"
import { isPriorityValue, priorityFromValue } from "@/domain/priority"
import { LinearGraphQLError } from "@/linear/errors"

const UpdateInput = Schema.Struct({
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.NullOr(Schema.String)),
  stateId: Schema.optional(Schema.String),
  priority: Schema.optional(Schema.Finite),
  assigneeId: Schema.optional(Schema.NullOr(Schema.String)),
  projectId: Schema.optional(Schema.NullOr(Schema.String)),
  parentId: Schema.optional(Schema.NullOr(Schema.String)),
})
type UpdateInput = typeof UpdateInput.Type

const RelationInput = Schema.Struct({
  issueId: Schema.String,
  relatedIssueId: Schema.String,
  type: Schema.Literals(["blocks", "duplicate", "related", "similar"]),
})
type RelationInput = typeof RelationInput.Type

const CommentInput = Schema.Struct({
  issueId: Schema.String,
  body: Schema.String,
  id: Schema.optional(Schema.String),
})
type CommentInput = typeof CommentInput.Type

type MemoryWriteState = {
  readonly viewer: Viewer
  readonly issues: MemoryIssue[]
  readonly teams: readonly MemoryTeam[]
  readonly labels: readonly MemoryLabel[]
  readonly projects: readonly MemoryProject[]
}

const unsupported = (message: string) => new LinearGraphQLError({ message, details: [] })

const decodeInput = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown,
): S["Type"] | undefined => Option.getOrUndefined(Schema.decodeUnknownOption(schema)(value))

const childOf = (issue: MemoryIssue): IssueChild => ({
  id: issue.summary.id,
  identifier: issue.summary.identifier,
  title: issue.summary.title,
  state: issue.summary.state,
})

const requireIssue = (state: MemoryWriteState, id: string): MemoryIssue => {
  const issue = state.issues.find(
    (candidate) => String(candidate.summary.id) === id || candidate.summary.identifier === id,
  )
  if (issue === undefined) {
    throw unsupported(`No issue matches ${id}.`)
  }
  return issue
}

const replaceIssue = (state: MemoryWriteState, issue: MemoryIssue): void => {
  const index = state.issues.findIndex(
    (candidate) => String(candidate.summary.id) === String(issue.summary.id),
  )
  if (index === -1) {
    throw unsupported(`No issue matches ${String(issue.summary.id)}.`)
  }
  state.issues[index] = issue
}

const userOf = (state: MemoryWriteState, id: string | null): IssueUser | null => {
  if (id === null) {
    return null
  }
  if (state.viewer.id === id) {
    return {
      id: userId(state.viewer.id),
      name: state.viewer.name,
      displayName: state.viewer.displayName,
    }
  }
  const member = state.teams
    .flatMap((team) => team.members ?? [])
    .find((candidate) => candidate.id === id)
  return member === undefined
    ? { id: userId(id), name: id, displayName: id }
    : { id: userId(member.id), name: member.name, displayName: member.displayName }
}

const updatedAt = () => "2026-01-07T00:00:00.000Z"

const updateIssue = (state: MemoryWriteState, variables: Record<string, unknown>) => {
  const input = decodeInput(UpdateInput, variables.input)
  if (input === undefined) {
    throw unsupported("The update input is not valid.")
  }
  const issue = requireIssue(state, String(variables.id))
  const team = state.teams.find((candidate) => candidate.id === issue.team.id)
  const stateNode =
    input.stateId === undefined
      ? undefined
      : (team?.states ?? []).find((candidate) => candidate.id === input.stateId)
  if (input.stateId !== undefined && stateNode === undefined) {
    throw unsupported(`No workflow state matches ${input.stateId}.`)
  }
  const project =
    input.projectId === undefined
      ? undefined
      : input.projectId === null
        ? null
        : (state.projects.find((candidate) => candidate.id === input.projectId) ??
          (() => {
            throw unsupported(`No project matches ${input.projectId}.`)
          })())
  const parent =
    input.parentId === undefined
      ? undefined
      : input.parentId === null
        ? null
        : (() => {
            const found = state.issues.find(
              (candidate) => String(candidate.summary.id) === input.parentId,
            )
            return found === undefined
              ? null
              : {
                  id: found.summary.id,
                  identifier: found.summary.identifier,
                  title: found.summary.title,
                }
          })()
  const priority =
    input.priority === undefined
      ? issue.summary.priority
      : isPriorityValue(input.priority)
        ? priorityFromValue(input.priority)
        : issue.summary.priority
  const updated: MemoryIssue = {
    ...issue,
    summary: {
      ...issue.summary,
      title: input.title ?? issue.summary.title,
      state:
        stateNode === undefined
          ? issue.summary.state
          : { name: stateNode.name, type: stateNode.type },
      priority,
      assignee:
        input.assigneeId === undefined ? issue.summary.assignee : userOf(state, input.assigneeId),
      project: project === undefined ? issue.summary.project : project,
      parent: parent === undefined ? issue.summary.parent : parent,
      updatedAt: updatedAt(),
    },
    description: input.description === undefined ? issue.description : input.description,
  }
  replaceIssue(state, updated)
  return { issueUpdate: { success: true, issue: updated.summary } }
}

const labelOf = (state: MemoryWriteState, issue: MemoryIssue, id: string) => {
  const label =
    state.labels.find((candidate) => candidate.id === id) ??
    issue.summary.labels.nodes.find((candidate) => candidate.id === id)
  if (label === undefined) {
    throw unsupported(`No label matches ${id}.`)
  }
  return { id: label.id, name: label.name }
}

const changeLabel = (
  state: MemoryWriteState,
  variables: Record<string, unknown>,
  mode: "add" | "remove",
) => {
  const issue = requireIssue(state, String(variables.id))
  const label = labelOf(state, issue, String(variables.labelId))
  const present = issue.summary.labels.nodes.some((candidate) => candidate.id === label.id)
  const labels =
    mode === "add"
      ? present
        ? issue.summary.labels.nodes
        : [...issue.summary.labels.nodes, label]
      : issue.summary.labels.nodes.filter((candidate) => candidate.id !== label.id)
  const updated: MemoryIssue = {
    ...issue,
    summary: { ...issue.summary, labels: { nodes: labels }, updatedAt: updatedAt() },
  }
  replaceIssue(state, updated)
  return {
    [mode === "add" ? "issueAddLabel" : "issueRemoveLabel"]: {
      success: true,
      issue: updated.summary,
    },
  }
}

const createComment = (state: MemoryWriteState, variables: Record<string, unknown>) => {
  const input = decodeInput(CommentInput, variables.input)
  if (input === undefined) {
    throw unsupported("The comment input is not valid.")
  }
  const issue = requireIssue(state, input.issueId)
  const existing = (issue.comments ?? []).find(
    (comment) => input.id !== undefined && String(comment.id) === input.id,
  )
  if (existing !== undefined) {
    return { commentCreate: { success: false, comment: null } }
  }
  const comment: IssueComment = {
    id:
      input.id === undefined
        ? commentId(`comment-${(issue.comments ?? []).length + 1}`)
        : commentId(input.id),
    body: input.body,
    createdAt: "2026-01-06T00:00:00.000Z",
    user: {
      id: userId(state.viewer.id),
      name: state.viewer.name,
      displayName: state.viewer.displayName,
    },
  }
  const updated: MemoryIssue = {
    ...issue,
    comments: [...(issue.comments ?? []), comment],
  }
  replaceIssue(state, updated)
  return { commentCreate: { success: true, comment } }
}

const relationTypeOf = (value: string): RelationType =>
  value === "blocks" || value === "duplicate" || value === "related" ? value : "similar"

const createRelation = (state: MemoryWriteState, variables: Record<string, unknown>) => {
  const input = decodeInput(RelationInput, variables.input)
  if (input === undefined) {
    throw unsupported("The relation input is not valid.")
  }
  const source = requireIssue(state, input.issueId)
  const target = requireIssue(state, input.relatedIssueId)
  const type = relationTypeOf(input.type)
  const exists = (source.relations ?? []).some(
    (relation) =>
      String(relation.relatedIssue.id) === String(target.summary.id) && relation.type === type,
  )
  if (exists) {
    return { issueRelationCreate: { success: true } }
  }
  replaceIssue(state, {
    ...source,
    relations: [...(source.relations ?? []), { type, relatedIssue: childOf(target) }],
  })
  replaceIssue(state, {
    ...target,
    inverseRelations: [...(target.inverseRelations ?? []), { type, issue: childOf(source) }],
  })
  return { issueRelationCreate: { success: true } }
}

const splitRelationId = (
  id: string,
):
  | { readonly inverse: boolean; readonly identifier: string; readonly index: number }
  | undefined => {
  const inverse = id.startsWith("inverse-relation-")
  const prefix = inverse ? "inverse-relation-" : "relation-"
  if (!id.startsWith(prefix)) {
    return undefined
  }
  const rest = id.slice(prefix.length)
  const separator = rest.lastIndexOf("-")
  if (separator === -1) {
    return undefined
  }
  const index = Math.trunc(Number(rest.slice(separator + 1)))
  if (!Number.isFinite(index)) {
    return undefined
  }
  return { inverse, identifier: rest.slice(0, separator), index }
}

const deleteRelation = (state: MemoryWriteState, variables: Record<string, unknown>) => {
  const parsed = splitRelationId(String(variables.id))
  if (parsed === undefined) {
    throw unsupported(`No relation matches ${String(variables.id)}.`)
  }
  const issue = requireIssue(state, parsed.identifier)
  if (parsed.inverse) {
    const relation = (issue.inverseRelations ?? [])[parsed.index]
    if (relation === undefined) {
      throw unsupported(`No relation matches ${String(variables.id)}.`)
    }
    const other = state.issues.find(
      (candidate) => String(candidate.summary.id) === String(relation.issue.id),
    )
    if (other !== undefined) {
      replaceIssue(state, {
        ...other,
        relations: (other.relations ?? []).filter(
          (candidate) =>
            String(candidate.relatedIssue.id) !== String(issue.summary.id) ||
            candidate.type !== relation.type,
        ),
      })
    }
    replaceIssue(state, {
      ...issue,
      inverseRelations: (issue.inverseRelations ?? []).filter((_, at) => at !== parsed.index),
    })
  } else {
    const relation = (issue.relations ?? [])[parsed.index]
    if (relation === undefined) {
      throw unsupported(`No relation matches ${String(variables.id)}.`)
    }
    const other = state.issues.find(
      (candidate) => String(candidate.summary.id) === String(relation.relatedIssue.id),
    )
    if (other !== undefined) {
      replaceIssue(state, {
        ...other,
        inverseRelations: (other.inverseRelations ?? []).filter(
          (candidate) =>
            String(candidate.issue.id) !== String(issue.summary.id) ||
            candidate.type !== relation.type,
        ),
      })
    }
    replaceIssue(state, {
      ...issue,
      relations: (issue.relations ?? []).filter((_, at) => at !== parsed.index),
    })
  }
  return { issueRelationDelete: { success: true } }
}

export {
  changeLabel,
  createComment,
  createRelation,
  deleteRelation,
  type MemoryWriteState,
  updateIssue,
}
