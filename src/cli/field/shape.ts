type FieldPath = readonly string[]

type FieldShape =
  | { readonly kind: "scalar" }
  | { readonly kind: "object"; readonly fields: FieldShapeFields }
  | { readonly kind: "array"; readonly items: FieldShape }

type FieldShapeFields = Readonly<Record<string, FieldShape>>

const scalarField: FieldShape = { kind: "scalar" }

const objectField = (fields: FieldShapeFields): FieldShape => ({ kind: "object", fields })

const arrayField = (items: FieldShape): FieldShape => ({ kind: "array", items })

export {
  arrayField,
  type FieldPath,
  type FieldShape,
  type FieldShapeFields,
  objectField,
  scalarField,
}
