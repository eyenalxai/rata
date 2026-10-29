import { Effect, Option } from "effect"
import { Command, Flag } from "effect/cli"

import { IssueApi } from "@/api/issue"
import { OutputFields, rejectFields } from "@/cli/fields"
import { formatIssueLine } from "@/cli/issue/line"
import { JsonOutput, errorLine, reportFailure, writeJson, writeLine } from "@/cli/output"

const parentFlag = Flag.String("parent").pipe(
  Flag.withDescription("Parent issue reference"),
  Flag.optional,
)

const nextCommand = Command.make("next", { parent: parentFlag }, (config) =>
  Effect.gen(function* next() {
    const json = yield* JsonOutput
    yield* rejectFields(yield* OutputFields)
    const parent = Option.getOrUndefined(config.parent)
    if (parent === undefined || parent.trim().length === 0) {
      return yield* errorLine(
        "validation",
        "The --parent flag is required.",
        "Pass --parent <ref>.",
      )
    }
    const api = yield* IssueApi
    const page = yield* api.list({
      parent,
      unblocked: true,
      unassigned: true,
      sort: "priority",
      after: null,
      limit: 1,
    })
    const issue = page.issues[0] ?? null
    if (json) {
      return yield* writeJson({ issue })
    }
    return yield* writeLine(issue === null ? "No ready ticket." : formatIssueLine(issue))
  }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Show the next ready child of a parent issue"),
  Command.withExamples([
    {
      command: "rata next --parent RAT-1",
      description: "Show the most urgent open, unblocked, unassigned child",
    },
    {
      command: "rata next --parent RAT-1 --json",
      description: "Read the ready child as JSON, or null when none is ready",
    },
  ]),
)

export { nextCommand }
