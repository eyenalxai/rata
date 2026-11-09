import { Effect, Result, Schema } from "effect"

import { JsonOutput, errorLine } from "@/cli/output"
import { parseIssueRef } from "@/domain/ref"

type InvalidForm = {
  readonly message: string
  readonly hint: string
}

// The published Effect CLI types omit its internal boolean literal helpers.
const trueLiterals = Schema.Literals(["true", "yes", "on", "1", "y"])
const falseLiterals = Schema.Literals(["false", "no", "off", "0", "n"])
const isTrueLiteral = Schema.is(trueLiterals)
const isFalseLiteral = Schema.is(falseLiterals)

const valueFlags = new Set(["--fields", "--log-level", "--completions"])
const booleanFlags = new Set(["--json", "--help", "-h", "--version", "-v", "--wizard"])
const actionFlags = new Set(["--help", "-h", "--version", "-v", "--wizard", "--completions"])

const isBooleanLiteral = (value: string): boolean => isTrueLiteral(value) || isFalseLiteral(value)

const skipFlag = (args: readonly string[], index: number): number => {
  const token = args[index]
  if (token === undefined) {
    return index
  }
  if (token === "--") {
    return index + 1
  }
  if (token.includes("=")) {
    return index + 1
  }
  if (valueFlags.has(token)) {
    return index + 2
  }
  const next = args[index + 1]
  if (booleanFlags.has(token) && next !== undefined && isBooleanLiteral(next)) {
    return index + 2
  }
  return index + 1
}

const skipFlags = (args: readonly string[], start: number): number => {
  let index = start
  while (args[index]?.startsWith("-") === true) {
    index = skipFlag(args, index)
  }
  return index
}

const inlineAction = (arg: string): boolean => {
  const [name, value] = arg.split("=", 2)
  if (name === undefined || value === undefined) {
    return false
  }
  if (name === "--help" || name === "-h" || name === "--version" || name === "-v") {
    return isTrueLiteral(value)
  }
  return name === "--wizard" || name === "--completions"
}

const bundledAction = (arg: string): boolean =>
  arg.startsWith("-") &&
  !arg.startsWith("--") &&
  arg.length > 2 &&
  !arg.includes("=") &&
  (arg.slice(1).includes("h") || arg.slice(1).includes("v"))

const hasActionFlag = (args: readonly string[]): boolean => {
  for (const arg of args) {
    if (arg === "--") {
      return false
    }
    if (actionFlags.has(arg) || inlineAction(arg) || bundledAction(arg)) {
      return true
    }
  }
  return false
}

const findIssue = (args: readonly string[]): number | undefined => {
  let index = 0
  while (index < args.length) {
    const token = args[index]
    if (token === undefined || token === "--") {
      return undefined
    }
    if (token.startsWith("-")) {
      index = skipFlag(args, index)
      continue
    }
    return token === "issue" ? index : undefined
  }
  return undefined
}

const detectInvalidForm = (args: readonly string[]): InvalidForm | undefined => {
  if (hasActionFlag(args)) {
    return undefined
  }

  const issue = findIssue(args)
  if (issue === undefined) {
    return undefined
  }

  const groupIndex = skipFlags(args, issue + 1)
  const group = args[groupIndex]
  if (group === undefined) {
    return undefined
  }

  if (group === "comment") {
    const ref = args[skipFlags(args, groupIndex + 1)]
    if (ref === undefined || !Result.isSuccess(parseIssueRef(ref))) {
      return undefined
    }
    return {
      message: "The comment group needs a subcommand.",
      hint: `rata issue comment create ${ref}`,
    }
  }

  if (!Result.isSuccess(parseIssueRef(group))) {
    return undefined
  }
  return {
    message: "The issue group needs a subcommand.",
    hint: `rata issue show ${group}`,
  }
}

const jsonEnabled = (args: readonly string[]): boolean => {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (token === undefined || token === "--") {
      break
    }
    if (token === "--no-json") {
      return false
    }
    if (token === "--json") {
      const next = args[index + 1]
      return next === undefined || !isFalseLiteral(next)
    }
    if (token.startsWith("--json=")) {
      return isTrueLiteral(token.slice("--json=".length))
    }
  }
  return false
}

const reportInvalidForm = (form: InvalidForm, json: boolean): Effect.Effect<void> =>
  errorLine("validation", form.message, form.hint).pipe(Effect.provideService(JsonOutput, json))

export { detectInvalidForm, jsonEnabled, reportInvalidForm }
