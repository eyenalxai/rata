import type { GraphQLRequest, Handler } from "@test/fake-linear"

import { apiLayer, makeFakeLinear } from "@test/fake-linear"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { LabelService } from "@/api/label"
import { TeamService } from "@/api/team"
import { canonicalLabels } from "@/domain/labels"

const team = { id: "team-1", key: "RAT", name: "Rata" }

const listLabels = (handler: Handler, teamId: string) =>
  Effect.gen(function* runList() {
    const labels = yield* LabelService
    return yield* labels.list(teamId)
  }).pipe(Effect.provide(apiLayer(handler)))

const ensureLabels = (handler: Handler, teamKey: string) =>
  Effect.gen(function* runEnsure() {
    const teams = yield* TeamService
    const labels = yield* LabelService
    const selected = yield* teams.byKey(teamKey)
    return yield* labels.ensure(selected.id)
  }).pipe(Effect.provide(apiLayer(handler)))

const countCreates = (requests: readonly GraphQLRequest[]): number =>
  requests.filter((request) => request.query.includes("mutation CreateLabel")).length

describe("LabelService", () => {
  test("lists only the labels of the given team", async () => {
    const fake = makeFakeLinear({
      teams: [team],
      projects: [],
      labels: [
        { id: "label-1", name: "needs-triage", color: "#111111", teamId: "team-1" },
        { id: "label-2", name: "bug", color: "#222222", teamId: "team-2" },
      ],
    })
    const labels = await listLabels(fake.handler, "team-1").pipe(Effect.runPromise)
    expect(labels).toEqual([{ id: "label-1", name: "needs-triage", color: "#111111" }])
    expect(fake.requests[0]?.variables.teamId).toBe("team-1")
  })

  test("creates only the missing canonical labels and reports both groups", async () => {
    const fake = makeFakeLinear({
      teams: [team],
      projects: [],
      labels: [
        { id: "label-1", name: "wontfix", color: "#111111", teamId: "team-1" },
        { id: "label-2", name: "needs-triage", color: "#222222", teamId: "team-1" },
      ],
    })
    const result = await ensureLabels(fake.handler, "RAT").pipe(Effect.runPromise)
    expect(countCreates(fake.requests)).toBe(canonicalLabels.length - 2)
    expect(result.created.map((label) => label.name)).toEqual(
      canonicalLabels.filter((name) => name !== "needs-triage" && name !== "wontfix"),
    )
    expect(result.existing.map((label) => label.name)).toEqual(["needs-triage", "wontfix"])
  })

  test("is idempotent: a second run creates nothing", async () => {
    const fake = makeFakeLinear({ teams: [team], projects: [], labels: [] })
    const first = await ensureLabels(fake.handler, "RAT").pipe(Effect.runPromise)
    expect(first.created).toHaveLength(canonicalLabels.length)
    expect(countCreates(fake.requests)).toBe(canonicalLabels.length)

    const second = await ensureLabels(fake.handler, "RAT").pipe(Effect.runPromise)
    expect(countCreates(fake.requests)).toBe(canonicalLabels.length)
    expect(second.created).toEqual([])
    expect(second.existing.map((label) => label.name)).toEqual([...canonicalLabels])
  })

  test("fails when Linear rejects a label creation", async () => {
    const fake = makeFakeLinear({ teams: [team], projects: [], labels: [] }, { rejectCreate: true })
    const error = await ensureLabels(fake.handler, "RAT").pipe(Effect.flip, Effect.runPromise)
    expect(error._tag).toBe("LabelCreateError")
    if (error._tag === "LabelCreateError") {
      expect(error.name).toBe("needs-triage")
    }
  })
})
