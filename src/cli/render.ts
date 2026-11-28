import { Effect, Option, Predicate } from "effect"

import type { FieldPath, FieldShape } from "@/cli/field/shape"
import type { CliExit, CommandOutput, OutputFormat, OutputSpec, OutputSpecs } from "@/cli/spec"

import { toTrackerError } from "@/cli/error-report"
import { selectItems, selectObject } from "@/cli/fields"
import { jsonText, writeLine } from "@/cli/output"
import { TrackerError } from "@/domain/error"

type RenderOptions = {
  readonly format: OutputFormat
  readonly select: Option.Option<readonly FieldPath[]>
}

const internalError = (message: string): TrackerError =>
  new TrackerError({ code: "internal", message, hint: null })

const isSpecList = (spec: OutputSpecs): spec is readonly OutputSpec[] => Array.isArray(spec)

const specFor = (spec: OutputSpecs, kind: OutputSpec["kind"]): OutputSpec | undefined => {
  const specs = isSpecList(spec) ? spec : [spec]
  return specs.find((item) => item.kind === kind)
}

const writeLines = (lines: readonly string[]): Effect.Effect<void> =>
  Effect.forEach(lines, writeLine, { discard: true })

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
      return yield* internalError(`The output has no value at ${at.join(".")}.`)
    }
    const selected = yield* selectObject(fields, shape, target).pipe(
      Effect.mapError(toTrackerError),
    )
    return valueWith(value, at, selected)
  })

const renderResource = (
  output: CommandOutput & { readonly kind: "resource" },
  spec: OutputSpec & { readonly kind: "resource" },
  options: RenderOptions,
): Effect.Effect<void, TrackerError> =>
  Effect.gen(function* renderResourceOutput() {
    if (options.format === "text") {
      yield* writeLines(output.text)
      return
    }
    const selected = yield* selectResource(
      output.value,
      spec.shape,
      options.select,
      spec.select?.at ?? [],
    )
    yield* writeLine(yield* jsonText(selected))
  })

const renderCollection = (
  output: CommandOutput & { readonly kind: "collection" },
  spec: OutputSpec & { readonly kind: "collection" },
  options: RenderOptions,
): Effect.Effect<void, TrackerError> =>
  Effect.gen(function* renderCollectionOutput() {
    if (options.format === "text") {
      yield* writeLines(output.text)
      return
    }
    const items = yield* selectItems(options.select, spec.shape, output.items).pipe(
      Effect.mapError(toTrackerError),
    )
    yield* writeLine(yield* jsonText({ [output.key]: items, pageInfo: output.pageInfo }))
  })

const renderOutput = (
  output: CommandOutput,
  outputSpec: OutputSpecs,
  options: RenderOptions,
): Effect.Effect<CliExit, TrackerError> =>
  Effect.gen(function* renderCommandOutput() {
    switch (output.kind) {
      case "resource": {
        const spec = specFor(outputSpec, "resource")
        if (spec?.kind !== "resource") {
          return yield* internalError(
            "The command returned a resource for a different output shape.",
          )
        }
        yield* renderResource(output, spec, options)
        return { code: output.exitCode ?? 0 }
      }
      case "collection": {
        const spec = specFor(outputSpec, "collection")
        if (spec?.kind !== "collection") {
          return yield* internalError(
            "The command returned a collection for a different output shape.",
          )
        }
        yield* renderCollection(output, spec, options)
        return { code: output.exitCode ?? 0 }
      }
      case "text": {
        if (specFor(outputSpec, "text") === undefined) {
          return yield* internalError("The command returned text for a different output shape.")
        }
        yield* writeLines(output.lines)
        return { code: output.exitCode ?? 0 }
      }
      default: {
        return yield* internalError("The runner received an output kind it cannot render.")
      }
    }
  })

export { renderOutput }
