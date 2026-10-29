import { Effect } from "effect"
import { Argument, Command } from "effect/cli"

import { IssueApi } from "@/api/issue"
import { isBlocked, toBlockers } from "@/api/issue-model"
import { OutputFields, rejectFields } from "@/cli/fields"
import { JsonOutput, reportFailure, writeJson, writeLine } from "@/cli/output"

const refArgument = Argument.String("ref").pipe(
  Argument.withDescription("Issue reference: an identifier, a UUID, or a linear.app URL"),
)

const whyCommand = Command.make("why", { ref: refArgument }, (config) =>
  Effect.gen(function* why() {
    const json = yield* JsonOutput
    yield* rejectFields(yield* OutputFields)
    const api = yield* IssueApi
    const issue = yield* api.show(config.ref, { comments: false })
    const blockedBy = toBlockers(issue.relations)
    const blocked = isBlocked(blockedBy)
    if (json) {
      return yield* writeJson({
        issue: { identifier: issue.identifier, title: issue.title },
        blocked,
        blockedBy,
      })
    }
    if (!blocked) {
      return yield* writeLine(`${issue.identifier} is ready.`)
    }
    yield* writeLine(`${issue.identifier} is blocked by:`)
    return yield* Effect.forEach(
      blockedBy,
      (blocker) => writeLine(`  ${blocker.identifier}  [${blocker.state.name}]  ${blocker.title}`),
      { discard: true },
    )
  }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Show one level of the blocking graph of an issue"),
  Command.withExamples([
    {
      command: "rata why RAT-42",
      description: "Show the blockers of one issue",
    },
    {
      command: "rata why RAT-42 --json",
      description: "Read the blockers, their states and the blocked flag as JSON",
    },
  ]),
)

export { whyCommand }
