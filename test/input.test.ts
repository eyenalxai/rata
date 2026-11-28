import { describe, expect, test } from "bun:test"
import { Effect, FileSystem, Layer, Option, Stdio, Stream } from "effect"

import { readBodyInput } from "@/cli/input"

const files = new Map([["notes.md", "from the file"]])

const layer = Layer.mergeAll(
  FileSystem.layerNoop({
    readFileString: (file) => Effect.succeed(files.get(file) ?? ""),
  }),
  Stdio.layerTest({}),
)

const stdinLayer = Layer.mergeAll(
  FileSystem.layerNoop({}),
  Stdio.layerTest({ stdin: Stream.make(new TextEncoder().encode("Body from stdin\n")) }),
)

const read = (bodyFile: Option.Option<string>) =>
  readBodyInput(bodyFile).pipe(Effect.provide(layer), Effect.runPromise)

const readFromStdin = (bodyFile: Option.Option<string>) =>
  readBodyInput(bodyFile).pipe(Effect.provide(stdinLayer), Effect.runPromise)

describe("readBodyInput", () => {
  test("reads the body file", async () => {
    expect(await read(Option.some("notes.md"))).toEqual(Option.some("from the file"))
  })

  test("returns none when the flag is not set", async () => {
    expect(await read(Option.none())).toEqual(Option.none())
  })

  test("reads the body from standard input for -", async () => {
    expect(await readFromStdin(Option.some("-"))).toEqual(Option.some("Body from stdin"))
  })
})
