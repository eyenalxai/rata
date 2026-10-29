import { Effect, Option } from "effect"
import { Command } from "effect/cli"

import { OutputFields, rejectFields } from "@/cli/fields"
import { JsonOutput, errorLine, reportFailure, writeJson, writeLine } from "@/cli/output"
import { currentDirectory, RepoConfigService } from "@/config/repo"

const reportNotLinked = errorLine(
  "not_linked",
  "No repository link. Run `rata link` to link this repository.",
)

const unlinkCommand = Command.make("unlink", {}, () =>
  Effect.gen(function* unlink() {
    const json = yield* JsonOutput
    yield* rejectFields(yield* OutputFields)
    const repoConfig = yield* RepoConfigService
    const directory = yield* currentDirectory
    const existing = yield* repoConfig.read(directory)
    if (Option.isNone(existing)) {
      return yield* reportNotLinked
    }
    const removed = yield* repoConfig.remove(directory)
    if (!removed) {
      return yield* reportNotLinked
    }
    const link = existing.value
    if (json) {
      return yield* writeJson({
        team: link.team ?? null,
        project: link.project ?? null,
        workspace: link.workspace ?? null,
      })
    }
    return yield* writeLine(
      link.team === undefined
        ? "Unlinked this repository."
        : `Unlinked ${link.team} from this repository.`,
    )
  }).pipe(Effect.catch(reportFailure)),
).pipe(
  Command.withDescription("Remove the stored link of this repository"),
  Command.withExamples([
    {
      command: "rata unlink",
      description: "Remove the stored team, project and workspace of this repository",
    },
    {
      command: "rata unlink --json",
      description: "Print the removed link as JSON",
    },
  ]),
  Command.withGlobalFlags([JsonOutput, OutputFields]),
)

export { unlinkCommand }
