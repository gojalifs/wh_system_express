import crypto from 'crypto';
import { getPool } from '../db/db.js';
import { sendToAudience } from '../../app/ws/wsHub.js';
let prevHash = null;
let warmedUp = false;
/** Ambil snapshot data "stabil" (tanpa LeadTime) */
async function fetchSnapshot() {
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
    const rs = await pool.request().query(q);
    return rs.recordset;
}
/** Hitung hash stabil dari snapshot (urut + kolom terpilih) */
function snapshotHash(rows) {
    // JSON stringify berdasarkan array yg sudah di-order di SQL
    const str = JSON.stringify(rows.map((r) => ({
        t: r.transaction_classno,
        n: r.notes ?? '',
        r: r.receive_cnc_Flag ?? '',
        q: r.request_by ?? '',
        s: r.stsconfirm ?? '',
    })));
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
            type: 'material_requests.list.invalidate',
            version: Date.now(), // versi sederhana; cukup untuk client
            ts: Date.now(),
            data: rows,
        };
        const delivered = sendToAudience({ mode: 'broadcast' }, payload);
        console.log(`[MR-Poller] invalidate delivered=${delivered} hash=${h.slice(0, 8)}...`);
    }
}
/** Start interval poller (default 1 menit) */
export function startExistingQueryPoller(intervalMs = 60_000) {
    console.log('starting query poller . . . ');
    // Jalankan pertama kali segera, lalu interval
    pollExistingQueryOnce().catch((err) => console.error('[MR-Poller] first run error', err));
    setInterval(() => {
        pollExistingQueryOnce().catch((err) => console.error('[MR-Poller] on looping error', err));
    }, intervalMs);
}
