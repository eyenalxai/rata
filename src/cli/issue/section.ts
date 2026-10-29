import { Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/cli"

import type { SectionWriteResult } from "@/api/issue-write/write-types"

import { IssueWriteApi } from "@/api/issue-write"
import { resolveBody } from "@/cli/body"
import { OutputFields, readFields, rejectFields, selectObject } from "@/cli/fields"
import { bodyFileFlag, bodyFlag, optionalText, refArgument } from "@/cli/issue-write/flags"
import {
  JsonOutput,
  dryRunFlag,
  errorLine,
  reportFailure,
  writeJson,
  writeLine,
} from "@/cli/output"

const headingArgument = Argument.String("heading").pipe(
  Argument.withDescription('Heading text without the # marks, for example "Handoff log"'),
)

const levelFlag = Flag.Int("level").pipe(
  Flag.withDescription("Heading level for a new section, 1 to 6. Default 2"),
  Flag.optional,
)

const ifUnchangedFlag = optionalText(
  "if-unchanged",
  "Write only when the issue updatedAt still matches this value",
)

const requireBody = (body: Option.Option<string>, bodyFile: Option.Option<string>) =>
  Effect.gen(function* requireSectionBody() {
    const resolved = yield* resolveBody({ body: "body", file: "body-file" }, body, bodyFile)
    if (Option.isNone(resolved)) {
      yield* errorLine("validation", "Pass --body or --body-file.")
      return Option.none<string>()
    }
    if (resolved.value.trim().length === 0) {
      yield* errorLine("validation", "The section body is empty.")
      return Option.none<string>()
    }
    return resolved
  })

const validateLevel = (level: number | undefined) =>
  Effect.gen(function* validateSectionLevel() {
    if (level === undefined) {
      return true
    }
    if (level < 1 || level > 6) {
      yield* errorLine("validation", "The --level flag must be from 1 to 6.")
      return false
    }
    return true
  })

const writeSectionResult = (json: boolean, result: SectionWriteResult) => {
  if (result.dryRun) {
    return json
      ? writeJson({
          dryRun: true,
          action: result.action,
          target: result.target,
          heading: result.heading,
          diff: result.diff,
        })
      : writeLine(result.diff.length === 0 ? "No changes." : result.diff)
  }
  if (json) {
    return writeJson({
      issue: { identifier: result.issue.identifier, updatedAt: result.issue.updatedAt },
      section: { heading: result.heading, level: result.level },
    })
  }
  return writeLine(`Updated ${result.target}, section "${result.heading}".`)
}

const getCommand = Command.make(
  "get",
  {
    ref: refArgument,
    heading: headingArgument,
    withHeading: Flag.Boolean("with-heading").pipe(
      Flag.withDescription("Print the heading line before the content"),
      Flag.withDefault(false),
    ),
  },
  (config) =>
    Effect.gen(function* getSection() {
      const json = yield* JsonOutput
      const fields = yield* readFields(json, yield* OutputFields)
      const api = yield* IssueWriteApi
      const result = yield* api.readSection(config.ref, config.heading)
      const section = {
        heading: result.heading,
        level: result.level,
        content: result.content,
      }
      if (json) {
        return yield* writeJson({ section: yield* selectObject(fields, section) })
      }
      const headingLine = `${"#".repeat(section.level)} ${section.heading}`
      if (config.withHeading) {
        return yield* writeLine(
          section.content.length === 0 ? headingLine : `${headingLine}\n${section.content}`,
        )
      }
      return yield* writeLine(section.content)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Print the content of one section"),
  Command.withExamples([
    {
      command: 'rata issue section get RAT-42 "Handoff log"',
      description: "Print the content under one heading",
    },
    {
      command: 'rata issue section get RAT-42 "Handoff log" --with-heading',
      description: "Print the heading before the content",
    },
  ]),
)

const appendCommand = Command.make(
  "append",
  {
    ref: refArgument,
    heading: headingArgument,
    body: bodyFlag,
    bodyFile: bodyFileFlag,
    level: levelFlag,
    dryRun: dryRunFlag,
    ifUnchanged: ifUnchangedFlag,
  },
  (config) =>
    Effect.gen(function* appendSection() {
      const json = yield* JsonOutput
      yield* rejectFields(yield* OutputFields)
      const level = Option.getOrUndefined(config.level)
      if (!(yield* validateLevel(level))) {
        return yield* Effect.void
      }
      const body = yield* requireBody(config.body, config.bodyFile)
      if (Option.isNone(body)) {
        return yield* Effect.void
      }
      const api = yield* IssueWriteApi
      const result = yield* api.appendSection(config.ref, config.heading, body.value, {
        dryRun: config.dryRun,
        ifUnchanged: Option.getOrUndefined(config.ifUnchanged),
        level,
      })
      return yield* writeSectionResult(json, result)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Append content to a section, or create the section at the end"),
  Command.withExamples([
    {
      command: 'rata issue section append RAT-42 "Handoff log" --body "Started."',
      description: "Append a line to one section",
    },
    {
      command: 'rata issue section append RAT-42 "Notes" --body-file notes.md --level 3',
      description: "Create a missing level-3 section from a file",
    },
  ]),
)

const replaceCommand = Command.make(
  "replace",
  {
    ref: refArgument,
    heading: headingArgument,
    body: bodyFlag,
    bodyFile: bodyFileFlag,
    dryRun: dryRunFlag,
    ifUnchanged: ifUnchangedFlag,
  },
  (config) =>
    Effect.gen(function* replaceSection() {
      const json = yield* JsonOutput
      yield* rejectFields(yield* OutputFields)
      const body = yield* requireBody(config.body, config.bodyFile)
      if (Option.isNone(body)) {
        return yield* Effect.void
      }
      const api = yield* IssueWriteApi
      const result = yield* api.replaceSection(config.ref, config.heading, body.value, {
        dryRun: config.dryRun,
        ifUnchanged: Option.getOrUndefined(config.ifUnchanged),
      })
      return yield* writeSectionResult(json, result)
    }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Replace the content of one section"),
  Command.withExamples([
    {
      command: 'rata issue section replace RAT-42 "Handoff log" --body-file -',
      description: "Replace a section with standard input",
    },
    {
      command: 'rata issue section replace RAT-42 "Handoff log" --body "New." --dry-run',
      description: "Preview the change as a unified diff",
    },
  ]),
)

const sectionCommand = Command.make("section").pipe(
  Command.withDescription("Read and edit a section of an issue body"),
  Command.withSubcommands([getCommand, appendCommand, replaceCommand]),
)

export { sectionCommand }
