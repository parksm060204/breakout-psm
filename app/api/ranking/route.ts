import { NextResponse } from 'next/server';

// Fallback data in case the Google Sheet is not configured or fails
let mockRankings: { name: string; time: string | number }[] = [
  { name: '횃불이', time: '01:45' },
  { name: '경제박사', time: '02:10' },
  { name: '성민', time: '02:40' },
];

const SHEETS_API_URL = process.env.NEXT_PUBLIC_SHEET_URL;

function standardizeTime(t: any): string {
  if (t === null || t === undefined || String(t).trim() === '') return '0:00';
  
  let str = String(t).trim();
  
  // Remove leading apostrophe
  if (str.startsWith("'")) {
    str = str.substring(1);
  }

  // Handle case where GSheets or Apps Script might send a Date string or ISO string
  const date = new Date(str);
  if (!isNaN(date.getTime()) && (str.includes('T') || str.includes(' ') || str.length > 10)) {
    // It's a valid date string. Extract MM:SS
    // Note: Use getMinutes/getSeconds for local time interpretation which usually matches GSheets input
    const m = date.getMinutes();
    const s = date.getSeconds();
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // If it's already in MM:SS format or similar
  if (str.includes(':')) {
    // Ensure it's clean (e.g. "0:13")
    const parts = str.split(':');
    const m = parseInt(parts[parts.length - 2], 10);
    const s = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(m) && !isNaN(s)) {
      return `${m}:${s.toString().padStart(2, '0')}`;
    }
    return str;
  }

  const num = Number(str);
  if (!isNaN(num)) {
    if (Math.abs(num) > 1000000000) { 
      const d = new Date(num);
      return `${d.getMinutes()}:${d.getSeconds().toString().padStart(2, '0')}`;
    }
    const m = Math.floor(num / 60);
    const s = Math.floor(num % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  return str;
}

function parseTimeToSeconds(t: string | number) {
  const std = standardizeTime(t);
  const parts = std.split(':');
  if (parts.length >= 2) {
    const mins = Number(parts[parts.length - 2]);
    const secs = Number(parts[parts.length - 1]);
    if (!isNaN(mins) && !isNaN(secs)) {
      return mins * 60 + secs;
    }
  }
  return 9999;
}

export async function GET() {
  try {
    // 💡 By-pass Apps Script GET entirely and fetch CSV directly from the public Google Sheet!
    // This ignores any Apps Script deployment errors or caching issues.
    const csvUrl = 'https://docs.google.com/spreadsheets/d/13pf4HI6jzLLNWaU1toNsJYVuoD1TyxoARoThmM9JIyA/export?format=csv&gid=0';
    const response = await fetch(csvUrl, { cache: 'no-store' });
    
    if (response.ok) {
      const csvText = await response.text();
      const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean);
      
      if (lines.length > 1) {
        lines.shift(); // Remove the header row
        
        const data = lines.map(line => {
          const cols = line.split(','); // [datetime, name, finishtime]
          return {
            name: String(cols[1] || 'Unknown').trim(),
            time: cols[cols.length - 1] // Last column is always the time
          };
        });

        const formattedData = data
          .map((item: any) => ({
            name: item.name,
            time: standardizeTime(item.time)
          }))
          .filter(item => item.time !== '99:99')
          .sort((a, b) => parseTimeToSeconds(a.time) - parseTimeToSeconds(b.time));

        return NextResponse.json({ top3: formattedData.slice(0, 3) });
      }
    }
  } catch (error) {
    console.error('Error fetching CSV from Google Sheets:', error);
  }

  // Fallback if spreadsheet read fails
  const sortedMock = [...mockRankings].sort((a, b) => parseTimeToSeconds(a.time) - parseTimeToSeconds(b.time)).slice(0, 3);
  return NextResponse.json({ top3: sortedMock });
}

export async function POST(req: Request) {
  try {
    const body = await req.json(); // Expected: { name, time: "MM:SS" }
    
    if (SHEETS_API_URL) {
      // Send to Google Apps Script, prepending apostrophe so Sheets treats it as plain text
      const sheetPayload = {
        name: body.name,
        time: "'" + body.time
      };
      await fetch(SHEETS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sheetPayload),
      });
    }

    // Update locally too for immediate feedback in session
    mockRankings.push(body);
    mockRankings.sort((a, b) => parseTimeToSeconds(a.time) - parseTimeToSeconds(b.time));
    mockRankings = mockRankings.slice(0, 10);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving ranking:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
