import { Option } from "effect"

const machineTimezone = (): Option.Option<string> => {
  const zone: unknown = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (typeof zone !== "string") {
    return Option.none()
  }
  const trimmed = zone.trim()
  return trimmed === "" ? Option.none() : Option.some(trimmed)
}

export { machineTimezone }
