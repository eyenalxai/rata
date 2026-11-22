import { Effect, Option, Predicate } from "effect"

import type { FieldPath, FieldShape } from "@/cli/field/shape"
import type { CommandOutput, OutputFormat, OutputSpec } from "@/cli/spec"

import { exitCodeOf, toTrackerError } from "@/cli/error-report"
import { selectItems, selectObject } from "@/cli/fields"
import { bulkJsonResult, writeJson, writeLine } from "@/cli/output"
import { TrackerError } from "@/domain/error"

type RenderOptions = {
  readonly format: OutputFormat
  readonly select: Option.Option<readonly FieldPath[]>
}

const valueAt = (value: unknown, path: readonly string[]): unknown => {
  let current = value
  for (const key of path) {
    if (!Predicate.isObject(current)) {
      return undefined
    }
    current = Reflect.get(current, key)
  }
  return current
}

const valueWith = (value: unknown, path: readonly string[], next: unknown): unknown => {
  if (path.length === 0) {
    return next
  }
  const [key, ...rest] = path
  if (key === undefined || !Predicate.isObject(value)) {
    return value
  }
  return { ...value, [key]: valueWith(Reflect.get(value, key), rest, next) }
}

const selectResource = (
  value: unknown,
  shape: FieldShape,
  fields: Option.Option<readonly FieldPath[]>,
  at: readonly string[],
) =>
  Effect.gen(function* selectResourceValue() {
    if (Option.isNone(fields)) {
      return value
    }
    const target = valueAt(value, at)
    if (target === undefined) {
      return yield* new TrackerError({
        code: "internal",
        message: `The output has no value at ${at.join(".")}.`,
        hint: null,
      })
    }
    const selected = yield* selectObject(fields, shape, target)
    return valueWith(value, at, selected)
  })

const renderResource = (
  output: CommandOutput & { readonly kind: "resource" },
  spec: OutputSpec & { readonly kind: "resource" },
  options: RenderOptions,
) =>
  Effect.gen(function* renderResourceOutput() {
    if (options.format === "text") {
      return yield* Effect.forEach(output.text, writeLine, { discard: true })
    }
    const selected = yield* selectResource(
      output.value,
      spec.shape,
      options.select,
      spec.select?.at ?? [],
    )
    return yield* writeJson(selected)
  })

const renderCollection = (
  output: CommandOutput & { readonly kind: "collection" },
  spec: OutputSpec & { readonly kind: "collection" },
  options: RenderOptions,
) =>
  Effect.gen(function* renderCollectionOutput() {
    if (options.format === "text") {
      return yield* Effect.forEach(output.text, writeLine, { discard: true })
    }
    const items = yield* selectItems(options.select, spec.shape, output.items)
    return yield* writeJson({ [output.key]: items, pageInfo: output.pageInfo })
  })

const bulkExitCode = (results: CommandOutput & { readonly kind: "bulk" }): number => {
  const firstFailure = results.results.find((result) => result.status === "failed")
  return firstFailure === undefined ? 0 : exitCodeOf(toTrackerError(firstFailure.error).code)
}

const renderOutput = (
  output: CommandOutput,
  spec: OutputSpec,
  options: RenderOptions,
): Effect.Effect<number, Error> =>
  Effect.gen(function* renderCommandOutput() {
    switch (output.kind) {
      case "resource": {
        if (spec.kind !== "resource") {
          return yield* new TrackerError({
            code: "internal",
            message: "The command returned a resource for a different output shape.",
            hint: null,
          })
        }
        yield* renderResource(output, spec, options)
        return 0
      }
      case "collection": {
        if (spec.kind !== "collection") {
          return yield* new TrackerError({
            code: "internal",
            message: "The command returned a collection for a different output shape.",
            hint: null,
          })
        }
        yield* renderCollection(output, spec, options)
        return 0
      }
      case "text": {
        yield* options.format === "text"
          ? Effect.forEach(output.lines, writeLine, { discard: true })
          : writeJson({ lines: output.lines })
        return 0
      }
      case "plan": {
        yield* options.format === "text"
          ? Effect.forEach(output.text, writeLine, { discard: true })
          : writeJson({ dryRun: true, actions: output.steps })
        return 0
      }
      case "bulk": {
        yield* options.format === "text"
          ? Effect.forEach(output.text, writeLine, { discard: true })
          : writeJson({
              dryRun: output.dryRun,
              results: output.results.map(bulkJsonResult),
            })
        return bulkExitCode(output)
      }
      case "none": {
        return 0
      }
      default: {
        return 0
      }
    }
  })

export { renderOutput }
