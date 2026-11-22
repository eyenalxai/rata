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
const migratedCommandNames = new Set([
  "auth",
  "whoami",
  "status",
  "config",
  "link",
  "unlink",
  "workspace",
  "team",
  "project",
  "label",
])
const workSurfaceCommandNames = new Set(["issue", "search", "next", "why"])

type ScannedArgs = {
  readonly tokens: readonly string[]
  readonly validFlags: boolean
}

const scanArgs = (args: readonly string[]): ScannedArgs => {
  const tokens: string[] = []
  let validFlags = true
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (token === undefined || token === "--") {
      break
    }
    if (token.startsWith("-")) {
      const [name, inline] = token.split("=", 2)
      if (name === undefined) {
        validFlags = false
        continue
      }
      if (valueGlobalFlags.has(name)) {
        if (inline === undefined) {
          index += 1
        }
        continue
      }
      if (!booleanGlobalFlags.has(name)) {
        validFlags = false
      }
      continue
    }
    tokens.push(token)
  }
  return { tokens, validFlags }
}

const topLevelCommand = (args: readonly string[]): string | undefined => scanArgs(args).tokens[0]

const formatFromArgs = (args: readonly string[], stdoutIsTerminal: boolean): OutputFormat => {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (token === undefined || token === "--") {
      break
    }
    if (token === "--format") {
      const value = args[index + 1]
      if (value === "json" || value === "text") {
        return value
      }
    }
    if (token.startsWith("--format=")) {
      const value = token.slice("--format=".length)
      if (value === "json" || value === "text") {
        return value
      }
    }
  }
  if (jsonEnabled(args)) {
    return "json"
  }
  const command = topLevelCommand(args)
  return command !== undefined && migratedCommandNames.has(command) && !stdoutIsTerminal
    ? "json"
    : "text"
}

const helpRequested = (args: readonly string[]): boolean =>
  args.includes("--help") || args.includes("-h")

const hasNewOutputFlag = (args: readonly string[]): boolean =>
  args.some(
    (token) =>
      token === "--format" ||
      token.startsWith("--format=") ||
      token === "--select" ||
      token.startsWith("--select="),
  )

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

const isWorkSurfaceCommand = (args: readonly string[]): boolean => {
  const command = topLevelCommand(args)
  return command !== undefined && workSurfaceCommandNames.has(command)
}

export {
  formatFromArgs,
  hasNewOutputFlag,
  helpRequested,
  isBareInvocation,
  isWorkSurfaceCommand,
  topLevelCommand,
}
