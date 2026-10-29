import { Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/cli"

import type { MissionInitResult } from "@/api/mission/model"

import { MissionApi } from "@/api/mission"
import { OutputFields, rejectFields } from "@/cli/fields"
import { JsonOutput, dryRunFlag, reportFailure, writeJson, writeLine } from "@/cli/output"
import { missionPhases, missionScopes } from "@/domain/mission/state"

const optionalText = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional)

const writeResult = (json: boolean, result: MissionInitResult): Effect.Effect<void> => {
  if (json) {
    return writeJson(result)
  }
  if (result.dryRun) {
    return writeLine(result.diff.length === 0 ? "No changes." : result.diff)
  }
  if (result.status === "skipped") {
    return writeLine(`Skipped ${result.issue.identifier}: a mission block already exists.`)
  }
  return writeLine(`Initialized ${result.issue.identifier}.`)
}

const initCommand = Command.make(
  "init",
  {
    ref: Argument.String("ref").pipe(
      Argument.withDescription("Issue reference: an identifier, a UUID, or a linear.app URL"),
    ),
    scope: Flag.Literals("scope", missionScopes).pipe(
      Flag.withDescription("Mission scope"),
      Flag.optional,
    ),
    phase: Flag.Literals("phase", missionPhases).pipe(
      Flag.withDescription("Mission phase"),
      Flag.optional,
    ),
    gate: optionalText("gate", "Current gate: Scope and understanding, Spec, Tickets, or PR"),
    method: optionalText("method", "Method of the current gate"),
    session: Flag.Int("session").pipe(
      Flag.withDescription("Session number, 1 or more"),
      Flag.optional,
    ),
    goal: optionalText("goal", "Short statement of the destination"),
    exit: optionalText("exit", "Short statement of what ends the mission"),
    reset: Flag.Boolean("reset").pipe(
      Flag.withDescription("Rewrite an existing mission block"),
      Flag.withDefault(false),
    ),
    dryRun: dryRunFlag,
  },
  (config) =>
    Effect.gen(function* missionInit() {
      const json = yield* JsonOutput
      yield* rejectFields(yield* OutputFields)
      const api = yield* MissionApi
      const result = yield* api.init(config.ref, {
        scope: Option.getOrUndefined(config.scope),
        phase: Option.getOrUndefined(config.phase),
        gate: Option.getOrUndefined(config.gate),
        method: Option.getOrUndefined(config.method),
        session: Option.getOrUndefined(config.session),
        goal: Option.getOrUndefined(config.goal),
        exit: Option.getOrUndefined(config.exit),
        reset: config.reset,
        dryRun: config.dryRun,
      })
      return yield* writeResult(json, result)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Write the mission state block and the missing tables of an issue"),
  Command.withExamples([
    {
      command: 'rata mission init RAT-42 --goal "ship 0.9.0" --exit "the tickets merged"',
      description: "Create the mission block and the missing tables",
    },
    {
      command: "rata mission init RAT-42 --phase implement --gate PR --reset",
      description: "Rewrite an existing mission block at a later phase",
    },
    {
      command: "rata mission init RAT-42 --dry-run",
      description: "Preview the body change as a unified diff",
    },
  ]),
)

export { initCommand }
