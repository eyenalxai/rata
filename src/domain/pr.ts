import { Predicate } from "effect"

type AttachmentLike = {
  readonly title: string
  readonly url: string
  readonly sourceType: string | null
  readonly metadata?: unknown
}

type PullRequest = {
  readonly source: "linear"
  readonly number: number | null
  readonly repo: string | null
  readonly url: string
  readonly title: string
  readonly status: string | null
  readonly draft: boolean | null
  readonly reviews: unknown
  readonly hasConflicts: boolean | null
  readonly mergedAt: string | null
  readonly closedAt: string | null
  readonly checks: null
  readonly mergeCommit: null
}

type Metadata = Record<PropertyKey, unknown>

const githubSource = "github"

const metadataOf = (attachment: AttachmentLike): Metadata =>
  Predicate.isObject(attachment.metadata) ? attachment.metadata : {}

const stringField = (metadata: Metadata, key: string): string | null =>
  Predicate.isString(metadata[key]) ? metadata[key] : null

const numberField = (metadata: Metadata, key: string): number | null => {
  const value = metadata[key]
  return Predicate.isNumber(value) && Number.isFinite(value) ? value : null
}

const booleanField = (metadata: Metadata, key: string): boolean | null =>
  Predicate.isBoolean(metadata[key]) ? metadata[key] : null

const rawField = (metadata: Metadata, key: string): unknown => metadata[key] ?? null

const repoField = (metadata: Metadata): string | null => {
  const repo = stringField(metadata, "repo")
  if (repo !== null) {
    return repo
  }
  const login = stringField(metadata, "repoLogin")
  const name = stringField(metadata, "repoName")
  return login === null || name === null ? null : `${login}/${name}`
}

const toPullRequest = (attachment: AttachmentLike): PullRequest => {
  const metadata = metadataOf(attachment)
  return {
    source: "linear",
    number: numberField(metadata, "number"),
    repo: repoField(metadata),
    url: attachment.url,
    title: attachment.title,
    status: stringField(metadata, "status"),
    draft: booleanField(metadata, "draft"),
    reviews: rawField(metadata, "reviews"),
    hasConflicts: booleanField(metadata, "hasConflicts"),
    mergedAt: stringField(metadata, "mergedAt"),
    closedAt: stringField(metadata, "closedAt"),
    checks: null,
    mergeCommit: null,
  }
}

const pullRequests = (attachments: readonly AttachmentLike[]): readonly PullRequest[] =>
  attachments
    .filter((attachment) => attachment.sourceType?.toLowerCase() === githubSource)
    .map(toPullRequest)

export { type AttachmentLike, pullRequests, type PullRequest }
