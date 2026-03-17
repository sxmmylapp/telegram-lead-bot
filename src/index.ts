import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { connectTelegram, disconnectTelegram } from './telegram.js';

// Global error handlers -- registered before main() to catch any startup errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

async function main() {
  // Step 1: Validate config (exits 1 on failure)
  const config = loadConfig();

  // Step 2: Initialize logger
  const logger = createLogger(config);

  // Step 3: Log startup
  logger.info({ event: 'startup' }, 'Config validated, starting up');

  // Step 4: Connect GramJS
  const client = await connectTelegram(config, logger);

  // Step 5: Log connected
  logger.info({ event: 'connected' }, 'Telegram client connected, process running');

  // Step 6: Graceful shutdown handler
  const shutdown = async (signal: string) => {
    logger.info({ event: 'shutdown', signal }, 'Received signal, shutting down');
    await disconnectTelegram(client);
    logger.flush();
    // Force exit after 5s -- fallback for GramJS's hanging _updateLoop promise (issue #242, #615)
    setTimeout(() => process.exit(0), 5000).unref();
  };

  // Step 7: Register signal handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
