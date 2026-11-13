import type { HelpDoc } from "effect/cli"

import { Context } from "effect"
import { CliOutput, Command } from "effect/cli"

const agentNotes = [
  "AGENT NOTES",
  "  --json prints one JSON document.",
  "  --dry-run prints the actions without writing.",
  "  --body-file - reads the body from standard input.",
  "  A list returns one page. Use --all to drain every page.",
].join("\n")

const AgentNotes = Context.Reference<boolean>("rata-cli/cli/help/AgentNotes", {
  defaultValue: () => false,
})

const withAgentNotes = <Name extends string, Input, E, R, ContextInput>(
  command: Command.Command<Name, Input, ContextInput, E, R>,
): Command.Command<Name, Input, ContextInput, E, R> => Command.annotate(command, AgentNotes, true)

const defaultFormatter = CliOutput.defaultFormatter()

const helpFormatter: CliOutput.Formatter = {
  formatHelpDoc: (doc: HelpDoc.HelpDoc) => {
    const text = defaultFormatter.formatHelpDoc(doc)
    return Context.get(doc.annotations, AgentNotes) ? `${text}\n\n${agentNotes}` : text
  },
  formatCliError: defaultFormatter.formatCliError,
  formatError: defaultFormatter.formatError,
  formatVersion: defaultFormatter.formatVersion,
  formatErrors: defaultFormatter.formatErrors,
}

const helpLayer = CliOutput.layer(helpFormatter)

export { helpLayer, withAgentNotes }
