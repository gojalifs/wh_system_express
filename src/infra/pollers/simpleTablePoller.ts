import sql from 'mssql';
import crypto from 'crypto';
import { getPool } from '../db/db.js';
import { sendToAudience } from '../../app/ws/wsHub.js';
import { createLogger } from '../logger.js';

const log = createLogger('mr-poller');

/**
 * Kita pakai query existing (Laravel) tapi TANPA kolom LeadTime
 * supaya nilai hash stabil dan tidak dianggap berubah tiap menit.
 *
 * Kolom yang dipakai hash: transaction_classno, notes (request_option map),
 * receive_cnc_Flag, request_by, stsconfirm.
 */

type Row = {
  transaction_classno: string;
  notes: string | null;
  receive_cnc_Flag: string;
  request_by: string | null;
  stsconfirm: string;
};

let prevHash: string | null = null;
let warmedUp = false;

/** Ambil snapshot data "stabil" (tanpa LeadTime) */
async function fetchSnapshot(): Promise<Row[]> {
  const pool = await getPool();

  // SQL setara dengan builder-mu, tapi:
  // - TANPA DATEDIFF/LeadTime
  // - Pakai DISTINCT untuk efek "group by" di Laravel-mu
  // - Urutkan agar deterministik saat hashing
  const q = `
    SELECT DISTINCT
      a.transaction_classno,
      CASE WHEN b.request_option = 'Normal' THEN 'Regular' ELSE b.request_option END AS notes,
      ISNULL(b.receive_cnc_Flag, '') AS receive_cnc_Flag,
      (
        SELECT TOP 1 e.request_by
        FROM mst_transaction e
        WHERE e.transaction_classno = a.transaction_classno
      ) AS request_by,
      ISNULL(b.stsconfirm, '') AS stsconfirm
    FROM mst_transaction AS a
    LEFT JOIN dtl_transaction AS b
      ON a.transaction_classno = b.transaction_classno
     AND a.part_number       = b.part_number
    LEFT JOIN temp_monitoring AS c
      ON a.transaction_classno = c.transaction_classno
    WHERE b.receive_cnc_Flag IS NULL
      AND a.transaction_classno IS NOT NULL
      AND (b.stsconfirm IS NULL OR b.stsconfirm = '0')
    ORDER BY a.transaction_classno ASC;
  `;

  const rs = await pool.request().query<Row>(q);
  return rs.recordset;
}

/** Hitung hash stabil dari snapshot (urut + kolom terpilih) */
function snapshotHash(rows: Row[]): string {
  // JSON stringify berdasarkan array yg sudah di-order di SQL
  const str = JSON.stringify(
    rows.map((r) => ({
      t: r.transaction_classno,
      n: r.notes ?? '',
      r: r.receive_cnc_Flag ?? '',
      q: r.request_by ?? '',
      s: r.stsconfirm ?? '',
    }))
  );
  return crypto.createHash('sha1').update(str).digest('hex');
}

/** Jalankan sekali: jika ada perubahan → kirim invalidate */
export async function pollExistingQueryOnce() {
  const rows = await fetchSnapshot();

  const h = snapshotHash(rows);

  // Warmup: pada run pertama, simpan hash tanpa kirim event
  if (!warmedUp) {
    prevHash = h;
    warmedUp = true;
    return;
  }

  if (prevHash !== h) {
    prevHash = h;

    // Broadcast invalidasi: client di halaman aktif => refresh REST
    const payload = {
      type: 'material_requests.list.invalidate' as const,
      version: Date.now(), // versi sederhana; cukup untuk client
      ts: Date.now(),
      data: rows,
    };
    const delivered = sendToAudience({ mode: 'broadcast' }, payload);
    log.info(`invalidate delivered=${delivered} hash=${h.slice(0, 8)}...`);
  }
}

/** Start interval poller (default 1 menit) */
export function startExistingQueryPoller(intervalMs = 60_000) {
  log.info('starting query poller');

  // Jalankan pertama kali segera, lalu interval
  pollExistingQueryOnce().catch((err) =>
    log.error('first run error', err)
  );
  setInterval(() => {
    pollExistingQueryOnce().catch((err) =>
      log.error('looping error', err)
    );
  }, intervalMs);
}
