import { commentFields, summaryFields } from "@/linear/documents/issue/fields"

const createIssueMutation = `mutation CreateIssue($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue {${summaryFields}
    }
  }
}`

const updateIssueMutation = `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) {
    success
    issue {${summaryFields}
    }
  }
}`

const createCommentMutation = `mutation CreateComment($input: CommentCreateInput!) {
  commentCreate(input: $input) {
    success
    comment { ${commentFields} }
  }
}`

const updateCommentMutation = `mutation UpdateComment($id: String!, $input: CommentUpdateInput!) {
  commentUpdate(id: $id, input: $input) {
    success
    comment { ${commentFields} }
  }
}`

const deleteCommentMutation = `mutation DeleteComment($id: String!) {
  commentDelete(id: $id) {
    success
    entityId
  }
}`

const addLabelMutation = `mutation AddLabel($id: String!, $labelId: String!) {
  issueAddLabel(id: $id, labelId: $labelId) {
    success
    issue {${summaryFields}
    }
  }
}`

const removeLabelMutation = `mutation RemoveLabel($id: String!, $labelId: String!) {
  issueRemoveLabel(id: $id, labelId: $labelId) {
    success
    issue {${summaryFields}
    }
  }
}`

const createRelationMutation = `mutation IssueRelationCreate($input: IssueRelationCreateInput!) {
  issueRelationCreate(input: $input) {
    success
  }
}`

const deleteRelationMutation = `mutation IssueRelationDelete($id: String!) {
  issueRelationDelete(id: $id) {
    success
  }
}`

const attachGitHubPrMutation = `mutation AttachGitHubPr($issueId: String!, $url: String!) {
  attachmentLinkGitHubPR(issueId: $issueId, url: $url) {
    success
    attachment { id }
  }
}`

const bulkTargetsQuery = `query IssueChildrenSummary($id: String!, $first: Int!, $after: String) {
  issue(id: $id) {
    children(first: $first, after: $after, orderBy: createdAt) {
      nodes {${summaryFields}
        team { id }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`

const commentByIdQuery = `query CommentById($filter: CommentFilter!, $first: Int!) {
  comments(filter: $filter, first: $first) {
    nodes { ${commentFields} }
    pageInfo { hasNextPage endCursor }
  }
}`

const childTailQuery = `query IssueChildTail($id: String!, $last: Int!) {
  issue(id: $id) {
    children(last: $last) {
      nodes { id }
    }
  }
}`

const commentTailQuery = `query IssueCommentTail($id: String!, $last: Int!) {
  issue(id: $id) {
    comments(last: $last) {
      nodes { id }
    }
  }
}`

export {
  addLabelMutation,
  attachGitHubPrMutation,
  bulkTargetsQuery,
  childTailQuery,
  commentByIdQuery,
  commentTailQuery,
  createCommentMutation,
  createIssueMutation,
  createRelationMutation,
  deleteCommentMutation,
  deleteRelationMutation,
  removeLabelMutation,
  updateCommentMutation,
  updateIssueMutation,
}
