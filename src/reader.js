// Smart file reader. Works on plain rows, so it runs in the browser and in tests.
(function (root) {
  const T = v => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
  const isN = v => typeof v === 'number' && Number.isFinite(v);
  const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

  /* ---------- workbook loading ---------- */
  function bookFrom(XLSX, data, name) {
    const wb = XLSX.read(data, { type: 'array', cellDates: true });
    const sheets = wb.SheetNames.map((n, i) => {
      const ws = wb.Sheets[n], meta = (wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[i]) || {};
      let errors = 0; const rows = [];
      if (ws['!ref']) {
        const rng = XLSX.utils.decode_range(ws['!ref']);
        for (let r = 0; r <= Math.min(rng.e.r, 12000); r++) {
          const row = [];
          for (let c = 0; c <= Math.min(rng.e.c, 40); c++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            if (!cell) { row[c] = null; continue; }
            if (cell.t === 'e') { errors++; row[c] = null; continue; }
            row[c] = cell.v === undefined ? null : cell.v;
          }
          rows[r] = row;
        }
      }
      return { name: n, hidden: !!meta.Hidden, rows, errors };
    });
    return { name, sheets };
  }

  function msgFrom(XLSX, data) {
    const cfb = XLSX.CFB.read(new Uint8Array(data), { type: 'array' });
    const get = id => {
      const e = XLSX.CFB.find(cfb, '/__substg1.0_' + id);
      if (!e || !e.content) return '';
      const b = Uint8Array.from(e.content);
      return id.endsWith('001F') ? new TextDecoder('utf-16le').decode(b).replace(/\0+$/, '') : new TextDecoder().decode(b).replace(/\0+$/, '');
    };
    const pick = (a, b) => get(a) || get(b);
    return { subject: pick('0037001F', '0037001E'), from: pick('0C1A001F', '0C1A001E'), body: pick('1000001F', '1000001E') };
  }

  // Logos placed on a form: left, centre and right of the header.
  function formLogos(XLSX, data) {
    try {
      const z = XLSX.CFB.read(new Uint8Array(data), { type: 'array' });
      const read = n => { const e = XLSX.CFB.find(z, n); return e && e.content ? Uint8Array.from(e.content) : null; };
      const txt = n => { const b = read(n); return b ? new TextDecoder().decode(b) : ''; };
      const d = txt('/xl/drawings/drawing1.xml'), rels = txt('/xl/drawings/_rels/drawing1.xml.rels');
      const out = {}, re = /<xdr:from><xdr:col>(\d+)<\/xdr:col>[\s\S]*?r:embed="(\w+)"/g; let m;
      while ((m = re.exec(d))) {
        const t = (rels.match(new RegExp('Id="' + m[2] + '"[^>]*Target="([^"]+)"')) || rels.match(new RegExp('Target="([^"]+)"[^>]*Id="' + m[2] + '"')) || [])[1];
        if (!t) continue;
        const b = read('/xl/' + t.replace('../', '')); if (!b) continue;
        const col = Number(m[1]), slot = col < 3 ? 'left' : col < 7 ? 'center' : 'right';
        let str = ''; b.forEach(x => { str += String.fromCharCode(x); });
        out[slot] = btoa(str);
      }
      return out;
    } catch (e) { return {}; }
  }

  /* ---------- amounts in words ---------- */
  const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function under1000(n) {
    const h = Math.floor(n / 100), t = n % 100, out = [];
    if (h) out.push(ONES[h] + ' Hundred');
    if (t) out.push(t < 20 ? ONES[t] : TENS[Math.floor(t / 10)] + (t % 10 ? ' ' + ONES[t % 10] : ''));
    return out.join(' and ');
  }
  function intWords(n) {
    if (!n) return 'Zero';
    const parts = [], b = Math.floor(n / 1e9), m = Math.floor(n / 1e6) % 1000, k = Math.floor(n / 1e3) % 1000, r = n % 1000;
    if (b) parts.push(under1000(b) + ' Billion');
    if (m) parts.push(under1000(m) + ' Million');
    if (k) parts.push(under1000(k) + ' Thousand');
    if (r) parts.push(under1000(r));
    return parts.join(' ');
  }
  function amountWords(v, unit = 'Egyptian Pounds', sub = 'Piasters') {
    const a = Math.abs(r2(v)), whole = Math.floor(a), p = Math.round((a - whole) * 100);
    return `Only ${v < 0 ? 'Negative ' : ''}${intWords(whole)} ${unit}${p ? ` and ${intWords(p)} ${sub}` : ''} Only.`;
  }
  function wordsValue(text) {
    const s = T(text).toLowerCase().replace(/in words\s*:/, '').replace(/-/g, ' ');
    const [pounds, rest = ''] = s.split(/egyptian pounds?/);
    const map = { ninty: 90 };
    ONES.forEach((w, i) => { if (w) map[w.toLowerCase()] = i; });
    TENS.forEach((w, i) => { if (w) map[w.toLowerCase()] = i * 10; });
    const val = t => { let cur = 0, tot = 0; t.split(/\s+/).forEach(w => { if (map[w] != null) cur += map[w]; else if (w === 'hundred') cur *= 100; else if (w === 'thousand') { tot += cur * 1e3; cur = 0; } else if (w === 'million') { tot += cur * 1e6; cur = 0; } else if (w === 'billion') { tot += cur * 1e9; cur = 0; } }); return tot + cur; };
    return { whole: val(pounds), piasters: val(rest.split(/piast/)[0] || ''), negative: /negative/.test(pounds) };
  }

  /* ---------- priced tables ---------- */
  function findHeader(rows) {
    for (let r = 0; r < Math.min(rows.length, 60); r++) {
      const c = (rows[r] || []).map(v => T(v).toLowerCase());
      const at = re => c.findIndex(x => re.test(x));
      const desc = at(/^(desc|type$)/), unit = at(/^unit/), qty = at(/^(qty|quantity)/), rate = at(/^rate/);
      if (desc >= 0 && unit >= 0 && qty >= 0 && rate >= 0) return { row: r, item: at(/^item/), desc, unit, qty, rate, amount: at(/^(amount|total|cost change)/), ref: at(/^(ref|remark)/) };
    }
    return null;
  }
  const DISC = n => (n <= 2 ? 'Civil' : n <= 5 ? 'Civil' : n <= 14 ? 'Architecture' : n <= 25 ? 'Mechanical' : n <= 28 ? 'Electrical' : 'Civil');

  function parseTable(sheet) {
    const h = findHeader(sheet.rows);
    if (!h) return null;
    const out = { rows: [], risk: null, total: null, sheet: sheet.name };
    let band = null, division = null, section = '', parent = '';
    sheet.rows.slice(h.row + 1).forEach(row => {
      if (!row) return;
      const desc = T(row[h.desc]), unit = T(row[h.unit]), qty = row[h.qty], rate = row[h.rate], amount = h.amount >= 0 ? row[h.amount] : null;
      if (!desc && !isN(amount)) return;
      if (/^omission(s)?$/i.test(desc)) { band = 'Omission'; parent = ''; return; }
      if (/^addition(s)?$/i.test(desc)) { band = 'Addition'; parent = ''; return; }
      if (/risk allowance/i.test(desc)) { const m = desc.match(/(\d+(\.\d+)?)\s*%/); out.risk = { pct: m ? Number(m[1]) : isN(qty) && qty < 1 ? qty * 100 : null, amount: isN(amount) ? amount : null }; return; }
      if (/^total amount/i.test(desc)) { if (isN(amount)) out.total = amount; return; }
      if (/^(total|sub-?\s?total|page\s*\d|grand|carried|brought|summary|cost impact per)/i.test(desc)) return;
      const div = desc.match(/^DIVISION\s*0*(\d+)/i);
      if (div) { division = Number(div[1]); section = desc; parent = ''; if (isN(amount) && !unit) return; return; }
      if (/^section\b/i.test(desc)) { section = desc; parent = ''; return; }
      if (band && desc && !unit && isN(amount) && amount !== 0 && !isN(qty)) { out.rows.push({ item: '', desc: desc.slice(0, 320), unit: 'Item', qty: amount < 0 ? -1 : 1, rate: Math.abs(amount), amount, ref: '', band, division, section, discipline: '' }); return; }
      if (!unit || !(isN(qty) || isN(rate))) { if (desc.length > 12 && !desc.startsWith('*')) parent = desc; return; }
      if (!isN(rate) && isN(amount) && amount !== 0) { out.rows.push({ item: h.item >= 0 ? T(row[h.item]) : '', desc: `${desc.slice(0, 280)}${unit === '%' && isN(qty) ? ` (${qty}%)` : ''}`, unit: 'Item', qty: amount < 0 ? -1 : 1, rate: Math.abs(amount), amount, ref: '', band, division, section, discipline: '' }); return; }
      const full = parent && parent !== desc ? `${parent.slice(0, 160)}: ${desc}` : desc;
      const refTxt = h.ref >= 0 ? T(row[h.ref]) : '';
      out.rows.push({ item: h.item >= 0 ? T(row[h.item]) : '', desc: full.slice(0, 320), unit, qty: isN(qty) ? qty : 0, rate: isN(rate) ? rate : 0, amount: isN(amount) ? amount : 0, ref: refTxt, band, division, section, discipline: division ? DISC(division) : '' });
    });
    return out;
  }

  const SKIP = /cover|summary|checker|matrix|prime|^qs|take.?off/i;
  function parseBOQ(book) {
    const rows = []; const seen = {};
    book.sheets.filter(s => !s.hidden && !SKIP.test(s.name)).forEach(s => {
      const t = parseTable(s);
      if (t) t.rows.forEach(r => rows.push(r));
    });
    const items = rows.map(r => {
      const base = (r.division ? `D${r.division}-` : '') + (r.item || 'X').replace(/\.0$/, '');
      seen[base] = (seen[base] || 0) + 1;
      return { code: seen[base] > 1 ? `${base}/${seen[base]}` : base, desc: r.desc, unit: r.unit, qty: r.qty, rate: r.rate, discipline: r.discipline || 'General', section: r.section };
    });
    return { items, total: r2(items.reduce((a, b) => a + b.qty * b.rate, 0)) };
  }

  function parseTakeoff(book) {
    for (const s of book.sheets) for (let r = 0; r < Math.min(s.rows.length, 30); r++) {
      const c = (s.rows[r] || []).map(v => T(v).toLowerCase());
      const o = c.findIndex(x => /original|contract qty|old/.test(x)), n = c.findIndex(x => /revised|new qty/.test(x)), code = c.findIndex(x => /^(code|item)/.test(x));
      if (o >= 0 && n >= 0 && code >= 0) {
        const d = c.findIndex(x => /^desc/.test(x)), u = c.findIndex(x => /^unit/.test(x));
        return s.rows.slice(r + 1).filter(x => x && T(x[code])).map(x => ({ code: T(x[code]), desc: d >= 0 ? T(x[d]) : '', unit: u >= 0 ? T(x[u]) : '', originalQty: isN(x[o]) ? x[o] : 0, revisedQty: isN(x[n]) ? x[n] : 0 }));
      }
    }
    return null;
  }

  /* ---------- change request form ---------- */
  function labelValue(rows, re) {
    for (const row of rows) for (let c = 0; c < (row || []).length; c++) {
      if (typeof row[c] === 'string' && re.test(T(row[c]))) for (let k = c + 1; k < row.length; k++) if (row[k] != null && T(row[k]) !== '') return row[k];
    }
    return null;
  }
  function belowLabel(rows, re) {
    for (let r = 0; r < rows.length; r++) if (rows[r] && re.test(T(rows[r][0]))) { const v = rows[r + 1] && rows[r + 1][0]; return T(v); }
    return '';
  }
  const iso = v => (v instanceof Date ? v.toISOString().slice(0, 10) : '');
  const crDigits = s => { const m = T(s).match(/(\d+)\s*$/); return m ? String(Number(m[1])) : ''; };

  function parseCR(book) {
    const cover = book.sheets.find(s => /cover/i.test(s.name)) || book.sheets.find(s => s.rows.some(r => r && r.some(v => /value of this cr/i.test(T(v)))));
    if (!cover || !cover.rows.some(r => r && r.some(v => /value of this cr/i.test(T(v))))) return null;
    const rows = cover.rows, val = re => labelValue(rows, re);
    const cr = {
      subject: T(val(/^subject/i)), no: T(val(/^CR No/i)), date: iso(val(/^CR Issue Date/i)), contractRef: T(val(/^Contract Ref/i)), contractName: T(val(/^Contract Name/i)), contractor: T(val(/^Contractor/i)),
      contractPrice: val(/^Contract Price/i), contractDate: iso(val(/^Contract Date/i)), originator: T(val(/^Originator/i)), discipline: T(val(/^Discipline/i)), value: val(/^Value of This CR/i),
      description: belowLabel(rows, /^Full Description/i), basis: belowLabel(rows, /^Basis of Estimate/i), references: belowLabel(rows, /^Reference of Documents/i), reasons: [], other: ''
    };
    let words = ''; rows.forEach(r => (r || []).forEach(v => { if (/in words/i.test(T(v))) words = T(v); }));
    cr.words = words;
    rows.forEach(r => (r || []).forEach((v, i) => {
      if (v === true || v === 1) { const lab = T((r.slice(i + 1).find(x => x != null && T(x) !== '')) || ''); if (lab && i < 9 && !isN(lab)) cr.reasons.push(/^other/i.test(lab) ? 'Other' : lab); }
    }));
    if (!cr.reasons.length) rows.forEach(r => (r || []).forEach((v, i) => { const lab = T(r[i + 1]); if (v === true && lab) cr.reasons.push(lab); }));

    const visible = book.sheets.filter(s => !s.hidden && s !== cover);
    const types = book.sheets.find(s => /matrix/i.test(s.name));
    cr.matrix = [];
    if (types) {
      const hr = types.rows.findIndex(r => r && /type/i.test(T(r[0])) && r.some(v => /total/i.test(T(v))));
      if (hr >= 0) {
        const ti = types.rows[hr].findIndex(v => /total/i.test(T(v)));
        types.rows.slice(hr + 1).forEach(r => { if (r && T(r[0]) && !/^total/i.test(T(r[0])) && isN(r[ti])) cr.matrix.push({ name: T(r[0]), count: r[ti] }); });
      }
    }
    const sumSheet = visible.find(s => /^summary/i.test(T(s.name)));
    const sumRows = [];
    if (sumSheet) {
      const hr = sumSheet.rows.findIndex(r => r && r.some(v => /no\. of each type/i.test(T(v))));
      if (hr >= 0) sumSheet.rows.slice(hr + 1).forEach(r => { if (r && isN(r[2]) && T(r[1])) sumRows.push({ type: T(r[1]), count: r[2], each: r[3], total: r[4] }); });
    }
    cr.summary = sumRows;
    const lines = {}, order = []; let riskPct = null;
    const addLine = (x, typeName) => {
      const action = x.band || (x.qty < 0 || x.amount < 0 ? 'Omission' : 'Addition');
      const key = `${action}|${x.desc}|${x.rate}`;
      if (!lines[key]) { lines[key] = { action, desc: x.desc, unit: x.unit, rate: Math.abs(x.rate), ref: x.ref, discipline: x.discipline, qty: 0, perType: {} }; order.push(key); }
      if (typeName) lines[key].perType[typeName] = (lines[key].perType[typeName] || 0) + Math.abs(x.qty); else lines[key].qty += Math.abs(x.qty);
    };
    const summaryTable = sumSheet && parseTable(sumSheet);
    const useTypes = [];
    if (summaryTable && summaryTable.rows.length) {
      summaryTable.rows.forEach(x => addLine(x)); if (summaryTable.risk) riskPct = summaryTable.risk.pct;
    } else {
      const tabled = visible.filter(s => s !== sumSheet && !/matrix|^qs|sanitary fixtures qs|detailed summary/i.test(s.name)).map(s => ({ s, t: parseTable(s) })).filter(x => x.t && x.t.rows.length);
      sumRows.forEach(sr => {
        const hit = tabled.find(x => x.s.name.toLowerCase().includes(sr.type.toLowerCase()));
        if (hit && !hit.used) { hit.used = true; useTypes.push({ name: sr.type, count: sr.count }); hit.t.rows.forEach(x => addLine(x, sr.type)); if (hit.t.risk) riskPct = hit.t.risk.pct; }
      });
      const left = tabled.filter(x => !x.used);
      if (!useTypes.length && left.length) {
        const sr = sumRows.length === 1 && sumRows[0].count > 1 ? sumRows[0] : null;
        if (sr) useTypes.push({ name: sr.type, count: sr.count });
        left.forEach(x => { x.t.rows.forEach(y => addLine(y, sr ? sr.type : null)); if (x.t.risk) riskPct = x.t.risk.pct; });
      }
    }
    cr.types = useTypes; cr.riskPct = riskPct;
    cr.lines = order.map(k => { const l = lines[k]; return { ...l, perType: useTypes.length ? l.perType : null }; });

    const lineTotal = t => cr.lines.reduce((a, l) => { const q = useTypes.length ? useTypes.reduce((s, y) => s + y.count * (l.perType[y.name] || 0), 0) : l.qty; return a + (l.action === 'Omission' ? -1 : 1) * q * l.rate; }, 0);
    const adds = cr.lines.reduce((a, l) => { if (l.action !== 'Addition') return a; const q = useTypes.length ? useTypes.reduce((s, y) => s + y.count * (l.perType[y.name] || 0), 0) : l.qty; return a + q * l.rate; }, 0);
    cr.computed = r2(lineTotal() + (riskPct ? adds * riskPct / 100 : 0));

    const issues = [], v = isN(cr.value) ? cr.value : 0;
    if (words) { const w = wordsValue(words), ar2 = Math.abs(r2(v)); if (w.whole !== Math.floor(ar2) || w.piasters !== Math.round((ar2 - Math.floor(ar2)) * 100) || w.negative !== (v < 0)) issues.push({ level: 'error', text: `Value in words does not match the figure ${r2(v).toLocaleString('en-US')}. Words read: ${words.replace(/^IN WORDS\s*:\s*/i, '').slice(0, 90)}` }); }
    const nameNo = (book.name || '').match(/CR[-_\s]*0*(\d+)/i);
    if (nameNo && crDigits(cr.no) && nameNo[1] !== crDigits(cr.no)) issues.push({ level: 'warn', text: `File name says CR ${nameNo[1]}, the form says ${cr.no}.` });
    if (!nameNo && /CR[-_\s]*0+[-_\s]/i.test(book.name || '')) issues.push({ level: 'warn', text: `File name has no CR number, the form says ${cr.no}.` });
    const errs = book.sheets.reduce((a, s) => a + s.errors, 0);
    if (errs) issues.push({ level: 'warn', text: `${errs} formula error cells in the file: ${book.sheets.filter(s => s.errors).map(s => `${s.name}${s.hidden ? ' (hidden)' : ''}`).join(', ')}.` });
    if (cr.lines.length && Math.abs(cr.computed - v) > 1) issues.push({ level: 'warn', text: `Items read add up to ${cr.computed.toLocaleString('en-US')}, the cover says ${r2(v).toLocaleString('en-US')}.` });
    cr.issues = issues;
    return cr;
  }

  /* ---------- similar items and assessment matching ---------- */
  const STOP = new Set('the a an of and or for to in on with by as at per all including include items item mentioned supply install installation method measurements measurement mm thick type work works'.split(' '));
  const tokens = s => new Set(T(s).toLowerCase().replace(/[^a-z0-9.\s]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w)));
  function similarity(a, b) { const A = tokens(a), B = tokens(b); if (!A.size || !B.size) return 0; let n = 0; A.forEach(w => { if (B.has(w)) n++; }); return n / (A.size + B.size - n); }
  const unitKey = u => T(u).toLowerCase().replace(/[.\s]/g, '').replace('m³', 'm3').replace('m²', 'm2').replace('lm', 'm').replace(/^(no|nr|nos)$/, 'no');
  function similar(desc, unit, boq, n = 3) {
    return (boq || []).map(b => ({ b, score: similarity(desc, b.desc) + (unit && unitKey(unit) === unitKey(b.unit) ? 0.08 : 0) })).filter(x => x.score >= 0.2).sort((a, b) => b.score - a.score).slice(0, n);
  }
  const rank = (q, boq, n) => (boq || []).map(b => ({ b, score: overlap(q, b.desc) / Math.sqrt(tokens(b.desc).size + 1) })).filter(x => x.score > 0.45).sort((a, c) => c.score - a.score).slice(0, n);
  function overlap(a, b) { const A = tokens(a), B = tokens(b); let n = 0; A.forEach(w => { if (B.has(w)) n++; }); return n; }
  function matchAssessment(rows, lines) {
    const used = new Set(), unmatched = [], matches = [];
    rows.forEach(r => {
      let best = null, score = 0;
      lines.forEach(l => {
        if (used.has(l.id)) return;
        let s = similarity(r.desc, l.desc) + (unitKey(r.unit) === unitKey(l.unit) ? 0.08 : 0);
        if (r.item && l.boqCode && r.item === l.boqCode) s = 1;
        if (s > score) { score = s; best = l; }
      });
      if (best && score >= 0.3) { used.add(best.id); matches.push({ line: best, row: r, score }); } else unmatched.push(r);
    });
    return { matches, unmatched };
  }

  /* ---------- contract clauses ---------- */
  const TOPICS = [
    ['Variation pricing', /variation|valuation of|change order|rates? (for|of) (the )?(new|varied)|fair rate/i],
    ['OH&P', /overhead|profit/i], ['Notices', /notice|within \d+ days/i], ['Claims', /claim|extension of time|delay/i],
    ['Payment', /interim payment|payment certificate|ipc|advance payment/i], ['Retention', /retention/i],
    ['Price adjustment', /price adjustment|fluctuation|escalation/i], ['Free issue', /free.?issue|employer.?supplied|client.?supplied/i], ['Omissions', /omit|omission/i]
  ];
  function autoClauses(text) {
    const out = []; let cur = null;
    const flush = () => { if (cur && cur.text.length > 40) { const t = TOPICS.find(([, re]) => re.test(cur.text)); if (t) out.push({ topic: t[0], ref: cur.ref, text: cur.text.slice(0, 700) }); } };
    String(text || '').split(/\n/).forEach(line => {
      const m = line.match(/^\s*(?:clause\s*|sub-?clause\s*)?(\d{1,2}(?:\.\d{1,2}){1,3})[\s.:)-]+(.{3,})/i);
      if (m) { flush(); cur = { ref: m[1], text: T(m[2]) }; } else if (cur && T(line)) cur.text += ' ' + T(line);
    });
    flush();
    return out;
  }

  /* ---------- file type guess ---------- */
  function classify(book, hint) {
    const cr = parseCR(book);
    if (cr) return { kind: 'cr', cr };
    const take = parseTakeoff(book);
    if (take && take.length) return { kind: 'takeoff', takeoff: take };
    const boq = parseBOQ(book);
    if (boq.items.length) return { kind: hint === 'change' ? 'assessment' : 'boq', boq };
    return { kind: 'unknown' };
  }

  const api = { T, bookFrom, msgFrom, formLogos, amountWords, wordsValue, findHeader, parseTable, parseBOQ, parseTakeoff, parseCR, similarity, similar, rank, overlap, matchAssessment, autoClauses, classify, crDigits, TOPICS: TOPICS.map(t => t[0]) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Reader = api;
})(typeof window !== 'undefined' ? window : globalThis);
