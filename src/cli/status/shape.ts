import { arrayField, objectField, scalarField } from "@/cli/field/shape"
import { triageRoles } from "@/context/docs"

const defaultsShape = objectField({
  assignee: scalarField,
  labels: arrayField(scalarField),
  priority: scalarField,
})

const stateShape = objectField({
  id: scalarField,
  name: scalarField,
  type: scalarField,
  position: scalarField,
})

const labelShape = objectField({
  id: scalarField,
  name: scalarField,
  color: scalarField,
  scope: scalarField,
})

const triageRoleShape = Object.fromEntries(triageRoles.map((role) => [role, scalarField]))

const triageShape = objectField({
  source: scalarField,
  roles: objectField(triageRoleShape),
})

const cacheShape = objectField({
  ageSeconds: scalarField,
  fetchedAt: scalarField,
})

const docHealthShape = objectField({
  path: scalarField,
  exists: scalarField,
  healthy: scalarField,
  warning: scalarField,
})

const statusShape = objectField({
  repository: objectField({
    root: scalarField,
    linked: scalarField,
  }),
  workspace: objectField({
    name: scalarField,
    keySource: scalarField,
  }),
  viewer: objectField({
    id: scalarField,
    name: scalarField,
    displayName: scalarField,
    email: scalarField,
    organization: objectField({
      id: scalarField,
      name: scalarField,
      urlKey: scalarField,
    }),
  }),
  team: objectField({
    id: scalarField,
    key: scalarField,
    name: scalarField,
  }),
  project: scalarField,
  defaults: defaultsShape,
  states: arrayField(stateShape),
  labels: arrayField(labelShape),
  triage: triageShape,
  cache: cacheShape,
  docs: objectField({
    tracker: docHealthShape,
    triage: docHealthShape,
  }),
  warning: scalarField,
})

export { statusShape }
