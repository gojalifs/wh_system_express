export interface StoScanSumRow {
  material_no: string | null;
  qty: number | string | null;
}

export interface StoJobRow {
  id: number;
  tally_no: string | null;
  sect_code: string | null;
  location_code: string | null;
  material_number: string | null;
  material_name: string | null;
  inventory_qty: number | string | null;
  uom: string | null;
  batch: number | null;
  job_assign_to: string | null;
  counted: unknown;
  correction_number: unknown;
}

export interface StoMaterialRow {
  id: number;
  material_no: string | null;
  material_nm: string | null;
  material_loc: string | null;
  box_qty: number | string | null;
  receiving_serial: string | null;
  rack_entry_date: Date | string | null;
  rack_entry_by: string | null;
  status: string | null;
  remark: string | null;
}

export interface StoScanRow {
  material_no: string | null;
  [key: string]: unknown;
}

export interface StoWireTagRow {
  Matl_no: string | null;
  wire_cd: string | null;
}

export interface StoScopeRow {
  rack_code: string | null;
  material_no: string | null;
}

export interface StoSessionRow {
  session_id: string;
  rack_code: string | null;
  assigned_user: string | null;
  status: string | null;
  total_expected_count: number | null;
  snapshot_checksum: string | null;
  batch_id: number;
  batch_code: string | null;
  batch_status: string | null;
}

export interface SessionBatchMetadata {
  id: number;
  batch: string | null;
  status: string | null;
}

export interface SessionMetadata {
  rack_code: string | null;
  assigned_user: string | null;
  status: string | null;
  total_expected_count: number | null;
  snapshot_checksum: string | null;
  batch: SessionBatchMetadata | null;
}

export interface JobForEnrichment {
  material_number?: string | null;
  inventory_qty?: number | string | null;
}

export interface JobEnrichment {
  scanned_qty: number;
  scanned_percent: number | null;
  data_box: number;
  wire_tag: string | null;
}

export type EnrichedJob<T extends JobForEnrichment = StoJobRow> = T &
  JobEnrichment;

export interface StoPagination {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  from: number;
  to: number;
}

export interface StoBundle {
  session_id: string;
  metadata: SessionMetadata;
  pagination: StoPagination;
  scope: Array<Pick<StoScopeRow, 'rack_code' | 'material_no'>>;
  jobs: Array<EnrichedJob<StoJobRow>>;
  materials: StoMaterialRow[];
  scans: StoScanRow[];
}

export interface BundleResult extends StoBundle {
  _cacheHit: boolean;
  _message: string;
}

// ============================================================
// STO v4 - split package (no serials) + per-material serials
// ============================================================
export interface StoSerialRow {
  id: number;
  receiving_serial: string | null;
  material_no: string | null;
  box_qty: number | string | null;
  material_loc: string | null;
}

export interface StoMaterialSerialCount {
  material_no: string;
  serial_count: number;
}

export interface SessionPackageV4 {
  session_id: string;
  metadata: SessionMetadata;
  /** Distinct materials in this session (from the job list, NOT distinct racks). */
  material_count: number;
  scope: Array<Pick<StoScopeRow, 'rack_code' | 'material_no'>>;
  jobs: Array<EnrichedJob<StoJobRow>>;
  scans: StoScanRow[];
  /** Expected serial count per material; seeds the per-material download tracker. */
  materials: StoMaterialSerialCount[];
}

export interface MaterialSerialsV4 {
  session_id: string;
  material_no: string;
  snapshot_checksum: string | null;
  pagination: StoPagination;
  serials: StoSerialRow[];
}
