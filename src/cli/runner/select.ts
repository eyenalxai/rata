import { Effect, Option, Result } from "effect"

import type { FieldPath } from "@/cli/field/shape"
import type { OutputFormat, OutputSpec, OutputSpecs } from "@/cli/spec"

import { toTrackerError } from "@/cli/error-report"
import { parseFieldPaths } from "@/cli/fields"
import { TrackerError } from "@/domain/error"

const isSpecList = (output: OutputSpecs): output is readonly OutputSpec[] => Array.isArray(output)

const supportsSelect = (output: OutputSpecs): boolean => {
  const specs = isSpecList(output) ? output : [output]
  return specs.some(
    (spec) => spec.kind === "collection" || (spec.kind === "resource" && spec.select !== undefined),
  )
}

const parseSelector = (
  flag: "--fields" | "--select",
  value: string,
  format: OutputFormat,
): Effect.Effect<readonly FieldPath[], TrackerError> => {
  if (format !== "json") {
    return Effect.fail(
      new TrackerError({
        code: "validation",
        message:
          flag === "--fields" ? "--fields requires --json." : "--select requires JSON output.",
        hint: null,
      }),
    )
  }
  const parsed = parseFieldPaths(value)
  if (Result.isFailure(parsed)) {
    return Effect.fail(toTrackerError(parsed.failure))
  }
  return Effect.succeed(parsed.success)
}

const resolveSelect = (
  output: OutputSpecs,
  fields: Option.Option<string>,
  select: Option.Option<string>,
  format: OutputFormat,
): Effect.Effect<Option.Option<readonly FieldPath[]>, TrackerError> =>
  Effect.gen(function* resolveSelector() {
    if (Option.isSome(fields) && Option.isSome(select)) {
      return yield* new TrackerError({
        code: "validation",
        message: "Pass --select or --fields, not both.",
        hint: null,
      })
    }
    if (Option.isSome(select)) {
      if (!supportsSelect(output)) {
        return yield* new TrackerError({
          code: "validation",
          message: "--select is not supported by this command.",
          hint: "This command does not declare a selectable output. Use --format json and jq.",
        })
      }
      return Option.some(yield* parseSelector("--select", select.value, format))
    }
    if (Option.isSome(fields)) {
      if (!supportsSelect(output)) {
        return yield* new TrackerError({
          code: "validation",
          message: "--fields is not supported by this command.",
          hint: "This command does not declare a selectable output. Use --format json and jq.",
        })
      }
      return Option.some(yield* parseSelector("--fields", fields.value, format))
    }
    return Option.none()
  })

export { resolveSelect, supportsSelect }
