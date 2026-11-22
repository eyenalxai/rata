import { Schema } from "effect"

import { LabelId, TeamId, UserId } from "@/domain/id"
import { Label } from "@/domain/label"
import { WorkflowStateNode } from "@/domain/workflow-state"
import { PageInfo } from "@/linear/decode/page"

const Team = Schema.Struct({
  id: TeamId,
  key: Schema.String,
  name: Schema.String,
  timezone: Schema.String,
})

type Team = typeof Team.Type

const TeamConnection = Schema.Struct({
  nodes: Schema.Array(Team),
  pageInfo: PageInfo,
})

const TeamWritePayload = Schema.Struct({
  success: Schema.Boolean,
  team: Schema.NullOr(Team),
})

const DeletePayload = Schema.Struct({
  success: Schema.Boolean,
  entityId: Schema.String,
})

const TeamState = Schema.Struct({
  ...WorkflowStateNode.fields,
  position: Schema.Finite,
})

type TeamState = typeof TeamState.Type

const TeamLabel = Schema.Struct({
  ...Label.fields,
  scope: Schema.Literals(["team", "workspace"]),
})

type TeamLabel = typeof TeamLabel.Type

const TeamMember = Schema.Struct({
  id: UserId,
  name: Schema.String,
  displayName: Schema.String,
  email: Schema.String,
})

type TeamMember = typeof TeamMember.Type

const TeamPriority = Schema.Struct({
  priority: Schema.Int,
  label: Schema.String,
})

type TeamPriority = typeof TeamPriority.Type

const TeamDetail = Schema.Struct({
  id: TeamId,
  key: Schema.String,
  name: Schema.String,
  timezone: Schema.String,
  states: Schema.Array(TeamState),
  labels: Schema.Array(TeamLabel),
  members: Schema.Array(TeamMember),
  priorities: Schema.Array(TeamPriority),
})

type TeamDetail = typeof TeamDetail.Type

const TeamStateConnection = Schema.Struct({
  nodes: Schema.Array(TeamState),
  pageInfo: PageInfo,
})

const TeamLabelNode = Schema.Struct({
  id: LabelId,
  name: Schema.String,
  color: Schema.String,
  team: Schema.NullOr(Schema.Struct({ id: TeamId })),
})

const TeamLabelConnection = Schema.Struct({
  nodes: Schema.Array(TeamLabelNode),
  pageInfo: PageInfo,
})

const TeamMemberNode = Schema.Struct({
  id: UserId,
  name: Schema.String,
  displayName: Schema.String,
  email: Schema.String,
  active: Schema.Boolean,
})

const TeamMemberConnection = Schema.Struct({
  nodes: Schema.Array(TeamMemberNode),
  pageInfo: PageInfo,
})

export {
  DeletePayload,
  Team,
  TeamConnection,
  TeamDetail,
  type TeamLabel,
  TeamLabelConnection,
  TeamLabelNode,
  TeamMember,
  TeamMemberConnection,
  TeamMemberNode,
  TeamPriority,
  type TeamState,
  TeamStateConnection,
  TeamWritePayload,
}
