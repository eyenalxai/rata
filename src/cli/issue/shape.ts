import type { FieldShape, FieldShapeFields } from "@/cli/field/shape"

import { arrayField, objectField, scalarField } from "@/cli/field/shape"

const issueStateShape = objectField({
  name: scalarField,
  type: scalarField,
})

const issueUserShape = objectField({
  id: scalarField,
  name: scalarField,
  displayName: scalarField,
})

const issueLabelShape = objectField({
  id: scalarField,
  name: scalarField,
})

const issueProjectShape = objectField({
  id: scalarField,
  name: scalarField,
})

const issueParentShape = objectField({
  id: scalarField,
  identifier: scalarField,
  title: scalarField,
})

const issueChildShape = objectField({
  id: scalarField,
  identifier: scalarField,
  title: scalarField,
  state: issueStateShape,
})

const issueRelationsShape = objectField({
  blocks: arrayField(issueChildShape),
  blockedBy: arrayField(issueChildShape),
  duplicates: arrayField(issueChildShape),
  duplicatedBy: arrayField(issueChildShape),
  related: arrayField(issueChildShape),
  similar: arrayField(issueChildShape),
})

const issueSummaryFields = {
  id: scalarField,
  identifier: scalarField,
  title: scalarField,
  url: scalarField,
  state: issueStateShape,
  priority: scalarField,
  createdAt: scalarField,
  updatedAt: scalarField,
  assignee: issueUserShape,
  project: issueProjectShape,
  parent: issueParentShape,
  labels: arrayField(issueLabelShape),
} satisfies FieldShapeFields

const issueSummaryShape = objectField(issueSummaryFields)

const issueSummaryRelationsShape = objectField({
  ...issueSummaryFields,
  relations: issueRelationsShape,
})

const issueTeamShape = objectField({
  id: scalarField,
  key: scalarField,
  name: scalarField,
})

const issueAttachmentShape = objectField({
  id: scalarField,
  title: scalarField,
  subtitle: scalarField,
  url: scalarField,
  sourceType: scalarField,
  createdAt: scalarField,
  metadata: scalarField,
})

const issueCommentShape = objectField({
  id: scalarField,
  body: scalarField,
  createdAt: scalarField,
  user: issueUserShape,
})

const issueBlockerShape = objectField({
  identifier: scalarField,
  title: scalarField,
  state: issueStateShape,
  closed: scalarField,
})

const issuePullRequestShape = objectField({
  source: scalarField,
  number: scalarField,
  repo: scalarField,
  url: scalarField,
  title: scalarField,
  status: scalarField,
  draft: scalarField,
  reviews: scalarField,
  hasConflicts: scalarField,
  mergedAt: scalarField,
  closedAt: scalarField,
  checks: scalarField,
  mergeCommit: scalarField,
})

const issueSectionShape = objectField({
  heading: scalarField,
  level: scalarField,
  content: scalarField,
  line: scalarField,
})

const issueWorkingChildFields = {
  id: scalarField,
  identifier: scalarField,
  title: scalarField,
  state: issueStateShape,
  priority: scalarField,
  assignee: issueUserShape,
  blocked: scalarField,
  blockedBy: arrayField(issueBlockerShape),
} satisfies FieldShapeFields

const issueWorkingChildShape = objectField(issueWorkingChildFields)

const issueWorkingChildFullShape = objectField({
  ...issueSummaryFields,
  blocked: scalarField,
  blockedBy: arrayField(issueBlockerShape),
})

const workingFields = {
  description: scalarField,
  sections: arrayField(issueSectionShape),
  blocked: scalarField,
  blockedBy: arrayField(issueBlockerShape),
  prs: arrayField(issuePullRequestShape),
  comments: arrayField(issueCommentShape),
}

const issueWorkingSetShape: FieldShape = objectField({
  ...issueSummaryFields,
  ...workingFields,
  children: arrayField(issueWorkingChildShape),
  frontier: arrayField(issueWorkingChildShape),
  nextChild: issueWorkingChildShape,
})

const issueWorkingSetFullShape: FieldShape = objectField({
  ...issueSummaryFields,
  ...workingFields,
  children: arrayField(issueWorkingChildFullShape),
  frontier: arrayField(issueWorkingChildFullShape),
  nextChild: issueWorkingChildFullShape,
  relations: issueRelationsShape,
})

const issueReadShapes = {
  full: issueWorkingSetFullShape,
  summary: issueSummaryShape,
  working: issueWorkingSetShape,
} as const

export {
  issueAttachmentShape,
  issueBlockerShape,
  issueChildShape,
  issueCommentShape,
  issueLabelShape,
  issueParentShape,
  issueProjectShape,
  issuePullRequestShape,
  issueReadShapes,
  issueRelationsShape,
  issueSectionShape,
  issueStateShape,
  issueSummaryFields,
  issueSummaryRelationsShape,
  issueSummaryShape,
  issueTeamShape,
  issueUserShape,
  issueWorkingChildShape,
  issueWorkingSetFullShape,
  issueWorkingSetShape,
}
