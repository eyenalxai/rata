import { Effect, Terminal } from "effect"

import { writeLine } from "@/cli/output"

const affirmativeAnswers = new Set(["y", "yes"])

const isConfirmed = (answer: string): boolean => affirmativeAnswers.has(answer.trim().toLowerCase())

const confirm = Effect.fn("Cli.Confirm.confirm")(function* confirm(prompt: string, yes: boolean) {
  if (yes) {
    return true
  }
  yield* writeLine(`${prompt} [y/N]`)
  const terminal = yield* Terminal.Terminal
  const answer = yield* terminal.readLine.pipe(
    Effect.catchTag("QuitError", () => Effect.succeed("")),
  )
  return isConfirmed(answer)
})

export { confirm, isConfirmed }
