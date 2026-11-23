import type { Command as CliCommand } from "effect/cli"

import type { OutputFormat } from "@/cli/spec"

import { jsonEnabled } from "@/cli/pre-parse"

const valueGlobalFlags = new Set([
  "--fields",
  "--format",
  "--select",
  "--completions",
  "--log-level",
])
const booleanGlobalFlags = new Set([
  "--help",
  "-h",
  "--version",
  "-v",
  "--wizard",
  "--json",
  "--no-json",
])
const falseLiterals = new Set(["false", "no", "off", "0", "n"])
const legacyIssueGroups = new Set(["create", "close"])

type ScannedArgs = {
  tokens: string[]
  validFlags: boolean
  format: OutputFormat | undefined
  hasNewOutputFlag: boolean
  hasOldOutputFlag: boolean
}

const scanFlag = (args: readonly string[], index: number, state: ScannedArgs): number => {
  const token = args[index] ?? ""
  const [name, inline] = token.split("=", 2)
  if (name === undefined) {
    state.validFlags = false
    return index + 1
  }
  if (name === "--format") {
    state.hasNewOutputFlag = true
    const value = inline ?? args[index + 1]
    if (value === "json" || value === "text") {
      state.format = value
    }
    return inline === undefined ? index + 2 : index + 1
  }
  if (name === "--select") {
    state.hasNewOutputFlag = true
    return inline === undefined ? index + 2 : index + 1
  }
  if (name === "--json" || name === "--no-json" || name === "--fields") {
    state.hasOldOutputFlag = true
  }
  if (valueGlobalFlags.has(name)) {
    return inline === undefined ? index + 2 : index + 1
  }
  if (!booleanGlobalFlags.has(name)) {
    state.validFlags = false
    return index + 1
  }
  const next = args[index + 1]
  return inline === undefined &&
    name !== "--no-json" &&
    next !== undefined &&
    falseLiterals.has(next)
    ? index + 2
    : index + 1
}

const scanArgs = (args: readonly string[]): ScannedArgs => {
  const state: ScannedArgs = {
    tokens: [],
    validFlags: true,
    format: undefined,
    hasNewOutputFlag: false,
    hasOldOutputFlag: false,
  }
  let index = 0
  while (index < args.length) {
    const token = args[index]
    if (token === undefined || token === "--") {
      break
    }
    if (token.startsWith("-")) {
      index = scanFlag(args, index, state)
      continue
    }
    state.tokens.push(token)
    index += 1
  }
  return state
}

const isLegacyScanned = (scanned: ScannedArgs): boolean => {
  if (scanned.tokens[0] !== "issue") {
    return false
  }
  const group = scanned.tokens[1]
  return group !== undefined && legacyIssueGroups.has(group)
}

const isLegacyIssueCommand = (args: readonly string[]): boolean => isLegacyScanned(scanArgs(args))

const isIssueReadCommand = (args: readonly string[]): boolean => {
  const scanned = scanArgs(args)
  return scanned.tokens[0] === "issue" && !isLegacyScanned(scanned)
}

const formatFromArgs = (args: readonly string[], stdoutIsTerminal: boolean): OutputFormat => {
  const scanned = scanArgs(args)
  if (scanned.format !== undefined) {
    return scanned.format
  }
  if (isLegacyIssueCommand(args)) {
    return jsonEnabled(args) ? "json" : "text"
  }
  if (jsonEnabled(args) || !stdoutIsTerminal) {
    return "json"
  }
  return "text"
}

const helpRequested = (args: readonly string[]): boolean =>
  args.includes("--help") || args.includes("-h")

const hasNewOutputFlag = (args: readonly string[]): boolean => scanArgs(args).hasNewOutputFlag

const hasOldOutputFlag = (args: readonly string[]): boolean => scanArgs(args).hasOldOutputFlag

const isBareInvocation = (root: CliCommand.Command.Any, args: readonly string[]): boolean => {
  const scanned = scanArgs(args)
  if (!scanned.validFlags) {
    return false
  }
  let current = root
  for (const token of scanned.tokens) {
    const child = current.subcommands
      .flatMap((group) => group.commands)
      .find((command) => command.name === token)
    if (child === undefined) {
      return false
    }
    current = child
  }
  return current.subcommands.length > 0
}

export {
  formatFromArgs,
  hasNewOutputFlag,
  hasOldOutputFlag,
  helpRequested,
  isBareInvocation,
  isIssueReadCommand,
  isLegacyIssueCommand,
}
