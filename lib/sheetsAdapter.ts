/**
 * Google Sheets Storage Adapter
 * Communicates with Google Sheets using Google Apps Script Web App (or Google Sheets REST API)
 * dynamically selected based on Vercel environment variables.
 */

export type StorageProvider = 'turso' | 'sheets' | 'local';

export interface StorageStatus {
  provider: StorageProvider;
  tursoConfigured: boolean;
  sheetsConfigured: boolean;
  tursoUrlMasked: string;
  sheetIdMasked: string;
  scriptUrlConfigured: boolean;
  message: string;
}

/**
 * Returns the currently active storage provider based on Vercel environment variables:
 * - If TURSO_DATABASE_URL is set -> 'turso'
 * - If VITE_SHEET_ID / GOOGLE_SHEET_ID is set -> 'sheets'
 * - Otherwise -> 'local' (local fallback)
 */
export function getStorageProvider(): StorageProvider {
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_DATABASE_URL.trim() !== '') {
    return 'turso';
  }

  const sheetId = process.env.VITE_SHEET_ID || process.env.GOOGLE_SHEET_ID || process.env.SHEET_ID;
  if (sheetId && sheetId.trim() !== '') {
    return 'sheets';
  }

  return 'local';
}

/**
 * Gets a clean diagnostic status of storage configurations
 */
export function getStorageStatus(): StorageStatus {
  const provider = getStorageProvider();
  const sheetId = (process.env.VITE_SHEET_ID || process.env.GOOGLE_SHEET_ID || process.env.SHEET_ID || '').trim();
  const tursoUrl = (process.env.TURSO_DATABASE_URL || '').trim();
  const scriptUrl = (process.env.GOOGLE_SCRIPT_URL || process.env.APPS_SCRIPT_URL || '').trim();

  let message = '';
  if (provider === 'turso') {
    message = 'متصل بقاعدة بيانات Turso السحابية (libSQL)';
  } else if (provider === 'sheets') {
    message = 'متصل بجداول بيانات Google Sheets السحابية';
  } else {
    message = 'يعمل في وضع التخزين المحلي المؤقت (Local Fallback Engine)';
  }

  return {
    provider,
    tursoConfigured: Boolean(tursoUrl),
    sheetsConfigured: Boolean(sheetId),
    tursoUrlMasked: tursoUrl ? tursoUrl.slice(0, 25) + '...' : '',
    sheetIdMasked: sheetId ? (sheetId.slice(0, 6) + '...' + sheetId.slice(-4)) : '',
    scriptUrlConfigured: Boolean(scriptUrl),
    message
  };
}

const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx2u2N0sow8r_2Gm1iBmygjZXgT_RiKV-YSDi-B0QmSZu0rI0LDvGdVYB5tLIrZ7VZZXQ/exec';

/**
 * Invokes Google Apps Script Web App for Google Sheets operations
 */
export async function callGoogleSheetsApi(method: string, args: any[] = []): Promise<any> {
  const sheetId = (process.env.VITE_SHEET_ID || process.env.GOOGLE_SHEET_ID || process.env.SHEET_ID || '').trim();
  const scriptUrl = (process.env.GOOGLE_SCRIPT_URL || process.env.APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL).trim();

  if (!sheetId) {
    throw new Error('لم يتم تعيين معرف جدول البيانات (VITE_SHEET_ID أو GOOGLE_SHEET_ID) في متغيرات البيئة (Environment Variables).');
  }

  const payload = {
    method,
    args,
    sheetId
  };

  const response = await fetch(scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`تعذر الاتصال بـ Google Sheets API (رمز الاستجابة: ${response.status})`);
  }

  const json: any = await response.json();
  if (!json.success) {
    throw new Error(json.error || 'خطأ غير متوقع أثناء معالجة البيانات في Google Sheets');
  }

  return json.data;
}

/**
 * Normalizes rows returned by Google Sheets so that column 11 is always 'responsible'
 * and column 12 is 'timestamp'. Handles both legacy 12-column sheets and new 13-column sheets.
 */
export function normalizeSheetReportRows(rows: any[]): any[][] {
  if (!Array.isArray(rows)) return [];

  return rows.map(r => {
    if (!Array.isArray(r)) return r;

    // Date formatter helper
    const dateStr = r[0] ? String(r[0]).split('T')[0] : '';

    if (r.length === 12) {
      // Legacy 12 columns: Date, Month, Year, Period, Dept, Insp, Sup, Proc, Status, Note, Rec, Timestamp
      return [
        dateStr,
        r[1] !== undefined && r[1] !== null ? Number(r[1]) : null,
        r[2] !== undefined && r[2] !== null ? Number(r[2]) : null,
        r[3] || '',
        r[4] || '',
        r[5] || '',
        r[6] || '',
        r[7] || '',
        r[8] || '',
        r[9] || '',
        r[10] || '',
        '', // responsible (empty on legacy rows)
        r[11] || '' // timestamp
      ];
    }

    // 13 or more columns: Date, Month, Year, Period, Dept, Insp, Sup, Proc, Status, Note, Rec, Responsible, Timestamp
    return [
      dateStr,
      r[1] !== undefined && r[1] !== null ? Number(r[1]) : null,
      r[2] !== undefined && r[2] !== null ? Number(r[2]) : null,
      r[3] || '',
      r[4] || '',
      r[5] || '',
      r[6] || '',
      r[7] || '',
      r[8] || '',
      r[9] || '',
      r[10] || '',
      r[11] !== undefined && r[11] !== null ? String(r[11]) : '',
      r[12] || ''
    ];
  });
}
