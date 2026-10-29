import { Effect } from "effect"
import { Argument, Command } from "effect/cli"

import { IssueApi } from "@/api/issue"
import { OutputFields, readFields, selectObject } from "@/cli/fields"
import { formatIssueStatus } from "@/cli/issue/format"
import { JsonOutput, reportFailure, writeJson, writeLine } from "@/cli/output"

const refArgument = Argument.String("ref").pipe(
  Argument.withDescription("Issue reference: an identifier, a UUID, or a linear.app URL"),
)

const statusCommand = Command.make("status", { ref: refArgument }, (config) =>
  Effect.gen(function* issueStatus() {
    const json = yield* JsonOutput
    const fields = yield* readFields(json, yield* OutputFields)
    const api = yield* IssueApi
    const result = yield* api.status(config.ref)
    return json
      ? yield* writeJson(yield* selectObject(fields, result))
      : yield* writeLine(formatIssueStatus(result))
  }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Show one issue with its blockers, pull requests and next child"),
  Command.withExamples([
    {
      command: "rata issue status RAT-42",
      description: "Read the state, the blockers, the pull requests and the next child",
    },
    {
      command: "rata issue status RAT-42 --json",
      description: "Read the same object as JSON",
    },
    {
      command: "rata issue status RAT-42 --json --fields issue.identifier,blocked,prs",
      description: "Select fields from the JSON object",
    },
  ]),
)

export { statusCommand }
