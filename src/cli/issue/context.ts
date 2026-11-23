import { Console, Effect } from "effect"

import type { ResolveOptions } from "@/context/resolve/model"

import { ContextResolver } from "@/context/resolve"

const resolveIssueContext = Effect.fn("Cli.IssueRead.resolveContext")(function* resolveContext(
  options: ResolveOptions,
) {
  const resolver = yield* ContextResolver
  const context = yield* resolver.resolve(options)
  if (context.warning !== null) {
    yield* Console.error(`warning: ${context.warning}`)
  }
  return context
})

export { resolveIssueContext }
