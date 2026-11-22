import { maxPageSize } from "@/linear/connection"
import {
  attachmentFields,
  commentFields,
  listRelationFields,
  summaryFields,
  workingFields,
} from "@/linear/documents/issue/fields"

const prioritySort = [
  {
    priority: {
      order: "Ascending",
      noPriorityFirst: false,
      usePrioritySortOrderTiebreaker: false,
    },
  },
  { createdAt: { order: "Ascending" } },
]

type ListQueryOptions = {
  readonly relations: boolean
  readonly sort: boolean
}

const listQuery = ({ relations, sort }: ListQueryOptions): string =>
  `query IssueList($filter: IssueFilter, $first: Int!, $after: String${sort ? ", $sort: [IssueSortInput!]" : ""}) {
  issues(filter: $filter, first: $first, after: $after, ${sort ? "sort: $sort" : "orderBy: createdAt"}) {
    nodes {${summaryFields}${relations ? `\n  ${listRelationFields.relations}\n  ${listRelationFields.inverseRelations}` : ""}
    }
    pageInfo { hasNextPage endCursor }
  }
}`

const searchQuery = `query IssueSearch($term: String!, $filter: IssueFilter, $first: Int!, $after: String) {
  searchIssues(term: $term, filter: $filter, first: $first, after: $after) {
    nodes {${summaryFields}
    }
    pageInfo { hasNextPage endCursor }
  }
}`

const issueIdQuery = `query IssueId($id: String!) {
  issue(id: $id) {
    id
  }
}`

const issueTeamQuery = `query IssueTeam($id: String!) {
  issue(id: $id) {
    team {
      id
    }
  }
}`

const issueSummaryQuery = `query IssueSummary($id: String!) {
  issue(id: $id) {${summaryFields}
  }
}`

type WorkingSetQueryOptions = {
  readonly comments: boolean
}

const workingSetQuery = (options: WorkingSetQueryOptions): string => {
  const comments = options.comments
    ? `    comments(first: ${maxPageSize}, orderBy: createdAt) { nodes { ${commentFields} } pageInfo { hasNextPage endCursor } }`
    : ""
  return `query IssueWorkingSet($filter: IssueFilter, $first: Int!, $after: String) {
  issues(filter: $filter, first: $first, after: $after) {
    nodes {
      id
      identifier
      title
      description
      url
      state { name type }
      priority
      createdAt
      updatedAt
      assignee { id name displayName }
      project { id name }
      parent { id identifier title }
      labels { nodes { id name } }
${workingFields.relations}
${workingFields.inverseRelations}
${workingFields.children}
${workingFields.attachments}
${comments}
    }
    pageInfo { hasNextPage endCursor }
  }
}`
}

const workingChildrenQuery = `query IssueWorkingChildren($id: String!, $first: Int!, $after: String) {
  issue(id: $id) {
    children(first: $first, after: $after) {
      nodes {${summaryFields}
        ${listRelationFields.relations}
        ${listRelationFields.inverseRelations}
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

const labelsQuery = `query IssueLabels($id: String!, $first: Int!, $after: String) {
  issue(id: $id) {
    labels(first: $first, after: $after) {
      nodes { id name }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

const commentsQuery = `query IssueComments($id: String!, $first: Int!, $after: String) {
  issue(id: $id) {
    comments(first: $first, after: $after, orderBy: createdAt) {
      nodes { ${commentFields} }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

const attachmentsQuery = `query IssueAttachments($id: String!, $first: Int!, $after: String) {
  issue(id: $id) {
    attachments(first: $first, after: $after) {
      nodes { ${attachmentFields} }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

export {
  attachmentsQuery,
  commentsQuery,
  issueIdQuery,
  issueSummaryQuery,
  issueTeamQuery,
  labelsQuery,
  listQuery,
  prioritySort,
  searchQuery,
  workingChildrenQuery,
  workingSetQuery,
}
