import { Effect, Result, Schema } from "effect"

import type { ErrorCode } from "@/domain/error"

import { JsonOutput, errorLine } from "@/cli/output"
import { parseIssueRef } from "@/domain/issue-ref"

type InvalidForm = {
  readonly code: ErrorCode
  readonly message: string
  readonly hint: string
}

type FlagValues = {
  readonly present: boolean
  readonly values: readonly string[]
}

const shellSafe = /^[A-Za-z0-9_./:@%+=,-]+$/u
const backslash = String.fromCodePoint(92)
const escapedBackslash = `${backslash}${backslash}`
const escapedQuote = `${backslash}"`

const quoteHintValue = (value: string): string =>
  shellSafe.test(value)
    ? value
    : `"${value.replaceAll(backslash, escapedBackslash).replaceAll('"', escapedQuote)}"`

const isFlagValue = (token: string | undefined): token is string =>
  token !== undefined && (token === "-" || !token.startsWith("-"))

const readFlagValues = (args: readonly string[], start: number, name: string): FlagValues => {
  const values: string[] = []
  let present = false
  const flag = `--${name}`
  const prefix = `${flag}=`
  for (let index = start; index < args.length; index += 1) {
    const token = args[index]
    if (token === undefined || token === "--") {
      break
    }
    if (token === flag) {
      present = true
      const value = args[index + 1]
      if (isFlagValue(value)) {
        values.push(value)
        index += 1
      }
      continue
    }
    if (token.startsWith(prefix)) {
      present = true
      values.push(token.slice(prefix.length))
    }
  }
  return { present, values }
}

// The published Effect CLI types omit its internal boolean literal helpers.
const trueLiterals = Schema.Literals(["true", "yes", "on", "1", "y"])
const falseLiterals = Schema.Literals(["false", "no", "off", "0", "n"])
const isTrueLiteral = Schema.is(trueLiterals)
const isFalseLiteral = Schema.is(falseLiterals)

const valueFlags = new Set(["--fields", "--format", "--select", "--log-level", "--completions"])
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

const issueRef = (args: readonly string[], start: number): string | undefined => {
  let index = skipFlags(args, start)
  while (index < args.length) {
    const token = args[index]
    if (token === undefined || token === "--") {
      break
    }
    if (token.startsWith("-")) {
      index = skipFlag(args, index)
      continue
    }
    if (Result.isSuccess(parseIssueRef(token))) {
      return token
    }
    index += 1
  }
  return undefined
}

const relationHint = (args: readonly string[], groupIndex: number): string => {
  const blockedBy = readFlagValues(args, groupIndex + 1, "blocked-by")
  const targets = blockedBy.values.length === 0 ? ["<blocker>"] : blockedBy.values
  return targets.map((target) => `--blocked-by ${quoteHintValue(target)}`).join(" ")
}

const detectCreateForm = (args: readonly string[], groupIndex: number): InvalidForm | undefined => {
  const body = readFlagValues(args, groupIndex + 1, "body")
  if (body.present) {
    return {
      code: "usage",
      message: "The --body flag was removed from issue create.",
      hint: "Use --body-file - and pipe the body on standard input.",
    }
  }
  const blockedBy = readFlagValues(args, groupIndex + 1, "blocked-by")
  if (!blockedBy.present) {
    return undefined
  }
  return {
    code: "validation",
    message: "The --blocked-by flag is not supported by issue create.",
    hint: `Create the issue, then run rata issue relate <new-ref> ${relationHint(args, groupIndex)}.`,
  }
}

const removedReadGroups = new Set(["show", "view", "status"])

const removedApplyGroups = new Set(["update", "section", "label", "assign", "unassign", "reopen"])

const removedRelateGroups = new Set(["link", "unlink"])

const detectRemovedGroup = (
  args: readonly string[],
  groupIndex: number,
  group: string,
): InvalidForm | undefined => {
  if (removedApplyGroups.has(group)) {
    const ref = issueRef(args, groupIndex + 1) ?? "<ref>"
    return {
      code: "usage",
      message: `The issue ${group} command was replaced by issue apply.`,
      hint: `rata issue apply ${ref} --file -`,
    }
  }
  if (removedRelateGroups.has(group)) {
    const ref = issueRef(args, groupIndex + 1) ?? "<ref>"
    return {
      code: "usage",
      message: `The issue ${group} command was replaced by issue relate.`,
      hint: `rata issue relate ${ref} --blocked-by <target>`,
    }
  }
  return undefined
}

const detectOldCommentForm = (
  args: readonly string[],
  groupIndex: number,
): InvalidForm | undefined => {
  const next = args[skipFlags(args, groupIndex + 1)]
  if (next === "create" || next === "update" || next === "delete") {
    return {
      code: "usage",
      message: "The issue comment subcommands were replaced by one comment command.",
      hint: "rata issue comment <ref> --body-file -",
    }
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

  if (group === "create") {
    return detectCreateForm(args, groupIndex)
  }

  if (group === "comment") {
    return detectOldCommentForm(args, groupIndex)
  }

  const removed = detectRemovedGroup(args, groupIndex, group)
  if (removed !== undefined) {
    return removed
  }

  if (removedReadGroups.has(group)) {
    const ref = issueRef(args, groupIndex + 1) ?? "<ref>"
    return {
      code: "usage",
      message: `The issue ${group} command does not exist.`,
      hint: `rata issue ${ref}`,
    }
  }

  return undefined
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
  errorLine(form.code, form.message, form.hint).pipe(Effect.provideService(JsonOutput, json))

export { detectInvalidForm, jsonEnabled, reportInvalidForm }
