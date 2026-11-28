import { lastJson, runRoot } from "@test/cli-harness"
import { makeFakeLinear } from "@test/fake-linear"
import { describe, expect, test } from "bun:test"
import { Stream } from "effect"

const fake = () => makeFakeLinear({ teams: [], labels: [] })

const encoder = new TextEncoder()

describe("admin api", () => {
  test("accepts a query from --query and returns the raw data", async () => {
    const linear = fake()
    const lines: string[] = []
    const exit = await runRoot(
      linear.handler,
      ["admin", "api", "--query", "query Viewer { viewer { id name } }", "--format", "json"],
      lines,
    )

    expect(lastJson(lines)).toMatchObject({
      data: { viewer: { id: "user-1", name: "Ada" } },
    })
    expect(exit.code).toBe(0)
  })

  test("accepts a query from standard input", async () => {
    const linear = fake()
    const lines: string[] = []
    const exit = await runRoot(
      linear.handler,
      ["admin", "api", "--format", "json"],
      lines,
      undefined,
      {
        stdio: {
          stdin: Stream.make(encoder.encode("query Viewer { viewer { id } }")),
        },
      },
    )

    expect(lastJson(lines)).toMatchObject({ data: { viewer: { id: "user-1" } } })
    expect(exit.code).toBe(0)
  })

  test("rejects a mutation before it sends a request", async () => {
    const linear = fake()
    const lines: string[] = []
    const exit = await runRoot(
      linear.handler,
      ["admin", "api", "--query", "mutation Create { issueCreate { id } }", "--format", "json"],
      lines,
    )

    expect(lastJson(lines)).toMatchObject({
      error: {
        code: "validation",
        message: "The admin api command rejects mutation operations.",
      },
    })
    expect(linear.requests).toHaveLength(0)
    expect(exit.code).toBe(2)
  })

  test("rejects a subscription before it sends a request", async () => {
    const linear = fake()
    const lines: string[] = []
    const exit = await runRoot(
      linear.handler,
      ["admin", "api", "--query", "subscription Watch { issues { id } }", "--format", "json"],
      lines,
    )

    expect(lastJson(lines)).toMatchObject({
      error: {
        code: "validation",
        message: "The admin api command rejects subscription operations.",
      },
    })
    expect(linear.requests).toHaveLength(0)
    expect(exit.code).toBe(2)
  })

  test("never prints the API key", async () => {
    const linear = fake()
    const lines: string[] = []
    const secret = "lin_api_super_secret"
    const exit = await runRoot(
      linear.handler,
      ["admin", "api", "--query", "query Viewer { viewer { id } }", "--format", "json"],
      lines,
      undefined,
      { env: { HOME: "/home/test", LINEAR_API_KEY: secret } },
    )

    expect(linear.requests[0]?.authorization).toBe(secret)
    expect(lines.join("\n")).not.toContain(secret)
    expect(exit.code).toBe(0)
  })
})
