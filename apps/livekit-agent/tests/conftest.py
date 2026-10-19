import os

# `agent` initializes Sentry at import time so LiveKit job processes, which
# re-import the module, keep error monitoring. Tests must never report their
# deliberate failures as production events. Empty values (rather than deleting
# the keys) also stop `load_dotenv()` from restoring a DSN from a local `.env`.
os.environ["SENTRY_AGENT_DSN"] = ""
os.environ["SENTRY_DSN"] = ""
