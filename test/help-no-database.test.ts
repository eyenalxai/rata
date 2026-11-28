import { afterEach, describe, expect, test } from "bun:test"
import { access, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const directories: string[] = []

const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), "rata-help-"))
  directories.push(directory)
  return directory
}

const exists = async (file: string): Promise<boolean> =>
  access(file).then(
    () => true,
    () => false,
  )

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe("--help", () => {
  test("does not open or create SQLite", async () => {
    const directory = await temporaryDirectory()
    const child = Bun.spawn([process.execPath, "src/main.ts", "--help"], {
      cwd: path.resolve(import.meta.dir, ".."),
      env: { HOME: directory, XDG_DATA_HOME: path.join(directory, "data") },
      stdout: "pipe",
      stderr: "pipe",
    })
    const stdout = await new Response(child.stdout).text()
    const exitCode = await child.exited

    expect(exitCode).toBe(0)
    expect(stdout).toContain("USAGE")
    expect(await exists(path.join(directory, "data", "rata", "rata.sqlite"))).toBe(false)
  })

  test("does not build the database layer when no data directory is set", async () => {
    const child = Bun.spawn([process.execPath, "src/main.ts", "--help"], {
      cwd: path.resolve(import.meta.dir, ".."),
      env: { PATH: "/usr/local/bin:/usr/bin:/bin" },
      stdout: "pipe",
      stderr: "pipe",
    })
    const stdout = await new Response(child.stdout).text()
    const stderr = await new Response(child.stderr).text()
    const exitCode = await child.exited

    expect(stderr).toBe("")
    expect(exitCode).toBe(0)
    expect(stdout).toContain("USAGE")
  })

  test("does not build a command layer for a subcommand help", async () => {
    const child = Bun.spawn([process.execPath, "src/main.ts", "admin", "team", "show", "--help"], {
      cwd: path.resolve(import.meta.dir, ".."),
      env: { PATH: "/usr/local/bin:/usr/bin:/bin" },
      stdout: "pipe",
      stderr: "pipe",
    })
    const stdout = await new Response(child.stdout).text()
    const stderr = await new Response(child.stderr).text()
    const exitCode = await child.exited

    expect(stderr).toBe("")
    expect(exitCode).toBe(0)
    expect(stdout).toContain("USAGE")
  })
})
