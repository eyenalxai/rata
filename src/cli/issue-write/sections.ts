import { Effect, Option, Schema } from "effect"
import { Flag } from "effect/cli"

import type { IssueWriteApi } from "@/api/issue-write"
import type {
  IssueSectionReplacement,
  IssueUpdateSectionsOptions,
  IssueUpdateSectionsPlan,
  IssueUpdateSectionsResult,
  IssueUpdateWriteOptions,
} from "@/api/issue-write/write-types"

import { resolveBody } from "@/cli/body"
import { postUpdateComment } from "@/cli/issue-write/comment"
import { errorLine, writeJson, writeLine } from "@/cli/output"

const SectionInput = Schema.Struct({
  heading: Schema.String,
  content: Schema.String,
})

const SectionsDocument = Schema.Struct({
  sections: Schema.Array(SectionInput),
})

const SectionsJson = Schema.fromJsonString(SectionsDocument)

const sectionsFileFlag = Flag.String("sections-file").pipe(
  Flag.withDescription(
    "Read a JSON document with a `sections` array of heading and content pairs. Use - for standard input",
  ),
  Flag.optional,
)

const readSections = Effect.fn("Cli.IssueWrite.readSections")(function* readSections(
  file: Option.Option<string>,
) {
  const text = yield* resolveBody({ body: "sections", file: "sections-file" }, Option.none(), file)
  if (Option.isNone(text)) {
    return Option.none<readonly IssueSectionReplacement[]>()
  }
  const decoded = Schema.decodeOption(SectionsJson)(text.value)
  if (Option.isNone(decoded)) {
    yield* errorLine(
      "validation",
      "The sections file must be JSON with a sections array of heading and content pairs.",
    )
    return Option.none<readonly IssueSectionReplacement[]>()
  }
  if (decoded.value.sections.length === 0) {
    yield* errorLine("validation", "The sections file needs at least one section.")
    return Option.none<readonly IssueSectionReplacement[]>()
  }
  return Option.some(decoded.value.sections)
})

const resolveSectionsInput = Effect.fn("Cli.IssueWrite.resolveSectionsInput")(
  function* resolveSectionsInput(
    sectionsFile: Option.Option<string>,
    body: Option.Option<string>,
    bodyFile: Option.Option<string>,
    append: boolean,
  ) {
    if (Option.isNone(sectionsFile)) {
      return Option.none<Option.Option<readonly IssueSectionReplacement[]>>()
    }
    if (Option.isSome(body) || Option.isSome(bodyFile) || append) {
      yield* errorLine(
        "validation",
        "The --sections-file flag cannot be combined with --body, --body-file or --append.",
        "rata issue update <ref> --sections-file -",
      )
      return Option.some(Option.none<readonly IssueSectionReplacement[]>())
    }
    return Option.some(yield* readSections(sectionsFile))
  },
)

const previewSections = (json: boolean, plan: IssueUpdateSectionsPlan) =>
  json
    ? writeJson({
        dryRun: true,
        status: plan.status,
        updatedAt: plan.updatedAt,
        sections: plan.sections,
        diff: plan.diff,
      })
    : writeLine(plan.diff.length === 0 ? "No changes." : plan.diff)

const writeSectionsResult = (json: boolean, result: IssueUpdateSectionsResult) =>
  json
    ? writeJson({
        status: result.status,
        updatedAt: result.updatedAt,
        issue: result.issue,
        sections: result.sections,
      })
    : writeLine(
        result.status === "skipped"
          ? `${result.issue.identifier} already has the requested sections.`
          : `Updated ${result.issue.identifier}.`,
      )

const runSectionsUpdate = Effect.fn("Cli.IssueWrite.runSectionsUpdate")(function* runSectionsUpdate(
  api: IssueWriteApi["Service"],
  json: boolean,
  ref: string,
  fields: IssueUpdateSectionsOptions,
  sections: readonly IssueSectionReplacement[],
  writeOptions: IssueUpdateWriteOptions,
  comment: Option.Option<string>,
  dryRun: boolean,
) {
  if (dryRun) {
    const plan = yield* api.planUpdateSections(ref, fields, sections, writeOptions)
    return yield* previewSections(json, plan)
  }
  const result = yield* api.updateSections(ref, fields, sections, writeOptions)
  if (Option.isNone(comment)) {
    return yield* writeSectionsResult(json, result)
  }
  return yield* postUpdateComment(api, json, ref, result.issue, comment.value, {
    status: result.status,
    updatedAt: result.updatedAt,
    sections: result.sections,
  })
})

export { readSections, resolveSectionsInput, runSectionsUpdate, sectionsFileFlag }
