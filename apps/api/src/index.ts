import { app } from "./app.js";
import type { Env } from "./env.js";

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
} satisfies ExportedHandler<Env>;
