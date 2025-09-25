import { Request, Response } from 'express';
import { getPool } from '../../infra/db/db';

type Row = {
  transaction_classno: string;
  notes: string | null;
  receive_cnc_Flag: string;
  request_by: string | null;
  LeadTime: number; // menit
  stsconfirm: string;
};

export async function getMaterialRequests(_req: Request, res: Response) {
  try {
    const pool = await getPool();

    // NOTE:
    // - Query ini setara dengan builder Laravel kamu.
    // - Jika perlu kurangi blocking, boleh tambah WITH (NOLOCK) di tiap tabel.
    const q = `
      SELECT
        a.transaction_classno,
        CASE WHEN b.request_option = 'Normal' THEN 'Regular' ELSE b.request_option END AS notes,
        ISNULL(b.receive_cnc_Flag,'') AS receive_cnc_Flag,
        (
          SELECT TOP 1 e.request_by
          FROM mst_transaction e
          WHERE e.transaction_classno = a.transaction_classno
        ) AS request_by,
        DATEDIFF(
          minute,
          (
            SELECT TOP 1 ISNULL(d.pick_date, GETDATE())
            FROM dtl_transaction d
            WHERE d.transaction_classno = a.transaction_classno
          ),
          GETDATE()
        ) AS LeadTime,
        ISNULL(b.stsconfirm,'') AS stsconfirm
      FROM mst_transaction AS a
      LEFT JOIN dtl_transaction AS b
        ON a.transaction_classno = b.transaction_classno
       AND a.part_number       = b.part_number
      LEFT JOIN temp_monitoring AS c
        ON a.transaction_classno = c.transaction_classno
      WHERE b.receive_cnc_flag IS NULL
        AND a.transaction_classno IS NOT NULL
        AND (b.stsconfirm IS NULL OR b.stsconfirm = '0')
      GROUP BY
        a.transaction_classno, b.request_option, b.receive_cnc_Flag, b.stsconfirm, b.print_flag
      ORDER BY
        b.request_option DESC,
        stsconfirm ASC,
        a.transaction_classno DESC;
    `;

    const req = pool.request();
    (req as any).timeout = 20000; // 20s per-request timeout (opsional)
    const rs = await req.query<Row>(q);

    return res.json({
      success: true,
      message: 'Success get picking document list',
      data: rs.recordset,
    });
  } catch (e: any) {
    console.error('[GET /material-requests] error:', e?.message ?? e);
    return res.status(500).json({
      success: false,
      message: 'Failed get picking document list',
      data: [],
    });
  }
}
