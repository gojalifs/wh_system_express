import { buildPagination } from '../../services/pagination.js';

describe('buildPagination (v4 serials)', () => {
  test('first page of a large material', () => {
    const p = buildPagination(12345, 1, 5000);
    expect(p.current_page).toBe(1);
    expect(p.per_page).toBe(5000);
    expect(p.total).toBe(12345);
    expect(p.last_page).toBe(3);
    expect(p.from).toBe(1);
    expect(p.to).toBe(5000);
    expect(p.offset).toBe(0);
  });

  test('last partial page', () => {
    const p = buildPagination(12345, 3, 5000);
    expect(p.current_page).toBe(3);
    expect(p.from).toBe(10001);
    expect(p.to).toBe(12345);
    expect(p.offset).toBe(10000);
  });

  test('page beyond range clamps to last page', () => {
    const p = buildPagination(100, 9, 5000);
    expect(p.last_page).toBe(1);
    expect(p.current_page).toBe(1);
    expect(p.from).toBe(1);
    expect(p.to).toBe(100);
  });

  test('empty material has no pages', () => {
    const p = buildPagination(0, 1, 5000);
    expect(p.last_page).toBe(0);
    expect(p.current_page).toBe(1);
    expect(p.from).toBe(0);
    expect(p.to).toBe(0);
  });

  test('exact multiple does not create a phantom page', () => {
    const p = buildPagination(10000, 2, 5000);
    expect(p.last_page).toBe(2);
    expect(p.to).toBe(10000);
  });
});
