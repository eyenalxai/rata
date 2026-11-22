import type { Redacted } from "effect"

import { Context, Effect, Layer } from "effect"
import { HttpClient } from "effect/http"

import type { LinearClientShape } from "@/linear/client"
import type { Viewer } from "@/linear/decode/viewer"
import type { LinearApiError } from "@/linear/errors"
import type { IssueReadOperations } from "@/linear/operations/issue"
import type { LabelReadOperations } from "@/linear/operations/label"
import type { ProjectReadOperations } from "@/linear/operations/project"
import type { TeamReadOperations } from "@/linear/operations/team"
import type { UserReadOperations } from "@/linear/operations/user"

import { makeClient } from "@/linear/client"
import { makeIssueOperations } from "@/linear/operations/issue"
import { makeLabelOperations } from "@/linear/operations/label"
import { makeProjectOperations } from "@/linear/operations/project"
import { makeTeamOperations } from "@/linear/operations/team"
import { makeUserOperations } from "@/linear/operations/user"

type LinearGatewayShape = {
  // Write services keep the raw transport until the write seam moves; reads use the typed operations.
  readonly client: LinearClientShape
  readonly viewer: Effect.Effect<Viewer, LinearApiError>
  readonly viewerWithKey: (apiKey: Redacted.Redacted) => Effect.Effect<Viewer, LinearApiError>
  readonly issue: IssueReadOperations
  readonly team: TeamReadOperations
  readonly label: LabelReadOperations
  readonly project: ProjectReadOperations
  readonly user: UserReadOperations
  readonly withKey: (apiKey: Redacted.Redacted) => LinearGatewayShape
}

const makeLinearGateway = (client: LinearClientShape): LinearGatewayShape => ({
  client,
  viewer: client.viewer,
  viewerWithKey: client.viewerWithKey,
  issue: makeIssueOperations(client.execute),
  team: makeTeamOperations(client.execute),
  label: makeLabelOperations(client.execute),
  project: makeProjectOperations(client.execute),
  user: makeUserOperations(client.execute),
  withKey: (apiKey) => makeLinearGateway(client.withKey(apiKey)),
})

class LinearGateway extends Context.Service<LinearGateway, LinearGatewayShape>()(
  "rata-cli/linear/gateway/LinearGateway",
) {
  static readonly layer = (key: () => Effect.Effect<Redacted.Redacted, LinearApiError>) =>
    Layer.effect(
      LinearGateway,
      Effect.gen(function* linearGatewayLayer() {
        const http = yield* HttpClient.HttpClient
        return LinearGateway.of(makeLinearGateway(makeClient(http, key)))
      }),
    )
}

export { LinearGateway, type LinearGatewayShape, makeLinearGateway }
