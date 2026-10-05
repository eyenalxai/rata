import { Option } from "effect"

import type { Team } from "@/api/team"

const parseTeamAnswer = (teams: readonly Team[], answer: string): Option.Option<Team> => {
  const trimmed = answer.trim()
  if (trimmed.length === 0) {
    return Option.none()
  }
  if (/^\d+$/u.test(trimmed)) {
    return Option.fromUndefinedOr(teams[Math.trunc(Number(trimmed)) - 1])
  }
  const key = trimmed.toLowerCase()
  return Option.fromUndefinedOr(teams.find((team) => team.key.toLowerCase() === key))
}

export { parseTeamAnswer }
