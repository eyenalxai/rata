import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"

const ENDPOINT = "https://api.linear.app/graphql"
const TEAM_ID = "efe567f2-ff44-41d5-9acf-eba8e43c7604"

const home = process.env.HOME ?? ""
const dataHome = process.env.XDG_DATA_HOME ?? `${home}/.local/share`
const db = new Database(`${dataHome}/rata/rata.sqlite`, { readonly: true })
const row = db.query("select api_key from profiles order by is_default desc limit 1").get() as {
  api_key: string
}
db.close()

const hexVersion = (hex: string): string => `${hex.slice(0, 12)}4${hex.slice(13, 16)}`
const hexVariant = (hex: string): string => {
  const nibble = Number.parseInt(hex.charAt(16), 16)
  return `${((nibble % 4) + 8).toString(16)}${hex.slice(17, 32)}`
}
const uuidFromHex = (hex: string): string => {
  const versioned = hexVersion(hex)
  const tail = hexVariant(hex)
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${tail.slice(0, 4)}-${tail.slice(4, 16)}`
}
const issueIdFor = (key: string): string =>
  uuidFromHex(createHash("sha256").update(`issue\0${TEAM_ID}\0${key}`).digest("hex"))

const gql = async (query: string, variables: Record<string, unknown>) => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { authorization: row.api_key, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  })
  const text = await response.text()
  const payload = JSON.parse(text)
  if (payload.errors) {
    throw new Error(JSON.stringify(payload.errors))
  }
  return payload.data
}

const slice = JSON.parse(
  await Bun.file("/tmp/opencode/rata-108-rehearsal/manifest.json").text(),
) as {
  key: string
  title: string
  parent: string | null
  createdAt: string
  state: string
  labels: string[]
  comments: { key: string; createdAt: string }[]
  blocks: string[]
}[]

const data = await gql(
  `query All($teamId: ID!) {
    issues(filter: { team: { id: { eq: $teamId } } }, first: 250, includeArchived: true) {
      nodes {
        id
        identifier
        title
        createdAt
        priority
        parent { id identifier }
        state { name }
        labels { nodes { name } }
        comments(first: 50) { nodes { id body createdAt } }
        relations { nodes { type relatedIssue { id } } }
      }
    }
  }`,
  { teamId: TEAM_ID },
)

const nodes = data.issues.nodes as any[]
const byId = new Map(nodes.map((node) => [node.id, node]))

const report: any[] = []
for (const entry of slice) {
  const id = issueIdFor(entry.key)
  const node = byId.get(id)
  if (node === undefined) {
    report.push({ key: entry.key, status: "missing" })
    continue
  }
  const expectedParent = entry.parent === null ? null : issueIdFor(entry.parent)
  const actualParent = node.parent?.id ?? null
  const labelNames = node.labels.nodes.map((label: any) => label.name).sort()
  const mismatches: string[] = []
  if (entry.title !== node.title) mismatches.push("title")
  if (entry.createdAt !== node.createdAt)
    mismatches.push(`createdAt ${entry.createdAt} != ${node.createdAt}`)
  if (expectedParent !== actualParent)
    mismatches.push(`parent ${expectedParent} != ${actualParent}`)
  if (entry.state.replace("inProgress", "in progress") !== node.state.name.toLowerCase())
    mismatches.push(`state ${entry.state} != ${node.state.name}`)
  const labelNamesFor = (names: string[]): string[] =>
    names.map((name) =>
      name === "readyForAgent" ? "ready-for-agent" : name === "needsTriage" ? "needs-triage" : name,
    )
  const expectedLabels = labelNamesFor(entry.labels).sort()
  if (
    JSON.stringify(expectedLabels) !==
    JSON.stringify(labelNames.map((name: string) => name.toLowerCase()))
  )
    mismatches.push(`labels ${expectedLabels} != ${labelNames.join(",")}`)
  if (entry.comments.length !== node.comments.nodes.length)
    mismatches.push(`comments ${entry.comments.length} != ${node.comments.nodes.length}`)
  report.push({
    key: entry.key,
    identifier: node.identifier,
    createdAt: node.createdAt,
    priority: node.priority,
    parent: node.parent?.identifier ?? null,
    state: node.state.name,
    labels: labelNames,
    comments: node.comments.nodes.length,
    blocks: node.relations.nodes.filter((relation: any) => relation.type === "blocks").length,
    mismatches,
  })
}

const failures = report.filter(
  (item) =>
    item.status === "missing" || (item.mismatches !== undefined && item.mismatches.length > 0),
)

const sameBatchDupId = issueIdFor("probe-same-batch-duplicate")
const sameBatch = nodes.filter((node) => node.id === sameBatchDupId)
const sameBatchTitles = nodes.filter((node) => node.title.startsWith("Same-batch duplicate"))

const relationCount = nodes.reduce(
  (total, node) =>
    total + node.relations.nodes.filter((relation: any) => relation.type === "blocks").length,
  0,
)

console.log(
  JSON.stringify(
    {
      teamIssues: nodes.length,
      sliceMatched: report.filter((item) => item.identifier !== undefined).length,
      mismatches: failures,
      blockersTotal: relationCount,
      expectedEdges: slice.reduce((total, entry) => total + entry.blocks.length, 0),
      sameBatchDuplicateCreated: sameBatch.length + sameBatchTitles.length,
      commentsInTeam: nodes.reduce((total, node) => total + node.comments.nodes.length, 0),
      sample: report.slice(0, 3),
      sampleChild: report.find((item) => item.key === "alpha-1-1"),
      sampleCommentDates: nodes
        .flatMap((node) => node.comments.nodes.map((comment: any) => comment.createdAt))
        .sort(),
    },
    null,
    2,
  ),
)
