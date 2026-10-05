import { Option } from "effect"

import type { Team } from "@/api/team"

const parseChoiceAnswer = <A>(
  choices: readonly A[],
  answer: string,
  label: (choice: A) => string,
): Option.Option<A> => {
  const trimmed = answer.trim()
  if (trimmed.length === 0) {
    return Option.none()
  }
  if (/^\d+$/u.test(trimmed)) {
    return Option.fromUndefinedOr(choices[Math.trunc(Number(trimmed)) - 1])
  }
  const wanted = trimmed.toLowerCase()
  return Option.fromUndefinedOr(choices.find((choice) => label(choice).toLowerCase() === wanted))
}

const parseTeamAnswer = (teams: readonly Team[], answer: string): Option.Option<Team> =>
  parseChoiceAnswer(teams, answer, (team) => team.key)

const parseWorkspaceAnswer = <A extends { readonly name: string }>(
  workspaces: readonly A[],
  answer: string,
): Option.Option<A> => parseChoiceAnswer(workspaces, answer, (workspace) => workspace.name)

export { parseTeamAnswer, parseWorkspaceAnswer }
