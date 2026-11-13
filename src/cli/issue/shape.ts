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

type IssueDetailShapeOptions = {
  readonly body: boolean
  readonly children: boolean
  readonly relations: boolean
  readonly attachments: boolean
  readonly comments: boolean
}

const issueDetailShape = (options: IssueDetailShapeOptions): FieldShape =>
  objectField({
    ...issueSummaryFields,
    team: issueTeamShape,
    ...(options.body ? { description: scalarField } : {}),
    ...(options.children ? { children: arrayField(issueChildShape) } : {}),
    ...(options.relations ? { relations: issueRelationsShape } : {}),
    ...(options.attachments ? { attachments: arrayField(issueAttachmentShape) } : {}),
    ...(options.comments ? { comments: arrayField(issueCommentShape) } : {}),
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

const issueStatusShape = objectField({
  ...issueSummaryFields,
  blocked: scalarField,
  blockedBy: arrayField(issueBlockerShape),
  prs: arrayField(issuePullRequestShape),
  nextChild: issueSummaryShape,
})

const issueWhyShape = objectField({
  ...issueSummaryFields,
  blocked: scalarField,
  blockedBy: arrayField(issueBlockerShape),
})

export {
  issueCommentShape,
  issueDetailShape,
  type IssueDetailShapeOptions,
  issueStatusShape,
  issueSummaryRelationsShape,
  issueSummaryShape,
  issueWhyShape,
}
