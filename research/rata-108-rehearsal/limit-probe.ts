import { Database } from "bun:sqlite"

const ENDPOINT = "https://api.linear.app/graphql"
const home = process.env.HOME ?? ""
const dataHome = process.env.XDG_DATA_HOME ?? `${home}/.local/share`
const db = new Database(`${dataHome}/rata/rata.sqlite`, { readonly: true })
const row = db.query("select api_key from profiles order by is_default desc limit 1").get() as {
  api_key: string
}
db.close()

const gql = async (query: string, variables: Record<string, unknown> = {}) => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { authorization: row.api_key, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  })
  const payload = await response.json()
  if (payload.errors) {
    throw new Error(JSON.stringify(payload.errors))
  }
  return { data: payload.data, complexity: response.headers.get("x-complexity") }
}

const status = async () => {
  const result = await gql(
    `query { rateLimitStatus { limits { type allowedAmount remainingAmount requestedAmount reset period } } }`,
  )
  const limits = result.data.rateLimitStatus.limits as any[]
  return {
    complexity: limits.find((limit) => limit.type === "complexity"),
    requests: limits.find((limit) => limit.type === "requests"),
    header: result.complexity,
  }
}

const first = await gql(
  `query { issues(filter: { team: { id: { eq: "efe567f2-ff44-41d5-9acf-eba8e43c7604" } } }, first: 1) { nodes { id } } }`,
)
const issueId = (first.data.issues.nodes[0] as { id: string }).id

const before = await status()
const relationQuery = await gql(
  `query Relations($id: String!) {
    issue(id: $id) { relations { nodes { id type relatedIssue { id } } } }
  }`,
  { id: issueId },
)
const after = await status()

const delta = (key: string) => Number(before.complexity[key]) - Number(after.complexity[key])

console.log(
  JSON.stringify(
    {
      before,
      relationHeader: relationQuery.complexity,
      after,
      complexityRemainingDelta: delta("remainingAmount"),
      complexityRequested: after.complexity.requestedAmount,
      requestRemainingDelta:
        Number(before.requests.remainingAmount) - Number(after.requests.remainingAmount),
      requestsRequested: after.requests.requestedAmount,
      period: { complexity: before.complexity.period, requests: before.requests.period },
      reset: { before: before.complexity.reset, after: after.complexity.reset },
    },
    null,
    2,
  ),
)
