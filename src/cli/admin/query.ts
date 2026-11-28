type WriteOperation = "mutation" | "subscription"

const identifierStart = /[A-Za-z_]/u
const identifierPart = /[A-Za-z0-9_]/u

const skipString = (source: string, start: number): number => {
  if (source.startsWith('"""', start)) {
    const end = source.indexOf('"""', start + 3)
    return end === -1 ? source.length : end + 3
  }
  let index = start + 1
  while (index < source.length) {
    const char = source[index]
    if (char === "\\") {
      index += 2
      continue
    }
    if (char === '"') {
      return index + 1
    }
    index += 1
  }
  return source.length
}

const stripStringsAndComments = (source: string): string => {
  let result = ""
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (char === "#") {
      const end = source.indexOf("\n", index)
      index = end === -1 ? source.length : end
      result += " "
      continue
    }
    if (char === '"') {
      index = skipString(source, index)
      result += " "
      continue
    }
    result += char
    index += 1
  }
  return result
}

const nextSignificant = (source: string, start: number): string | undefined => {
  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (char !== undefined && !/\s/u.test(char)) {
      return char
    }
  }
  return undefined
}

const findWriteOperation = (query: string): WriteOperation | null => {
  const source = stripStringsAndComments(query)
  let depth = 0
  let expectName = false
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (char === "{") {
      depth += 1
      expectName = false
      index += 1
      continue
    }
    if (char === "}") {
      depth = Math.max(0, depth - 1)
      index += 1
      continue
    }
    if (depth > 0 || char === undefined || !identifierStart.test(char)) {
      index += 1
      continue
    }
    const start = index
    while (index < source.length && identifierPart.test(source[index] ?? "")) {
      index += 1
    }
    const word = source.slice(start, index)
    const previous = start === 0 ? undefined : source[start - 1]
    if (previous === "$" || previous === "@") {
      continue
    }
    if (word === "fragment") {
      expectName = true
      continue
    }
    if (word === "query") {
      const next = nextSignificant(source, index)
      expectName = next !== undefined && identifierStart.test(next)
      continue
    }
    if (word === "mutation" || word === "subscription") {
      if (expectName) {
        expectName = false
        continue
      }
      return word
    }
    expectName = false
  }
  return null
}

export { findWriteOperation, type WriteOperation }
