import { inputOf } from "@test/fake-linear/model"
import { jsonResponse, summaryNode } from "@test/issue-fixtures"
import { makeRecorder } from "@test/issue-write/fixtures"

type BodyState = {
  description: string | null
  updatedAt: string
}

const body = (description: string | null, updatedAt = "2026-01-01T09:00:00.000Z") => {
  const state: BodyState = { description, updatedAt }
  const recorder = makeRecorder((request) => {
    if (request.query.includes("query IssueBody")) {
      return jsonResponse({
        data: {
          issue: {
            id: "i1",
            identifier: "RAT-1",
            description: state.description,
            updatedAt: state.updatedAt,
          },
        },
      })
    }
    if (request.query.includes("query IssueSummary")) {
      return jsonResponse({
        data: { issue: { ...summaryNode("RAT-1"), updatedAt: state.updatedAt } },
      })
    }
    if (request.query.includes("query IssueId")) {
      return jsonResponse({ data: { issue: { id: "i1" } } })
    }
    if (request.query.includes("mutation UpdateIssue")) {
      const input = inputOf(request.variables)
      if (typeof input.description === "string") {
        state.description = input.description
      }
      state.updatedAt = "2026-01-02T09:00:00.000Z"
      return jsonResponse({
        data: {
          issueUpdate: {
            success: true,
            issue: { ...summaryNode("RAT-1"), updatedAt: state.updatedAt },
          },
        },
      })
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })
  return { recorder, state }
}

export { body, type BodyState }
