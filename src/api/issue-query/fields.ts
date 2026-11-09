import { maxPageSize, pageSize } from "@/api/pagination"

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

const showFields = {
  labels: `    labels(first: ${pageSize}) { nodes { id name } pageInfo { hasNextPage endCursor } }`,
  children: `    children(first: ${pageSize}) { nodes { id identifier title state { name type } } pageInfo { hasNextPage endCursor } }`,
  ...relationFields(pageSize),
  attachments: `    attachments(first: ${pageSize}) { nodes { ${attachmentFields} } pageInfo { hasNextPage endCursor } }`,
}

const listRelationFields = relationFields(maxPageSize)

export { attachmentFields, listRelationFields, showFields, summaryFields }
