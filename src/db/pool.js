import sql from 'mssql';
import { config } from '../config.js';

let poolPromise = null;

/**
 * Get or create SQL Server connection pool
 */
export async function getPool() {
  if (poolPromise) {
    return poolPromise;
  }

  // Build connection config with explicit SQL Server authentication
  // (not Windows/Integrated Authentication)
  const poolConfig = {
    server: config.db.server,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    // Explicitly use SQL Server authentication (not Windows/Integrated auth)
    authentication: {
      type: 'default',
      options: {
        userName: config.db.user,
        password: config.db.password,
      },
    },
    options: {
      encrypt: config.db.options.encrypt,
      trustServerCertificate: config.db.options.trustServerCertificate,
      enableArithAbort: true,
      cryptoCredentialsDetails: {
        minVersion: 'TLSv1.2',
      },
    },
    pool: {
      max: config.db.pool.max,
      min: config.db.pool.min,
      idleTimeoutMillis: config.db.pool.idleTimeoutMillis,
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
    },
  };

  poolPromise = new sql.ConnectionPool(poolConfig);

  poolPromise.on('error', (err) => {
    console.error('[SQL Pool] Unexpected error:', err);
    poolPromise = null; // Allow reconnection
  });

  try {
    await poolPromise.connect();
    console.log('[SQL Pool] Connected to', config.db.server, config.db.database);
  } catch (err) {
    poolPromise = null;
    throw err;
  }

  return poolPromise;
}

/**
 * Close the pool (for graceful shutdown)
 */
export async function closePool() {
  if (poolPromise) {
    await poolPromise.close();
    poolPromise = null;
    console.log('[SQL Pool] Closed');
  }
}

/**
 * Execute a query with automatic retry on transient failures
 */
export async function query(sqlText, params = [], retries = 2) {
  const pool = await getPool();
  const request = pool.request();

  // Add parameters
  params.forEach((param, index) => {
    request.input(`param${index}`, param);
  });

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await request.query(sqlText);
      return result.recordset;
    } catch (err) {
      lastError = err;
      // Check if it's a transient connection error
      if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
        if (attempt < retries) {
          console.warn(`[SQL] Query failed (attempt ${attempt + 1}), retrying...`, err.message);
          poolPromise = null; // Force reconnect
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * Execute a query with typed parameters (for complex types)
 */
export async function queryTyped(sqlText, paramMap = {}) {
  const pool = await getPool();
  const request = pool.request();

  for (const [name, { type, value }] of Object.entries(paramMap)) {
    request.input(name, type, value);
  }

  const result = await request.query(sqlText);
  return result.recordset;
}

export { sql };