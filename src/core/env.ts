import 'dotenv/config';

export const ENV = {
  HOST: process.env.HOST ?? '0.0.0.0',
  PORT: Number(process.env.PORT ?? 3000),
  AUTH_TOKEN: process.env.AUTH_TOKEN ?? 'supersecret-lan-token',

  // SQL (opsional kalau pakai poller)
  SQL_USER: process.env.SQL_USER ?? '',
  SQL_PASS: process.env.SQL_PASS ?? '',
  SQL_HOST: process.env.SQL_HOST ?? '',
  SQL_DB: process.env.SQL_DB ?? '',
  SQL_PORT: process.env.SQL_PORT ?? 1433,
  SQL_ENCRYPT: (process.env.SQL_ENCRYPT ?? 'false') === 'true',
  POLL_INTERVAL_MS: Number(process.env.POLL_INTERVAL_MS ?? 60_000), // 1 menit
};
