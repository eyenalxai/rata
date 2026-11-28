import { Effect, Schema, Stdio } from "effect"
import { Prompt } from "effect/cli"

import { runPrompt } from "@/config/prompt"

class PromptRequiredError extends Schema.TaggedError<PromptRequiredError>()("PromptRequiredError", {
  code: Schema.tag("validation"),
  message: Schema.String,
}) {}

const confirm = Effect.fn("Cli.Confirm.confirm")(function* confirm(prompt: string, yes: boolean) {
  if (yes) {
    return true
  }
  const stdinIsTerminal = yield* Stdio.Stdio.use((stdio) => stdio.stdinIsTerminal)
  if (!stdinIsTerminal) {
    return yield* new PromptRequiredError({
      message: "This command needs confirmation, but standard input is not a terminal.",
    })
  }
  return yield* runPrompt(Prompt.Confirm({ message: prompt }))
})

export { PromptRequiredError, confirm }
