const normalizeLineEndings = (text: string): string => text.replaceAll(/\r\n?/gu, "\n")

export { normalizeLineEndings }
