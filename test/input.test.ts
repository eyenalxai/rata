import { describe, expect, test } from "bun:test"
import { Effect, FileSystem, Layer, Option, Stdio } from "effect"

import { readBodyInput } from "@/cli/input"
import { TrackerError } from "@/domain/error"

const files = new Map([["notes.md", "from the file"]])

const layer = Layer.mergeAll(
  FileSystem.layerNoop({
    readFileString: (file) => Effect.succeed(files.get(file) ?? ""),
  }),
  Stdio.layerTest({}),
)

const read = (body: Option.Option<string>, bodyFile: Option.Option<string>) =>
  readBodyInput(body, bodyFile).pipe(Effect.provide(layer), Effect.runPromise)

describe("readBodyInput", () => {
  test("returns the inline body", async () => {
    expect(await read(Option.some("inline text"), Option.none())).toEqual(
      Option.some("inline text"),
    )
  })

  test("reads the body file", async () => {
    expect(await read(Option.none(), Option.some("notes.md"))).toEqual(Option.some("from the file"))
  })

  test("returns none when neither flag is set", async () => {
    expect(await read(Option.none(), Option.none())).toEqual(Option.none())
  })

  test("fails when both flags are set", async () => {
    const error = await readBodyInput(Option.some("inline"), Option.some("notes.md")).pipe(
      Effect.provide(layer),
      Effect.flip,
      Effect.runPromise,
    )

    expect(error).toBeInstanceOf(TrackerError)
    expect(error.message).toBe("Pass --body or --body-file, not both.")
  })
})
