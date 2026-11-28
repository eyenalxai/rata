import { Effect, Option, Schema, Stdio } from "effect"
import { Flag } from "effect/cli"

import { findWriteOperation } from "@/cli/admin/query"
import { objectField, scalarField } from "@/cli/field/shape"
import { readStandardInput } from "@/cli/input"
import { jsonText } from "@/cli/output"
import { defineCommand, resourceOutput } from "@/cli/spec"
import { TrackerError } from "@/domain/error"
import { LinearGateway } from "@/linear/gateway"

const queryFlag = Flag.String("query").pipe(
  Flag.withDescription("GraphQL query. Reads standard input when absent"),
  Flag.optional,
)

const apiSpec = defineCommand("api", {
  summary: "Run a read-only GraphQL query against Linear",
  examples: [
    {
      command: 'rata admin api --query "query Viewer { viewer { id name } }"',
      description: "Read the viewer directly from Linear",
    },
    {
      command: "printf '%s' \"query Teams { teams { nodes { key name } } }\" | rata admin api",
      description: "Read a query from standard input",
    },
  ],
  input: { query: queryFlag },
  selectable: false,
  output: resourceOutput(objectField({ data: scalarField })),
  run: (input) =>
    Effect.gen(function* runApiQuery() {
      if (Option.isNone(input.query)) {
        const stdio = yield* Stdio.Stdio
        const interactive = yield* stdio.stdinIsTerminal
        if (interactive) {
          return yield* new TrackerError({
            code: "validation",
            message: "No GraphQL query.",
            hint: "Pass --query, or pipe a query on standard input.",
          })
        }
      }
      const query = Option.isSome(input.query) ? input.query.value : yield* readStandardInput()
      if (query.trim().length === 0) {
        return yield* new TrackerError({
          code: "validation",
          message: "No GraphQL query.",
          hint: "Pass --query, or pipe a query on standard input.",
        })
      }
      const operation = findWriteOperation(query)
      if (operation !== null) {
        return yield* new TrackerError({
          code: "validation",
          message: `admin api rejects ${operation} operations.`,
          hint: "Send a GraphQL query or an anonymous selection set. admin api is read-only.",
        })
      }
      const gateway = yield* LinearGateway
      const data = yield* gateway.client.execute(query, {}, Schema.Unknown)
      return {
        kind: "resource",
        value: { data },
        text: [yield* jsonText(data)],
      }
    }),
})

export { apiSpec }
