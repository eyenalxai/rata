import { Effect } from "effect"
import { Prompt } from "effect/cli"

import { runPrompt } from "@/config/prompt"

const confirm = Effect.fn("Cli.Confirm.confirm")(function* confirm(prompt: string, yes: boolean) {
  if (yes) {
    return true
  }
  return yield* runPrompt(Prompt.Confirm({ message: prompt }))
})

export { confirm }
