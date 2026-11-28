import type { StaleCommand } from "@/docs/check"

const readFlags = ["--json", "--fields", "--count", "--ids-only", "--include", "--children"]

const flagReplacement = (base: string, flag: string): string => {
  if (flag === "--json") {
    return `${base} --format json`
  }
  if (flag === "--include") {
    return `${base} --relations`
  }
  if (flag === "--children") {
    return `${base} --full`
  }
  return `${base} --select`
}

const staleFlags = (text: string, tokens: readonly string[]): StaleCommand | null => {
  const first = tokens[0]
  if (first !== "issue") {
    return null
  }
  const base = `rata ${tokens.join(" ")}`
  const group = tokens[1]
  if (group === "create") {
    if (text.includes("--json")) {
      return { command: `${base} --json`, replacement: `${base} --format json` }
    }
    if (text.includes("--fields")) {
      return { command: `${base} --fields`, replacement: `${base} --select` }
    }
    if (text.includes("--wait")) {
      return { command: `${base} --wait`, replacement: "Remove --wait." }
    }
    if (text.includes("--no-default-labels")) {
      return {
        command: `${base} --no-default-labels`,
        replacement: "Remove --no-default-labels; use issue publish defaults.",
      }
    }
    return null
  }
  if (group === "close" && text.includes("--comment")) {
    return { command: `${base} --comment`, replacement: `${base} --comment-file` }
  }
  const flag = readFlags.find((candidate) => text.includes(candidate))
  if (flag === undefined) {
    return null
  }
  return { command: `${base} ${flag}`, replacement: flagReplacement(base, flag) }
}

export { staleFlags }
