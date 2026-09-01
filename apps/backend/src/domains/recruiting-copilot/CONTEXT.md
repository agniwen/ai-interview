# Recruiting Copilot

Recruiting Copilot owns conversational state and proposes recruiting actions while business records remain owned by their source contexts.

## Language

**Confirmed Recruiting Command**:
A Copilot Action Proposal explicitly accepted by a recruiter and submitted to the context that owns the affected record.
_Avoid_: Direct database update, tool write

**Copilot Projection**:
A read-only, permission-scoped summary supplied by another context for Copilot retrieval.
_Avoid_: Shared table access, raw database row
