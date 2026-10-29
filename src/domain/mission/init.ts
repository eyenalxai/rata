import { Result } from "effect"

import type { SectionLookupError } from "@/domain/body/section/model"
import type {
  MissionGate,
  MissionPhase,
  MissionScope,
  MissionSection,
  MissionState,
} from "@/domain/mission/state"
import type { ParsedTable, TableSpec } from "@/domain/mission/table"

import { readSection } from "@/domain/body/section"
import { appendSection, replaceSection } from "@/domain/body/section/edit"
import {
  encodeMissionSection,
  gateMethods,
  gateNames,
  MissionStateError,
  readMissionSection,
} from "@/domain/mission/state"
import { parseTable, referencesTable, sessionPlanTable, tableSection } from "@/domain/mission/table"

type MissionInspection = {
  readonly mission: "missing" | MissionSection
  readonly sessionPlan: ParsedTable | null
  readonly references: ParsedTable | null
}

type MissionInitInput = {
  readonly scope?: MissionScope | undefined
  readonly phase?: MissionPhase | undefined
  readonly gate?: string | undefined
  readonly method?: string | undefined
  readonly session?: number | undefined
  readonly goal?: string | undefined
  readonly exit?: string | undefined
}

const optionalSection = (body: string, heading: string) => {
  const section = readSection(body, heading)
  if (Result.isFailure(section) && section.failure._tag === "SectionNotFoundError") {
    return Result.succeed(null)
  }
  return section
}

const readTable = (
  body: string,
  spec: TableSpec,
): Result.Result<ParsedTable | null, MissionStateError | SectionLookupError> => {
  const section = optionalSection(body, spec.heading)
  if (Result.isFailure(section)) {
    return Result.fail(section.failure)
  }
  return section.success === null ? Result.succeed(null) : parseTable(section.success.content, spec)
}

const isGateName = (name: string): name is (typeof gateNames)[number] =>
  gateNames.some((candidate) => candidate === name)

const inspectMissionBody = (
  body: string,
): Result.Result<MissionInspection, MissionStateError | SectionLookupError> => {
  const mission = optionalSection(body, "Mission")
  if (Result.isFailure(mission)) {
    return Result.fail(mission.failure)
  }
  const parsedMission =
    mission.success === null
      ? Result.succeed<"missing" | MissionSection>("missing")
      : readMissionSection(mission.success.content)
  if (Result.isFailure(parsedMission)) {
    return Result.fail(parsedMission.failure)
  }
  const sessionPlan = readTable(body, sessionPlanTable)
  if (Result.isFailure(sessionPlan)) {
    return Result.fail(sessionPlan.failure)
  }
  const references = readTable(body, referencesTable)
  if (Result.isFailure(references)) {
    return Result.fail(references.failure)
  }
  return Result.succeed({
    mission: parsedMission.success,
    sessionPlan: sessionPlan.success,
    references: references.success,
  })
}

const nextForPhase = (
  phase: MissionPhase,
  gate: string,
): {
  readonly skill: string
  readonly gate: string
  readonly command: string
  readonly produce: string
} => {
  const steps = {
    classify: {
      skill: "router",
      command: "classify the request with router",
      produce: "the scope and the flow",
    },
    grill: {
      skill: "grilling",
      command: "grill the request",
      produce: "shared understanding",
    },
    spec: {
      skill: "to-spec",
      command: "write the spec",
      produce: "the spec",
    },
    tickets: {
      skill: "to-tickets",
      command: "cut the tickets",
      produce: "the ticket graph",
    },
    implement: {
      skill: "implement",
      command: "implement the next ready ticket",
      produce: "one pull request",
    },
    done: {
      skill: "",
      command: "close the mission",
      produce: "merged pull requests",
    },
  } as const
  const step = steps[phase]
  return { skill: step.skill, gate, command: step.command, produce: step.produce }
}

const defaultGates = (gateName: string, method: string): readonly MissionGate[] =>
  gateNames.map((name) => ({
    name,
    status: "pending",
    method: name === gateName ? method : gateMethods[name],
  }))

const mergeGates = (
  base: MissionState,
  gateName: string,
  method: string | undefined,
): readonly MissionGate[] =>
  base.gates.map((gate) =>
    gate.name === gateName && method !== undefined ? { ...gate, method } : gate,
  )

const pick = <A>(input: A | undefined, base: A | undefined, fallback: A): A =>
  input ?? base ?? fallback

const gateRecord = (state: MissionState | undefined, name: string): MissionGate | undefined =>
  state?.gates.find((gate) => gate.name === name)

const resolveMethod = (
  input: MissionInitInput,
  base: MissionState | undefined,
  gateName: string,
): string => {
  if (input.method !== undefined) {
    return input.method
  }
  const record = gateRecord(base, gateName)
  if (record !== undefined) {
    return record.method
  }
  return isGateName(gateName) ? gateMethods[gateName] : "grill"
}

const resolveGateStatus = (
  base: MissionState | undefined,
  gateName: string,
): MissionGate["status"] => gateRecord(base, gateName)?.status ?? "pending"

const resolveNext = (
  input: MissionInitInput,
  base: MissionState | undefined,
  phase: MissionPhase,
  gateName: string,
): MissionState["next"] =>
  input.phase === undefined && base !== undefined
    ? { ...base.next, gate: gateName }
    : nextForPhase(phase, gateName)

const resolveGates = (
  input: MissionInitInput,
  base: MissionState | undefined,
  gateName: string,
  method: string,
): readonly MissionGate[] =>
  base === undefined ? defaultGates(gateName, method) : mergeGates(base, gateName, input.method)

const initState = (
  base: MissionState | undefined,
  input: MissionInitInput,
): Result.Result<MissionState, MissionStateError> => {
  const gateName = pick(input.gate, base?.gate.name, gateNames[0])
  if (!isGateName(gateName)) {
    return Result.fail(
      new MissionStateError({
        message: `Unknown gate "${gateName}". Use one of: ${gateNames.join(", ")}.`,
      }),
    )
  }
  const session = pick(input.session, base?.session, 1)
  if (session < 1) {
    return Result.fail(
      new MissionStateError({ message: "The mission session must be at least 1." }),
    )
  }
  const phase = pick(input.phase, base?.phase, "classify")
  const method = resolveMethod(input, base, gateName)
  return Result.succeed({
    schema: 1,
    status: pick(base?.status, undefined, "active"),
    scope: pick(input.scope, base?.scope, "feature"),
    phase,
    gate: { name: gateName, status: resolveGateStatus(base, gateName), method },
    goal: pick(input.goal, base?.goal, ""),
    exit: pick(input.exit, base?.exit, ""),
    session,
    next: resolveNext(input, base, phase, gateName),
    gates: resolveGates(input, base, gateName, method),
  })
}

const planMissionBody = (
  body: string,
  inspection: MissionInspection,
  state: MissionState,
): Result.Result<string, SectionLookupError> => {
  const content = encodeMissionSection(state)
  const withMission =
    inspection.mission === "missing"
      ? appendSection(body, "Mission", content, 2)
      : replaceSection(body, "Mission", content)
  if (Result.isFailure(withMission)) {
    return withMission
  }
  const withSessionPlan =
    inspection.sessionPlan === null
      ? appendSection(
          withMission.success,
          sessionPlanTable.heading,
          tableSection({ columns: sessionPlanTable.columns, rows: [] }),
          2,
        )
      : Result.succeed<string>(withMission.success)
  if (Result.isFailure(withSessionPlan)) {
    return withSessionPlan
  }
  return inspection.references === null
    ? appendSection(
        withSessionPlan.success,
        referencesTable.heading,
        tableSection({ columns: referencesTable.columns, rows: [] }),
        2,
      )
    : Result.succeed(withSessionPlan.success)
}

export {
  initState,
  inspectMissionBody,
  type MissionInitInput,
  type MissionInspection,
  planMissionBody,
}
