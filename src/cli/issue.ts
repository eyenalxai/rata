import { Command } from "effect/cli"

import { OutputFields } from "@/cli/fields"
import { withAgentNotes } from "@/cli/help"
import { issueLabelCommand } from "@/cli/issue-label"
import { linkCommand, unlinkCommand } from "@/cli/issue-link"
import { assignCommand, closeCommand, reopenCommand, unassignCommand } from "@/cli/issue-transition"
import { createCommand } from "@/cli/issue-write/create"
import { updateCommand } from "@/cli/issue-write/update"
import { commentCommand } from "@/cli/issue/comment"
import { listSpec } from "@/cli/issue/list"
import { readSpec } from "@/cli/issue/read"
import { searchSpec } from "@/cli/issue/search"
import { sectionCommand } from "@/cli/issue/section"
import { JsonOutput } from "@/cli/output"
import { Format, OutputSelect, buildCommand } from "@/cli/runner"

const issueCommand = buildCommand(readSpec).pipe(
  Command.withDescription("Read and write Linear issues"),
  Command.withSubcommands([
    buildCommand(listSpec),
    buildCommand(searchSpec),
    createCommand,
    commentCommand,
    updateCommand,
    sectionCommand,
    issueLabelCommand,
    withAgentNotes(closeCommand),
    withAgentNotes(reopenCommand),
    withAgentNotes(assignCommand),
    withAgentNotes(unassignCommand),
    linkCommand,
    unlinkCommand,
  ]),
  Command.withGlobalFlags([Format, OutputSelect, JsonOutput, OutputFields]),
  withAgentNotes,
)

export { issueCommand }
