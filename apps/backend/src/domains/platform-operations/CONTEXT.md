# Platform Operations

Platform Operations exposes privileged diagnostics and recovery actions by coordinating the contexts that own the affected data.

## Language

**Platform Operation**:
A privileged diagnostic, retry, recovery, or administration action delegated to the owning context.
_Avoid_: Platform-owned business write, database repair endpoint

**Operational Read Model**:
A read-only infrastructure projection that composes owner data for privileged diagnostics without
exposing Drizzle or a database handle to the Platform HTTP services.
_Avoid_: Platform query code reaching through `HTTP_DATABASE`
