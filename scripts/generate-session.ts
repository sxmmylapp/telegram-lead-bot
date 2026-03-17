// scripts/generate-session.ts
// One-time local script to generate a StringSession for Telegram.
// Run with: npm run generate-session
// NEVER runs in production -- interactive auth flow for local use only.

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import input from 'input';

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

if (!apiId || isNaN(apiId)) {
  console.error('Missing or invalid TELEGRAM_API_ID environment variable');
  process.exit(1);
}

if (!apiHash) {
  console.error('Missing TELEGRAM_API_HASH environment variable');
  process.exit(1);
}

(async () => {
  const session = new StringSession('');

  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
    deviceModel: 'MacBook Pro',
    systemVersion: '14.0',
    appVersion: '1.0.0',
  });

  await client.start({
    phoneNumber: async () => await input.text('Phone number (with country code): '),
    password: async () => await input.text('2FA password (if enabled): '),
    phoneCode: async () => await input.text('Code from Telegram: '),
    onError: (err) => console.error('Auth error:', err),
  });

  console.log('\n--- Copy this StringSession to TELEGRAM_SESSION env var ---');
  console.log(client.session.save());
  console.log('--- End of session string ---\n');

  await client.disconnect();
  process.exit(0);
})();
