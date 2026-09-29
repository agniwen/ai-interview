import path from "node:path";
import { verifyServerBundleImports } from "./server-bundle-imports";

const appRoot = path.resolve(import.meta.dirname, "..");
const serverOutput = path.join(appRoot, ".output", "server");
try {
  for (const modulePath of await verifyServerBundleImports(serverOutput)) {
    console.log(`Verified server bundle import: ${path.relative(appRoot, modulePath)}`);
  }
  // Imported server modules can open pools or timers. Verification is complete;
  // these runtime handles must not keep the build-only process alive.
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
