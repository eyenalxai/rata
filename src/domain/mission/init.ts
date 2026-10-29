import { Result } from "effect"

import type {
  MissionGateRecord,
  MissionPhase,
  MissionScope,
  MissionSection,
  MissionState,
} from "@/domain/mission/state"
import type { ParsedTable } from "@/domain/mission/table"

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

const mapSectionError = (error: { readonly _tag: string }): MissionStateError =>
  error._tag === "SectionAmbiguousError"
    ? new MissionStateError({ message: "A mission section heading appears more than once." })
    : new MissionStateError({ message: "The mission section could not be read." })

const optionalSection = (body: string, heading: string) => {
  const section = readSection(body, heading)
  if (Result.isFailure(section) && section.failure._tag === "SectionNotFoundError") {
    return Result.succeed(null)
  }
  return Result.map(section, (found) => found)
}

const isGateName = (name: string): name is (typeof gateNames)[number] =>
  gateNames.some((candidate) => candidate === name)

const inspectMissionBody = (body: string): Result.Result<MissionInspection, MissionStateError> => {
  const mission = optionalSection(body, "Mission")
  if (Result.isFailure(mission)) {
    return Result.fail(mapSectionError(mission.failure))
  }
  const parsedMission =
    mission.success === null
      ? Result.succeed<"missing" | MissionSection>("missing")
      : readMissionSection(mission.success.content)
  if (Result.isFailure(parsedMission)) {
    return Result.fail(parsedMission.failure)
  }
  const sessionPlan = optionalSection(body, sessionPlanTable.heading)
  if (Result.isFailure(sessionPlan)) {
    return Result.fail(mapSectionError(sessionPlan.failure))
  }
  const references = optionalSection(body, referencesTable.heading)
  if (Result.isFailure(references)) {
    return Result.fail(mapSectionError(references.failure))
  }
  const parsedSessionPlan =
    sessionPlan.success === null
      ? Result.succeed<ParsedTable | null>(null)
      : parseTable(sessionPlan.success.content, sessionPlanTable)
  if (Result.isFailure(parsedSessionPlan)) {
    return Result.fail(parsedSessionPlan.failure)
  }
  const parsedReferences =
    references.success === null
      ? Result.succeed<ParsedTable | null>(null)
      : parseTable(references.success.content, referencesTable)
  if (Result.isFailure(parsedReferences)) {
    return Result.fail(parsedReferences.failure)
  }
  return Result.succeed({
    mission: parsedMission.success,
    sessionPlan: parsedSessionPlan.success,
    references: parsedReferences.success,
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

const defaultGates = (gateName: string, method: string): readonly MissionGateRecord[] =>
  gateNames.map((name) => ({
    name,
    status: "pending",
    method: name === gateName ? method : gateMethods[name],
  }))

const mergeGates = (
  base: MissionState,
  gateName: string,
  method: string | undefined,
): readonly MissionGateRecord[] =>
  base.gates.map((gate) =>
    gate.name === gateName && method !== undefined ? { ...gate, method } : gate,
  )

const pick = <A>(input: A | undefined, base: A | undefined, fallback: A): A =>
  input ?? base ?? fallback

const resolveMethod = (
  input: MissionInitInput,
  base: MissionState | undefined,
  gateName: string,
): string => {
  if (input.method !== undefined) {
    return input.method
  }
  const record = base?.gates.find((gate) => gate.name === gateName)
  if (record !== undefined) {
    return record.method
  }
  return isGateName(gateName) ? gateMethods[gateName] : "grill"
}

const resolveGateStatus = (
  base: MissionState | undefined,
  gateName: string,
): MissionGateRecord["status"] =>
  base?.gates.find((gate) => gate.name === gateName)?.status ?? "pending"

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
): readonly MissionGateRecord[] =>
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
    return Result.fail(new MissionStateError({ message: "The --session flag must be at least 1." }))
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
): Result.Result<string, MissionStateError> => {
  const content = encodeMissionSection(state)
  const withMission =
    inspection.mission === "missing"
      ? appendSection(body, "Mission", content, 2)
      : replaceSection(body, "Mission", content)
  if (Result.isFailure(withMission)) {
    return Result.fail(mapSectionError(withMission.failure))
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
    return Result.fail(mapSectionError(withSessionPlan.failure))
  }
  const withReferences =
    inspection.references === null
      ? appendSection(
          withSessionPlan.success,
          referencesTable.heading,
          tableSection({ columns: referencesTable.columns, rows: [] }),
          2,
        )
      : Result.succeed<string>(withSessionPlan.success)
  return Result.isFailure(withReferences)
    ? Result.fail(mapSectionError(withReferences.failure))
    : Result.succeed(withReferences.success)
}

export {
  initState,
  inspectMissionBody,
  type MissionInitInput,
  type MissionInspection,
  planMissionBody,
}
