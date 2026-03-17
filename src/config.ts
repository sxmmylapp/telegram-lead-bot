import { z } from 'zod';

const configSchema = z.object({
  telegram: z.object({
    apiId: z.coerce.number().int().positive(),
    apiHash: z.string().min(1),
    session: z.string().min(1),
    botToken: z.string().min(1),
  }),
  claude: z.object({
    apiKey: z.string().min(1),
    model: z.string().default('claude-sonnet-4-20250514'),
  }),
  schedule: z.object({
    activeHoursStart: z.coerce.number().int().min(0).max(23),
    activeHoursEnd: z.coerce.number().int().min(0).max(23),
    timezone: z.string().default('America/New_York'),
  }),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const result = configSchema.safeParse({
    telegram: {
      apiId: process.env.TELEGRAM_API_ID,
      apiHash: process.env.TELEGRAM_API_HASH,
      session: process.env.TELEGRAM_SESSION,
      botToken: process.env.TELEGRAM_BOT_TOKEN,
    },
    claude: {
      apiKey: process.env.CLAUDE_API_KEY,
      model: process.env.CLAUDE_MODEL,
    },
    schedule: {
      activeHoursStart: process.env.ACTIVE_HOURS_START,
      activeHoursEnd: process.env.ACTIVE_HOURS_END,
      timezone: process.env.TIMEZONE,
    },
    logLevel: process.env.LOG_LEVEL,
  });

  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(`Config validation failed:\n${formatted}`);
    process.exit(1);
  }

  return result.data;
}
