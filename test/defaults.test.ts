import type { RepositorySeed } from "@test/database-harness"

import { apiLayer, makeFakeLinear } from "@test/fake-linear"
import { describe, expect, test } from "bun:test"
import { Effect, Option } from "effect"

import { IssueDefaultsService } from "@/config/defaults"
import { RepoConfigService } from "@/config/repo"

const team = { id: "team-1", key: "RAT", name: "Rata", timezone: "America/Los_Angeles" }
const labels = [
  { id: "l-enh", name: "enhancement", color: "#111111", teamId: "team-1" },
  { id: "l-bug", name: "bug", color: "#EB5757", teamId: "team-1" },
]

const linked: readonly RepositorySeed[] = [{ key: process.cwd(), team: "RAT" }]

const runDefaults = <A, E>(
  repositorySeed: readonly RepositorySeed[],
  effect: Effect.Effect<A, E, IssueDefaultsService | RepoConfigService>,
): Promise<A> => {
  const fake = makeFakeLinear({ teams: [team], labels })
  return effect.pipe(
    Effect.provide(apiLayer(fake.handler, { repositories: repositorySeed })),
    Effect.runPromise,
  )
}

describe("IssueDefaultsService.set", () => {
  test("stores each default in the repository config", async () => {
    const result = await runDefaults(
      linked,
      Effect.gen(function* setDefaults() {
        const service = yield* IssueDefaultsService
        const repoConfig = yield* RepoConfigService
        const defaults = yield* service.set({
          assignee: "me",
          labels: ["enhancement"],
          priority: 3,
        })
        const stored = yield* repoConfig.read(process.cwd())
        return { defaults, stored }
      }),
    )

    expect(result.defaults).toEqual({
      assignee: "me",
      labels: ["enhancement"],
      priority: 3,
    })
    expect(result.stored).toEqual(
      Option.some({
        team: "RAT",
        defaultAssignee: "me",
        defaultLabels: ["enhancement"],
        defaultPriority: 3,
      }),
    )
  })

  test("resolves the labels against the linked team and deduplicates them", async () => {
    const defaults = await runDefaults(
      linked,
      Effect.gen(function* setDefaults() {
        const service = yield* IssueDefaultsService
        return yield* service.set({ labels: ["Enhancement", "enhancement", "bug"] })
      }),
    )

    expect(defaults.labels).toEqual(["enhancement", "bug"])
  })

  test("fails with not_found and writes nothing for a missing label", async () => {
    const result = await runDefaults(
      linked,
      Effect.gen(function* setDefaults() {
        const service = yield* IssueDefaultsService
        const repoConfig = yield* RepoConfigService
        const error = yield* Effect.flip(service.set({ labels: ["missing"] }))
        const stored = yield* repoConfig.read(process.cwd())
        return { error, stored }
      }),
    )

    expect(result.error._tag).toBe("LabelNotFoundError")
    expect(result.stored).toEqual(Option.some({ team: "RAT" }))
  })

  test("fails with not_linked without a repository link", async () => {
    const error = await runDefaults(
      [],
      Effect.gen(function* setDefaults() {
        const service = yield* IssueDefaultsService
        return yield* Effect.flip(service.set({ priority: 2 }))
      }),
    )

    expect(error._tag).toBe("TeamResolutionError")
  })

  test("clears a field with none and writes nothing on a dry run", async () => {
    const result = await runDefaults(
      [{ key: process.cwd(), team: "RAT", defaultAssignee: "me", defaultPriority: 3 }],
      Effect.gen(function* setDefaults() {
        const service = yield* IssueDefaultsService
        const repoConfig = yield* RepoConfigService
        const plan = yield* service.set({ assignee: "none", priority: 0, dryRun: true })
        const stored = yield* repoConfig.read(process.cwd())
        return { plan, stored }
      }),
    )

    expect(result.plan).toEqual({ assignee: null, labels: [], priority: null })
    expect(result.stored).toEqual(
      Option.some({ team: "RAT", defaultAssignee: "me", defaultPriority: 3 }),
    )
  })
})

describe("IssueDefaultsService.unset", () => {
  test("clears only the named fields", async () => {
    const result = await runDefaults(
      [
        {
          key: process.cwd(),
          team: "RAT",
          defaultAssignee: "me",
          defaultLabels: ["enhancement"],
          defaultPriority: 3,
        },
      ],
      Effect.gen(function* unsetDefaults() {
        const service = yield* IssueDefaultsService
        const defaults = yield* service.unset({
          assignee: false,
          labels: true,
          priority: false,
        })
        const stored = yield* service.show
        return { defaults, stored }
      }),
    )

    expect(result.defaults).toEqual({ assignee: "me", labels: [], priority: 3 })
    expect(result.stored).toEqual({ assignee: "me", labels: [], priority: 3 })
  })
})
