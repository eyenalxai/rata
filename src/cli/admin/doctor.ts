import { Effect, FileSystem, Path } from "effect"
import { Flag } from "effect/cli"

import type { Surface } from "@/cli/surface"

import { arrayField, objectField, scalarField } from "@/cli/field/shape"
import { defineCommand, resourceOutput } from "@/cli/spec"
import { currentDirectory } from "@/config/repo"
import { RepositoryIdentity } from "@/config/repo-identity"
import { buildTrackerBlock, replaceGeneratedBlock, trackerMarkers } from "@/docs/blocks"
import { checkTrackerCommands, describeCheck, doctorValue } from "@/docs/check"
import { TrackerError } from "@/domain/error"

const writeFlag = Flag.Boolean("write").pipe(
  Flag.withDescription("Rewrite the generated command block in the tracker document"),
  Flag.withDefault(false),
)

const readError = (file: string) => (cause: unknown) =>
  new TrackerError({
    code: "internal",
    message: `Could not read ${file}.`,
    hint: null,
    cause,
  })

const writeError = (file: string) => (cause: unknown) =>
  new TrackerError({
    code: "internal",
    message: `Could not write ${file}.`,
    hint: null,
    cause,
  })

const makeDoctorSpec = (surface: () => Surface) =>
  defineCommand("doctor", {
    summary: "Check the tracker document and repair its generated command block",
    examples: [
      {
        command: "rata admin doctor",
        description: "Report stale command forms in the tracker document",
      },
      {
        command: "rata admin doctor --write",
        description: "Rewrite the generated command block",
      },
    ],
    input: { write: writeFlag },
    output: resourceOutput(
      objectField({
        document: scalarField,
        healthy: scalarField,
        stale: arrayField(
          objectField({
            command: scalarField,
            replacement: scalarField,
          }),
        ),
        block: objectField({
          present: scalarField,
          fresh: scalarField,
        }),
        written: scalarField,
      }),
    ),
    run: (input) =>
      Effect.gen(function* checkDocument() {
        const identity = yield* RepositoryIdentity
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const directory = yield* currentDirectory
        const location = yield* identity.locate(directory)
        const file = path.join(location.root, "docs", "agents", "issue-tracker.md")
        const exists = yield* fs.exists(file)
        if (!exists) {
          return yield* new TrackerError({
            code: "not_found",
            message: `No tracker document at ${file}.`,
            hint: "Create docs/agents/issue-tracker.md first.",
          })
        }
        let content = yield* fs.readFileString(file).pipe(Effect.mapError(readError(file)))
        let written = false
        if (input.write) {
          const repaired = replaceGeneratedBlock(
            content,
            buildTrackerBlock(surface()),
            trackerMarkers,
          )
          if (repaired.error !== null) {
            return yield* new TrackerError({
              code: "validation",
              message: `${file}: ${repaired.error}`,
              hint: "Add both markers or remove the partial pair.",
            })
          }
          if (repaired.changed) {
            yield* fs
              .writeFileString(file, repaired.content)
              .pipe(Effect.mapError(writeError(file)))
            content = repaired.content
            written = true
          }
        }
        const check = checkTrackerCommands(content, surface())
        return {
          kind: "resource",
          value: { document: file, ...doctorValue(check), written },
          text: describeCheck(file, check, written),
        }
      }),
  })

export { makeDoctorSpec }
