import type { GraphQLRequest, Handler } from "@test/fake-linear-model"

import { apiLayer, makeFakeLinear } from "@test/fake-linear"
import { recordingConsole } from "@test/recording-console"
import { afterEach, describe, expect, test } from "bun:test"
import { Console, Effect, FileSystem, Layer, Path, Stdio, Terminal } from "effect"
import { Command } from "effect/cli"
import { ChildProcessSpawner } from "effect/process"

import { projectCommand } from "@/cli/project"

const tracker = { id: "project-1", name: "Tracker", progress: 0.5, status: { name: "Started" } }

const cliLayer = (
  handler: Handler,
  args: readonly string[],
  lines: string[],
  readLine: Effect.Effect<string, Terminal.QuitError>,
) =>
  Layer.mergeAll(
    apiLayer(handler, { stdio: { args: Effect.succeed(args) } }),
    FileSystem.layerNoop({}),
    Path.layer,
    Stdio.layerTest({ args: Effect.succeed(args) }),
    Layer.succeed(
      Terminal.Terminal,
      Terminal.make({
        columns: Effect.succeed(80),
        rows: Effect.succeed(24),
        readInput: Effect.die("unused"),
        readLine,
        display: () => Effect.void,
      }),
    ),
    Layer.succeed(
      ChildProcessSpawner.ChildProcessSpawner,
      ChildProcessSpawner.make(() => Effect.die("unused")),
    ),
    Layer.succeed(Console.Console, recordingConsole(lines)),
  )

const runProject = (
  handler: Handler,
  args: readonly string[],
  lines: string[],
  readLine: Effect.Effect<string, Terminal.QuitError> = Effect.die("unused"),
) =>
  Command.run(projectCommand, { version: "test" }).pipe(
    Effect.provide(cliLayer(handler, args, lines, readLine)),
    Effect.runPromise,
  )

const lastJson = (lines: readonly string[]): unknown => JSON.parse(lines.at(-1) ?? "")

const deleteMutation = (requests: readonly GraphQLRequest[]): GraphQLRequest | undefined =>
  requests.find((request) => request.query.includes("mutation ProjectDelete"))

afterEach(() => {
  process.exitCode = 0
})

describe("project delete", () => {
  test("prompts with the project name and deletes on yes", async () => {
    const fake = makeFakeLinear({ teams: [], labels: [], projects: [tracker] })
    const lines: string[] = []
    await runProject(fake.handler, ["delete", "tracker"], lines, Effect.succeed("y"))
    expect(lines).toEqual([
      "Delete project Tracker (project-1)? [y/N]",
      "Deleted Tracker (project-1).",
    ])
    expect(deleteMutation(fake.requests)?.variables).toEqual({ id: "project-1" })
  })

  test("aborts without a mutation when the answer is not yes", async () => {
    const fake = makeFakeLinear({ teams: [], labels: [], projects: [tracker] })
    const lines: string[] = []
    await runProject(fake.handler, ["delete", "Tracker"], lines, Effect.succeed("no"))
    expect(lines).toEqual(["Delete project Tracker (project-1)? [y/N]", "Aborted."])
    expect(deleteMutation(fake.requests)).toBeUndefined()
  })

  test("skips the prompt with --yes and prints JSON", async () => {
    const fake = makeFakeLinear({ teams: [], labels: [], projects: [tracker] })
    const lines: string[] = []
    await runProject(fake.handler, ["delete", "Tracker", "--yes", "--json"], lines)
    expect(lines).toHaveLength(1)
    expect(lastJson(lines)).toEqual({ deleted: { id: "project-1", name: "Tracker" } })
    expect(deleteMutation(fake.requests)?.variables).toEqual({ id: "project-1" })
  })

  test("points at project list when no project matches", async () => {
    const fake = makeFakeLinear({ teams: [], labels: [] })
    const lines: string[] = []
    await runProject(fake.handler, ["delete", "Nope", "--yes"], lines)
    expect(lines).toEqual([
      "error: No project named Nope. Run `rata project list` to see the projects.",
    ])
    expect(process.exitCode).toBe(1)
    expect(deleteMutation(fake.requests)).toBeUndefined()
  })

  test("points at project restore when the project is in the trash", async () => {
    const trashed = { ...tracker, trashed: true }
    const fake = makeFakeLinear({ teams: [], labels: [], projects: [trashed] })
    const lines: string[] = []
    await runProject(fake.handler, ["delete", "Tracker", "--yes"], lines)
    expect(lines).toEqual([
      "error: The project Tracker (project-1) is in the trash. Run `rata project restore` to bring it back.",
    ])
    expect(process.exitCode).toBe(1)
    expect(deleteMutation(fake.requests)).toBeUndefined()
  })

  test("asks for the UUID when several live projects share the name", async () => {
    const other = { ...tracker, id: "project-2" }
    const fake = makeFakeLinear({ teams: [], labels: [], projects: [tracker, other] })
    const lines: string[] = []
    await runProject(fake.handler, ["delete", "Tracker", "--yes"], lines)
    expect(lines).toEqual([
      "error: More than one live project is named Tracker. Pass the project UUID instead.",
    ])
    expect(process.exitCode).toBe(1)
    expect(deleteMutation(fake.requests)).toBeUndefined()
  })
})
