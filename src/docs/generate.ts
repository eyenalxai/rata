import { BunRuntime, BunServices } from "@effect/platform-bun"
import { Console, Effect, FileSystem, Stdio } from "effect"

import { surface } from "@/cli/registry"
import {
  blockContent,
  buildReferenceBlock,
  buildTrackerBlock,
  referenceMarkers,
  replaceGeneratedBlock,
  trackerMarkers,
} from "@/docs/blocks"

const program = Effect.gen(function* generateDocs() {
  const fs = yield* FileSystem.FileSystem
  const stdio = yield* Stdio.Stdio
  const args = yield* stdio.args
  const check = args.includes("--check")
  const commandSurface = surface()
  const documents = [
    {
      file: "skills/rata/reference.md",
      block: buildReferenceBlock(commandSurface),
      markers: referenceMarkers,
    },
    {
      file: "docs/agents/issue-tracker.md",
      block: buildTrackerBlock(commandSurface),
      markers: trackerMarkers,
    },
  ]
  let stale = false
  for (const document of documents) {
    const exists = yield* fs.exists(document.file)
    if (exists) {
      const content = yield* fs.readFileString(document.file)
      if (check) {
        if (blockContent(content, document.markers) === document.block) {
          yield* Console.log(`${document.file} is current.`)
        } else {
          yield* Console.error(`${document.file} is stale. Run \`bun run docs:generate\`.`)
          stale = true
        }
      } else {
        const repaired = replaceGeneratedBlock(content, document.block, document.markers)
        if (repaired.error !== null) {
          yield* Console.error(`${document.file}: ${repaired.error}`)
          stale = true
          continue
        }
        if (repaired.changed) {
          yield* fs.writeFileString(document.file, repaired.content)
          yield* Console.log(`Wrote ${document.file}.`)
        } else {
          yield* Console.log(`${document.file} is current.`)
        }
      }
    } else {
      yield* Console.error(`The document ${document.file} does not exist.`)
      stale = true
    }
  }
  if (stale) {
    yield* Effect.sync(() => {
      process.exitCode = 1
    })
  }
})

BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)))
