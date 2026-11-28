import { Context, Effect, Ref } from "effect"

import type { CliExit } from "@/cli/spec"

const ExitRef = Context.Reference<Ref.Ref<CliExit | null> | null>("rata-cli/cli/exit/ExitRef", {
  defaultValue: () => null,
})

const successExit: CliExit = { code: 0, output: null, error: null }

const recordExit = (exit: CliExit): Effect.Effect<CliExit> =>
  Effect.gen(function* recordCliExit() {
    const ref = yield* ExitRef
    if (ref !== null) {
      yield* Ref.set(ref, exit)
    }
    return exit
  })

export { ExitRef, recordExit, successExit }
