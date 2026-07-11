---
status: accepted
---

# Use workspaces for recruiting tenancy

The product treats a workspace as the tenant boundary for recruiting data, collaboration, and settings. We use Better Auth organization membership as the membership foundation, keep platform administration separate from workspace administration, and scope business records through workspace context so one user can belong to multiple recruiting workspaces without tying tenancy to a single identity provider.

## Consequences

Workspace-facing language should say "workspace" even when lower-level auth or database code uses organization terminology. Business routes and DAOs must carry workspace scope rather than relying on a global active user alone.
