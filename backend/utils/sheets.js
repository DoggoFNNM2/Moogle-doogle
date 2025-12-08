/**
 * Fetches questions from a Google Sheet CSV URL.
 * Expected columns (header row):
 * Question,OptionA,OptionB,OptionC,OptionD,Answer
 * Answer should be A/B/C/D (case-insensitive).
 */
async function fetchQuestionsFromCsv(csvUrl) {
  const res = await fetch(csvUrl); // global fetch in Node 22
  if (!res.ok) throw new Error(`Failed to fetch CSV: ${res.status}`);
  const text = await res.text();

  const rows = parseCsv(text);
  const header = rows[0] || [];
  const idx = {
    q: header.indexOf('Question'),
    A: header.indexOf('OptionA'),
    B: header.indexOf('OptionB'),
    C: header.indexOf('OptionC'),
    D: header.indexOf('OptionD'),
    ans: header.indexOf('Answer')
  };

  const required = Object.values(idx).every(i => i !== -1);
  if (!required) throw new Error('CSV missing required headers');

  const questions = rows.slice(1).filter(r => r.length >= 6).map(r => {
    const q = r[idx.q]?.trim();
    const A = r[idx.A]?.trim();
    const B = r[idx.B]?.trim();
    const C = r[idx.C]?.trim();
    const D = r[idx.D]?.trim();
    const ans = (r[idx.ans] || '').trim().toUpperCase();
    const map = { A: 0, B: 1, C: 2, D: 3 };
    const answerIndex = map[ans];
    if (!q || [A, B, C, D].some(o => !o) || answerIndex === undefined) return null;
    return { q, options: [A, B, C, D], answerIndex };
  }).filter(Boolean);

  if (questions.length === 0) throw new Error('No valid questions parsed');
  return questions;
}

// Simple CSV parser
function parseCsv(text) {
  return text.split(/\r?\n/).filter(line => line.trim().length > 0).map(line => {
    return line.split(',').map(cell => cell.trim());
  });
}

module.exports = { fetchQuestionsFromCsv };