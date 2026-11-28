import { Command } from "effect/cli"

import { withAgentNotes } from "@/cli/help"
import { applySpec } from "@/cli/issue/apply"
import { closeSpec } from "@/cli/issue/close"
import { commentSpec } from "@/cli/issue/comment"
import { createSpec } from "@/cli/issue/create"
import { handoffSpec } from "@/cli/issue/handoff"
import { listSpec } from "@/cli/issue/list"
import { publishSpec } from "@/cli/issue/publish"
import { readSpec } from "@/cli/issue/read"
import { relateSpec } from "@/cli/issue/relate"
import { searchSpec } from "@/cli/issue/search"
import { startSpec } from "@/cli/issue/start"
import { Format, OutputSelect, buildCommand } from "@/cli/runner"

const issueCommand = buildCommand(readSpec).pipe(
  Command.withDescription("Read and write Linear issues"),
  Command.withSubcommands([
    buildCommand(listSpec),
    buildCommand(searchSpec),
    buildCommand(createSpec),
    buildCommand(publishSpec),
    buildCommand(startSpec),
    buildCommand(handoffSpec),
    buildCommand(closeSpec),
    buildCommand(applySpec),
    buildCommand(relateSpec),
    buildCommand(commentSpec),
  ]),
  Command.withGlobalFlags([Format, OutputSelect]),
  withAgentNotes,
)

export { issueCommand }
