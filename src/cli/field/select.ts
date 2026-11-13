import { Result } from "effect"

import type { FieldPath, FieldShape, FieldShapeFields } from "@/cli/field/shape"

import { FieldSelectionError } from "@/cli/field/error"
import { scalarField } from "@/cli/field/shape"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const unknownPath = (path: FieldPath, fields: FieldShapeFields): FieldSelectionError => {
  const validPaths = Object.keys(fields).toSorted()
  return new FieldSelectionError({
    message: `Unknown field path: ${path.join(".")}.`,
    ...(validPaths.length === 0 ? {} : { hint: `Valid paths: ${validPaths.join(", ")}.` }),
    path: path.join("."),
    validPaths,
  })
}

const scalarPath = (
  path: FieldPath,
  index: number,
  arrayPath: string | null,
): FieldSelectionError => {
  const prefix = path.slice(0, index).join(".")
  return new FieldSelectionError({
    message:
      arrayPath === prefix
        ? `The field path enters the array of scalars ${prefix}.`
        : `The field path continues past the scalar ${prefix}.`,
    hint:
      arrayPath === null
        ? `Stop the path at ${prefix}.`
        : `Stop the path at ${prefix}, or select ${arrayPath} as a whole.`,
    path: path.join("."),
    validPaths: [],
  })
}

const validateShapePath = (
  shape: FieldShape,
  path: FieldPath,
): Result.Result<void, FieldSelectionError> => {
  let current = shape
  let index = 0
  let arrayPath: string | null = null
  while (index < path.length) {
    const segment = path[index]
    if (segment === undefined) {
      return Result.void
    }
    if (current.kind === "object") {
      if (!Object.hasOwn(current.fields, segment)) {
        return Result.fail(unknownPath(path, current.fields))
      }
      current = current.fields[segment] ?? scalarField
      index += 1
      continue
    }
    if (current.kind === "array") {
      arrayPath ??= path.slice(0, index).join(".")
      current = current.items
      continue
    }
    return Result.fail(scalarPath(path, index, arrayPath))
  }
  return Result.void
}

const validateFieldPaths = (
  shape: FieldShape,
  paths: readonly FieldPath[],
): Result.Result<void, FieldSelectionError> => {
  for (const path of paths) {
    const valid = validateShapePath(shape, path)
    if (Result.isFailure(valid)) {
      return valid
    }
  }
  return Result.void
}

const shapeAt = (shape: FieldShape, path: FieldPath): FieldShape => {
  if (path.length === 0) {
    return shape
  }
  const [segment, ...rest] = path
  if (shape.kind === "array") {
    return shapeAt(shape.items, path)
  }
  if (shape.kind === "scalar" || segment === undefined) {
    return shape
  }
  return shapeAt(shape.fields[segment] ?? scalarField, rest)
}

const crossesArray = (shape: FieldShape, path: FieldPath): boolean => {
  if (path.length === 0) {
    return false
  }
  if (shape.kind === "array") {
    return true
  }
  if (shape.kind === "scalar") {
    return false
  }
  const [segment, ...rest] = path
  if (segment === undefined || !Object.hasOwn(shape.fields, segment)) {
    return false
  }
  return crossesArray(shape.fields[segment] ?? scalarField, rest)
}

const extractLeaf = (value: unknown, path: FieldPath): unknown => {
  let current = value
  for (const key of path) {
    if (!isRecord(current) || !Object.hasOwn(current, key)) {
      return null
    }
    current = current[key]
  }
  return current
}

type Selector = (
  shape: FieldShape,
  value: unknown,
  paths: readonly FieldPath[],
) => Result.Result<unknown, FieldSelectionError>

const selectArrayValue = (
  itemsShape: FieldShape,
  value: readonly unknown[],
  paths: readonly FieldPath[],
  select: Selector,
): Result.Result<unknown[], FieldSelectionError> => {
  const path = paths[0]
  const flatten =
    paths.length === 1 &&
    path !== undefined &&
    shapeAt(itemsShape, path).kind === "scalar" &&
    !crossesArray(itemsShape, path)
  const selected: unknown[] = []
  for (const item of value) {
    const projected = select(itemsShape, item, paths)
    if (Result.isFailure(projected)) {
      return Result.fail(projected.failure)
    }
    selected.push(
      flatten && path !== undefined ? extractLeaf(projected.success, path) : projected.success,
    )
  }
  return Result.succeed(selected)
}

const selectObjectValue = (
  fields: FieldShapeFields,
  value: Record<string, unknown>,
  paths: readonly FieldPath[],
  select: Selector,
): Result.Result<Record<string, unknown>, FieldSelectionError> => {
  const groups = new Map<string, FieldPath[]>()
  for (const path of paths) {
    const key = path[0]
    if (key === undefined) {
      continue
    }
    const tails = groups.get(key)
    if (tails === undefined) {
      groups.set(key, [path.slice(1)])
    } else {
      tails.push(path.slice(1))
    }
  }
  const selected: Record<string, unknown> = {}
  for (const [key, tails] of groups) {
    if (tails.some((tail) => tail.length === 0)) {
      selected[key] = value[key]
      continue
    }
    const child = value[key]
    if (child === null || child === undefined) {
      selected[key] = null
      continue
    }
    const projected = select(fields[key] ?? scalarField, child, tails)
    if (Result.isFailure(projected)) {
      return Result.fail(projected.failure)
    }
    selected[key] = projected.success
  }
  return Result.succeed(selected)
}

const selectValue: Selector = (shape, value, paths) => {
  if (paths.some((path) => path.length === 0)) {
    return Result.succeed(value)
  }
  if (value === null || value === undefined) {
    return Result.succeed(null)
  }
  if (shape.kind === "array") {
    return Array.isArray(value)
      ? selectArrayValue(shape.items, value, paths, selectValue)
      : Result.succeed(null)
  }
  if (shape.kind === "object") {
    return isRecord(value)
      ? selectObjectValue(shape.fields, value, paths, selectValue)
      : Result.succeed(null)
  }
  return Result.succeed(null)
}

const selectFields = (
  shape: FieldShape,
  value: unknown,
  paths: readonly FieldPath[],
): Result.Result<unknown, FieldSelectionError> => {
  const valid = validateFieldPaths(shape, paths)
  if (Result.isFailure(valid)) {
    return valid
  }
  return selectValue(shape, value, paths)
}

const selectValues = (
  shape: FieldShape,
  values: readonly unknown[],
  paths: readonly FieldPath[],
): Result.Result<unknown[], FieldSelectionError> => {
  const valid = validateFieldPaths(shape, paths)
  if (Result.isFailure(valid)) {
    return Result.fail(valid.failure)
  }
  const selected: unknown[] = []
  for (const value of values) {
    const item = selectValue(shape, value, paths)
    if (Result.isFailure(item)) {
      return Result.fail(item.failure)
    }
    selected.push(item.success)
  }
  return Result.succeed(selected)
}

export { type FieldPath, type FieldShape, type FieldShapeFields, selectFields, selectValues }
