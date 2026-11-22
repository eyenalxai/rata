import {
  attachmentFields,
  commentFields,
  listRelationFields,
  summaryFields,
  workingFields,
  workingLimits,
  workingSummaryFields,
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
  readonly full: boolean
}

const workingSetQuery = (options: WorkingSetQueryOptions): string => {
  const comments = options.comments
    ? `    comments(first: ${workingLimits.comments}, orderBy: createdAt) { nodes { ${commentFields} } pageInfo { hasNextPage endCursor } }`
    : ""
  return `query IssueWorkingSet($filter: IssueFilter, $first: Int!, $after: String) {
  issues(filter: $filter, first: $first, after: $after) {
    nodes {${workingSummaryFields}
      description
${workingFields(options.full)}
${comments}
    }
    pageInfo { hasNextPage endCursor }
  }
}`
}

const workingSummaryQuery = `query IssueWorkingSummary($filter: IssueFilter, $first: Int!, $after: String) {
  issues(filter: $filter, first: $first, after: $after) {
    nodes {${workingSummaryFields}
    }
    pageInfo { hasNextPage endCursor }
  }
}`

const aliasVariables = (count: number): string =>
  Array.from({ length: count }, (_, index) => `$id${index}: String!, $after${index}: String`).join(
    ", ",
  )

const workingAttachmentsPageQuery = (count: number, first: number): string =>
  `query IssueWorkingAttachments(${aliasVariables(count)}) {
${Array.from(
  { length: count },
  (_, index) =>
    `  issue${index}: issue(id: $id${index}) { attachments(first: ${first}, after: $after${index}) { nodes { ${attachmentFields} } pageInfo { hasNextPage endCursor } } }`,
).join("\n")}
}`

const workingCommentsPageQuery = (count: number, first: number): string =>
  `query IssueWorkingComments(${aliasVariables(count)}) {
${Array.from(
  { length: count },
  (_, index) =>
    `  issue${index}: issue(id: $id${index}) { comments(first: ${first}, after: $after${index}, orderBy: createdAt) { nodes { ${commentFields} } pageInfo { hasNextPage endCursor } } }`,
).join("\n")}
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
  workingAttachmentsPageQuery,
  workingCommentsPageQuery,
  workingSetQuery,
  workingSummaryQuery,
}
