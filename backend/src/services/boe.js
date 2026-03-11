const { parse } = require('csv-parse/sync');
const { getCached, setCached, isFresh } = require('./cache');

const BOE_TTL = 24 * 60 * 60; // 24 hours in seconds
const BOE_URL = 'https://www.bankofengland.co.uk/boeapps/iadb/fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/2024&Dateto=now&SeriesCodes=IUMBV34,IUMBV37,IUMBV42&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N';

async function parseBoeCSV(csvText) {
  const rows = parse(csvText, { columns: true, skip_empty_lines: true });
  return rows.map(row => ({
    date: row['Date'] || row[Object.keys(row)[0]],
    twoYear: parseFloat(Object.values(row)[1]) || null,
    threeYear: parseFloat(Object.values(row)[2]) || null,
    fiveYear: parseFloat(Object.values(row)[3]) || null,
  })).filter(r => r.twoYear !== null);
}

function normalizeMortgageRates(parsed) {
  const current = parsed[parsed.length - 1];
  return { current, history: parsed };
}

async function fetchMortgageRates() {
  const cacheKey = 'boe/mortgage-rates';
  const cached = await getCached(cacheKey);

  if (cached && isFresh(cached.cachedAt, BOE_TTL)) {
    return { ...cached.data, stale: false };
  }

  try {
    const response = await fetch(BOE_URL);
    const csvText = await response.text();
    const parsed = await parseBoeCSV(csvText);
    const normalized = normalizeMortgageRates(parsed);
    await setCached(cacheKey, normalized);
    return { ...normalized, stale: false };
  } catch (err) {
    console.error('BoE API error:', err.message);
    if (cached) return { ...cached.data, stale: true };
    throw err;
  }
}

module.exports = { parseBoeCSV, normalizeMortgageRates, fetchMortgageRates };
