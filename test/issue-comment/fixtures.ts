import { inputOf, stringField } from "@test/fake-linear/model"
import { jsonResponse, pageInfo, user } from "@test/issue-fixtures"
import { makeRecorder } from "@test/issue-write/fixtures"
import { Option, Schema } from "effect"

import type { IssueComment } from "@/api/issue-schema"

const commentNode = (id: string, body: string): IssueComment => ({
  id,
  body,
  createdAt: "2026-01-01T10:00:00.000Z",
  user,
})

const CommentFilter = Schema.Struct({
  id: Schema.Struct({ eq: Schema.String }),
})

const filterId = (variables: Record<string, unknown>): string => {
  const decoded = Option.getOrNull(Schema.decodeUnknownOption(CommentFilter)(variables.filter))
  return decoded?.id.eq ?? ""
}

type CommentState = {
  readonly comments: Map<string, IssueComment>
  creates: number
  updates: number
  deletes: number
}

type CommentHandlerOptions = {
  readonly seeds?: readonly IssueComment[]
  readonly failCreate?: boolean
}

const issueIds: Readonly<Record<string, string>> = {
  "RAT-1": "i1",
  "RAT-2": "i2",
}

const commentHandler = (options: CommentHandlerOptions = {}) => {
  const state: CommentState = {
    comments: new Map((options.seeds ?? []).map((comment) => [comment.id, comment])),
    creates: 0,
    updates: 0,
    deletes: 0,
  }
  const recorder = makeRecorder((request) => {
    if (request.query.includes("query IssueId")) {
      const ref = String(request.variables.id)
      return jsonResponse({ data: { issue: { id: issueIds[ref] ?? "i9" } } })
    }
    if (request.query.includes("query CommentById")) {
      const comment = state.comments.get(filterId(request.variables))
      return jsonResponse({
        data: {
          comments: { nodes: comment === undefined ? [] : [comment], pageInfo },
        },
      })
    }
    if (request.query.includes("mutation CreateComment")) {
      state.creates += 1
      if (options.failCreate === true) {
        return jsonResponse({ errors: [{ message: "Duplicate comment id" }] }, 400)
      }
      const input = inputOf(request.variables)
      const id = typeof input.id === "string" ? input.id : `c${state.creates}`
      if (state.comments.has(id)) {
        return jsonResponse({ errors: [{ message: "Duplicate comment id" }] }, 400)
      }
      const comment = commentNode(id, stringField(input, "body"))
      state.comments.set(id, comment)
      return jsonResponse({ data: { commentCreate: { success: true, comment } } })
    }
    if (request.query.includes("mutation UpdateComment")) {
      state.updates += 1
      const id = stringField(request.variables, "id")
      const body = stringField(inputOf(request.variables), "body")
      const current = state.comments.get(id)
      if (current === undefined) {
        return jsonResponse({ data: { commentUpdate: { success: false, comment: null } } })
      }
      const comment = { ...current, body }
      state.comments.set(id, comment)
      return jsonResponse({ data: { commentUpdate: { success: true, comment } } })
    }
    if (request.query.includes("mutation DeleteComment")) {
      state.deletes += 1
      const id = stringField(request.variables, "id")
      const deleted = state.comments.delete(id)
      return jsonResponse({ data: { commentDelete: { success: deleted, entityId: id } } })
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })
  return { recorder, state }
}

export { commentHandler, commentNode, type CommentHandlerOptions, type CommentState }
