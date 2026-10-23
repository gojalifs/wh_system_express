import {
  sortJobsUnscannedFirst,
  enrichJobs,
} from '../../services/bundleService.js';

describe('Bundle Service - Pure Functions', () => {
  describe('sortJobsUnscannedFirst', () => {
    test('sorts unscanned jobs before scanned', () => {
      const jobs = [
        { material_number: 'MAT002', inventory_qty: 100 },
        { material_number: 'MAT001', inventory_qty: 100 },
        { material_number: 'MAT003', inventory_qty: 100 },
      ];
      const scanSums = { MAT002: 50, MAT003: 30 };

      const sorted = sortJobsUnscannedFirst(jobs, scanSums);

      expect(sorted[0].material_number).toBe('MAT001');
      expect(sorted[1].material_number).toBe('MAT002');
      expect(sorted[2].material_number).toBe('MAT003');
    });

    test('secondary sort by material_number', () => {
      const jobs = [
        { material_number: 'MAT002', inventory_qty: 100 },
        { material_number: 'MAT001', inventory_qty: 100 },
      ];
      const scanSums = {};

      const sorted = sortJobsUnscannedFirst(jobs, scanSums);

      expect(sorted[0].material_number).toBe('MAT001');
      expect(sorted[1].material_number).toBe('MAT002');
    });

    test('handles null/undefined scanSums', () => {
      const jobs = [{ material_number: 'MAT001' }];
      const sorted = sortJobsUnscannedFirst(jobs, null);
      expect(sorted).toHaveLength(1);
    });
  });

  describe('enrichJobs', () => {
    test('adds scanned_qty, scanned_percent, data_box, wire_tag', () => {
      const jobs = [
        {
          material_number: 'MAT001',
          inventory_qty: 100,
        },
      ];
      const scanSums = { MAT001: 30 };
      const dataBox = { MAT001: 10 };
      const wireTagMap = { MAT001: 'WIRE001' };

      const enriched = enrichJobs(jobs, scanSums, dataBox, wireTagMap);

      expect(enriched[0]).toMatchObject({
        scanned_qty: 30,
        scanned_percent: 40,
        data_box: 10,
        wire_tag: 'WIRE001',
      });
    });

    test('calculates 100% when inventory is 0 but scanned exists', () => {
      const jobs = [{ material_number: 'MAT001', inventory_qty: 0 }];
      const scanSums = { MAT001: 5 };
      const dataBox = {};
      const wireTagMap = {};

      const enriched = enrichJobs(jobs, scanSums, dataBox, wireTagMap);

      expect(enriched[0].scanned_percent).toBe(100);
    });

    test('sets scanned_percent to null when inventory 0 and unscanned', () => {
      const jobs = [{ material_number: 'MAT001', inventory_qty: 0 }];
      const scanSums = {};
      const dataBox = {};
      const wireTagMap = {};

      const enriched = enrichJobs(jobs, scanSums, dataBox, wireTagMap);

      expect(enriched[0].scanned_percent).toBeNull();
    });

    test('handles missing wire_tag gracefully', () => {
      const jobs = [{ material_number: 'MAT001', inventory_qty: 100 }];
      const scanSums = { MAT001: 10 };
      const dataBox = {};
      const wireTagMap = {};

      const enriched = enrichJobs(jobs, scanSums, dataBox, wireTagMap);

      expect(enriched[0].wire_tag).toBeNull();
    });
  });
});
