import { loadWebProcessEnv } from "./load";

loadWebProcessEnv(process.env.NODE_ENV ?? "production");
