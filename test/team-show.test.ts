import type {
  FakeLabel,
  FakeTeam,
  FakeTeamMember,
  FakeTeamState,
  Handler,
} from "@test/fake-linear/model"

import { cliLayer, lastJson } from "@test/cli-harness"
import { apiLayer, makeFakeLinear } from "@test/fake-linear"
import { defaultEnv } from "@test/fake-linear/model"
import { afterEach, describe, expect, test } from "bun:test"
import { Effect, Option, Schema } from "effect"
import { Command } from "effect/cli"

import { TeamService } from "@/api/team"
import { teamCommand } from "@/cli/team"

const states: readonly FakeTeamState[] = Array.from({ length: 60 }, (_, index) => ({
  id: `state-${index}`,
  name: `State ${index}`,
  type: index % 2 === 0 ? "unstarted" : "started",
  position: 100 - index,
}))

const members: readonly FakeTeamMember[] = [
  ...Array.from({ length: 60 }, (_, index) => ({
    id: `member-${index}`,
    name: `Member ${index}`,
    displayName: `member${index}`,
    email: `member${index}@example.com`,
    active: true,
  })),
  {
    id: "member-disabled",
    name: "Disabled",
    displayName: "disabled",
    email: "disabled@example.com",
    active: false,
  },
]

const team: FakeTeam = {
  id: "team-1",
  key: "RAT",
  name: "Rata",
  timezone: "America/Los_Angeles",
  states,
  members,
}

const labels: readonly FakeLabel[] = [
  ...Array.from({ length: 60 }, (_, index) => ({
    id: `label-${index}`,
    name: `Label ${index}`,
    color: "#5E6AD2",
    teamId: "team-1",
  })),
  { id: "label-workspace", name: "Workspace", color: "#EB5757", teamId: null },
]

const priorities = [
  { priority: 3, label: "Medium" },
  { priority: 0, label: "No priority" },
]

const seed = { teams: [team], labels, priorities }

const TeamDocument = Schema.Struct({
  team: Schema.Struct({
    key: Schema.String,
    states: Schema.Array(Schema.Unknown),
    labels: Schema.Array(Schema.Unknown),
    members: Schema.Array(Schema.Unknown),
    priorities: Schema.Array(Schema.Unknown),
  }),
})

const ErrorEnvelope = Schema.Struct({
  error: Schema.Struct({ code: Schema.String }),
})

const showTeam = (handler: Handler, ref: string) =>
  Effect.gen(function* show() {
    const teams = yield* TeamService
    return yield* teams.details(ref)
  }).pipe(Effect.provide(apiLayer(handler, { env: defaultEnv })), Effect.runPromise)

const runShow = (handler: Handler, args: readonly string[], lines: string[], linked: boolean) =>
  Command.run(teamCommand, { version: "test" }).pipe(
    Effect.provide(
      cliLayer(handler, args, lines, linked ? [{ key: process.cwd(), team: "RAT" }] : []),
    ),
    Effect.runPromise,
  )

afterEach(() => {
  process.exitCode = 0
})

describe("TeamService.details", () => {
  test("drains every page of states, labels and members", async () => {
    const fake = makeFakeLinear(seed)
    const detail = await showTeam(fake.handler, "RAT")

    expect(detail.states).toHaveLength(60)
    expect(detail.states[0]?.position).toBe(41)
    expect(detail.states.at(-1)?.position).toBe(100)
    expect(detail.labels).toHaveLength(61)
    expect(detail.labels.find((label) => label.id === "label-workspace")?.scope).toBe("workspace")
    expect(detail.labels.find((label) => label.id === "label-0")?.scope).toBe("team")
    expect(detail.members).toHaveLength(60)
    expect(detail.members.some((member) => member.id === "member-disabled")).toBe(false)
    expect(detail.priorities.map((priority) => priority.priority)).toEqual([0, 3])
  })
})

describe("team show", () => {
  test("uses the linked team and prints the complete read model", async () => {
    const fake = makeFakeLinear(seed)
    const lines: string[] = []
    await runShow(fake.handler, ["show", "--json"], lines, true)

    const document = Option.getOrThrow(Schema.decodeUnknownOption(TeamDocument)(lastJson(lines)))
    expect(document.team.key).toBe("RAT")
    expect(document.team.states).toHaveLength(60)
    expect(document.team.labels).toHaveLength(61)
    expect(document.team.members).toHaveLength(60)
    expect(document.team.priorities).toHaveLength(2)
  })

  test("fails with not_linked without a reference or a link", async () => {
    const fake = makeFakeLinear(seed)
    const lines: string[] = []
    await runShow(fake.handler, ["show", "--json"], lines, false)

    const error = Option.getOrThrow(Schema.decodeUnknownOption(ErrorEnvelope)(lastJson(lines)))
    expect(error.error.code).toBe("not_linked")
    expect(process.exitCode).toBe(1)
  })
})
