const issueReadModes = ["summary", "working", "full"] as const
type IssueReadMode = (typeof issueReadModes)[number]

export { type IssueReadMode, issueReadModes }
