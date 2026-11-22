import { maxPageSize } from "@/linear/connection"

const summaryFields = `
      id
      identifier
      title
      url
      state { name type }
      priority
      createdAt
      updatedAt
      assignee { id name displayName }
      project { id name }
      parent { id identifier title }
      labels { nodes { id name } }`

const attachmentFields = "id title subtitle url sourceType createdAt metadata"

const relationFields = (
  first: number,
): { readonly relations: string; readonly inverseRelations: string } => ({
  relations: `    relations(first: ${first}) { nodes { id type relatedIssue { id identifier title state { name type } } } pageInfo { hasNextPage endCursor } }`,
  inverseRelations: `    inverseRelations(first: ${first}) { nodes { id type issue { id identifier title state { name type } } } pageInfo { hasNextPage endCursor } }`,
})

const listRelationFields = relationFields(maxPageSize)

// Linear multiplies nested connection first values into a 10,000-point query cap.
const workingLimits = {
  batch: { full: 3, summary: maxPageSize, working: 5 },
  attachments: 25,
  childLabels: 10,
  childRelations: 5,
  children: 50,
  comments: 10,
  labels: 25,
  relations: 25,
} as const

const workingSummaryFields = `
      id
      identifier
      title
      url
      state { name type }
      priority
      createdAt
      updatedAt
      assignee { id name displayName }
      project { id name }
      parent { id identifier title }
      labels(first: ${workingLimits.labels}) { nodes { id name } }`

const childSummaryFields = (labels: number): string => `
          id
          identifier
          title
          url
          state { name type }
          priority
          createdAt
          updatedAt
          assignee { id name displayName }
          project { id name }
          parent { id identifier title }
          labels(first: ${labels}) { nodes { id name } }`

const workingChildFields = (full: boolean): string => {
  const { inverseRelations } = relationFields(workingLimits.childRelations)
  return `${childSummaryFields(full ? workingLimits.childLabels : 1)}
          ${inverseRelations}`
}

const workingFields = (full: boolean): string =>
  `    relations(first: ${workingLimits.relations}) { nodes { id type relatedIssue { id identifier title state { name type } } } pageInfo { hasNextPage endCursor } }
    inverseRelations(first: ${workingLimits.relations}) { nodes { id type issue { id identifier title state { name type } } } pageInfo { hasNextPage endCursor } }
    children(first: ${workingLimits.children}) { nodes {${workingChildFields(full)}
    } pageInfo { hasNextPage endCursor } }
    attachments(first: ${workingLimits.attachments}) { nodes { ${attachmentFields} } pageInfo { hasNextPage endCursor } }`

const commentFields = `id body createdAt user { id name displayName }`

export {
  attachmentFields,
  commentFields,
  listRelationFields,
  summaryFields,
  workingLimits,
  workingSummaryFields,
  workingFields,
}
