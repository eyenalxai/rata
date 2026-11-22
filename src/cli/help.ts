import type { HelpDoc } from "effect/cli"

import { Context } from "effect"
import { CliOutput, Command } from "effect/cli"

const agentNotes = [
  "AGENT NOTES",
  "  Run `rata <command> --help` for the flags of this command.",
  "  --dry-run prints the actions without writing.",
  "  --body-file - reads the body from standard input.",
  "  A list returns one page. Use --all to drain every page.",
].join("\n")

const AgentNotes = Context.Reference<boolean>("rata-cli/cli/help/AgentNotes", {
  defaultValue: () => false,
})

const Selectable = Context.Reference<boolean>("rata-cli/cli/help/Selectable", {
  defaultValue: () => false,
})

const withAgentNotes = <Name extends string, Input, E, R, ContextInput>(
  command: Command.Command<Name, Input, ContextInput, E, R>,
): Command.Command<Name, Input, ContextInput, E, R> => Command.annotate(command, AgentNotes, true)

const withSelectable = <Name extends string, Input, E, R, ContextInput>(
  command: Command.Command<Name, Input, ContextInput, E, R>,
): Command.Command<Name, Input, ContextInput, E, R> => Command.annotate(command, Selectable, true)

const defaultFormatter = CliOutput.defaultFormatter()
const workSurfaceCommands = new Set(["issue", "search", "next", "why"])

const filterGlobalFlags = (doc: HelpDoc.HelpDoc): HelpDoc.HelpDoc => {
  const command = doc.usage.trim().split(/\s+/u)[1]
  const isWorkSurface = command !== undefined && workSurfaceCommands.has(command)
  const isLeaf = doc.subcommands === undefined || doc.subcommands.length === 0
  const selectable = Context.get(doc.annotations, Selectable)
  const globalFlags = doc.globalFlags?.filter((flag) => {
    if (flag.name === "format") {
      return !isWorkSurface
    }
    if (flag.name === "select") {
      return !isWorkSurface && (!isLeaf || selectable)
    }
    return true
  })
  return { ...doc, ...(globalFlags === undefined ? {} : { globalFlags }) }
}

let suppressHelp = false

const setSuppressHelp = (value: boolean): void => {
  suppressHelp = value
}

const helpFormatter: CliOutput.Formatter = {
  formatHelpDoc: (doc: HelpDoc.HelpDoc) => {
    if (suppressHelp) {
      return ""
    }
    const text = defaultFormatter.formatHelpDoc(filterGlobalFlags(doc))
    return Context.get(doc.annotations, AgentNotes) ? `${text}\n\n${agentNotes}` : text
  },
  formatCliError: defaultFormatter.formatCliError,
  formatError: defaultFormatter.formatError,
  formatVersion: defaultFormatter.formatVersion,
  formatErrors: defaultFormatter.formatErrors,
}

const helpLayer = CliOutput.layer(helpFormatter)

export { helpLayer, Selectable, setSuppressHelp, withAgentNotes, withSelectable }
