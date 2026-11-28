import { describe, expect, test } from "bun:test"
import { Effect, FileSystem, Layer, Option, Stdio } from "effect"

import { readBodyInput } from "@/cli/input"

const files = new Map([["notes.md", "from the file"]])

const layer = Layer.mergeAll(
  FileSystem.layerNoop({
    readFileString: (file) => Effect.succeed(files.get(file) ?? ""),
  }),
  Stdio.layerTest({}),
)

const read = (bodyFile: Option.Option<string>) =>
  readBodyInput(bodyFile).pipe(Effect.provide(layer), Effect.runPromise)

describe("readBodyInput", () => {
  test("reads the body file", async () => {
    expect(await read(Option.some("notes.md"))).toEqual(Option.some("from the file"))
  })

  test("returns none when the flag is not set", async () => {
    expect(await read(Option.none())).toEqual(Option.none())
  })
})
