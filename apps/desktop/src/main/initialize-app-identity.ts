import { app } from "electron";
import { configureAppIdentity } from "./app-identity";

// Run before Sentry or other startup modules resolve Electron data paths.
configureAppIdentity(app);
