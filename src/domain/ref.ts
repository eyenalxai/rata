import { Result, Schema } from "effect"

const identifierPattern = /^[A-Z][A-Z0-9]*-\d+$/u
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

const IssueIdentifier = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(identifierPattern, {
      message: "Expected an issue identifier like RAT-42",
    }),
  ),
)

const IssueUuid = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(uuidPattern, {
      message: "Expected an issue UUID",
    }),
  ),
)

const IssueRef = Schema.Union([IssueIdentifier, IssueUuid])
type IssueRef = typeof IssueRef.Type

class InvalidIssueRef extends Schema.TaggedError<InvalidIssueRef>()("InvalidIssueRef", {
  input: Schema.String,
  message: Schema.String,
}) {}

const decodeIssueRef = Schema.decodeUnknownResult(IssueRef)

const isLinearUrl = (hostname: string): boolean =>
  hostname === "linear.app" || hostname.endsWith(".linear.app")

const fromLinearUrl = (value: string): string | undefined => {
  if (!value.startsWith("http://") && !value.startsWith("https://")) {
    return undefined
  }

  const url = URL.parse(value)
  if (url === null || !isLinearUrl(url.hostname)) {
    return undefined
  }

  const segments = url.pathname.split("/").filter((segment) => segment.length > 0)
  const issueIndex = segments.indexOf("issue")
  if (issueIndex === -1) {
    return undefined
  }

  return segments[issueIndex + 1]
}

const invalidRef = (input: string): InvalidIssueRef =>
  new InvalidIssueRef({
    input,
    message:
      "Expected a Linear issue reference: an identifier like RAT-42, a UUID, or a linear.app issue URL.",
  })

const parseIssueRef = (input: string): Result.Result<IssueRef, InvalidIssueRef> => {
  const trimmed = input.trim()
  const candidate = fromLinearUrl(trimmed) ?? trimmed

  const decode = (value: string): Result.Result<IssueRef, InvalidIssueRef> =>
    Result.mapError(decodeIssueRef(value), () => invalidRef(input))

  return Result.orElse(decode(candidate), () => decode(candidate.toUpperCase()))
}

export { InvalidIssueRef, IssueRef, parseIssueRef }
