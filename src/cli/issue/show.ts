import { Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/cli"

import type { IssueDetail } from "@/api/issue-model"

import { IssueApi } from "@/api/issue"
import { OutputFields, readFields, selectObject } from "@/cli/fields"
import { formatIssueDetail, formatIssueSummary } from "@/cli/issue/format"
import { JsonOutput, errorLine, reportFailure, writeJson, writeLine } from "@/cli/output"

const refArgument = Argument.String("ref").pipe(
  Argument.withDescription("Issue reference: an identifier, a UUID, or a linear.app URL"),
)

const commentsFlag = Flag.Boolean("comments").pipe(
  Flag.withDescription("Include the issue comments"),
  Flag.optional,
)

const noCommentsFlag = Flag.Boolean("no-comments").pipe(
  Flag.withDescription("Skip the comment fetch and omit the comments key"),
  Flag.optional,
)

const summaryFlag = Flag.Boolean("summary").pipe(
  Flag.withDescription("Lean read: header fields only"),
  Flag.withDefault(false),
)

const noBodyFlag = Flag.Boolean("no-body").pipe(
  Flag.withDescription("Omit the description from the output"),
  Flag.withDefault(false),
)

const noRelationsFlag = Flag.Boolean("no-relations").pipe(
  Flag.withDescription("Skip the relation fetch and omit the relations key"),
  Flag.withDefault(false),
)

const noChildrenFlag = Flag.Boolean("no-children").pipe(
  Flag.withDescription("Skip the child fetch and omit the children key"),
  Flag.withDefault(false),
)

const noAttachmentsFlag = Flag.Boolean("no-attachments").pipe(
  Flag.withDescription("Skip the attachment fetch and omit the attachments key"),
  Flag.withDefault(false),
)

type ShowShape = {
  readonly noBody: boolean
  readonly noRelations: boolean
  readonly noChildren: boolean
  readonly noAttachments: boolean
}

const detailOutput = (issue: IssueDetail, shape: ShowShape): Record<string, unknown> => {
  const { description, children, relations, attachments, ...rest } = issue
  return {
    ...rest,
    ...(shape.noBody ? {} : { description }),
    ...(shape.noChildren ? {} : { children }),
    ...(shape.noRelations ? {} : { relations }),
    ...(shape.noAttachments ? {} : { attachments }),
  }
}

const showCommand = Command.make(
  "show",
  {
    ref: refArgument,
    comments: commentsFlag,
    noComments: noCommentsFlag,
    summary: summaryFlag,
    noBody: noBodyFlag,
    noRelations: noRelationsFlag,
    noChildren: noChildrenFlag,
    noAttachments: noAttachmentsFlag,
  },
  (config) =>
    Effect.gen(function* show() {
      const json = yield* JsonOutput
      const fields = yield* readFields(json, yield* OutputFields)
      const includesComments = Option.exists(config.comments, (value) => value)
      const skipsComments = Option.exists(config.noComments, (value) => value)
      if (config.summary && includesComments) {
        return yield* errorLine(
          1,
          "--summary and --comments are mutually exclusive.",
          "Drop one of the two flags.",
        )
      }
      if (includesComments && skipsComments) {
        return yield* errorLine(
          1,
          "--comments and --no-comments are mutually exclusive.",
          "Pass one of the two flags.",
        )
      }
      const comments = skipsComments ? false : includesComments || json
      const api = yield* IssueApi
      if (config.summary) {
        const summary = yield* api.summary(config.ref)
        return json
          ? yield* writeJson({ issue: yield* selectObject(fields, summary) })
          : yield* writeLine(formatIssueSummary(summary))
      }
      const issue = yield* api.show(config.ref, {
        comments,
        relations: !config.noRelations,
        children: !config.noChildren,
        attachments: !config.noAttachments,
      })
      return json
        ? yield* writeJson({ issue: yield* selectObject(fields, detailOutput(issue, config)) })
        : yield* writeLine(formatIssueDetail(issue, !config.noBody))
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Show one issue"),
  Command.withAlias("view"),
  Command.withExamples([
    {
      command: "rata issue view RAT-42",
      description: "Show one issue; `view` is an alias for `show`",
    },
    {
      command: "rata issue show RAT-42 --summary --json",
      description: "Read the lean summary without connections",
    },
    {
      command: "rata issue show RAT-42 --json --no-body --no-relations",
      description: "Read the issue without the body or the relations",
    },
    {
      command: "rata issue show RAT-42 --comments",
      description: "Show one issue with its comments",
    },
  ]),
)

export { showCommand }
