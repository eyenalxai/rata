import { summaryFields } from "@/linear/documents/issue/fields"

const issueBatchCreateMutation = `mutation IssueBatchCreate($input: IssueBatchCreateInput!) {
  issueBatchCreate(input: $input) {
    success
    issues {${summaryFields}
    }
  }
}`

export { issueBatchCreateMutation }
