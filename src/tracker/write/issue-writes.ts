import { Effect } from "effect"

import type { ResolvedContext } from "@/context/model"
import type { WriteAction, WriteOptions } from "@/tracker/write/model"
import type { makeIssueWriteResolvers } from "@/tracker/write/resolvers"

import { combineStatus } from "@/tracker/write/model"

type WriteResolvers = ReturnType<typeof makeIssueWriteResolvers>

const makeIssueWrites = (resolvers: WriteResolvers) => {
  const close = Effect.fn("IssueWriter.close")(function* close(
    context: ResolvedContext,
    ref: string,
    body?: string,
    options: WriteOptions = {},
  ) {
    const summary = yield* resolvers.readIssueSummary(ref)
    const commented = body !== undefined
    const alreadyCompleted = summary.state.type === "completed"
    const actions: readonly WriteAction[] = [
      {
        action: "close",
        target: ref,
        status: alreadyCompleted ? "skipped" : "updated",
        changes: { state: "completed" },
      },
      ...(commented
        ? [
            {
              action: "comment-create" as const,
              target: ref,
              status: alreadyCompleted ? ("skipped" as const) : ("updated" as const),
              changes: { body },
            },
          ]
        : []),
    ]
    const status = combineStatus(actions)
    if (options.dryRun === true || alreadyCompleted) {
      return { status, issue: summary, actions }
    }
    if (commented) {
      yield* resolvers.postComment(summary.id, body)
    }
    const issue = yield* resolvers.setStateByType(context, summary.id, "completed")
    return { status, issue, actions }
  })

  return { close }
}

export { makeIssueWrites }
