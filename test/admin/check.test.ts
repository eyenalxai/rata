import { describe, expect, test } from "bun:test"

import { surface } from "@/cli/registry"
import { staleCommands } from "@/docs/check"

describe("stale command detection", () => {
  test("names the old comment subcommands", () => {
    expect(staleCommands("Run `rata issue comment create RAT-1`.", surface())).toEqual([
      {
        command: "rata issue comment create",
        replacement: "rata issue comment <ref> --body-file -",
      },
    ])
  })

  test("finds a command inside a pipeline", () => {
    expect(
      staleCommands("Run `printf '%s' done | rata team list --format json`.", surface()),
    ).toEqual([{ command: "rata team list", replacement: "rata admin team list" }])
  })

  test("finds a removed create flag", () => {
    expect(staleCommands("Run `rata issue create --json`.", surface())).toEqual([
      { command: "rata issue create --json", replacement: "rata issue create --format json" },
    ])
  })

  test("finds a removed close flag", () => {
    expect(staleCommands("Run `rata issue close --comment done`.", surface())).toEqual([
      { command: "rata issue close --comment", replacement: "rata issue close --comment-file" },
    ])
  })
})
