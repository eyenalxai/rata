import { Effect, Option } from "effect"

import { objectField, scalarField } from "@/cli/field/shape"
import { defineCommand, resourceOutput } from "@/cli/spec"
import { currentDirectory, RepoConfigService } from "@/config/repo"
import { TrackerError } from "@/domain/error"

const unlinkSpec = defineCommand("unlink", {
  summary: "Remove the stored link of this repository",
  examples: [
    {
      command: "rata unlink",
      description: "Remove the stored team, project and workspace of this repository",
    },
    {
      command: "rata unlink --format json",
      description: "Print the removed link as JSON",
    },
  ],
  input: {},
  output: resourceOutput(
    objectField({
      team: scalarField,
      project: scalarField,
      workspace: scalarField,
    }),
  ),
  run: () =>
    Effect.gen(function* unlink() {
      const repoConfig = yield* RepoConfigService
      const directory = yield* currentDirectory
      const existing = yield* repoConfig.read(directory)
      if (Option.isNone(existing)) {
        return yield* new TrackerError({
          code: "not_linked",
          message: "No repository link. Run `rata link` to link this repository.",
          hint: null,
        })
      }
      const removed = yield* repoConfig.remove(directory)
      if (!removed) {
        return yield* new TrackerError({
          code: "not_linked",
          message: "No repository link. Run `rata link` to link this repository.",
          hint: null,
        })
      }
      const link = existing.value
      return {
        kind: "resource",
        value: {
          team: link.team ?? null,
          project: link.project ?? null,
          workspace: link.workspace ?? null,
        },
        text: [
          link.team === undefined
            ? "Unlinked this repository."
            : `Unlinked ${link.team} from this repository.`,
        ],
      }
    }),
})

export { unlinkSpec }
