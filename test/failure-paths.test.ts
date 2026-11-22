import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const directories: string[] = []

const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), "rata-failure-"))
  directories.push(directory)
  return directory
}

const baseEnv = (): Record<string, string | undefined> => {
  const env = { ...Bun.env }
  delete env.LINEAR_API_KEY
  return env
}

const run = async (
  args: readonly string[],
  overrides: Readonly<Record<string, string>>,
): Promise<{ readonly exitCode: number; readonly output: string }> => {
  const child = Bun.spawn([process.execPath, "src/main.ts", ...args], {
    cwd: path.resolve(import.meta.dir, ".."),
    env: { ...baseEnv(), ...overrides },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { exitCode, output: `${stdout}${stderr}`.trim() }
}

const errorCode = (output: string): unknown => {
  const parsed: unknown = JSON.parse(output)
  if (typeof parsed !== "object" || parsed === null) {
    return undefined
  }
  const error: unknown = Reflect.get(parsed, "error")
  return typeof error === "object" && error !== null ? Reflect.get(error, "code") : undefined
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe("failure paths", () => {
  test("reports a missing key as an auth error", async () => {
    const directory = await temporaryDirectory()
    const result = await run(["whoami", "--json"], {
      HOME: directory,
      XDG_DATA_HOME: path.join(directory, "data"),
    })

    expect(result.exitCode).toBe(5)
    expect(errorCode(result.output)).toBe("auth")
  })

  test("reports a database-open failure as internal for whoami", async () => {
    const result = await run(["whoami", "--json"], {
      HOME: "/proc",
      XDG_DATA_HOME: "/proc/data",
    })

    expect(result.exitCode).toBe(1)
    expect(errorCode(result.output)).toBe("internal")
  })

  test("reports a database-open failure as internal for a summary read", async () => {
    const result = await run(["issue", "show", "RAT-1", "--summary", "--json"], {
      HOME: "/proc",
      XDG_DATA_HOME: "/proc/data",
    })

    expect(result.exitCode).toBe(1)
    expect(errorCode(result.output)).toBe("internal")
  })
})
