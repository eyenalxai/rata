type IssueStateLike = {
  readonly state: {
    readonly type: string
  }
}

type BlockedIssueLike = IssueStateLike & {
  readonly blockers: readonly IssueStateLike[]
}

const isOpenIssue = (issue: IssueStateLike): boolean =>
  issue.state.type !== "completed" && issue.state.type !== "canceled"

const isUnblocked = (issue: BlockedIssueLike): boolean =>
  isOpenIssue(issue) && issue.blockers.every((blocker) => !isOpenIssue(blocker))

export { type BlockedIssueLike, isOpenIssue, isUnblocked, type IssueStateLike }
