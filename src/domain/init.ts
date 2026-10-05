import { Option } from "effect"

import type { RepoConfig } from "@/config/repo"

type InitAction = "create" | "overwrite" | "unchanged" | "skip"

type InitStep<A> = {
  readonly action: InitAction
  readonly content: A
}

type InitPlan = {
  readonly config: InitStep<RepoConfig>
  readonly trackerDocument: InitStep<string>
  readonly agents: InitStep<string>
}

type InitPlanInput = {
  readonly force: boolean
  readonly config: RepoConfig
  readonly existingConfig: Option.Option<RepoConfig>
  readonly trackerDocument: string
  readonly existingTrackerDocument: Option.Option<string>
  readonly agentsDocument: string
  readonly existingAgents: Option.Option<string>
}

const decideAction = (input: {
  readonly force: boolean
  readonly exists: boolean
  readonly unchanged: boolean
}): InitAction => {
  if (!input.exists) {
    return "create"
  }
  if (input.unchanged) {
    return "unchanged"
  }
  return input.force ? "overwrite" : "skip"
}

const sameConfig = (left: RepoConfig, right: RepoConfig): boolean =>
  left.team === right.team && left.project === right.project

const planInit = (input: InitPlanInput): InitPlan => ({
  config: {
    action: decideAction({
      force: input.force,
      exists: Option.isSome(input.existingConfig),
      unchanged: Option.exists(input.existingConfig, (existing) =>
        sameConfig(existing, input.config),
      ),
    }),
    content: input.config,
  },
  trackerDocument: {
    action: decideAction({
      force: input.force,
      exists: Option.isSome(input.existingTrackerDocument),
      unchanged: Option.exists(
        input.existingTrackerDocument,
        (existing) => existing === input.trackerDocument,
      ),
    }),
    content: input.trackerDocument,
  },
  agents: {
    action: decideAction({
      force: input.force,
      exists: Option.isSome(input.existingAgents),
      unchanged: Option.exists(
        input.existingAgents,
        (existing) => existing === input.agentsDocument,
      ),
    }),
    content: input.agentsDocument,
  },
})

export { planInit, type InitAction, type InitPlan, type InitPlanInput, type InitStep }
