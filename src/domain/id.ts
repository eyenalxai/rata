import { Brand, Schema } from "effect"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

const isUuid = (value: string): boolean => uuidPattern.test(value)

const WorkspaceId = Schema.String.pipe(Schema.brand("WorkspaceId"))
type WorkspaceId = typeof WorkspaceId.Type

const UserId = Schema.String.pipe(Schema.brand("UserId"))
type UserId = typeof UserId.Type

const TeamId = Schema.String.pipe(Schema.brand("TeamId"))
type TeamId = typeof TeamId.Type

const ProjectId = Schema.String.pipe(Schema.brand("ProjectId"))
type ProjectId = typeof ProjectId.Type

const LabelId = Schema.String.pipe(Schema.brand("LabelId"))
type LabelId = typeof LabelId.Type

const IssueId = Schema.String.pipe(Schema.brand("IssueId"))
type IssueId = typeof IssueId.Type

const CommentId = Schema.String.pipe(Schema.brand("CommentId"))
type CommentId = typeof CommentId.Type

const WorkflowStateId = Schema.String.pipe(Schema.brand("WorkflowStateId"))
type WorkflowStateId = typeof WorkflowStateId.Type

const AttachmentId = Schema.String.pipe(Schema.brand("AttachmentId"))
type AttachmentId = typeof AttachmentId.Type

const RelationId = Schema.String.pipe(Schema.brand("RelationId"))
type RelationId = typeof RelationId.Type

const userId = Brand.nominal<UserId>()
const teamId = Brand.nominal<TeamId>()
const projectId = Brand.nominal<ProjectId>()
const labelId = Brand.nominal<LabelId>()
const issueId = Brand.nominal<IssueId>()
const commentId = Brand.nominal<CommentId>()
const workflowStateId = Brand.nominal<WorkflowStateId>()
const attachmentId = Brand.nominal<AttachmentId>()
const relationId = Brand.nominal<RelationId>()

export {
  attachmentId,
  AttachmentId,
  commentId,
  CommentId,
  isUuid,
  IssueId,
  issueId,
  labelId,
  LabelId,
  projectId,
  ProjectId,
  relationId,
  RelationId,
  teamId,
  TeamId,
  userId,
  UserId,
  uuidPattern,
  WorkspaceId,
  workflowStateId,
  WorkflowStateId,
}
