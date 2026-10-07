import { Effect } from "effect"
import { Prompt } from "effect/cli"

const runPrompt = Effect.fn("Prompt.runPrompt")(function* runPrompt<A>(prompt: Prompt.Prompt<A>) {
  return yield* Prompt.run(prompt).pipe(Effect.catchTag("QuitError", () => Effect.interrupt))
})

export { runPrompt }
