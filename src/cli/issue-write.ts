import { Effect, Option, Result } from "effect"
import { Argument, Command, Flag } from "effect/cli"

import { IssueWriteApi } from "@/api/issue-write"
import { resolveBody } from "@/cli/body"
import { errorLine, reportFailure, writeJson, writeLine } from "@/cli/output"
import { parsePriority } from "@/domain/priority"

const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDescription("Print machine-readable JSON"),
  Flag.withDefault(false),
)

const optionalText = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional)

const refArgument = Argument.String("ref").pipe(
  Argument.withDescription("Issue reference: an identifier, a UUID, or a linear.app URL"),
)

const bodyFlag = optionalText("body", "Body text in markdown")
const bodyFileFlag = optionalText(
  "body-file",
  "Read the body from a file. Use - for standard input",
)

const createCommand = Command.make(
  "create",
  {
    title: Flag.String("title").pipe(Flag.withDescription("Issue title")),
    body: bodyFlag,
    bodyFile: bodyFileFlag,
    team: optionalText("team", "Team key or id. Defaults to the team from `rata link`"),
    label: Flag.atLeast(Flag.String("label"), 0).pipe(
      Flag.withDescription("Label name. Repeat for more labels"),
    ),
    parent: optionalText("parent", "Parent issue reference"),
    project: optionalText("project", "Project id or name"),
    state: optionalText("state", "Workflow state name"),
    assignee: optionalText("assignee", "Assignee: `me` or a user id"),
    priority: optionalText("priority", "Priority: none, urgent, high, medium, low, or 0-4"),
    json: jsonFlag,
  },
  (config) =>
    Effect.gen(function* createIssue() {
      const body = yield* resolveBody(
        { body: "body", file: "body-file" },
        config.body,
        config.bodyFile,
      )
      const priorityText = Option.getOrUndefined(config.priority)
      const parsedPriority = priorityText === undefined ? undefined : parsePriority(priorityText)
      if (parsedPriority !== undefined && Result.isFailure(parsedPriority)) {
        return yield* errorLine(1, parsedPriority.failure)
      }
      const priority = parsedPriority === undefined ? undefined : Result.getOrThrow(parsedPriority)
      const api = yield* IssueWriteApi
      const issue = yield* api.create({
        title: config.title,
        body: Option.getOrUndefined(body),
        team: Option.getOrUndefined(config.team),
        labels: config.label.length > 0 ? config.label : undefined,
        parent: Option.getOrUndefined(config.parent),
        project: Option.getOrUndefined(config.project),
        state: Option.getOrUndefined(config.state),
        assignee: Option.getOrUndefined(config.assignee),
        priority,
      })
      if (config.json) {
        return yield* writeJson({ issue })
      }
      return yield* writeLine(`Created ${issue.identifier}: ${issue.title}`)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Create an issue"),
  Command.withExamples([
    {
      command: 'rata issue create --title "Fix login" --team RAT --label ready-for-agent',
      description: "Create an issue with a label",
    },
    {
      command: 'echo "The body" | rata issue create --title "Fix login" --team RAT --body-file -',
      description: "Read the body from standard input",
    },
  ]),
)

const commentCommand = Command.make(
  "comment",
  {
    ref: refArgument,
    body: bodyFlag,
    bodyFile: bodyFileFlag,
    json: jsonFlag,
  },
  (config) =>
    Effect.gen(function* commentOnIssue() {
      const body = yield* resolveBody(
        { body: "body", file: "body-file" },
        config.body,
        config.bodyFile,
      )
      if (Option.isNone(body)) {
        return yield* errorLine(1, "A comment needs --body or --body-file.")
      }
      if (body.value.trim().length === 0) {
        return yield* errorLine(1, "The comment body is empty.")
      }
      const api = yield* IssueWriteApi
      const comment = yield* api.comment(config.ref, body.value)
      if (config.json) {
        return yield* writeJson({ comment })
      }
      return yield* writeLine(`Commented on ${config.ref}.`)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Comment on an issue"),
  Command.withExamples([
    {
      command: 'rata issue comment RAT-42 --body "Looks good."',
      description: "Comment on an issue",
    },
  ]),
)

const updateCommand = Command.make(
  "update",
  {
    ref: refArgument,
    title: optionalText("title", "New title"),
    body: bodyFlag,
    bodyFile: bodyFileFlag,
    state: optionalText("state", "Workflow state name"),
    assignee: optionalText("assignee", "Assignee: `me` or a user id"),
    project: optionalText("project", "Project id or name"),
    parent: optionalText("parent", "Parent issue reference"),
    priority: optionalText("priority", "Priority: none, urgent, high, medium, low, or 0-4"),
    json: jsonFlag,
  },
  (config) =>
    Effect.gen(function* updateIssue() {
      const body = yield* resolveBody(
        { body: "body", file: "body-file" },
        config.body,
        config.bodyFile,
      )
      const priorityText = Option.getOrUndefined(config.priority)
      const parsedPriority = priorityText === undefined ? undefined : parsePriority(priorityText)
      if (parsedPriority !== undefined && Result.isFailure(parsedPriority)) {
        return yield* errorLine(1, parsedPriority.failure)
      }
      const priority = parsedPriority === undefined ? undefined : Result.getOrThrow(parsedPriority)
      const options = {
        title: Option.getOrUndefined(config.title),
        body: Option.getOrUndefined(body),
        state: Option.getOrUndefined(config.state),
        assignee: Option.getOrUndefined(config.assignee),
        project: Option.getOrUndefined(config.project),
        parent: Option.getOrUndefined(config.parent),
        priority,
      }
      if (Object.values(options).every((value) => value === undefined)) {
        return yield* errorLine(
          1,
          "Pass at least one of --title, --body, --state, --assignee, --project, --parent or --priority.",
        )
      }
      const api = yield* IssueWriteApi
      const issue = yield* api.update(config.ref, options)
      if (config.json) {
        return yield* writeJson({ issue })
      }
      return yield* writeLine(`Updated ${issue.identifier}.`)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Update an issue"),
  Command.withExamples([
    {
      command: 'rata issue update RAT-42 --state "In Progress" --assignee me',
      description: "Move an issue to a state and claim it",
    },
    {
      command: "rata issue update RAT-42 --priority high",
      description: "Set the priority",
    },
  ]),
)

export { commentCommand, createCommand, updateCommand }
