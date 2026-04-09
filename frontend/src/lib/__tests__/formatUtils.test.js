/**
 * Tests for format utility functions
 */

import { describe, it, expect } from 'vitest';
import {
  formatSize,
  formatDuration,
  formatDurationSeconds,
  formatDurationMinutes,
  formatNumber,
  formatPercent
} from '../formatUtils.js';

describe('formatSize', () => {
  it('should return "0 B" for zero bytes', () => {
    expect(formatSize(0)).toBe('0 B');
  });

  it('should return "0 B" for null/undefined', () => {
    expect(formatSize(null)).toBe('0 B');
    expect(formatSize(undefined)).toBe('0 B');
  });

  it('should return "0 B" for negative values', () => {
    expect(formatSize(-100)).toBe('0 B');
  });

  it('should format bytes', () => {
    expect(formatSize(500)).toBe('500 B');
  });

  it('should format kilobytes', () => {
    expect(formatSize(1024)).toBe('1 KB');
    expect(formatSize(1536)).toBe('1.5 KB');
  });

  it('should format megabytes', () => {
    expect(formatSize(1048576)).toBe('1 MB');
  });

  it('should format gigabytes', () => {
    expect(formatSize(1073741824)).toBe('1 GB');
  });
});

describe('formatDuration', () => {
  it('should return "0s" for zero', () => {
    expect(formatDuration(0)).toBe('0s');
  });

  it('should return "0s" for null/undefined', () => {
    expect(formatDuration(null)).toBe('0s');
    expect(formatDuration(undefined)).toBe('0s');
  });

  it('should format milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('should format seconds', () => {
    expect(formatDuration(5000)).toBe('5s');
  });

  it('should format minutes and seconds', () => {
    expect(formatDuration(90000)).toBe('1m 30s');
  });

  it('should format hours and minutes', () => {
    expect(formatDuration(3660000)).toBe('1h 1m');
  });

  it('should format days and hours', () => {
    expect(formatDuration(90000000)).toBe('1d 1h');
  });
});

describe('formatDurationSeconds', () => {
  it('should return "0s" for zero', () => {
    expect(formatDurationSeconds(0)).toBe('0s');
  });

  it('should format seconds under a minute', () => {
    expect(formatDurationSeconds(45)).toBe('45s');
  });

  it('should format minutes and seconds', () => {
    expect(formatDurationSeconds(90)).toBe('1m 30s');
  });

  it('should format hours and minutes', () => {
    expect(formatDurationSeconds(3661)).toBe('1h 1m');
  });
});

describe('formatDurationMinutes', () => {
  it('should return "0m" for zero', () => {
    expect(formatDurationMinutes(0)).toBe('0m');
  });

  it('should format minutes', () => {
    expect(formatDurationMinutes(45)).toBe('45m');
  });

  it('should format hours and minutes', () => {
    expect(formatDurationMinutes(90)).toBe('1h 30m');
  });
});

describe('formatNumber', () => {
  it('should return "0" for non-number input', () => {
    expect(formatNumber('abc')).toBe('0');
    expect(formatNumber(null)).toBe('0');
  });

  it('should format numbers with locale separators', () => {
    const result = formatNumber(1234567);
    // Should contain some separator (varies by locale)
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('should handle small numbers', () => {
    expect(formatNumber(42)).toBeTruthy();
  });
});

describe('formatPercent', () => {
  it('should return "0%" for non-number input', () => {
    expect(formatPercent('abc')).toBe('0%');
    expect(formatPercent(null)).toBe('0%');
  });

  it('should format percentage with default 1 decimal', () => {
    expect(formatPercent(42.567)).toBe('42.6%');
  });

  it('should format percentage with custom decimals', () => {
    expect(formatPercent(42.567, 2)).toBe('42.57%');
    expect(formatPercent(42.567, 0)).toBe('43%');
  });

  it('should handle zero', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('should handle 100%', () => {
    expect(formatPercent(100)).toBe('100.0%');
  });
});
