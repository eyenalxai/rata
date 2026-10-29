import { Context, Effect, Layer } from "effect"

import type { IssueWriteApiError } from "@/api/issue-write/model"
import type { MissionInitOptions, MissionInitResult } from "@/api/mission/model"
import type { MissionStateError } from "@/domain/mission/state"

import { LinearClient } from "@/api/client"
import { IssueWriteApi } from "@/api/issue-write"
import { IssueBodyResponse, issueBodyQuery } from "@/api/issue-write/body/query"
import { unifiedDiff } from "@/domain/body/diff"
import { initState, inspectMissionBody, planMissionBody } from "@/domain/mission/init"
import { parseRefOrFail } from "@/domain/ref"

type MissionApiShape = {
  readonly init: (
    ref: string,
    options: MissionInitOptions,
  ) => Effect.Effect<MissionInitResult, IssueWriteApiError | MissionStateError>
}

class MissionApi extends Context.Service<MissionApi, MissionApiShape>()(
  "rata-cli/api/mission/MissionApi",
) {
  static readonly layer = Layer.effect(
    MissionApi,
    Effect.gen(function* missionApiLayer() {
      const client = yield* LinearClient
      const writes = yield* IssueWriteApi

      const readIssueBody = Effect.fn("MissionApi.readIssueBody")(function* readIssueBody(
        input: string,
      ) {
        const ref = yield* parseRefOrFail(input)
        const data = yield* client.execute(issueBodyQuery, { id: ref }, IssueBodyResponse)
        return data.issue
      })

      const init = Effect.fn("MissionApi.init")(function* init(
        ref: string,
        options: MissionInitOptions,
      ): Effect.fn.Return<MissionInitResult, IssueWriteApiError | MissionStateError> {
        const issue = yield* readIssueBody(ref)
        const body = issue.description ?? ""
        const inspection = yield* Effect.fromResult(inspectMissionBody(body))
        const existing =
          inspection.mission !== "missing" && inspection.mission._tag === "state"
            ? inspection.mission.state
            : undefined
        if (existing !== undefined && options.reset !== true) {
          return options.dryRun === true
            ? {
                dryRun: true,
                action: "mission-init",
                status: "skipped",
                target: issue.identifier,
                diff: "",
                state: existing,
              }
            : {
                dryRun: false,
                action: "mission-init",
                status: "skipped",
                issue: { identifier: issue.identifier, updatedAt: issue.updatedAt },
                state: existing,
              }
        }
        const state = yield* Effect.fromResult(initState(existing, options))
        const next = yield* Effect.fromResult(planMissionBody(body, inspection, state))
        if (options.dryRun === true) {
          return {
            dryRun: true,
            action: "mission-init",
            status: "created",
            target: issue.identifier,
            diff: unifiedDiff(body, next),
            state,
          }
        }
        if (next === body) {
          return {
            dryRun: false,
            action: "mission-init",
            status: "skipped",
            issue: { identifier: issue.identifier, updatedAt: issue.updatedAt },
            state,
          }
        }
        const written = yield* writes.update(ref, { body: next }, { ifUnchanged: issue.updatedAt })
        return {
          dryRun: false,
          action: "mission-init",
          status: "created",
          issue: { identifier: written.identifier, updatedAt: written.updatedAt },
          state,
        }
      })

      return MissionApi.of({ init })
    }),
  )
}

export { MissionApi }
