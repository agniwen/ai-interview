import "./instrument.js";

import { Logger } from "@nestjs/common";
import { listenBackendApplication } from "./bootstrap.js";

const app = await listenBackendApplication();
const address = await app.getUrl();
Logger.log(`Backend listening on ${address}`, "Bootstrap");
