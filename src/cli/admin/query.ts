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

type ScanState = {
  depth: number
  parens: number
  brackets: number
}

const skipDelimiter = (char: string | undefined, state: ScanState): boolean => {
  switch (char) {
    case "{": {
      state.depth += 1
      return true
    }
    case "}": {
      state.depth = Math.max(0, state.depth - 1)
      return true
    }
    case "(": {
      state.parens += 1
      return true
    }
    case ")": {
      state.parens = Math.max(0, state.parens - 1)
      return true
    }
    case "[": {
      state.brackets += 1
      return true
    }
    case "]": {
      state.brackets = Math.max(0, state.brackets - 1)
      return true
    }
    case undefined: {
      return false
    }
    default: {
      return false
    }
  }
}

const isNested = (state: ScanState): boolean =>
  state.depth > 0 || state.parens > 0 || state.brackets > 0

const readWord = (
  source: string,
  start: number,
): { readonly word: string; readonly end: number } => {
  let index = start
  while (index < source.length && identifierPart.test(source[index] ?? "")) {
    index += 1
  }
  return { word: source.slice(start, index), end: index }
}

const findWriteOperation = (query: string): WriteOperation | null => {
  const source = stripStringsAndComments(query)
  const state: ScanState = { depth: 0, parens: 0, brackets: 0 }
  let expectName = false
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (skipDelimiter(char, state)) {
      if (char === "{") {
        expectName = false
      }
      index += 1
      continue
    }
    if (isNested(state) || char === undefined || !identifierStart.test(char)) {
      index += 1
      continue
    }
    const start = index
    const { word, end } = readWord(source, start)
    index = end
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
