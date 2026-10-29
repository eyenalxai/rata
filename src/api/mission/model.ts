import type { MissionInitInput } from "@/domain/mission/init"
import type { MissionState } from "@/domain/mission/state"

type MissionInitOptions = MissionInitInput & {
  readonly dryRun?: boolean | undefined
  readonly reset?: boolean | undefined
}

type MissionInitIssue = {
  readonly identifier: string
  readonly updatedAt: string
}

type MissionInitResult =
  | {
      readonly dryRun: true
      readonly action: "mission-init"
      readonly status: "created" | "skipped"
      readonly target: string
      readonly diff: string
      readonly state: MissionState
    }
  | {
      readonly dryRun: false
      readonly action: "mission-init"
      readonly status: "created" | "skipped"
      readonly issue: MissionInitIssue
      readonly state: MissionState
    }

export { type MissionInitIssue, type MissionInitOptions, type MissionInitResult }
