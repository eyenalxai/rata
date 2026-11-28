import type { ErrorCode } from "@/domain/error"

import { TrackerError } from "@/domain/error"

type CommandErrorInput = {
  readonly code: ErrorCode
  readonly message: string
  readonly hint: string | null
  readonly retryAfterSeconds?: number | undefined
  readonly details?: Readonly<Record<string, unknown>> | undefined
  readonly cause?: unknown
}

const commandError = (input: CommandErrorInput): TrackerError => new TrackerError(input)

const exitCodes: Record<ErrorCode, number> = {
  usage: 2,
  validation: 2,
  not_linked: 2,
  ambiguous: 2,
  not_found: 3,
  conflict: 4,
  auth: 5,
  forbidden: 5,
  rate_limited: 6,
  network: 6,
  internal: 1,
}

const exitCodeOf = (code: ErrorCode): number => exitCodes[code]

export { commandError, exitCodeOf }
