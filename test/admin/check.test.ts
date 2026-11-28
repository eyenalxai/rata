import { describe, expect, test } from "bun:test"

import { staleCommands } from "@/cli/docs/check"
import { surface } from "@/cli/registry"

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

  test("accepts every canonical form in the generated block", () => {
    const commands = surface()
      .roots.flatMap(function collect(node): string[] {
        return [`\`rata ${node.path.join(" ")}\``, ...node.children.flatMap(collect)]
      })
      .join("\n")
    expect(staleCommands(commands, surface())).toEqual([])
  })
})
