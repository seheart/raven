/**
 * Tests for numberFormat utility
 */

import { describe, it, expect } from 'vitest';
import { formatNumber, formatBytes } from '../numberFormat.js';

describe('formatNumber', () => {
  it('should return "0" for null/undefined/NaN', () => {
    expect(formatNumber(null)).toBe('0');
    expect(formatNumber(undefined)).toBe('0');
    expect(formatNumber(NaN)).toBe('0');
  });

  it('should format integers with locale separators', () => {
    const result = formatNumber(1234567);
    expect(result).toMatch(/1.*234.*567/); // Should have separators
  });

  it('should handle zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('should handle negative numbers', () => {
    const result = formatNumber(-1234);
    expect(result).toContain('1');
    expect(result).toContain('234');
  });

  it('should handle decimals', () => {
    const result = formatNumber(3.14);
    expect(result).toContain('3');
  });
});

describe('formatBytes', () => {
  it('should return "0 Bytes" for zero', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
  });

  it('should return "0 Bytes" for null/undefined', () => {
    expect(formatBytes(null)).toBe('0 Bytes');
    expect(formatBytes(undefined)).toBe('0 Bytes');
  });

  it('should return "0 Bytes" for negative values', () => {
    expect(formatBytes(-100)).toBe('0 Bytes');
  });

  it('should format bytes', () => {
    expect(formatBytes(500)).toBe('500 Bytes');
  });

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
  });

  it('should format megabytes with decimals', () => {
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(1572864, 1)).toBe('1.5 MB');
  });

  it('should format gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1 GB');
  });

  it('should format terabytes', () => {
    expect(formatBytes(1099511627776)).toBe('1 TB');
  });

  it('should respect decimal places parameter', () => {
    expect(formatBytes(1536, 0)).toBe('2 KB'); // Rounds
    expect(formatBytes(1536, 2)).toBe('1.5 KB');
    expect(formatBytes(1536, 3)).toBe('1.5 KB');
  });
});
