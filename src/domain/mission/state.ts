import { Result, Schema } from "effect"

import { normalizeLineEndings } from "@/domain/body/text"

const missionScopes = ["fog", "feature", "change", "bug", "trivial"] as const
const MissionScope = Schema.Literals(missionScopes)
type MissionScope = typeof MissionScope.Type

const missionPhases = ["classify", "grill", "spec", "tickets", "implement", "done"] as const
const MissionPhase = Schema.Literals(missionPhases)
type MissionPhase = typeof MissionPhase.Type

const gateStatuses = ["pending", "approved", "rejected"] as const
const GateStatus = Schema.Literals(gateStatuses)
type GateStatus = typeof GateStatus.Type

const gateNames = ["Scope and understanding", "Spec", "Tickets", "PR"] as const
type GateName = (typeof gateNames)[number]

const gateMethods: Readonly<Record<GateName, string>> = {
  "Scope and understanding": "grill",
  Spec: "owner review",
  Tickets: "owner review",
  PR: "code-review",
}

const MissionGate = Schema.Struct({
  name: Schema.String,
  status: GateStatus,
  method: Schema.String,
})
type MissionGate = typeof MissionGate.Type

const MissionGateRecord = Schema.Struct({
  name: Schema.String,
  status: GateStatus,
  method: Schema.String,
  evidence: Schema.optionalKey(Schema.String),
  approvedAt: Schema.optionalKey(Schema.String),
  reason: Schema.optionalKey(Schema.String),
})
type MissionGateRecord = typeof MissionGateRecord.Type

const MissionNext = Schema.Struct({
  skill: Schema.String,
  gate: Schema.String,
  command: Schema.String,
  produce: Schema.String,
})
type MissionNext = typeof MissionNext.Type

const MissionState = Schema.Struct({
  schema: Schema.Literal(1),
  status: Schema.String,
  scope: MissionScope,
  phase: MissionPhase,
  gate: MissionGate,
  goal: Schema.String,
  exit: Schema.String,
  session: Schema.Int,
  next: MissionNext,
  gates: Schema.Array(MissionGateRecord),
})
type MissionState = typeof MissionState.Type

class MissionStateError extends Schema.TaggedError<MissionStateError>()("MissionStateError", {
  message: Schema.String,
}) {}

const decodeMissionState = (text: string): Result.Result<MissionState, MissionStateError> => {
  const decoded = Schema.decodeResult(Schema.fromJsonString(MissionState), {
    onExcessProperty: "error",
  })(text)
  return Result.mapError(
    decoded,
    (error) =>
      new MissionStateError({
        message: `The mission block is malformed: ${error.message}`,
      }),
  )
}

const encodeMissionState = (state: MissionState): string => JSON.stringify(state, null, 2)

type Fence = {
  readonly marker: "`" | "~"
  readonly length: number
  readonly info: string
}

const fenceLine = (line: string): Fence | undefined => {
  const match = /^ {0,3}(?<marker>`{3,}|~{3,})(?<info>.*)$/u.exec(line)
  const marker = match?.groups?.marker
  if (marker === undefined) {
    return undefined
  }
  return {
    marker: marker.startsWith("`") ? "`" : "~",
    length: marker.length,
    info: (match?.groups?.info ?? "").trim(),
  }
}

const closesFence = (line: string, fence: Fence): boolean => {
  const marker = /^ {0,3}(?<marker>`{3,}|~{3,})[ \t]*$/u.exec(line)?.groups?.marker
  return marker !== undefined && marker.startsWith(fence.marker) && marker.length >= fence.length
}

const jsonBlocks = (content: string): Result.Result<readonly string[], MissionStateError> => {
  const blocks: string[] = []
  let open: Fence | undefined = undefined
  let buffer: string[] = []
  for (const line of normalizeLineEndings(content).split("\n")) {
    if (open === undefined) {
      const fence = fenceLine(line)
      if (fence !== undefined) {
        open = fence
        buffer = []
      }
      continue
    }
    if (closesFence(line, open)) {
      if (open.info === "json") {
        blocks.push(buffer.join("\n"))
      }
      open = undefined
      buffer = []
      continue
    }
    buffer.push(line)
  }
  if (open !== undefined) {
    return Result.fail(
      new MissionStateError({ message: "The ## Mission section has an unclosed code fence." }),
    )
  }
  return Result.succeed(blocks)
}

type MissionSection =
  | { readonly _tag: "legacy" }
  | { readonly _tag: "state"; readonly state: MissionState }

const readMissionSection = (content: string): Result.Result<MissionSection, MissionStateError> => {
  const blocks = jsonBlocks(content)
  if (Result.isFailure(blocks)) {
    return Result.fail(blocks.failure)
  }
  const [block, ...rest] = blocks.success
  if (block === undefined) {
    return Result.succeed({ _tag: "legacy" })
  }
  if (rest.length > 0) {
    return Result.fail(
      new MissionStateError({
        message: "The ## Mission section has more than one json block.",
      }),
    )
  }
  return Result.map(decodeMissionState(block), (state) => ({ _tag: "state", state }))
}

const gateSummary = (state: MissionState): string =>
  `Gate: ${state.gate.name}, ${state.gate.status}`

const summaryLines = (state: MissionState): readonly string[] => [
  `Status: ${state.status}`,
  `Scope: ${state.scope}`,
  `Phase: ${state.phase}`,
  gateSummary(state),
  `Method: ${state.gate.method}`,
  `Session: ${state.session}`,
  `Goal: ${state.goal}`,
  `Exit: ${state.exit}`,
]

const encodeMissionSection = (state: MissionState): string =>
  [...summaryLines(state), "", "```json", encodeMissionState(state), "```"].join("\n")

export {
  decodeMissionState,
  encodeMissionSection,
  encodeMissionState,
  gateMethods,
  gateNames,
  type GateName,
  GateStatus,
  gateStatuses,
  MissionGate,
  MissionGateRecord,
  MissionNext,
  MissionPhase,
  missionPhases,
  MissionScope,
  missionScopes,
  MissionState,
  MissionStateError,
  readMissionSection,
  type MissionSection,
}
