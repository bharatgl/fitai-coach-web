import { buildApp } from "./app.js";
import { getConfig } from "./config.js";

const app = await buildApp();
const { PORT } = getConfig();

await app.listen({ port: PORT, host: "0.0.0.0" });

export default app;
