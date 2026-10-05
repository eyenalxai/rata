import type { Option } from "effect"

import type { LabelEnsureResult } from "@/api/label"
import type { Team } from "@/api/team"
import type { LinkTargetOptions, TimezoneChange } from "@/config/link-team"
import type { InitAction } from "@/domain/init"

type InitOptions = {
  readonly team: Option.Option<string>
  readonly project: Option.Option<string>
  readonly force: boolean
  readonly print: boolean
  readonly ensureLabels: boolean
}

type InitFileReport = {
  readonly path: string
  readonly action: InitAction
}

type InitResult = {
  readonly document: Option.Option<string>
  readonly team: Option.Option<string>
  readonly files: readonly InitFileReport[]
  readonly labels: Option.Option<LabelEnsureResult>
}

type LinkOptions = LinkTargetOptions & {
  readonly project: Option.Option<string>
  readonly workspace: Option.Option<string>
  readonly force: boolean
}

type LinkResult = {
  readonly team: Team
  readonly project: Option.Option<string>
  readonly workspace: Option.Option<string>
  readonly timezone: Option.Option<TimezoneChange>
  readonly files: readonly InitFileReport[]
  readonly labels: LabelEnsureResult
}

export { type InitFileReport, type InitOptions, type InitResult, type LinkOptions, type LinkResult }
