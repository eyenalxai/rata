import { createHash } from "node:crypto"

// Linear accepts a client id only as a UUIDv4: RFC 4122 fixes version 4 and variant 10xx.
const withVersionNibble = (hex: string): string => `${hex.slice(0, 12)}4${hex.slice(13, 16)}`

const withVariantNibble = (hex: string): string => {
  const nibble = Number.parseInt(hex.charAt(16), 16)
  const variant = ((nibble % 4) + 8).toString(16)
  return `${variant}${hex.slice(17, 32)}`
}

const dedupeCommentId = (issueId: string, key: string): string => {
  const hex = createHash("sha256").update(`${issueId}\0${key}`).digest("hex")
  const versioned = withVersionNibble(hex)
  const tail = withVariantNibble(hex)
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${tail.slice(0, 4)}-${tail.slice(4, 16)}`
}

export { dedupeCommentId }
