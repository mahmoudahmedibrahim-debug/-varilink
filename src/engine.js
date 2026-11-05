// VariLink calculation engine. Pure functions, no DOM and no AI.
(function (root) {
  const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

  // Lump Sum and Design & Build keep BOQ quantities on full-item replacement.
  function measurementBasis(contractType) {
    if (contractType === 'Lump Sum' || contractType === 'Design & Build') return 'lumpsum';
    if (contractType === 'Re-measured') return 'remeasured';
    return 'actual';
  }

  function findBoq(pkg, code) { return (pkg.boq || []).find(b => b.code === code) || null; }

  function rateFor(line, pkg) {
    const contract = pkg.contract || {};
    const markup = num(contract.markupPct) / 100;
    const src = line.rateSource;
    if (src === 'BOQ' || src === 'Similar') {
      const b = findBoq(pkg, line.rateRef || line.boqCode);
      return { rate: b ? num(b.rate) : 0, basis: b ? `${src === 'BOQ' ? 'BOQ rate' : 'Similar item'} ${b.code}` : 'BOQ reference missing', direct: null };
    }
    if (src === 'Derived') {
      const b = findBoq(pkg, line.rateRef);
      const f = line.factor === '' || line.factor == null ? 1 : num(line.factor);
      return { rate: b ? round2(num(b.rate) * f) : 0, basis: b ? `Derived from ${b.code} x ${f}, all-in${line.derivation ? ': ' + line.derivation : ''}` : 'BOQ reference missing', direct: null };
    }
    if (src === 'New') {
      const direct = (line.breakdown || []).reduce((s, r) => s + num(r.qty) * num(r.rate), 0);
      if (direct > 0) return { rate: round2(direct * (1 + markup)), basis: `New rate: direct cost ${round2(direct)} + OH&P ${contract.markupPct || 0}%`, direct: round2(direct) };
      return { rate: num(line.rate), basis: line.quoteRef ? `Quotation ${line.quoteRef}` : 'New rate without build-up', direct: null };
    }
    return { rate: num(line.rate), basis: 'Manual rate', direct: null };
  }

  function typeTotal(line, change) {
    return (change && change.types || []).reduce((s, t) => s + num(t.count) * num((line.perType || {})[t.name]), 0);
  }

  function computeLine(line, pkg, change) {
    const basis = measurementBasis((pkg.contract || {}).type);
    const boq = line.boqCode ? findBoq(pkg, line.boqCode) : null;
    const flags = [];
    let qty = 0, qtyBasis = '', rateInfo;
    const hasTypes = line.perType && change && (change.types || []).length;
    const takeoff = hasTypes ? round2(typeTotal(line, change) * 1000) / 1000 : num(line.takeoffQty);
    const tBasis = hasTypes ? 'Quantity per type x number of each type' : null;

    if (line.action === 'Omission') {
      if (!boq && !num(line.rate)) flags.push({ level: 'error', text: 'Omission needs a BOQ item.' });
      if (!boq && num(line.rate)) flags.push({ level: 'warn', text: 'Not linked to a BOQ item yet.' });
      if (line.scope === 'full') {
        qty = boq ? num(boq.qty) : 0;
        qtyBasis = 'BOQ quantity: full item omitted';
      } else {
        qty = takeoff;
        qtyBasis = tBasis || 'Actual take-off: part of item omitted';
        if (boq && qty > num(boq.qty)) flags.push({ level: 'warn', text: `Omitted take-off ${qty} exceeds BOQ quantity ${num(boq.qty)}.` });
      }
      rateInfo = boq ? { rate: num(boq.rate), basis: `BOQ rate ${boq.code}`, direct: null } : { rate: num(line.rate), basis: line.rateNote || 'Rate from the form', direct: null };
    } else {
      const replaced = line.replacesCode ? findBoq(pkg, line.replacesCode) : null;
      if (basis === 'lumpsum' && replaced) {
        qty = num(replaced.qty);
        qtyBasis = `BOQ quantity of ${replaced.code}: lump sum full replacement`;
        if (line.unit && replaced.unit && line.unit !== replaced.unit) flags.push({ level: 'warn', text: `Unit ${line.unit} differs from replaced item unit ${replaced.unit}; the fixed quantity needs review.` });
      } else {
        qty = takeoff;
        qtyBasis = tBasis || 'Actual take-off from revised drawings';
      }
      rateInfo = rateFor(line, pkg);
      if (!rateInfo.rate) flags.push({ level: 'error', text: 'Rate is missing.' });
      if (line.rateSource === 'New' && !rateInfo.direct && !line.quoteRef) flags.push({ level: 'warn', text: 'New rate has no build-up or quotation.' });
    }

    if (!qty) flags.push({ level: 'error', text: 'Quantity is missing.' });
    if (line.source === 'AI' && !line.verified) flags.push({ level: 'warn', text: 'AI line is not verified yet.' });

    const sign = line.action === 'Omission' ? -1 : 1;
    const rate = rateInfo.rate;
    const amount = round2(sign * qty * rate), raw = sign * qty * rate;
    const contractorAmount = line.contractorQty === '' || line.contractorQty == null || line.contractorRate === '' || line.contractorRate == null ? null : round2(sign * num(line.contractorQty) * num(line.contractorRate));
    return { ...line, desc: line.desc || (boq ? boq.desc : ''), unit: line.unit || (boq ? boq.unit : ''), discipline: line.discipline || (boq ? boq.discipline : '') || 'General', qty, qtyBasis, rate, rateBasis: rateInfo.basis, direct: rateInfo.direct, sign, amount, raw, contractorAmount, flags };
  }

  function computeChange(change, pkg) {
    const lines = (change.lines || []).map(l => computeLine(l, pkg, change));
    const abortive = [];
    if (change.abortive && change.abortive.status === 'Yes') {
      lines.filter(l => l.action === 'Omission' && num(l.executedQty) > 0).forEach(l => {
        const q = num(l.executedQty);
        abortive.push({ id: l.id + '-abortive', action: 'Abortive', desc: `Abortive work: ${l.desc}`, unit: l.unit, discipline: l.discipline, qty: q, qtyBasis: 'Executed quantity confirmed by the supervision consultant', rate: l.rate, rateBasis: l.rateBasis, sign: 1, amount: round2(q * l.rate), contractorAmount: null, flags: q > l.qty ? [{ level: 'warn', text: 'Executed quantity exceeds omitted quantity.' }] : [], boqCode: l.boqCode });
      });
    }
    const all = lines.concat(abortive);
    const sum = f => all.filter(f).reduce((s, l) => s + (l.raw != null ? l.raw : l.amount), 0);
    const omissions = sum(l => l.action === 'Omission');
    const additions = sum(l => l.action === 'Addition');
    const abortiveTotal = sum(l => l.action === 'Abortive');
    const riskPct = change.riskPct != null && change.riskPct !== '' ? num(change.riskPct) : num((pkg.contract || {}).riskPct);
    const riskRaw = Math.max(additions, 0) * riskPct / 100, risk = round2(riskRaw);
    const net = round2(omissions + additions + abortiveTotal + riskRaw);
    const priced = lines.filter(l => l.contractorAmount != null);
    const contractorTotal = priced.length ? round2(priced.reduce((s, l) => s + l.contractorAmount, 0)) : null;
    return { lines: all, omissions: round2(omissions), additions: round2(additions), abortiveTotal: round2(abortiveTotal), risk, riskPct, net, contractorTotal, flags: all.flatMap(l => (l.flags || []).map(f => ({ ...f, line: l.desc }))) };
  }

  const STAGE_ORDER = ['DCR', 'NoV', 'Notice of Claim', 'Cost Study', 'Damage Report', 'CR', 'VO'];

  function latestStage(change) { const s = change.stages || []; return s.length ? s[s.length - 1] : null; }

  // Approved VO amount is final; otherwise the live AAA assessment is used.
  function changeValue(change, pkg) {
    const calc = computeChange(change, pkg);
    const vo = (change.stages || []).find(s => s.kind === 'VO' && s.status === 'Approved' && s.approved !== '' && s.approved != null);
    const closed = (change.stages || []).some(s => s.status === 'Cancelled');
    const latest = latestStage(change);
    const analysed = (change.lines || []).length > 0;
    const assessed = analysed ? calc.net : latest ? num(latest.amount) : 0;
    return { calc, approved: vo ? num(vo.approved) : null, closed, analysed, assessed, contractor: calc.contractorTotal != null ? calc.contractorTotal : change.contractorSubmitted != null ? num(change.contractorSubmitted) : null, value: closed ? 0 : vo ? num(vo.approved) : assessed };
  }

  function chainChecks(change) {
    const out = [], stages = change.stages || [];
    for (let i = 1; i < stages.length; i++) {
      const delta = round2(num(stages[i].amount) - num(stages[i - 1].amount));
      if (delta !== 0 && !stages[i].deltaReason) out.push({ level: 'error', text: `${stages[i].kind} ${stages[i].no || ''} moved by ${delta} from ${stages[i - 1].kind} without a reason.` });
    }
    return out;
  }

  // Cross-change check: total omitted across the package against BOQ quantity.
  function boqOveromissions(pkg) {
    const totals = {};
    (pkg.changes || []).forEach(ch => {
      if ((ch.stages || []).some(s => s.status === 'Cancelled')) return;
      computeChange(ch, pkg).lines.filter(l => l.action === 'Omission' && l.boqCode).forEach(l => {
        totals[l.boqCode] = totals[l.boqCode] || { qty: 0, refs: [] };
        totals[l.boqCode].qty += l.qty; totals[l.boqCode].refs.push(ch.id);
      });
    });
    return Object.entries(totals).map(([code, t]) => {
      const b = findBoq(pkg, code);
      return b && round2(t.qty) > num(b.qty) ? { level: 'warn', code, text: `${code}: ${round2(t.qty)} ${b.unit} omitted across ${[...new Set(t.refs)].join(', ')}, BOQ holds ${num(b.qty)}.` } : null;
    }).filter(Boolean);
  }

  function packageSummary(pkg) {
    const boqSum = (pkg.boq || []).reduce((s, b) => s + num(b.qty) * num(b.rate), 0);
    const contractSum = pkg.contractAmount != null ? num(pkg.contractAmount) : boqSum;
    let approved = 0, pending = 0, omissions = 0, additions = 0, abortive = 0, contractorSubmitted = 0, unanalysed = 0, risk = 0;
    const byDiscipline = {};
    (pkg.changes || []).forEach(ch => {
      const v = changeValue(ch, pkg);
      if (v.closed) return;
      if (v.approved != null) approved += v.approved; else pending += v.assessed;
      if (!v.analysed) { unanalysed += v.value; const d = ch.discipline || 'Not broken down'; byDiscipline[d] = round2((byDiscipline[d] || 0) + v.value); }
      omissions += v.calc.omissions; additions += v.calc.additions; abortive += v.calc.abortiveTotal; risk += v.calc.risk;
      if (v.contractor != null) contractorSubmitted += v.contractor;
      v.calc.lines.forEach(l => { byDiscipline[l.discipline] = round2((byDiscipline[l.discipline] || 0) + l.amount); });
    });
    const cumulative = round2(approved + pending);
    return { contractSum: round2(contractSum), approved: round2(approved), pending: round2(pending), cumulative, omissions: round2(omissions), additions: round2(additions), abortive: round2(abortive), risk: round2(risk), unanalysed: round2(unanalysed), contractorSubmitted: round2(contractorSubmitted), byDiscipline, adjusted: round2(contractSum + cumulative), pct: contractSum ? cumulative / contractSum : 0 };
  }

  function logRows(pkg) {
    return (pkg.changes || []).map(ch => {
      const v = changeValue(ch, pkg), s = k => (ch.stages || []).find(x => x.kind === k) || {};
      const latest = latestStage(ch) || {};
      return { id: ch.id, title: ch.title, reason: ch.reason, reasonRef: ch.reasonRef, dcr: s('DCR'), nov: s('NoV'), claim: s('Notice of Claim'), cr: s('CR'), vo: s('VO'), si: (ch.si || []), contractor: v.contractor, assessed: v.assessed, approved: v.approved, stage: latest.kind || '', status: latest.status || '', variance: v.contractor == null ? null : round2(v.contractor - v.assessed), chain: (ch.stages || []).map(x => `${x.kind} ${x.no || ''}`.trim()).join(' > ') };
    });
  }

  // Compares an original / revised take-off table with the BOQ.
  function compareTakeoff(rows, pkg, tolerancePct) {
    const tol = (tolerancePct == null ? 5 : tolerancePct) / 100;
    return rows.map(r => {
      const b = findBoq(pkg, r.code), o = num(r.originalQty), n = num(r.revisedQty), delta = round2(n - o);
      const flags = [];
      if (r.code && !b) flags.push('Code is not in the BOQ');
      if (b && o && num(b.qty) && Math.abs(o - num(b.qty)) / num(b.qty) > tol) flags.push(`Original take-off ${o} differs from BOQ ${num(b.qty)}`);
      const action = delta < 0 ? 'Omission' : delta > 0 ? 'Addition' : null;
      const scope = action === 'Omission' && b && n === 0 ? 'full' : 'partial';
      return { ...r, boq: b, delta, action, scope, flags };
    });
  }

  const isoDate = v => {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const m = String(v || '').trim().match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
  };
  const txt = v => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
  const money2 = v => (typeof v === 'number' ? v : 0);

  function findHeader(sheets, tests) {
    for (const sh of sheets) for (let r = 0; r < Math.min(sh.rows.length, 30); r++) {
      const cells = (sh.rows[r] || []).map(txt);
      const map = {}; let ok = true;
      for (const [key, re] of Object.entries(tests)) { const i = cells.findIndex(c => re.test(c)); if (i < 0) ok = false; else map[key] = i; }
      if (ok) return { sheet: sh, row: r, col: map };
    }
    return null;
  }

  // Reads a project cost report: the package summary and the change management log.
  function parseCostReport(sheets) {
    const pk = findHeader(sheets, { ref: /^Package Ref/i, name: /^Package Name/i, contractor: /^Contractor$/i, type: /^Type of Contract/i, amount: /^Accepted Contract Amount/i });
    const lg = findHeader(sheets, { pkg: /^Package No/i, title: /^Change Description/i, reason: /^Reason for/i, cr: /^CR No/i, crDate: /^CR Creation Date/i, status: /^CR Status/i, est: /^CR Estimated Amount/i, vo: /^VO NO/i, voDate: /^Submission Date/i, aaa: /^AAA-Assessment/i, sub: /^Contractor Submission/i, app: /^Approved Amount/i, si: /^SWI\/CAI$/i, siDate: /^SWI\/CAI Date/i, comments: /^Comments/i });
    if (!pk) throw new Error('No package summary found. It needs Package Ref., Package Name, Contractor, Type of Contract and Accepted Contract Amount columns.');
    if (!lg) throw new Error('No change log found. It needs CR No, CR Status, VO No and Approved Amount columns.');
    const packages = [];
    pk.sheet.rows.slice(pk.row + 1).forEach(row => {
      const code = txt(row[pk.col.ref]);
      if (!/^(PKG|PK|DP)\s*#?\s*\d+/i.test(code)) return;
      const type = txt(row[pk.col.type]);
      packages.push({ id: 'k' + (packages.length + 1), code, name: txt(row[pk.col.name]), contractor: txt(row[pk.col.contractor]), contractAmount: money2(row[pk.col.amount]), contract: { type: /lump/i.test(type) ? 'Lump Sum' : /re-?meas/i.test(type) ? 'Re-measured' : /design/i.test(type) ? 'Design & Build' : /cost/i.test(type) ? 'Cost Plus' : 'Other', typeOther: type, markupPct: 0, riskPct: 10, vatPct: 14, designFeesIncluded: 'No', iftIsIfc: 'Yes', geotech: 'Yes', pricingClause: '', paymentClause: '', notes: '' }, docs: [], boq: [], changes: [], clauses: [], types: [], vos: [] });
    });
    const statusOf = s => /cancel|terminat/i.test(s) ? 'Cancelled' : /^pending/i.test(s) ? s : /approved|vo issued/i.test(s) ? 'Approved' : 'Draft';
    let rowsRead = 0; const unmatched = new Set();
    lg.sheet.rows.slice(lg.row + 1).forEach(row => {
      const cr = txt(row[lg.col.cr]), code = txt(row[lg.col.pkg]);
      if (!/^CR/i.test(cr)) return;
      const k = packages.find(p => p.code.replace(/\s/g, '').toUpperCase() === code.replace(/\s/g, '').toUpperCase());
      if (!k) { unmatched.add(code); return; }
      rowsRead++;
      const raw = txt(row[lg.col.status]), status = statusOf(raw), reason = txt(row[lg.col.reason]);
      const stages = [];
      const dcr = reason.match(/DCR\s*-?\s*\d+/i);
      if (dcr) stages.push({ kind: 'DCR', no: dcr[0], date: '', status: 'Approved', amount: money2(row[lg.col.est]), approved: '', letterRef: '', deltaReason: '' });
      const vo = txt(row[lg.col.vo]), issued = /vo issued/i.test(raw);
      stages.push({ kind: 'CR', no: cr, date: isoDate(row[lg.col.crDate]), status: issued ? 'Approved' : status, amount: money2(row[lg.col.est]), approved: '', letterRef: '', deltaReason: stages.length ? 'Imported from cost report' : '' });
      if (vo || issued) stages.push({ kind: 'VO', no: vo, date: isoDate(row[lg.col.voDate]), status: issued ? 'Approved' : 'Draft', amount: typeof row[lg.col.aaa] === 'number' ? row[lg.col.aaa] : money2(row[lg.col.app]), approved: issued ? money2(row[lg.col.app]) : '', letterRef: '', deltaReason: 'Imported from cost report' });
      const n = k.changes.length + 1;
      k.changes.push({ id: `CE-${k.code.replace(/\W/g, '')}-${String(n).padStart(3, '0')}`.toUpperCase(), title: txt(row[lg.col.title]), description: '', reason: dcr ? 'Design Change' : /mail/i.test(reason) ? 'Client Change' : 'Other', reasonRef: reason, discipline: '', imported: true, contractorSubmitted: typeof row[lg.col.sub] === 'number' ? row[lg.col.sub] : null, abortive: { status: 'Not applicable' }, si: txt(row[lg.col.si]) && !/^no$/i.test(txt(row[lg.col.si])) ? [{ no: txt(row[lg.col.si]), date: isoDate(row[lg.col.siDate]), ref: '' }] : [], lines: [], stages });
    });
    return { packages, rowsRead, unmatched: [...unmatched] };
  }

  function parseAiJson(text) {
    const t = String(text || '').trim(), s = t.indexOf('{'), e = t.lastIndexOf('}');
    if (s < 0 || e < 0) throw new Error('No JSON found in the reply.');
    return JSON.parse(t.slice(s, e + 1));
  }

  const api = { round2, num, measurementBasis, findBoq, rateFor, computeLine, computeChange, changeValue, chainChecks, boqOveromissions, packageSummary, logRows, latestStage, compareTakeoff, parseCostReport, parseAiJson, STAGE_ORDER };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
