import { Effect, Option } from "effect"
import { Command, Flag } from "effect/cli"

import { IssueApi } from "@/api/issue"
import { OutputFields, readFields, selectObject } from "@/cli/fields"
import { formatIssueLine } from "@/cli/issue/line"
import { issueSummaryShape } from "@/cli/issue/shape"
import { idsOnlyFlag, validateListOutput } from "@/cli/list-flags"
import { JsonOutput, errorLine, reportFailure, writeJson, writeLine } from "@/cli/output"

const parentFlag = Flag.String("parent").pipe(
  Flag.withDescription("Parent issue reference"),
  Flag.optional,
)

const nextCommand = Command.make("next", { parent: parentFlag, idsOnly: idsOnlyFlag }, (config) =>
  Effect.gen(function* next() {
    const json = yield* JsonOutput
    const fieldsOption = yield* OutputFields
    const validOutput = yield* validateListOutput({
      json,
      fields: fieldsOption,
      count: false,
      idsOnly: config.idsOnly,
    })
    if (!validOutput) {
      return
    }
    const fields = yield* readFields(json, fieldsOption)
    const parent = Option.getOrUndefined(config.parent)
    if (parent === undefined || parent.trim().length === 0) {
      yield* errorLine("validation", "The --parent flag is required.", "Pass --parent <ref>.")
      return
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
    if (config.idsOnly) {
      if (issue !== null) {
        yield* writeLine(issue.identifier)
      }
      return
    }
    if (json) {
      const selected = yield* selectObject(fields, issueSummaryShape, issue)
      yield* writeJson(selected)
      return
    }
    yield* writeLine(issue === null ? "No ready ticket." : formatIssueLine(issue))
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
    {
      command: "rata next --parent RAT-1 --json --fields identifier,title",
      description: "Select fields from the ready child",
    },
    {
      command: "rata next --parent RAT-1 --ids-only",
      description: "Print only the ready identifier, or nothing when none is ready",
    },
  ]),
)

export { nextCommand }
