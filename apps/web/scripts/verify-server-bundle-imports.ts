import path from "node:path";
import { verifyServerBundleImports } from "./server-bundle-imports";

const appRoot = path.resolve(import.meta.dirname, "..");
const serverOutput = path.join(appRoot, ".output", "server");
for (const modulePath of await verifyServerBundleImports(serverOutput)) {
  console.log(`Verified server bundle import: ${path.relative(appRoot, modulePath)}`);
}
