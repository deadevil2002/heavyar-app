import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { mockCategories } from '../mocks/categories';

describe('mobile category cards', () => {
  test('keeps localized identity and icons without stale numeric counts', () => {
    expect(mockCategories.length > 0).toBe(true);
    for (const category of mockCategories) {
      expect(category.id.length > 0).toBe(true);
      expect(category.nameAr.length > 0).toBe(true);
      expect(category.nameEn.length > 0).toBe(true);
      expect(category.icon.length > 0).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(category, 'count')).toBe(false);
    }
  });

  test('does not render a numeric count in CategoryCard', () => {
    const source = readFileSync('components/CategoryCard.tsx', 'utf8');
    expect(source.includes('category.count')).toBe(false);
    expect(source.includes('styles.count')).toBe(false);
  });
});