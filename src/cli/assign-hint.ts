import { Result } from "effect"

import { parseIssueRef } from "@/domain/ref"

const assignHint = (first: string, second: string): string => {
  const firstIsRef = Result.isSuccess(parseIssueRef(first))
  const secondIsRef = Result.isSuccess(parseIssueRef(second))
  if (firstIsRef && !secondIsRef) {
    return `rata issue assign ${first} --assignee ${second}`
  }
  if (secondIsRef && !firstIsRef) {
    return `rata issue assign ${second} --assignee ${first}`
  }
  return "rata issue assign <ref> --assignee <me|user-id|none>"
}

export { assignHint }
