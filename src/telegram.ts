import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import type { Config } from './config.js';
import type { Logger } from 'pino';

export async function connectTelegram(
  config: Config,
  logger: Logger
): Promise<TelegramClient> {
  const session = new StringSession(config.telegram.session);

  const client = new TelegramClient(session, config.telegram.apiId, config.telegram.apiHash, {
    connectionRetries: 5,
    retryDelay: 1000,
    autoReconnect: true,
    deviceModel: 'MacBook Pro',
    systemVersion: '14.0',
    appVersion: '1.0.0',
    floodSleepThreshold: 60,
  });

  await client.connect();

  const me = await client.getMe();
  logger.info(
    { event: 'telegram_connected', userId: me?.id?.toString() },
    'GramJS client connected'
  );

  return client;
}

export async function disconnectTelegram(client: TelegramClient): Promise<void> {
  await client.disconnect();
}
