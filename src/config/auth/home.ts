import type { Path } from "effect"

import { Config, Effect, Option } from "effect"

import type { AuthStoreError } from "@/config/auth/error"

const makeConfigHome = (
  path: Path.Path,
  envFailure: (message: string) => AuthStoreError,
): Effect.Effect<string, AuthStoreError> =>
  Effect.gen(function* configHome() {
    const xdg = yield* Config.String("XDG_CONFIG_HOME").pipe(
      Config.option,
      Effect.mapError(() => envFailure("Could not read the environment.")),
    )
    const home = yield* Config.String("HOME").pipe(
      Config.option,
      Effect.mapError(() => envFailure("Could not read the environment.")),
    )
    const base = Option.orElse(xdg, () =>
      Option.map(home, (directory) => path.join(directory, ".config")),
    )
    if (Option.isNone(base)) {
      return yield* envFailure("Cannot find the config directory: set HOME or XDG_CONFIG_HOME.")
    }
    return base.value
  })

export { makeConfigHome }
