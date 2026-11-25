import { env } from "./config/env.ts";
import { logger } from "./lib/logger.ts";
import { prisma } from "./lib/prisma.ts";
import { createApp } from "./app.ts";
import { startReminderSweep } from "./modules/notifications/service.ts";

const server = createApp().listen(env.API_PORT, () => {
  logger.info(`Code Junk API listening on http://localhost:${env.API_PORT}`);
  startReminderSweep();
});

server.on("error", (err) => {
  logger.fatal({ err }, "API failed to start");
  process.exit(1);
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
