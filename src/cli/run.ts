import { Console, Effect, Stdio } from "effect"
import { CliError, Command } from "effect/cli"

import { reportCliError } from "@/cli/exit"
import { setSuppressHelp } from "@/cli/help"
import { detectInvalidForm, jsonEnabled, reportInvalidForm } from "@/cli/pre-parse"
import { root } from "@/cli/root"

const helpRequested = (args: readonly string[]): boolean =>
  args.includes("--help") || args.includes("-h")

const dropEmptyLine = (base: Console.Console): Console.Console =>
  new Proxy(base, {
    get(target, property, receiver) {
      if (property === "log") {
        const log: unknown = Reflect.get(target, "log", target)
        if (typeof log !== "function") {
          return log
        }
        return (...args: readonly unknown[]) => {
          if (args.length === 1 && args[0] === "") {
            return
          }
          Reflect.apply(log, target, args)
        }
      }
      const value: unknown = Reflect.get(target, property, receiver)
      return value
    },
  })

const runCli = Effect.fn("Cli.run")(function* run(version: string) {
  const args = yield* Stdio.Stdio.use((stdio) => stdio.args)
  const invalid = detectInvalidForm(args)
  if (invalid !== undefined) {
    return yield* reportInvalidForm(invalid, jsonEnabled(args))
  }
  const json = jsonEnabled(args)
  const suppressHelp = json && !helpRequested(args)
  const console = yield* Console.Console
  setSuppressHelp(suppressHelp)
  return yield* Command.runWith(root, { version, renderErrors: false })(args).pipe(
    Effect.provideService(Console.Console, dropEmptyLine(console)),
    Effect.ensuring(
      Effect.sync(() => {
        setSuppressHelp(false)
      }),
    ),
    Effect.catchIf(CliError.isCliError, (error) => reportCliError(error, json)),
  )
})

export { runCli }
