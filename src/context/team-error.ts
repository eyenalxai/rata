import { Effect } from "effect"

import { TeamNotFoundError, TeamResolutionError } from "@/api/team"
import { isUuid } from "@/domain/id"

const requireTeamError = (
  missing: boolean,
  stored: string | null,
): Effect.Effect<never, TeamNotFoundError | TeamResolutionError> => {
  if (missing) {
    const key = stored ?? "the linked team"
    return Effect.fail(
      new TeamNotFoundError({
        key,
        message: isUuid(key) ? `No team with id ${key}.` : `No team with key ${key}.`,
      }),
    )
  }
  return Effect.fail(
    new TeamResolutionError({ message: "No team. Pass --team, or run `rata admin link`." }),
  )
}

export { requireTeamError }
