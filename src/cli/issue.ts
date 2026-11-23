import { Command } from "effect/cli"

import { OutputFields } from "@/cli/fields"
import { withAgentNotes } from "@/cli/help"
import { closeCommand } from "@/cli/issue-transition"
import { createCommand } from "@/cli/issue-write/create"
import { applySpec } from "@/cli/issue/apply"
import { commentSpec } from "@/cli/issue/comment"
import { listSpec } from "@/cli/issue/list"
import { readSpec } from "@/cli/issue/read"
import { relateSpec } from "@/cli/issue/relate"
import { searchSpec } from "@/cli/issue/search"
import { JsonOutput } from "@/cli/output"
import { Format, OutputSelect, buildCommand } from "@/cli/runner"

const issueCommand = buildCommand(readSpec).pipe(
  Command.withDescription("Read and write Linear issues"),
  Command.withSubcommands([
    buildCommand(listSpec),
    buildCommand(searchSpec),
    createCommand,
    withAgentNotes(closeCommand),
    buildCommand(applySpec),
    buildCommand(relateSpec),
    buildCommand(commentSpec),
  ]),
  Command.withGlobalFlags([Format, OutputSelect, JsonOutput, OutputFields]),
  withAgentNotes,
)

export { issueCommand }
