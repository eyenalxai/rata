import { Effect, Schema } from "effect"

import type { LinearClientShape } from "@/linear/client"
import type { ApplyPlanError } from "@/tracker/apply/model"
import type { IssueWorkingSetFull } from "@/tracker/model"
import type { PlanStep } from "@/tracker/plan"

import { TrackerError } from "@/domain/error"
import { toTrackerError } from "@/domain/error/report"
import { attachGitHubPrMutation } from "@/tracker/write/documents"

const AttachPrResponse = Schema.Struct({
  attachmentLinkGitHubPR: Schema.Struct({
    success: Schema.Boolean,
    attachment: Schema.NullOr(Schema.Struct({ id: Schema.String })),
  }),
})

type PrDependencies = {
  readonly client: LinearClientShape
}

const planPrStep = (
  dependencies: PrDependencies,
  ref: string,
  snapshot: IssueWorkingSetFull,
  url: string,
): Effect.Effect<PlanStep, ApplyPlanError> => {
  const trimmed = url.trim()
  if (trimmed.length === 0) {
    return Effect.fail(
      new TrackerError({
        code: "validation",
        message: "The handoff PR URL is empty.",
        hint: "Pass a GitHub pull request URL in the pr field.",
      }),
    )
  }
  const exists = snapshot.prs.some((pr) => pr.url === trimmed)
  const status = exists ? "skipped" : "updated"
  return Effect.succeed({
    action: "pr-attach",
    target: ref,
    status,
    changes: { url: trimmed },
    changed: status === "updated" ? [`pr:${trimmed}`] : [],
    actions: [
      {
        action: "pr-attach",
        target: ref,
        status,
        changes: { url: trimmed },
      },
    ],
    execute:
      status === "skipped"
        ? Effect.void
        : dependencies.client
            .execute(
              attachGitHubPrMutation,
              { issueId: snapshot.id, url: trimmed },
              AttachPrResponse,
            )
            .pipe(
              Effect.flatMap((data) =>
                data.attachmentLinkGitHubPR.success
                  ? Effect.void
                  : Effect.fail(
                      new TrackerError({
                        code: "internal",
                        message: "Linear did not attach the pull request.",
                        hint: null,
                      }),
                    ),
              ),
              Effect.mapError(toTrackerError),
            ),
  })
}

export { planPrStep }
