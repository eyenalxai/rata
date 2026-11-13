import { Effect } from "effect"
import { Argument, Command, Flag } from "effect/cli"

import { IssueApi } from "@/api/issue"
import { OutputFields, readFields, selectObject } from "@/cli/fields"
import { formatIssueStatus } from "@/cli/issue/format"
import { issueStatusShape } from "@/cli/issue/shape"
import { JsonOutput, reportFailure, writeJson, writeLine } from "@/cli/output"

const refArgument = Argument.String("ref").pipe(
  Argument.withDescription("Issue reference: an identifier, a UUID, or a linear.app URL"),
)

const withBodyFlag = Flag.Boolean("with-body").pipe(
  Flag.withDescription("Include the description; no extra request"),
  Flag.withDefault(false),
)

const commentsFlag = Flag.Boolean("comments").pipe(
  Flag.withDescription("Include the comments; one extra request"),
  Flag.withDefault(false),
)

const childrenFlag = Flag.Boolean("children").pipe(
  Flag.withDescription("Include every child and compute the next child from them"),
  Flag.withDefault(false),
)

const statusCommand = Command.make(
  "status",
  { ref: refArgument, withBody: withBodyFlag, comments: commentsFlag, children: childrenFlag },
  (config) =>
    Effect.gen(function* issueStatus() {
      const json = yield* JsonOutput
      const fields = yield* readFields(json, yield* OutputFields)
      const api = yield* IssueApi
      const result = yield* api.status(config.ref, {
        withBody: config.withBody,
        comments: config.comments,
        children: config.children,
      })
      if (!json) {
        return yield* writeLine(formatIssueStatus(result))
      }
      const shape = issueStatusShape({
        body: config.withBody,
        comments: config.comments,
        children: config.children,
      })
      return yield* writeJson(yield* selectObject(fields, shape, result))
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription(
    "Show one issue with its blockers, pull requests, next child and optional body, comments or children",
  ),
  Command.withExamples([
    {
      command: "rata issue status RAT-42",
      description: "Read the state, the blockers, the pull requests and the next child",
    },
    {
      command: "rata issue status RAT-42 --json --with-body",
      description: "Read the session start with the description, without another request",
    },
    {
      command: "rata issue status RAT-42 --json --comments --children",
      description: "Add the comments and every child to the session read",
    },
    {
      command: "rata issue status RAT-42 --json --fields identifier,blocked,prs",
      description: "Select fields from the JSON object",
    },
  ]),
)

export { statusCommand }
