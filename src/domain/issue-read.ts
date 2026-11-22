type IssueReadMode = "summary" | "working" | "full"

type IssueWorkingSetOptions = {
  readonly comments: boolean
  readonly mode: IssueReadMode
}

export { type IssueReadMode, type IssueWorkingSetOptions }
