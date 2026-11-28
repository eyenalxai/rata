import { Context, Effect, Ref } from "effect"

import type { CliExit } from "@/cli/spec"

class ExitRef extends Context.Service<ExitRef, Ref.Ref<CliExit>>()("rata-cli/cli/exit/ExitRef") {}

const successExit: CliExit = { code: 0 }

const recordExit = Effect.fn("Cli.recordExit")(function* recordCliExit(exit: CliExit) {
  const ref = yield* ExitRef
  yield* Ref.set(ref, exit)
  return exit
})

export { ExitRef, recordExit, successExit }
