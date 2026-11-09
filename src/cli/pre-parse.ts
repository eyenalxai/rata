import { Effect, Result } from "effect"

import { JsonOutput, errorLine } from "@/cli/output"
import { parseIssueRef } from "@/domain/ref"

type InvalidForm = {
  readonly message: string
  readonly hint: string
}

const valueFlags = new Set(["--fields", "--log-level", "--completions"])

const skipFlag = (args: readonly string[], index: number): number => {
  const token = args[index]
  if (token === undefined) {
    return index
  }
  if (token === "--") {
    return index + 1
  }
  if (!token.includes("=") && valueFlags.has(token)) {
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

const hasJsonFlag = (args: readonly string[]): boolean =>
  args.some((arg) => arg === "--json" || arg === "--json=true")

const reportInvalidForm = (form: InvalidForm, json: boolean): Effect.Effect<void> =>
  errorLine("validation", form.message, form.hint).pipe(Effect.provideService(JsonOutput, json))

export { detectInvalidForm, hasJsonFlag, reportInvalidForm }
