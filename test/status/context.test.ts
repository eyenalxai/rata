import { makeFakeLinear } from "@test/fake-linear"
import { defaultViewer } from "@test/fake-linear/model"
import { lastJson, now, profiles, runStatus, statusLayer, team } from "@test/status/harness"
import { afterEach, describe, expect, test } from "bun:test"
import { Effect, Option, Schema } from "effect"
import { Command } from "effect/cli"

import { statusCommand } from "@/cli/registry"
import { hashApiKey } from "@/context/key-hash"
import { TeamDetail } from "@/linear/decode/team"
import { Viewer } from "@/linear/decode/viewer"

const cachedDetail: TeamDetail = Option.getOrThrow(
  Schema.decodeOption(TeamDetail)({
    id: "team-1",
    key: "RAT",
    name: "Rata",
    timezone: "America/Los_Angeles",
    states: [],
    labels: [],
    members: [],
    priorities: [],
  }),
)

const cachedViewer = Option.getOrThrow(Schema.decodeOption(Viewer)(defaultViewer))

afterEach(() => {
  process.exitCode = 0
})

describe("status context", () => {
  test("serves a warm read from SQLite without a Linear request", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    const requests = await Effect.gen(function* runTwice() {
      yield* Command.run(statusCommand, { version: "test" })
      const afterFirst = fake.requests.length
      yield* Command.run(statusCommand, { version: "test" })
      return { afterFirst, afterSecond: fake.requests.length }
    }).pipe(
      Effect.provide(
        statusLayer(fake.handler, ["--format", "json"], lines, {
          profiles,
          repositories: [{ key: process.cwd(), teamId: "team-1" }],
        }),
      ),
      Effect.runPromise,
    )

    expect(requests.afterFirst).toBeGreaterThan(0)
    expect(requests.afterSecond).toBe(requests.afterFirst)
    expect(lastJson(lines)).toMatchObject({
      team: { id: "team-1", key: "RAT", name: "Rata" },
      cache: { ageSeconds: 0 },
      states: [],
      labels: [],
    })
  })

  test("reports the repaired team when the stored UUID is stale", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    await runStatus(fake.handler, ["--format", "json"], lines, {
      profiles,
      repositories: [{ key: process.cwd(), team: "RAT", teamId: "gone-id", project: "rata" }],
    })

    expect(lastJson(lines)).toMatchObject({
      team: { id: "team-1", key: "RAT", name: "Rata" },
      project: "rata",
      warning: "The stored team id gone-id is stale. Repaired the link to RAT.",
    })
  })

  test("returns non-empty states and labels", async () => {
    const fake = makeFakeLinear({
      teams: [
        {
          ...team,
          states: [{ id: "state-todo", name: "Todo", type: "unstarted", position: 1 }],
        },
      ],
      labels: [{ id: "label-bug", name: "bug", color: "#EB5757", teamId: "team-1" }],
    })
    const lines: string[] = []
    await runStatus(fake.handler, ["--format", "json"], lines, {
      profiles,
      repositories: [{ key: process.cwd(), teamId: "team-1" }],
    })

    expect(lastJson(lines)).toMatchObject({
      states: [{ id: "state-todo", name: "Todo", type: "unstarted", position: 1 }],
      labels: [{ id: "label-bug", name: "bug", color: "#EB5757", scope: "team" }],
    })
  })

  test("reads Linear and updates the cache when --refresh is passed", async () => {
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const lines: string[] = []
    const keyHash = hashApiKey("test-key")
    const fetchedAt = await now()
    await runStatus(fake.handler, ["--format", "json", "--refresh"], lines, {
      repositories: [{ key: process.cwd(), teamId: "team-1" }],
      cache: {
        teams: [
          {
            profile: "env",
            teamId: "team-1",
            keyHash,
            detail: cachedDetail,
            fetchedAt,
          },
        ],
        viewers: [{ profile: "env", keyHash, viewer: cachedViewer, fetchedAt }],
      },
    })

    expect(fake.requests.length).toBeGreaterThan(0)
    expect(lastJson(lines)).toMatchObject({
      team: { id: "team-1", key: "RAT", name: "Rata" },
      cache: { ageSeconds: 0 },
    })
  })
})
