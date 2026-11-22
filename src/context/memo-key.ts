import type { ResolveOptions } from "@/context/resolve/model"

const profileKey = (profile: string | null): string => profile ?? "env"

const resolveKey = (options: ResolveOptions): string =>
  [
    options.team ?? "",
    options.viewer === false ? "no-viewer" : "viewer",
    options.withTeam === false ? "no-team" : "team",
  ].join("|")

export { profileKey, resolveKey }
