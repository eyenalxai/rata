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
type CommandClass = "admin" | "work-surface"

const commandClasses: Readonly<Record<string, CommandClass>> = {
  auth: "admin",
  whoami: "admin",
  status: "admin",
  config: "admin",
  link: "admin",
  unlink: "admin",
  workspace: "admin",
  team: "admin",
  project: "admin",
  label: "admin",
  issue: "work-surface",
  search: "work-surface",
  next: "work-surface",
  why: "work-surface",
}

type ScannedArgs = {
  readonly tokens: readonly string[]
  readonly validFlags: boolean
  readonly format: OutputFormat | undefined
  readonly hasNewOutputFlag: boolean
}

const commandClass = (name: string | undefined): CommandClass | undefined =>
  name !== undefined && Object.hasOwn(commandClasses, name) ? commandClasses[name] : undefined

const isWorkSurfaceName = (name: string | undefined): boolean =>
  commandClass(name) === "work-surface"

const scanArgs = (args: readonly string[]): ScannedArgs => {
  const tokens: string[] = []
  let validFlags = true
  let format: OutputFormat | undefined = undefined
  let hasNewOutputFlag = false
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
      if (name === "--format") {
        hasNewOutputFlag = true
        const value = inline ?? args[index + 1]
        if (inline === undefined) {
          index += 1
        }
        if (value === "json" || value === "text") {
          format = value
        }
        continue
      }
      if (name === "--select") {
        hasNewOutputFlag = true
        if (inline === undefined) {
          index += 1
        }
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
        continue
      }
      const next = args[index + 1]
      if (
        inline === undefined &&
        name !== "--no-json" &&
        next !== undefined &&
        falseLiterals.has(next)
      ) {
        index += 1
      }
      continue
    }
    tokens.push(token)
  }
  return { tokens, validFlags, format, hasNewOutputFlag }
}

const topLevelCommand = (args: readonly string[]): string | undefined => scanArgs(args).tokens[0]

const formatFromArgs = (args: readonly string[], stdoutIsTerminal: boolean): OutputFormat => {
  const scanned = scanArgs(args)
  if (scanned.format !== undefined) {
    return scanned.format
  }
  if (jsonEnabled(args)) {
    return "json"
  }
  const command = scanned.tokens[0]
  return command !== undefined && commandClass(command) === "admin" && !stdoutIsTerminal
    ? "json"
    : "text"
}

const helpRequested = (args: readonly string[]): boolean =>
  args.includes("--help") || args.includes("-h")

const hasNewOutputFlag = (args: readonly string[]): boolean => scanArgs(args).hasNewOutputFlag

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

const isWorkSurfaceCommand = (args: readonly string[]): boolean =>
  isWorkSurfaceName(topLevelCommand(args))

export {
  formatFromArgs,
  hasNewOutputFlag,
  helpRequested,
  isBareInvocation,
  isWorkSurfaceCommand,
  isWorkSurfaceName,
  topLevelCommand,
}
