import { buildApp } from "./app.js";
import { config, validateConfig } from "./config/index.js";

async function main() {
  const warnings = validateConfig();
  if (warnings.length > 0) {
    console.warn("\n  Configuration warnings:");
    warnings.forEach((w) => console.warn(`    ⚠ ${w}`));
    console.warn("  Server will start, but translation will fail without API keys.\n");
  }

  const app = await buildApp();

  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
    console.log(`\n  Nokia Orka Translator Server`);
    console.log(`  Listening on http://localhost:${config.port}`);
    console.log(`  WebSocket: ws://localhost:${config.port}/ws/translate`);
    console.log(`  Health: http://localhost:${config.port}/health\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, async () => {
      console.log(`\n  Received ${signal}, shutting down...`);
      await app.close();
      process.exit(0);
    });
  }
}

main();
