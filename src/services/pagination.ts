import type { StoPagination } from '../domain/sto.js';

export interface PaginationWindow extends StoPagination {
  offset: number;
}

/**
 * Build the pagination block in the same shape as the v3 bundle
 * (current_page clamped into range, from/to 1-based, 0 when empty).
 */
export function buildPagination(
  total: number,
  page: number,
  perPage: number
): PaginationWindow {
  const safeTotal = Math.max(0, total);
  const safePerPage = Math.max(1, perPage);
  const lastPage = safeTotal > 0 ? Math.ceil(safeTotal / safePerPage) : 0;
  const currentPage = Math.max(1, Math.min(page, lastPage || 1));
  const offset = (currentPage - 1) * safePerPage;
  const from = safeTotal > 0 && offset < safeTotal ? offset + 1 : 0;
  const to = Math.min(offset + safePerPage, safeTotal);

  return {
    current_page: currentPage,
    per_page: safePerPage,
    total: safeTotal,
    last_page: lastPage,
    from,
    to,
    offset,
  };
}
