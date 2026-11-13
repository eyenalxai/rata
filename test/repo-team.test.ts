import type { RepositorySeed } from "@test/database-harness"

import { apiLayer, makeFakeLinear } from "@test/fake-linear"
import { recordingConsoleWithErrors } from "@test/recording-console"
import { describe, expect, test } from "bun:test"
import { Console, Effect, Option } from "effect"

import { RepoTeam } from "@/api/repo-team"
import { RepoConfigService } from "@/config/repo"

const team = { id: "team-1", key: "RAT", name: "Rata", timezone: "America/Los_Angeles" }

const resolveWith = async (repositories: readonly RepositorySeed[]) => {
  const stderr: string[] = []
  const result = await Effect.gen(function* resolveTeam() {
    const repoTeam = yield* RepoTeam
    const repoConfig = yield* RepoConfigService
    const teamId = yield* repoTeam.resolve()
    const stored = yield* repoConfig.read(process.cwd())
    return { teamId, stored }
  }).pipe(
    Effect.provide(
      apiLayer(makeFakeLinear({ teams: [team], labels: [] }).handler, { repositories }),
    ),
    Effect.provideService(Console.Console, recordingConsoleWithErrors([], stderr)),
    Effect.runPromise,
  )
  return { ...result, stderr }
}

describe("RepoTeam stale links", () => {
  test("repairs a stale key by team id and warns", async () => {
    const result = await resolveWith([
      { key: process.cwd(), team: "OLD", teamId: "team-1", project: "rata" },
    ])

    expect(result.teamId).toBe("team-1")
    expect(result.stored).toEqual(Option.some({ team: "RAT", teamId: "team-1", project: "rata" }))
    expect(result.stderr).toEqual([
      "warning: The stored team key OLD is stale. Repaired the link to RAT.",
    ])
  })

  test("repairs a stale key by team name and warns", async () => {
    const result = await resolveWith([{ key: process.cwd(), team: "Rata" }])

    expect(result.teamId).toBe("team-1")
    expect(result.stored).toEqual(Option.some({ team: "RAT", teamId: "team-1" }))
    expect(result.stderr).toEqual([
      "warning: The stored team key Rata is stale. Repaired the link to RAT.",
    ])
  })

  test("stores the team id on a legacy key link without a warning", async () => {
    const result = await resolveWith([{ key: process.cwd(), team: "RAT" }])

    expect(result.teamId).toBe("team-1")
    expect(result.stored).toEqual(Option.some({ team: "RAT", teamId: "team-1" }))
    expect(result.stderr).toEqual([])
  })

  test("fails with the repair path when the key no longer exists", async () => {
    const stderr: string[] = []
    const fake = makeFakeLinear({ teams: [team], labels: [] })
    const error = await Effect.gen(function* resolveTeam() {
      const repoTeam = yield* RepoTeam
      return yield* Effect.flip(repoTeam.resolve())
    }).pipe(
      Effect.provide(
        apiLayer(fake.handler, { repositories: [{ key: process.cwd(), team: "GONE" }] }),
      ),
      Effect.provideService(Console.Console, recordingConsoleWithErrors([], stderr)),
      Effect.runPromise,
    )

    expect(error._tag).toBe("TeamNotFoundError")
    if (error._tag === "TeamNotFoundError") {
      expect(error.key).toBe("GONE")
    }
    expect(stderr).toEqual([])
  })
})
