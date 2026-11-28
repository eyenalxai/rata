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

  test("does not name an invalid list flag replacement", () => {
    expect(staleCommands("Run `rata issue list --children`.", surface())).toEqual([
      {
        command: "rata issue list --children",
        replacement: "Read one issue with rata issue <ref> --full.",
      },
    ])
  })

  test("keeps the fields value in the select replacement", () => {
    expect(staleCommands("Run `rata issue list --fields id,title`.", surface())).toEqual([
      {
        command: "rata issue list --fields",
        replacement: "rata issue list --select id,title",
      },
    ])
  })

  test("finds a removed create body flag", () => {
    expect(staleCommands("Run `rata issue create --body Inline`.", surface())).toEqual([
      { command: "rata issue create --body", replacement: "Use --body-file -." },
    ])
  })
})
