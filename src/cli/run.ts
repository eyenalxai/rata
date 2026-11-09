import { Effect, Stdio } from "effect"
import { Command } from "effect/cli"

import { detectInvalidForm, hasJsonFlag, reportInvalidForm } from "@/cli/pre-parse"
import { root } from "@/cli/root"

const runCli = Effect.fn("Cli.run")(function* run(version: string) {
  const args = yield* Stdio.Stdio.use((stdio) => stdio.args)
  const invalid = detectInvalidForm(args)
  if (invalid !== undefined) {
    return yield* reportInvalidForm(invalid, hasJsonFlag(args))
  }
  return yield* Command.runWith(root, { version })(args)
})

export { runCli }
