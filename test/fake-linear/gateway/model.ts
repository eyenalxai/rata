import type { TeamId } from "@/domain/id"
import type { IncomingRelation, OutgoingRelation } from "@/domain/relation"
import type {
  IssueAttachment,
  IssueChild,
  IssueComment,
  IssueLabel,
  IssueSummaryNode,
  IssueTeam,
} from "@/linear/decode/issue"
import type { Project } from "@/linear/decode/project"
import type { Team, TeamLabel, TeamMember, TeamPriority, TeamState } from "@/linear/decode/team"
import type { Viewer } from "@/linear/decode/viewer"

type MemoryIssue = {
  readonly summary: IssueSummaryNode
  readonly description: string | null
  readonly team: IssueTeam
  readonly children?: readonly IssueChild[] | undefined
  readonly relations?: readonly OutgoingRelation<IssueChild>[] | undefined
  readonly inverseRelations?: readonly IncomingRelation<IssueChild>[] | undefined
  readonly attachments?: readonly IssueAttachment[] | undefined
  readonly comments?: readonly IssueComment[] | undefined
}

type MemoryMember = TeamMember & {
  readonly active?: boolean | undefined
}

type MemoryTeam = Team & {
  readonly states?: readonly TeamState[] | undefined
  readonly members?: readonly MemoryMember[] | undefined
  readonly labels?: readonly TeamLabel[] | undefined
  readonly priorities?: readonly TeamPriority[] | undefined
}

type MemoryLabel = {
  readonly id: IssueLabel["id"]
  readonly name: string
  readonly color: string
  readonly teamId: TeamId | null
}

type MemoryProject = Project & {
  readonly teams?: readonly TeamId[] | undefined
}

type MemoryWorkspace = {
  readonly viewer?: Viewer | undefined
  readonly teams?: readonly MemoryTeam[] | undefined
  readonly labels?: readonly MemoryLabel[] | undefined
  readonly projects?: readonly MemoryProject[] | undefined
  readonly issues?: readonly MemoryIssue[] | undefined
}

type MemorySeed = {
  readonly viewer: Viewer
  readonly teams: readonly MemoryTeam[]
  readonly labels: readonly MemoryLabel[]
  readonly projects?: readonly MemoryProject[] | undefined
  readonly issues?: readonly MemoryIssue[] | undefined
  readonly rejectedKeys?: readonly string[] | undefined
  readonly workspaces?: Readonly<Record<string, MemoryWorkspace>> | undefined
}

const defaultPriorities: readonly TeamPriority[] = [
  { priority: 0, label: "No priority" },
  { priority: 1, label: "Urgent" },
  { priority: 2, label: "High" },
  { priority: 3, label: "Medium" },
  { priority: 4, label: "Low" },
]

export {
  defaultPriorities,
  type MemoryIssue,
  type MemoryLabel,
  type MemoryMember,
  type MemoryProject,
  type MemorySeed,
  type MemoryTeam,
  type MemoryWorkspace,
}
