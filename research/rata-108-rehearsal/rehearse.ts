import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { writeFileSync } from "node:fs"

const ENDPOINT = "https://api.linear.app/graphql"
const TEAM_ID = "efe567f2-ff44-41d5-9acf-eba8e43c7604"
const TEAM_KEY = "RHR"
const VIEWER_ID = "d04a8850-48dc-40bf-b75f-02b581d0112e"

const STATE = {
  backlog: "88bccb64-c89c-4c2f-81d9-0eddf1f976f9",
  todo: "e7e55ab2-364a-478c-9dc8-a419456c470f",
  inProgress: "54690111-f506-4e50-8b2b-b147bddce770",
} as const

const LABEL = {
  enhancement: "741109cb-7825-492a-b72c-3befc91a5833",
  readyForAgent: "a5aa86f6-3c4e-4d1e-b09d-12fbea1475a3",
  bug: "f2172df1-e0ca-468d-b744-359017cbdb34",
  feature: "8a0fc11d-5989-4601-ba12-400a819f7b05",
  improvement: "d0fb6c06-ac4f-4247-af94-9f0f7bf3bd37",
  needsTriage: "3098948a-48a1-4bf8-b963-4cf326967316",
} as const

type LabelName = keyof typeof LABEL
type StateName = keyof typeof STATE

type Comment = { key: string; createdAt: string; body: string }

type Entry = {
  key: string
  title: string
  description: string
  state: StateName
  priority: 0 | 1 | 2 | 3 | 4
  labels: LabelName[]
  parent: string | null
  createdAt: string
  comments: Comment[]
  blocks: string[]
}

const readApiKey = (): string => {
  const home = process.env.HOME ?? ""
  const dataHome = process.env.XDG_DATA_HOME ?? `${home}/.local/share`
  const db = new Database(`${dataHome}/rata/rata.sqlite`, { readonly: true })
  const row = db.query("select api_key from profiles order by is_default desc limit 1").get() as {
    api_key: string
  } | null
  db.close()
  if (row === null) {
    throw new Error("No stored Linear profile.")
  }
  return row.api_key
}

const apiKey = readApiKey()

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
const commentIdFor = (issueId: string, key: string): string =>
  uuidFromHex(createHash("sha256").update(`${issueId}\0${key}`).digest("hex"))

type CallRecord = {
  phase: string
  op: string
  items: number
  ms: number
  httpStatus: number
  ok: boolean
  complexity: string | null
  requestsRemaining: string | null
  complexityRemaining: string | null
  errors: unknown
  note?: string
}

const calls: CallRecord[] = []
const failures: { phase: string; op: string; error: unknown }[] = []

class GraphQLError extends Error {
  readonly errors: unknown
  constructor(errors: unknown) {
    super("Linear returned a GraphQL error.")
    this.errors = errors
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const call = async (
  phase: string,
  op: string,
  query: string,
  variables: Record<string, unknown>,
  items = 0,
): Promise<any> => {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const started = performance.now()
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { authorization: apiKey, "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    })
    const text = await response.text()
    const record: CallRecord = {
      phase,
      op,
      items,
      ms: Math.round(performance.now() - started),
      httpStatus: response.status,
      ok: true,
      complexity: response.headers.get("x-complexity"),
      requestsRemaining: response.headers.get("x-ratelimit-requests-remaining"),
      complexityRemaining: response.headers.get("x-ratelimit-complexity-remaining"),
      errors: null,
    }
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "1")
      record.ok = false
      record.errors = { code: "RATELIMITED", retryAfterSeconds: retryAfter, attempt }
      calls.push(record)
      if (attempt === 3) {
        throw new GraphQLError(record.errors)
      }
      await sleep(Math.min(retryAfter, 60) * 1000)
      continue
    }
    if (response.status >= 400) {
      record.ok = false
      record.errors = text.slice(0, 2000)
      calls.push(record)
      throw new GraphQLError(record.errors)
    }
    let payload: any
    try {
      payload = JSON.parse(text)
    } catch (cause) {
      record.ok = false
      record.errors = text.slice(0, 2000)
      calls.push(record)
      throw new GraphQLError(record.errors)
    }
    if (payload.errors !== undefined && payload.errors !== null) {
      record.ok = false
      record.errors = payload.errors
      calls.push(record)
      throw new GraphQLError(payload.errors)
    }
    calls.push(record)
    return payload.data
  }
  throw new GraphQLError({ code: "unreachable" })
}

const attempt = async <T>(
  phase: string,
  op: string,
  run: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> => {
  try {
    return { ok: true, value: await run() }
  } catch (error) {
    failures.push({
      phase,
      op,
      error: error instanceof GraphQLError ? error.errors : String(error),
    })
    return { ok: false, error: error instanceof GraphQLError ? error.errors : String(error) }
  }
}

const rateLimitStatus = async (phase: string) => {
  const data = await call(
    phase,
    "rateLimitStatus",
    `query { rateLimitStatus { kind limits { type allowedAmount remainingAmount requestedAmount period reset } } }`,
    {},
  )
  return data.rateLimitStatus
}

const text = (index: number, words: readonly string[]): string => {
  const body = words[index % words.length] ?? "rehearsal"
  return [
    `## Context`,
    ``,
    `This entry is part of the RATA-108 rehearsal slice for team ${TEAM_KEY}. It exists to`,
    `measure the batch create path, not to carry real work.`,
    ``,
    `- key: \`${body}\``,
    `- index: ${index}`,
    `- generated: 2026-10-29`,
    ``,
    `### Notes`,
    ``,
    `The body is long enough to look like a real ticket and short enough to keep the request`,
    `small. A real migration carries prose of this shape.`,
  ].join("\n")
}

const words = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"]

const epic = (name: string, index: number, blocks: string[]): Entry => ({
  key: `epic-${name}`,
  title: `Epic ${name[0]?.toUpperCase()}${name.slice(1)}`,
  description: text(index, [name, ...words]),
  state: "todo",
  priority: (index % 3) as 0 | 1 | 2 | 3 | 4,
  labels: ["feature"],
  parent: null,
  createdAt: `2025-03-0${index + 1}T09:00:00.000Z`,
  comments:
    index < 2
      ? [
          {
            key: `${name}-kickoff`,
            createdAt: `2025-03-0${index + 1}T12:00:00.000Z`,
            body: `Kickoff note for epic ${name}.`,
          },
        ]
      : [],
  blocks,
})

const child = (parent: string, slot: number, index: number, blocks: string[]): Entry => ({
  key: `${parent.replace("epic-", "")}-${slot}`,
  title: `${parent.replace("epic-", "").replace(/^./, (c) => c.toUpperCase())} child ${slot}`,
  description: text(index, words),
  state: slot === 1 ? "inProgress" : "todo",
  priority: ((index + 1) % 5) as 0 | 1 | 2 | 3 | 4,
  labels: slot === 2 ? ["enhancement", "readyForAgent"] : ["enhancement"],
  parent,
  createdAt: `2025-03-${String(5 + index).padStart(2, "0")}T10:00:00.000Z`,
  comments:
    slot === 1
      ? [
          {
            key: `${parent}-${slot}-plan`,
            createdAt: `2025-03-${String(5 + index).padStart(2, "0")}T15:00:00.000Z`,
            body: `Plan for ${parent}-${slot}.`,
          },
        ]
      : [],
  blocks,
})

const grandchild = (parent: string, slot: number, index: number, blocks: string[]): Entry => ({
  key: `${parent}-${slot}`,
  title: `${parent.replace("epic-", "").replace(/^./, (c) => c.toUpperCase())} grandchild ${slot}`,
  description: text(index, [...words].reverse()),
  state: "backlog",
  priority: ((index + 2) % 5) as 0 | 1 | 2 | 3 | 4,
  labels: slot === 1 ? ["improvement"] : ["needsTriage"],
  parent,
  createdAt: `2025-03-${String(20 + index).padStart(2, "0")}T08:00:00.000Z`,
  comments: [],
  blocks,
})

const buildSlice = (): Entry[] => {
  const epics = [
    epic("alpha", 0, ["alpha-1"]),
    epic("bravo", 1, ["bravo-1"]),
    epic("charlie", 2, ["charlie-1"]),
    epic("delta", 3, []),
    epic("echo", 4, []),
  ]
  const children = [
    child("epic-alpha", 1, 0, ["alpha-2"]),
    child("epic-alpha", 2, 1, ["alpha-3"]),
    child("epic-alpha", 3, 2, ["bravo-1"]),
    child("epic-bravo", 1, 3, ["bravo-2"]),
    child("epic-bravo", 2, 4, []),
    child("epic-bravo", 3, 5, []),
    child("epic-charlie", 1, 6, ["charlie-2"]),
    child("epic-charlie", 2, 7, ["delta-1"]),
    child("epic-charlie", 3, 8, []),
    child("epic-delta", 1, 9, ["delta-2"]),
    child("epic-delta", 2, 10, []),
    child("epic-delta", 3, 11, []),
    child("epic-echo", 1, 12, ["echo-2"]),
    child("epic-echo", 2, 13, []),
    child("epic-echo", 3, 14, []),
  ]
  const grandchildren = [
    grandchild("alpha-1", 1, 0, ["alpha-1-2"]),
    grandchild("alpha-1", 2, 1, []),
    grandchild("alpha-2", 1, 2, []),
    grandchild("bravo-1", 1, 3, ["bravo-1-2"]),
    grandchild("bravo-1", 2, 4, []),
    grandchild("bravo-2", 1, 5, []),
    grandchild("charlie-1", 1, 6, []),
    grandchild("charlie-1", 2, 7, []),
    grandchild("delta-1", 1, 8, ["delta-1-2"]),
    grandchild("delta-1", 2, 9, []),
  ]
  return [...epics, ...children, ...grandchildren]
}

const titleFor = (entry: Entry) => entry.title
const descriptionFor = (entry: Entry) => entry.description

const createInput = (entry: Entry): Record<string, unknown> => {
  const id = issueIdFor(entry.key)
  const parentId = entry.parent === null ? undefined : issueIdFor(entry.parent)
  return {
    id,
    teamId: TEAM_ID,
    title: titleFor(entry),
    description: descriptionFor(entry),
    stateId: STATE[entry.state],
    priority: entry.priority,
    labelIds: entry.labels.map((label) => LABEL[label]),
    assigneeId: VIEWER_ID,
    createdAt: entry.createdAt,
    ...(parentId === undefined ? {} : { parentId }),
  }
}

const batchCreate = async (phase: string, op: string, entries: readonly Entry[]) => {
  const input = { input: { issues: entries.map(createInput) } }
  const run = await attempt(phase, op, () =>
    call(
      phase,
      op,
      `mutation CreateBatch($input: IssueBatchCreateInput!) {
        issueBatchCreate(input: $input) {
          success
          issues {
            id
            identifier
            title
            createdAt
            parent { id }
            state { name }
            labels { nodes { name } }
          }
        }
      }`,
      input,
      entries.length,
    ),
  )
  return run
}

const probeIssues = async (phase: string, ids: readonly string[]) => {
  const data = await call(
    phase,
    "issueProbe",
    `query Probe($ids: [ID!]!) {
      issues(filter: { id: { in: $ids } }, first: 250) { nodes { id identifier } }
    }`,
    { ids },
  )
  return data.issues.nodes as { id: string; identifier: string }[]
}

const createComment = async (phase: string, issueId: string, comment: Comment) => {
  const id = commentIdFor(issueId, comment.key)
  return attempt(phase, "commentCreate", () =>
    call(
      phase,
      "commentCreate",
      `mutation Comment($input: CommentCreateInput!) {
        commentCreate(input: $input) {
          success
          comment { id body createdAt issue { id } }
        }
      }`,
      { input: { id, issueId, body: comment.body, createdAt: comment.createdAt } },
      1,
    ),
  )
}

const createRelation = async (phase: string, blockerId: string, blockedId: string) =>
  attempt(phase, "relationCreate", () =>
    call(
      phase,
      "relationCreate",
      `mutation Relation($input: IssueRelationCreateInput!) {
        issueRelationCreate(input: $input) {
          success
          issueRelation { id type issue { id } relatedIssue { id } }
        }
      }`,
      { input: { issueId: blockerId, relatedIssueId: blockedId, type: "blocks" } },
      1,
    ),
  )

const readRelations = async (phase: string, issueId: string) => {
  const data = await call(
    phase,
    "relationRead",
    `query Relations($id: String!) {
      issue(id: $id) { relations { nodes { id type relatedIssue { id } } } }
    }`,
    { id: issueId },
  )
  return data.issue?.relations?.nodes as {
    id: string
    type: string
    relatedIssue: { id: string }
  }[]
}

const sumBy = <T>(items: readonly T[], pick: (item: T) => number) =>
  items.reduce((total, item) => total + pick(item), 0)

const phaseFacts = (phase: string) => {
  const scoped = calls.filter((record) => record.phase === phase)
  return {
    calls: scoped.length,
    failedCalls: scoped.filter((record) => !record.ok).length,
    wallMs: sumBy(scoped, (record) => record.ms),
    complexityPoints: sumBy(scoped, (record) => Number(record.complexity ?? "0")),
    byOp: Object.fromEntries(
      [...new Set(scoped.map((record) => record.op))].map((op) => [
        op,
        scoped.filter((record) => record.op === op).length,
      ]),
    ),
  }
}

const main = async () => {
  const slice = buildSlice()
  const levelOf = (entry: Entry): number =>
    entry.parent === null ? 0 : 1 + levelOfByKey(entry.parent)
  const byKey = new Map(slice.map((entry) => [entry.key, entry]))
  const levelOfByKey = (key: string): number => {
    const entry = byKey.get(key)
    if (entry === undefined) {
      throw new Error(`Unknown key ${key}`)
    }
    return entry.parent === null ? 0 : 1 + levelOfByKey(entry.parent)
  }
  const levels = [0, 1, 2].map((level) => slice.filter((entry) => levelOf(entry) === level))

  const startedAt = new Date().toISOString()
  const limitBefore = await rateLimitStatus("limits-before")

  const probes: Record<string, unknown> = {}

  const duplicateSeed = "probe-duplicate-key"
  probes.duplicateSeed = await batchCreate("probe-dup", "createSeed", [
    {
      key: duplicateSeed,
      title: "Duplicate probe",
      description: "Seed issue for the duplicate-id probe.",
      state: "todo",
      priority: 2,
      labels: [],
      parent: null,
      createdAt: "2025-02-01T09:00:00.000Z",
      comments: [],
      blocks: [],
    },
  ])

  const duplicateSeedId = issueIdFor(duplicateSeed)
  probes.duplicateSecondRequest = await attempt("probe-dup", "createAgain", () =>
    call(
      "probe-dup",
      "createAgain",
      `mutation Duplicate($input: IssueBatchCreateInput!) {
        issueBatchCreate(input: $input) { success issues { id identifier title } }
      }`,
      {
        input: {
          issues: [
            {
              id: duplicateSeedId,
              teamId: TEAM_ID,
              title: "Duplicate probe, second request",
              description: "Second request with the same client id.",
              stateId: STATE.todo,
              priority: 2,
            },
          ],
        },
      },
      1,
    ),
  )

  const sameBatchId = issueIdFor("probe-same-batch-duplicate")
  probes.duplicateSameBatch = await attempt("probe-dup", "createTwiceInBatch", () =>
    call(
      "probe-dup",
      "createTwiceInBatch",
      `mutation DuplicateBatch($input: IssueBatchCreateInput!) {
        issueBatchCreate(input: $input) { success issues { id identifier title } }
      }`,
      {
        input: {
          issues: [
            {
              id: sameBatchId,
              teamId: TEAM_ID,
              title: "Same-batch duplicate A",
              description: "First of two entries that carry one id.",
              stateId: STATE.todo,
              priority: 2,
            },
            {
              id: sameBatchId,
              teamId: TEAM_ID,
              title: "Same-batch duplicate B",
              description: "Second of two entries that carry one id.",
              stateId: STATE.todo,
              priority: 2,
            },
          ],
        },
      },
      2,
    ),
  )

  const capIds = Array.from({ length: 51 }, (_, index) => issueIdFor(`probe-cap-${index}`))
  probes.capFiftyOne = await attempt("probe-cap", "batchCreate51", () =>
    call(
      "probe-cap",
      "batchCreate51",
      `mutation Cap($input: IssueBatchCreateInput!) {
        issueBatchCreate(input: $input) { success issues { id identifier } }
      }`,
      {
        input: {
          issues: capIds.map((id, index) => ({
            id,
            teamId: TEAM_ID,
            title: `Cap probe ${index}`,
            description: "Settles whether 51 issues are accepted in one batch.",
            stateId: STATE.backlog,
            priority: 3,
          })),
        },
      },
      51,
    ),
  )

  const parentKey = "same-batch-parent"
  const childKey = "same-batch-child"
  const parentId = issueIdFor(parentKey)
  const childId = issueIdFor(childKey)
  const sameBatch = await attempt("probe-parent", "batchCreateParentAndChild", () =>
    call(
      "probe-parent",
      "batchCreateParentAndChild",
      `mutation ParentChild($input: IssueBatchCreateInput!) {
        issueBatchCreate(input: $input) { success issues { id identifier title parent { id } } }
      }`,
      {
        input: {
          issues: [
            {
              id: parentId,
              teamId: TEAM_ID,
              title: "Same-batch parent",
              description: "Parent created in the same batch as its child.",
              stateId: STATE.todo,
              priority: 2,
            },
            {
              id: childId,
              teamId: TEAM_ID,
              title: "Same-batch child",
              description: "Child whose parentId names a sibling in the same batch.",
              stateId: STATE.todo,
              priority: 2,
              parentId,
            },
          ],
        },
      },
      2,
    ),
  )
  const sameBatchRead = await attempt("probe-parent", "readChildParent", () =>
    call(
      "probe-parent",
      "readChildParent",
      `query ChildParent($id: String!) { issue(id: $id) { id identifier parent { id identifier } } }`,
      { id: childId },
    ),
  )
  probes.sameBatchParent = {
    write: sameBatch,
    read: sameBatchRead,
  }

  const sliceIds = slice.map((entry) => issueIdFor(entry.key))

  const runImport = async (phase: string, first: boolean) => {
    const summary = {
      phase,
      calls: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      createBatches: [] as unknown[],
      commentResults: [] as string[],
      relationResults: [] as string[],
    }

    const probe = await attempt(phase, "issueProbeAll", () => probeIssues(phase, sliceIds))

    if (first) {
      for (const [index, level] of levels.entries()) {
        const result = await batchCreate(phase, `batchCreateLevel${index}`, level)
        const created: any[] = result.ok ? result.value.issueBatchCreate.issues : []
        const parentless = created.filter((issue) => {
          const entry = slice.find((candidate) => issueIdFor(candidate.key) === issue.id)
          return entry !== undefined && entry.parent !== null && issue.parent === null
        })
        summary.createBatches.push({
          level: index,
          items: level.length,
          ok: result.ok,
          created: created.length,
          parentless: parentless.map((issue) => issue.identifier),
          errors: result.ok ? null : result.error,
        })
        if (result.ok) {
          summary.created += created.length
        } else {
          summary.failed += level.length
        }
      }
    } else {
      const hits = probe.ok ? probe.value : []
      const hitIds = new Set(hits.map((hit) => hit.id))
      summary.skipped += slice.filter((entry, index) => hitIds.has(sliceIds[index]!)).length
      summary.created += slice.filter((entry, index) => !hitIds.has(sliceIds[index]!)).length

      const missing = slice.filter((entry, index) => !hitIds.has(sliceIds[index]!))
      if (missing.length > 0) {
        for (const entry of missing) {
          const result = await batchCreate(phase, "batchCreateMiss", [entry])
          if (result.ok) {
            summary.created += 1
          } else {
            summary.failed += 1
          }
        }
      }
    }

    const allComments = slice.flatMap((entry) =>
      entry.comments.map((comment) => ({ issueId: issueIdFor(entry.key), comment })),
    )

    if (first) {
      for (const item of allComments) {
        const result = await createComment(phase, item.issueId, item.comment)
        summary.commentResults.push(result.ok ? "created" : "failed")
        if (!result.ok) {
          summary.failed += 1
        }
      }
    } else {
      const commentIds = allComments.map((item) => commentIdFor(item.issueId, item.comment.key))
      const existing = await attempt(phase, "commentProbe", () =>
        call(
          phase,
          "commentProbe",
          `query Comments($ids: [ID!]!) {
            comments(filter: { id: { in: $ids } }, first: 250) { nodes { id } }
          }`,
          { ids: commentIds },
        ),
      )
      const existingIds = new Set(
        existing.ok
          ? (existing.value.comments.nodes as { id: string }[]).map((node) => node.id)
          : [],
      )
      for (const item of allComments) {
        const id = commentIdFor(item.issueId, item.comment.key)
        if (existingIds.has(id)) {
          summary.skipped += 1
          summary.commentResults.push("skipped")
        } else {
          const result = await createComment(phase, item.issueId, item.comment)
          summary.commentResults.push(result.ok ? "created" : "failed")
          if (result.ok) {
            summary.created += 1
          } else {
            summary.failed += 1
          }
        }
      }
    }

    const edges = slice.flatMap((entry) =>
      entry.blocks.map((target) => ({
        blockerId: issueIdFor(entry.key),
        blockedId: issueIdFor(target),
      })),
    )

    if (first) {
      for (const edge of edges) {
        const result = await createRelation(phase, edge.blockerId, edge.blockedId)
        summary.relationResults.push(result.ok ? "created" : "failed")
        if (!result.ok) {
          summary.failed += 1
        }
      }
    } else {
      const blockers = [...new Set(edges.map((edge) => edge.blockerId))]
      const present = new Set<string>()
      for (const blockerId of blockers) {
        const relations = await attempt(phase, "relationRead", () =>
          readRelations(phase, blockerId),
        )
        if (relations.ok) {
          for (const relation of relations.value ?? []) {
            if (relation.type === "blocks") {
              present.add(`${blockerId}->${relation.relatedIssue.id}`)
            }
          }
        }
      }
      for (const edge of edges) {
        const key = `${edge.blockerId}->${edge.blockedId}`
        if (present.has(key)) {
          summary.skipped += 1
          summary.relationResults.push("skipped")
        } else {
          const result = await createRelation(phase, edge.blockerId, edge.blockedId)
          summary.relationResults.push(result.ok ? "created" : "failed")
          if (!result.ok) {
            summary.failed += 1
          }
        }
      }
    }

    const after = await attempt(phase, "issueProbeAfter", () => probeIssues(phase, sliceIds))
    const afterIds = new Set(after.ok ? after.value.map((hit) => hit.id) : [])
    summary.calls = calls.filter((record) => record.phase === phase).length
    summary.presentAfter = sliceIds.filter((id) => afterIds.has(id)).length
    return summary
  }

  const roundA = await runImport("import-1", true)
  const roundB = await runImport("import-2", false)

  const duplicates = await attempt("verify", "duplicateTitles", () =>
    call(
      "verify",
      "duplicateTitles",
      `query Duplicates($teamId: ID!) {
        issues(filter: { team: { id: { eq: $teamId } } }, first: 250) {
          nodes { id identifier title createdAt parent { id } }
        }
      }`,
      { teamId: TEAM_ID },
    ),
  )
  const nodes: {
    id: string
    identifier: string
    title: string
    createdAt: string
    parent: { id: string } | null
  }[] = duplicates.ok ? duplicates.value.issues.nodes : []
  const titleCounts = new Map<string, number>()
  for (const node of nodes) {
    titleCounts.set(node.title, (titleCounts.get(node.title) ?? 0) + 1)
  }

  const limitAfter = await rateLimitStatus("limits-after")

  const finishedAt = new Date().toISOString()
  const limitDelta = (before: any, after: any) => {
    const pick = (payload: any) =>
      Object.fromEntries(
        payload.limits.map((limit: any) => [
          limit.type,
          {
            allowed: limit.allowedAmount,
            remaining: limit.remainingAmount,
            requested: limit.requestedAmount,
            reset: limit.reset,
          },
        ]),
      )
    return { before: pick(before), after: pick(after) }
  }

  const evidence = {
    ticket: "RATA-108",
    team: { key: TEAM_KEY, id: TEAM_ID },
    startedAt,
    finishedAt,
    slice: {
      issues: slice.length,
      levels: levels.map((level) => level.length),
      comments: slice.reduce((total, entry) => total + entry.comments.length, 0),
      edges: slice.reduce((total, entry) => total + entry.blocks.length, 0),
      bytes: Buffer.byteLength(JSON.stringify(slice, null, 2)),
    },
    totalCalls: calls.length,
    totalWallMs: sumBy(calls, (record) => record.ms),
    limits: limitDelta(limitBefore, limitAfter),
    phases: {
      "import-1": phaseFacts("import-1"),
      "import-2": phaseFacts("import-2"),
      "probe-dup": phaseFacts("probe-dup"),
      "probe-cap": phaseFacts("probe-cap"),
      "probe-parent": phaseFacts("probe-parent"),
      verify: phaseFacts("verify"),
      "limits-before": phaseFacts("limits-before"),
      "limits-after": phaseFacts("limits-after"),
    },
    probes,
    roundA,
    roundB,
    verify: {
      teamIssues: nodes.length,
      sliceIssuesPresent: nodes.filter((node) => sliceIds.includes(node.id)).length,
      duplicateTitles: [...titleCounts.entries()].filter(([, count]) => count > 1),
      sampleTitles: nodes.slice(0, 5).map((node) => `${node.identifier} ${node.title}`),
    },
    failures,
    calls,
  }

  writeFileSync("/tmp/opencode/rata-108-rehearsal/manifest.json", JSON.stringify(slice, null, 2))
  writeFileSync("/tmp/opencode/rata-108-rehearsal/evidence.json", JSON.stringify(evidence, null, 2))

  console.log(
    JSON.stringify(
      {
        slice: evidence.slice,
        totalCalls: evidence.totalCalls,
        totalWallMs: evidence.totalWallMs,
        phases: evidence.phases,
        limits: evidence.limits,
        roundA,
        roundB,
        verify: evidence.verify,
        probes: Object.fromEntries(
          Object.entries(probes).map(([key, value]: [string, any]) => [
            key,
            value?.ok === false
              ? { ok: false, error: value.error }
              : value?.ok === true
                ? { ok: true }
                : value,
          ]),
        ),
        failureCount: failures.length,
      },
      null,
      2,
    ),
  )
}

await main()
