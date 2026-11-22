import {
  attachmentFields,
  commentFields,
  listRelationFields,
  showFields,
  summaryFields,
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

type ShowQueryOptions = {
  readonly children: boolean
  readonly relations: boolean
  readonly attachments: boolean
}

const showQuery = (options: ShowQueryOptions): string => {
  const connections = [
    showFields.labels,
    ...(options.children ? [showFields.children] : []),
    ...(options.relations ? [showFields.relations, showFields.inverseRelations] : []),
    ...(options.attachments ? [showFields.attachments] : []),
  ]
  return `query IssueShow($id: String!) {
  issue(id: $id) {
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
    team { id key name }
${connections.join("\n")}
  }
}`
}

const issueIdQuery = `query IssueId($id: String!) {
  issue(id: $id) {
    id
  }
}`

const issueSummaryQuery = `query IssueSummary($id: String!) {
  issue(id: $id) {${summaryFields}
  }
}`

const childrenQuery = `query IssueChildren($id: String!, $first: Int!, $after: String) {
  issue(id: $id) {
    children(first: $first, after: $after) {
      nodes { id identifier title state { name type } }
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
  childrenQuery,
  commentsQuery,
  issueIdQuery,
  issueSummaryQuery,
  labelsQuery,
  listQuery,
  prioritySort,
  searchQuery,
  showQuery,
}
