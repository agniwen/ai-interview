# Identity Access

Identity Access defines who an actor is inside a Workspace and which recruiting data that actor may access.

## Language

**Workspace Membership**:
The relationship between a person and one Workspace, including the workspace role and recruiting-group placement used for authorization.
_Avoid_: User role, global role

**Workspace Actor**:
An authenticated person resolved together with one Workspace Membership for a request or command.
_Avoid_: Request user, session row

**Recruiting Scope**:
The set of recruiting records visible to a Workspace Actor after workspace role and recruiting-group rules are applied.
_Avoid_: Interview visibility, creator filter
