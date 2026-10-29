import { inputOf } from "@test/fake-linear/model"
import { jsonResponse, summaryNode, user, viewer } from "@test/issue-fixtures"
import { makeRecorder } from "@test/issue-write/fixtures"

type ChildSeed = {
  readonly identifier: string
  readonly assignee: typeof user | null
  readonly labels: readonly { readonly id: string; readonly name: string }[]
}

const labels = {
  ready: { id: "l1", name: "ready-for-agent", color: "#111111" },
  bug: { id: "l-bug", name: "bug", color: "#EB5757" },
  enhancement: { id: "l-enh", name: "enhancement", color: "#5E6AD2" },
}

const childNode = (seed: ChildSeed) => ({
  ...summaryNode(seed.identifier),
  id: `id-${seed.identifier}`,
  assignee: seed.assignee,
  labels: { nodes: seed.labels },
  team: { id: "team-1" },
})

const seed = (identifier: string, extra: Partial<ChildSeed> = {}): ChildSeed => ({
  identifier,
  assignee: null,
  labels: [],
  ...extra,
})

const recorderFor = (children: readonly ChildSeed[], options: { readonly failOn?: string } = {}) =>
  makeRecorder((request) => {
    if (request.query.includes("query IssueId")) {
      return jsonResponse({ data: { issue: { id: "i-parent" } } })
    }
    if (request.query.includes("query IssueChildrenSummary")) {
      const after = request.variables.after
      const index = typeof after === "string" ? Number(after.replace("cursor-", "")) : 0
      const child = children[index]
      const hasNextPage = index + 1 < children.length
      return jsonResponse({
        data: {
          issue: {
            children: {
              nodes: child === undefined ? [] : [childNode(child)],
              pageInfo: { hasNextPage, endCursor: hasNextPage ? `cursor-${index + 1}` : null },
            },
          },
        },
      })
    }
    if (request.query.includes("query Viewer")) {
      return jsonResponse({ data: { viewer } })
    }
    if (request.query.includes("query AvailableLabels")) {
      return jsonResponse({
        data: {
          issueLabels: {
            nodes: Object.values(labels),
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      })
    }
    const id = String(request.variables.id)
    if (id === options.failOn) {
      return jsonResponse({ data: null, errors: [{ message: `Issue ${id} not found.` }] })
    }
    const identifier = id.replace("id-", "")
    if (request.query.includes("mutation UpdateIssue")) {
      const assignee = inputOf(request.variables).assigneeId === null ? null : user
      return jsonResponse({
        data: {
          issueUpdate: {
            success: true,
            issue: { ...summaryNode(identifier), assignee },
          },
        },
      })
    }
    if (request.query.includes("mutation AddLabel")) {
      return jsonResponse({
        data: { issueAddLabel: { success: true, issue: summaryNode(identifier) } },
      })
    }
    if (request.query.includes("mutation RemoveLabel")) {
      return jsonResponse({
        data: { issueRemoveLabel: { success: true, issue: summaryNode(identifier) } },
      })
    }
    return jsonResponse({ errors: [{ message: `Unexpected query: ${request.query}` }] }, 400)
  })

const mutations = (recorder: ReturnType<typeof recorderFor>, fragment: string) =>
  recorder.requests.filter((request) => request.query.includes(fragment))

export { labels, mutations, recorderFor, seed }
