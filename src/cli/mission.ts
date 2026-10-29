import { Command } from "effect/cli"

import { OutputFields } from "@/cli/fields"
import { initCommand } from "@/cli/mission/init"
import { JsonOutput } from "@/cli/output"

const missionCommand = Command.make("mission").pipe(
  Command.withDescription("Read and write the mission state of an issue"),
  Command.withSubcommands([initCommand]),
  Command.withGlobalFlags([JsonOutput, OutputFields]),
)

export { missionCommand }
