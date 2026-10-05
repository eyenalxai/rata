import { Option } from "effect"

import type { RepoConfig } from "@/config/repo"

type InitAction = "create" | "overwrite" | "unchanged" | "skip"

type InitStep<A> = {
  readonly action: InitAction
  readonly content: A
}

type InitDocument = {
  readonly path: string
  readonly content: string
  readonly existing: Option.Option<string>
}

type InitDocumentStep = {
  readonly path: string
  readonly action: InitAction
  readonly content: string
}

type InitPlan = {
  readonly config: InitStep<RepoConfig>
  readonly documents: readonly InitDocumentStep[]
  readonly agents: InitStep<string>
}

type InitPlanInput = {
  readonly force: boolean
  readonly config: RepoConfig
  readonly existingConfig: Option.Option<RepoConfig>
  readonly documents: readonly InitDocument[]
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

const planDocument = (force: boolean, document: InitDocument): InitDocumentStep => ({
  path: document.path,
  action: decideAction({
    force,
    exists: Option.isSome(document.existing),
    unchanged: Option.exists(document.existing, (existing) => existing === document.content),
  }),
  content: document.content,
})

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
  documents: input.documents.map((document) => planDocument(input.force, document)),
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

export {
  planInit,
  type InitAction,
  type InitDocument,
  type InitDocumentStep,
  type InitPlan,
  type InitPlanInput,
  type InitStep,
}
