import type { Cause } from "effect"

import { Effect, Option, Queue, Terminal } from "effect"

const key = (name: string): Terminal.UserInput => ({
  input: Option.none(),
  key: { name, ctrl: false, meta: false, shift: false },
})

const typed = (value: string): Terminal.UserInput => ({
  input: Option.some(value),
  key: { name: value, ctrl: false, meta: false, shift: false },
})

const ctrlC = (): Terminal.UserInput => ({
  input: Option.some("\u0003"),
  key: { name: "c", ctrl: true, meta: false, shift: false },
})

const fakeTerminal = (
  input: readonly Terminal.UserInput[],
  output: string[] = [],
): Terminal.Terminal => {
  let shared = Option.none<Queue.Queue<Terminal.UserInput, Cause.Done>>()
  return Terminal.make({
    columns: Effect.succeed(80),
    rows: Effect.succeed(24),
    readInput: Effect.gen(function* readInput() {
      if (Option.isSome(shared)) {
        return shared.value
      }
      const queue = yield* Queue.make<Terminal.UserInput, Cause.Done>()
      yield* Queue.offerAll(queue, input)
      yield* Queue.end(queue)
      shared = Option.some(queue)
      return queue
    }),
    readLine: Effect.die("unused"),
    display: (text) =>
      Effect.sync(() => {
        output.push(text)
      }),
  })
}

export { ctrlC, fakeTerminal, key, typed }
