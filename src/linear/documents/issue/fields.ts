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

const workingFields = {
  ...listRelationFields,
  children: `    children(first: ${maxPageSize}) { nodes {${summaryFields}\n      ${listRelationFields.relations}\n      ${listRelationFields.inverseRelations}\n    } pageInfo { hasNextPage endCursor } }`,
  attachments: `    attachments(first: ${maxPageSize}) { nodes { ${attachmentFields} } pageInfo { hasNextPage endCursor } }`,
}

const commentFields = `id body createdAt user { id name displayName }`

export { attachmentFields, commentFields, listRelationFields, summaryFields, workingFields }
