const closedStateTypes = ["completed", "canceled"] as const

const isClosedState = (type: string): boolean => closedStateTypes.some((closed) => closed === type)

export { closedStateTypes, isClosedState }
