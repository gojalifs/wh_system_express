# sto-express

Express.js service for STO offline bundle download. Reads Laravel file cache directly or queries SQL Server as fallback.

## Architecture

```
Android → Express (port 3001) →
  ├─ Cache HIT (Laravel file cache) → Return bundle instantly
  └─ Cache MISS → Query SQL Server → Build response → Cache in memory → Return
```

## Quick Start

```bash
cd /home/gojali/projects/wh_system_be/sto_express
cp .env.example .env
# Edit .env with your DB credentials
npm install
npm start
```

## Production (PM2)

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Endpoints

### GET `/api/v3/sto/sessions/:session_id?page=29&per_page=10`

Returns paginated offline bundle matching Laravel response exactly.

**Query params:**
- `page` (default: 1, min: 1)
- `per_page` (default: 20, min: 1, max: 100)

**Response:**
```json
{
  "success": true,
  "message": "Session package ready (cached).",
  "data": {
    "session_id": "STK-FMND6J2J",
    "metadata": { ... },
    "pagination": { "current_page": 29, "per_page": 10, "total": 268, "last_page": 27, "from": 281, "to": 290 },
    "scope": [{ "rack_code": "A1B1", "material_no": null }],
    "jobs": [{ ..., "scanned_qty": 30, "scanned_percent": 30.0, "data_box": 0, "wire_tag": "W-991" }],
    "materials": [{ "material_no": "...", "material_nm": "...", "box_qty": 10, ... }],
    "scans": [{ "serial_scanned": "...", "qty": 10, "scan_status": "VALID", ... }]
  }
}
```

### POST `/api/v3/sto/internal/prewarm`

Internal endpoint for Laravel to trigger pre-warm after job assignment.

```json
{
  "session_id": "STK-FMND6J2J",
  "per_pages": [1, 10, 20]
}
```

### GET `/health`

Health check endpoint.

## Cache Strategy

**Primary**: Read directly from Laravel's file cache (`storage/framework/cache/data/`)
- Keys: `stkv3:bundle:v{ver}:{session}:{page}:{perPage}`, `stkv3:sortedjobs:...`, `stkv3:wiretag:...`, etc.
- Format: 10-char expiry + PHP serialized (parsed via `php-serialize`)
- Zero network hop, always in sync with Laravel

**Secondary**: In-memory cache (Express's own)
- Stores computed bundles when Laravel cache misses
- TTL matches Laravel (600s default)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Server port |
| `NODE_ENV` | production | Environment |
| `LARAVEL_CACHE_PATH` | `../storage/framework/cache/data` | Path to Laravel file cache (relative to sto_express) |
| `DB_HOST` | 127.0.0.1 | SQL Server host |
| `DB_PORT` | 1433 | SQL Server port |
| `DB_DATABASE` | wh_system | Database name |
| `DB_USER` | **required** | SQL Server username (SQL auth, not Windows) |
| `DB_PASSWORD` | **required** | SQL Server password |
| `DB_DOMAIN` | | Windows domain (optional) |
| `LINKED_SERVER` | 192.168.89.218\iGHSSIWSL202 | Linked server for wire_tag view |
| `LINKED_DB` | iGHS_L2_B3 | Linked server database |
| `CACHE_PREFIX` | laravel_cache_ | Cache key prefix (must match Laravel) |

## ⚠️ Critical: SQL Server Authentication

**This service uses SQL Server Authentication (username/password), NOT Windows/Integrated Authentication.**

The error `Login failed. The login is from an untrusted domain and cannot be used with Integrated authentication` means the connection is trying Windows Auth but failing.

### To fix:
1. **SQL Server must have SQL Server Authentication enabled** (Mixed Mode)
2. **Create a SQL Server login** with username/password
3. **Grant permissions** to the `wh_system` database
4. **Fill in `.env`** with actual credentials:
   ```env
   DB_USER=your_sql_username
   DB_PASSWORD=your_sql_password
   ```

### Linked Server (wire_tag)
The wire_tag view uses a linked server. For this to work with SQL Server auth:
1. The linked server must be configured to accept SQL Server authentication
2. In SQL Server Management Studio → Server Objects → Linked Servers → Properties → Security
3. Choose **"Be made using this security context"** and provide remote login/password
4. Or ensure the remote server accepts the same SQL Server login

If wire_tag fails, the endpoint still works but `wire_tag` field will be `null` (graceful degradation).

## Laravel Integration

1. **Read cache**: Works automatically if `STO_CACHE_STORE=file` and path is correct.

2. **Pre-warm** (optional): After job assignment, Laravel can call:
   ```php
   Http::post('http://localhost:3001/api/v3/sto/internal/prewarm', [
       'session_id' => $sessionId,
       'per_pages' => [1, 10, 20], // or config('sto.prewarm_per_pages')
   ]);
   ```

3. **Nginx proxy** (recommended): Route `/api/v3/sto/sessions/*` to Express, rest to Laravel.

## Development

```bash
npm run dev  # uses node --watch (Node 18+)
```

## Requirements

- Node.js >= 18
- Access to SQL Server (same as Laravel)
- Read access to Laravel's `storage/framework/cache/data` directory