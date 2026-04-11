/**
 * Universal Export Utilities
 * Provides CSV, JSON, and Excel-compatible export functions for all panels
 */

import { formatDateTime, formatDateOnly, formatTimeOnly } from './timeFormat.js';

/**
 * Export data as CSV
 * @param {Array<Object>} data - Array of objects to export
 * @param {string} filename - Output filename (without extension)
 * @param {Array<string>} headers - Optional custom headers
 */
export function exportCSV(data, filename, headers = null) {
  if (!data || data.length === 0) {
    throw new Error('No data to export');
  }

  // Auto-detect headers from first object if not provided (with safety check)
  const csvHeaders =
    headers || (data[0] && typeof data[0] === 'object' ? Object.keys(data[0]) : []);

  // Build CSV rows
  const rows = data.map(row => {
    return csvHeaders
      .map(header => {
        const value = row[header];

        // Handle different data types
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value);

        // Escape quotes and wrap in quotes if contains comma/newline
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      })
      .join(',');
  });

  // Combine headers and rows
  const csv = [csvHeaders.join(','), ...rows].join('\n');

  // Download
  downloadBlob(csv, `${filename}.csv`, 'text/csv');
}

/**
 * Export data as JSON
 * @param {any} data - Data to export (object or array)
 * @param {string} filename - Output filename (without extension)
 * @param {boolean} pretty - Pretty print with indentation
 */
export function exportJSON(data, filename, pretty = true) {
  const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  downloadBlob(json, `${filename}.json`, 'application/json');
}

/**
 * Export data as Excel-compatible CSV (with BOM for proper encoding)
 * @param {Array<Object>} data - Array of objects to export
 * @param {string} filename - Output filename (without extension)
 * @param {Array<string>} headers - Optional custom headers
 */
export function exportExcel(data, filename, headers = null) {
  if (!data || data.length === 0) {
    throw new Error('No data to export');
  }

  const csvHeaders =
    headers || (data[0] && typeof data[0] === 'object' ? Object.keys(data[0]) : []);

  const rows = data.map(row => {
    return csvHeaders
      .map(header => {
        const value = row[header];
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value);

        const stringValue = String(value);
        // Excel-specific escaping
        if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      })
      .join(',');
  });

  // Add BOM for Excel UTF-8 recognition
  const BOM = '\uFEFF';
  const csv = BOM + [csvHeaders.join(','), ...rows].join('\n');

  downloadBlob(csv, `${filename}.csv`, 'text/csv;charset=utf-8');
}

/**
 * Export table data with custom formatting
 * @param {Object} options - Export options
 * @param {Array<Object>} options.data - Data to export
 * @param {string} options.filename - Output filename
 * @param {Array<{key: string, label: string, format?: function}>} options.columns - Column definitions
 * @param {string} options.format - Export format ('csv', 'json', 'excel')
 */
export function exportTable({ data, filename, columns, format = 'csv' }) {
  if (!data || data.length === 0) {
    throw new Error('No data to export');
  }

  // Transform data using column definitions
  const headers = columns.map(col => col.label || col.key);
  const transformedData = data.map(row => {
    const newRow = {};
    columns.forEach(col => {
      const value = row[col.key];
      newRow[col.label || col.key] = col.format ? col.format(value, row) : value;
    });
    return newRow;
  });

  // Export based on format
  switch (format.toLowerCase()) {
    case 'json':
      exportJSON({ data: transformedData, exported_at: new Date().toISOString() }, filename);
      break;
    case 'excel':
      exportExcel(transformedData, filename, headers);
      break;
    case 'csv':
    default:
      exportCSV(transformedData, filename, headers);
  }
}

/**
 * Helper function to download a blob
 * @param {string} content - File content
 * @param {string} filename - Filename with extension
 * @param {string} mimeType - MIME type
 */
function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export multi-sheet data as separate CSV files in a zip (simple version - just multiple downloads)
 * @param {Object} sheets - Object with sheet names as keys and data arrays as values
 * @param {string} baseFilename - Base filename for exports
 */
export function exportMultiSheet(sheets, baseFilename) {
  Object.entries(sheets).forEach(([sheetName, data], index) => {
    // Stagger downloads to avoid browser blocking
    setTimeout(() => {
      exportCSV(data, `${baseFilename}-${sheetName}`, null);
    }, index * 500);
  });
}

/**
 * Format helpers for common data types
 */
export const formatters = {
  // Format timestamp to readable date
  date: value => {
    if (!value) return '';
    return formatDateTime(value);
  },

  // Format timestamp to date only
  dateOnly: value => {
    if (!value) return '';
    return formatDateOnly(value);
  },

  // Format timestamp to time only
  timeOnly: value => {
    if (!value) return '';
    return formatTimeOnly(value);
  },

  // Format number with thousand separators
  number: value => {
    if (value === null || value === undefined) return '';
    return Number(value).toLocaleString();
  },

  // Format as percentage
  percentage: value => {
    if (value === null || value === undefined) return '';
    return `${Number(value).toFixed(2)}%`;
  },

  // Format bytes to human-readable
  bytes: bytes => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  },

  // Format boolean as Yes/No
  boolean: value => {
    return value ? 'Yes' : 'No';
  },

  // Truncate long text
  truncate: (value, maxLength = 100) => {
    if (!value) return '';
    const str = String(value);
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
  }
};
