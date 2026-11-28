import type { StaleCommand } from "@/docs/check"

const readFlags = ["--json", "--fields", "--count", "--ids-only", "--include", "--children"]

const hasFlag = (text: string, flag: string): boolean =>
  new RegExp(`(?:^|\\s)${flag}(?=$|[\\s,.;:])`, "u").test(text)

const flagValue = (text: string, flag: string): string | null => {
  const match = new RegExp(`(?:^|\\s)${flag}(?:\\s+|=)(\\S+)`, "u").exec(text)
  return match?.[1] ?? null
}

const fieldsReplacement = (base: string, text: string): string => {
  const value = flagValue(text, "--fields")
  return value === null ? `${base} --select <fields>` : `${base} --select ${value}`
}

const flagReplacement = (base: string, flag: string, tokens: readonly string[]): string => {
  if (flag === "--json") {
    return `${base} --format json`
  }
  if (flag === "--fields") {
    return `${base} --select <fields>`
  }
  if (flag === "--include") {
    return tokens[1] === "list" ? `${base} --relations` : "Use --relations on issue list."
  }
  if (flag === "--children") {
    return tokens.length === 1 ? `${base} --full` : "Read one issue with rata issue <ref> --full."
  }
  if (flag === "--count") {
    return "Use --format json and jq length."
  }
  return "Use --select identifier."
}

const staleFlags = (text: string, tokens: readonly string[]): StaleCommand | null => {
  const first = tokens[0]
  if (first !== "issue") {
    return null
  }
  const base = `rata ${tokens.join(" ")}`
  const group = tokens[1]
  if (group === "create") {
    if (hasFlag(text, "--json")) {
      return { command: `${base} --json`, replacement: `${base} --format json` }
    }
    if (hasFlag(text, "--fields")) {
      return { command: `${base} --fields`, replacement: fieldsReplacement(base, text) }
    }
    if (hasFlag(text, "--body")) {
      return { command: `${base} --body`, replacement: "Use --body-file -." }
    }
    if (hasFlag(text, "--wait")) {
      return { command: `${base} --wait`, replacement: "Remove --wait." }
    }
    if (hasFlag(text, "--no-default-labels")) {
      return {
        command: `${base} --no-default-labels`,
        replacement: "Remove --no-default-labels; use issue publish defaults.",
      }
    }
    return null
  }
  if (group === "close" && hasFlag(text, "--comment")) {
    return { command: `${base} --comment`, replacement: `${base} --comment-file` }
  }
  const flag = readFlags.find((candidate) => hasFlag(text, candidate))
  if (flag === undefined) {
    return null
  }
  return {
    command: `${base} ${flag}`,
    replacement:
      flag === "--fields" ? fieldsReplacement(base, text) : flagReplacement(base, flag, tokens),
  }
}

export { staleFlags }
