import type { MemorySeed, MemoryTeam } from "@test/fake-linear/gateway/model"

import { lastJson, runRootMemory } from "@test/cli-harness"
import { memoryApiLayer } from "@test/fake-linear/memory-layer"
import { defaultEnv, defaultViewer } from "@test/fake-linear/model"
import { afterEach, describe, expect, test } from "bun:test"
import { Effect, Option, Schema } from "effect"

import { TeamService } from "@/api/team"
import { labelId, teamId, userId, workflowStateId } from "@/domain/id"
import { Viewer } from "@/linear/decode/viewer"

const viewer = Option.getOrThrow(Schema.decodeUnknownOption(Viewer)(defaultViewer))

const states = Array.from({ length: 60 }, (_, index) => ({
  id: workflowStateId(`state-${index}`),
  name: `State ${index}`,
  type: index % 2 === 0 ? ("unstarted" as const) : ("started" as const),
  position: 100 - index,
}))

const members = [
  ...Array.from({ length: 60 }, (_, index) => ({
    id: userId(`member-${index}`),
    name: `Member ${index}`,
    displayName: `member${index}`,
    email: `member${index}@example.com`,
    active: true,
  })),
  {
    id: userId("member-disabled"),
    name: "Disabled",
    displayName: "disabled",
    email: "disabled@example.com",
    active: false,
  },
]

const labels = [
  ...Array.from({ length: 60 }, (_, index) => ({
    id: labelId(`label-${index}`),
    name: `Label ${index}`,
    color: "#5E6AD2",
    teamId: teamId("team-1"),
  })),
  {
    id: labelId("label-workspace"),
    name: "Workspace",
    color: "#EB5757",
    teamId: null,
  },
]

const team: MemoryTeam = {
  id: teamId("team-1"),
  key: "RAT",
  name: "Rata",
  timezone: "America/Los_Angeles",
  states,
  members,
  priorities: [
    { priority: 3, label: "Medium" },
    { priority: 0, label: "No priority" },
  ],
}

const seed: MemorySeed = { viewer, teams: [team], labels }

const TeamDocument = Schema.Struct({
  key: Schema.String,
  states: Schema.Array(Schema.Unknown),
  labels: Schema.Array(Schema.Unknown),
  members: Schema.Array(Schema.Unknown),
  priorities: Schema.Array(Schema.Unknown),
})

const ErrorEnvelope = Schema.Struct({
  error: Schema.Struct({ code: Schema.String }),
})

const showTeam = () =>
  Effect.gen(function* show() {
    const teams = yield* TeamService
    return yield* teams.details("RAT")
  }).pipe(Effect.provide(memoryApiLayer(seed, { env: defaultEnv })), Effect.runPromise)

afterEach(() => {
  process.exitCode = 0
})

describe("TeamService.details", () => {
  test("returns every state, label and member, with priorities sorted", async () => {
    const detail = await showTeam()

    expect(detail.states).toHaveLength(60)
    expect(detail.states[0]?.position).toBe(41)
    expect(detail.states.at(-1)?.position).toBe(100)
    expect(detail.labels).toHaveLength(61)
    expect(detail.labels.find((label) => label.id === labelId("label-workspace"))?.scope).toBe(
      "workspace",
    )
    expect(detail.labels.find((label) => label.id === labelId("label-0"))?.scope).toBe("team")
    expect(detail.members).toHaveLength(60)
    expect(detail.members.some((member) => member.id === userId("member-disabled"))).toBe(false)
    expect(detail.priorities.map((priority) => priority.priority)).toEqual([0, 3])
  })
})

describe("team show", () => {
  test("uses the linked team and prints the complete read model", async () => {
    const lines: string[] = []
    await runRootMemory(seed, ["team", "show", "--json"], lines, [
      { key: process.cwd(), team: "RAT" },
    ])

    const document = Option.getOrThrow(Schema.decodeUnknownOption(TeamDocument)(lastJson(lines)))
    expect(document.key).toBe("RAT")
    expect(document.states).toHaveLength(60)
    expect(document.labels).toHaveLength(61)
    expect(document.members).toHaveLength(60)
    expect(document.priorities).toHaveLength(2)
  })

  test("fails with not_linked without a reference or a link", async () => {
    const lines: string[] = []
    await runRootMemory(seed, ["team", "show", "--json"], lines, [])

    const error = Option.getOrThrow(Schema.decodeUnknownOption(ErrorEnvelope)(lastJson(lines)))
    expect(error.error.code).toBe("not_linked")
    expect(process.exitCode).toBe(2)
  })
})
