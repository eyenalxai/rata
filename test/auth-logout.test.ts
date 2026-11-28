import type { ProfileSeed } from "@test/database-harness"
import type { MemorySeed } from "@test/fake-linear/gateway/model"

import { lastJson, runRootMemory } from "@test/cli-harness"
import { defaultViewer } from "@test/fake-linear/model"
import { afterEach, describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"

import { Viewer } from "@/linear/decode/viewer"

const viewer = Option.getOrThrow(Schema.decodeUnknownOption(Viewer)(defaultViewer))
const seed: MemorySeed = { viewer, teams: [], labels: [] }

const profiles: readonly ProfileSeed[] = [
  { name: "alpha", apiKey: "alpha-key" },
  { name: "default", apiKey: "default-key", isDefault: true },
]

const runLogout = async (args: readonly string[], stored: readonly ProfileSeed[] = profiles) => {
  const lines: string[] = []
  await runRootMemory(seed, ["admin", "auth", "logout", ...args], lines, [], { profiles: stored })
  return lines
}

afterEach(() => {
  process.exitCode = 0
})

describe("auth logout output", () => {
  test("prints the removed profile and the promoted default", async () => {
    const lines = await runLogout([])

    expect(lines).toEqual(['Removed the workspace "default".', "Default workspace: alpha."])
  })

  test("prints the result shape as JSON", async () => {
    const lines = await runLogout(["--format", "json"])

    expect(lastJson(lines)).toEqual({
      removed: "default",
      defaultProfile: "alpha",
      remaining: 1,
    })
  })

  test("prints a null defaultProfile when the last profile is removed", async () => {
    const lines = await runLogout(
      ["--format", "json"],
      [{ name: "default", apiKey: "default-key", isDefault: true }],
    )

    expect(lastJson(lines)).toEqual({
      removed: "default",
      defaultProfile: null,
      remaining: 0,
    })
  })

  test("does not claim that no profile remains when only the default is missing", async () => {
    const stored: readonly ProfileSeed[] = [
      { name: "alpha", apiKey: "alpha-key" },
      { name: "work", apiKey: "work-key" },
    ]

    const text = await runLogout(["--workspace", "work"], stored)
    const json = await runLogout(["--workspace", "work", "--format", "json"], stored)

    expect(text).toEqual([
      'Removed the workspace "work".',
      "No default workspace. Run `rata admin workspace use <name>`.",
    ])
    expect(lastJson(json)).toEqual({
      removed: "work",
      defaultProfile: null,
      remaining: 1,
    })
  })
})
