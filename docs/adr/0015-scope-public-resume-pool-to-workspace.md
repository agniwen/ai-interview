---
status: accepted
---

# Scope public resume pool to the workspace

The public resume pool used to be readable across all workspaces so talent could be shared application-wide. That leaked candidate data between tenants and conflicted with workspace tenancy (ADR 0001). Public pool items are now visible only within the uploading workspace (`organizationId`); private pool ownership and recruiting visibility rules are unchanged.

## Consequences

List, detail, file, publish, and import paths for public pool items must filter or authorize by the active workspace. Cross-workspace import of public pool items is no longer supported. Existing public rows already store `organizationId` from create/publish, so no data migration is required for the new filter.
