/* APAAR module: APAAR ID creation, from the "APAAR Entry Status - School Wise (Only Operational)"
 * export of the UDISE+ portal, uploaded as it is. */
'use strict';

(() => {
    // APAAR Entry Status - School Wise: Block Name, School Name, UDISE Code, School Management, School Category,
    // Total Student, Total Generated, Total Requested, Total Failed. The title rows above the header carry
    // "Data as on : DD-MM-YYYY", which is used as the data date.
    function parse(rows, hi, H) {
        const find = colFinder(H);
        const iBlock = find(x => /block\s*name/i.test(x));
        const iSchool = find(x => /school\s*name/i.test(x));
        const iUdise = find(x => /udise/i.test(x));
        const iMg = find(x => /management/i.test(x));
        const iCt = find(x => /category/i.test(x));
        const iTotal = find(x => /total\s*student/i.test(x));
        const iGen = find(x => /generated/i.test(x));
        const iReq = find(x => /requested/i.test(x));
        const iFail = find(x => /failed/i.test(x));
        let asOn = null;
        rows.slice(0, hi).forEach(r => r.forEach(c => {
            const m = String(c).match(/data\s*as\s*on\s*:?\s*(\d{2})[-/.](\d{2})[-/.](20\d{2})/i);
            if (m) asOn = `${m[3]}-${m[2]}-${m[1]}`;
        }));
        const schools = [];
        for (const r of rows.slice(hi + 1)) {
            const n = cellText(r, iSchool);
            if (!n || /^\(\d+\)$/.test(n)) continue; // skip the "(1) (2) (3)" column-number row
            schools.push({
                b: cellText(r, iBlock) || 'UNKNOWN', n, u: cellText(r, iUdise), mc: cellText(r, iMg), cc: cellText(r, iCt),
                t: num(r[iTotal]), o: num(r[iGen]), rq: iReq >= 0 ? num(r[iReq]) : 0, fl: iFail >= 0 ? num(r[iFail]) : 0,
            });
        }
        return { schools, asOn };
    }

    // pend = students without an APAAR ID; nr = of those, not yet requested (and not failed)
    const K = colSet({
        t: 'Total Students', o: 'APAAR Generated', pend: 'Not Generated', p: 'Generated %', dO: 'Change (Gen.)',
        rq: { k: 'rq', h: 'Requested', type: 'n' }, fl: { k: 'fl', h: 'Failed', type: 'n' }, nr: { k: 'nr', h: 'Not Requested', type: 'n' },
    });

    function dashboard(v) {
        const S = cur(), P = prev(), T = S.total, PT = P && P.total;
        const d = k => (PT ? T[k] - PT[k] : null);
        const ranked = rankedBlocks(S, P);
        const base = modBase();
        pageHead(v, 'District Dashboard', subLine(S, P));
        heroCard(v, S, P, ranked, {
            ring: 'generated', unit: 'APAAR IDs',
            label: 'District APAAR creation &middot; Purba Bardhaman',
            title: `<b>${fmtN(T.o)}</b> of ${fmtN(T.t)} students have an APAAR ID`,
            meta: `${fmtN(T.pend)} students still without an APAAR ID across ${fmtN(T.schools)} schools`,
        });
        statGrid(v, [
            { label: 'Total Students', value: fmtN(T.t), delta: d('t'), foot: `in ${fmtN(T.schools)} schools`, ic: 'person', tone: 'blue' },
            { label: 'APAAR Generated', value: fmtN(T.o), delta: d('o'), foot: `${fmtP(T.p)}% of all students`, ic: 'check', tone: 'green' },
            { label: 'Not Generated', value: fmtN(T.pend), delta: d('pend'), invert: true, foot: `${fmtP(100 - T.p)}% yet to get an APAAR ID`, ic: 'clock', tone: 'red' },
            { label: 'Generated %', value: fmtP(T.p) + '%', delta: d('p'), pctDelta: true, foot: `best block ${fmtP(ranked[0].p)}%`, ic: 'up', tone: 'indigo' },
        ]);
        const k = (label, key, o = {}) => `<a class="kpi ${o.cls || ''}"${o.href ? ` href="${o.href}"` : ''}><span class="kpi-label">${label}</span><span class="kpi-val">${fmtN(T[key])}</span><span class="kpi-delta">${PT ? deltaHtml(T[key] - PT[key], false, o.invert) + ` <small>since ${fmtD(P.date)}</small>` : `<small>${o.foot || ''}</small>`}</span></a>`;
        v.append(h(`<div class="kpis">
            ${k('Requested (in process)', 'rq', { cls: 'mid', foot: `in ${fmtN(S.schools.filter(x => x.rq > 0).length)} schools`, href: `${base}schools/requested` })}
            ${k('Failed', 'fl', { cls: 'bad', invert: true, foot: `in ${fmtN(S.schools.filter(x => x.fl > 0).length)} schools`, href: `${base}schools/failed` })}
            ${k('Not yet requested', 'nr', { invert: true, foot: 'without ID, request or failure' })}
            ${k('Schools with no students', 'na', { foot: 'Total Student = 0', href: `${base}schools/na` })}
        </div>`));
        catGrid(v, [
            { key: 'full', label: '100% APAAR Generated', ic: 'full' },
            { key: 'part', label: 'Partially Generated (1-99%)', ic: 'part' },
            { key: 'zero', label: '0% APAAR Generated', ic: 'zero', invert: true },
        ], S, P);

        const best = ranked[0], worst = ranked[ranked.length - 1];
        const most = [...ranked].sort((a, b) => b.pend - a.pend)[0];
        const notes = [
            ['up', `Highest generation: <b>${esc(best.block)}</b> at ${fmtP(best.p)}%; lowest: <b>${esc(worst.block)}</b> at ${fmtP(worst.p)}%.`],
            ['zero', `<b>${fmtN(T.zero)}</b> schools (${fmtP(pct(T.zero, T.schools))}%) have not generated any APAAR ID. <a href="${base}schools/zero">See list &rsaquo;</a>`],
            ['flag', `Most students without APAAR: <b>${esc(most.block)}</b> (${fmtN(most.pend)} students).`],
        ];
        if (T.fl) notes.push(['info', `<b>${fmtN(T.fl)}</b> APAAR requests have failed in ${fmtN(S.schools.filter(x => x.fl > 0).length)} schools and need correction. <a href="${base}schools/failed">See list &rsaquo;</a>`]);
        if (P) {
            const sr = schoolRows(S, P);
            const newFull = sr.filter(x => x.c === 'full' && x.cPrev && x.cPrev !== 'full').length;
            const outZero = sr.filter(x => x.cPrev === 'zero' && x.c !== 'zero').length;
            const improved = sr.filter(x => x.dO > 0).length;
            const regressed = sr.filter(x => x.dO < 0).length;
            const still = ranked.filter(b => b.dO === 0).map(b => b.block);
            const gainer = [...ranked].sort((a, b) => (b.dO || 0) - (a.dO || 0))[0];
            notes.unshift(['check', `Since ${fmtD(P.date)}: <b>${fmtN(improved)}</b> schools improved, <b>${fmtN(newFull)}</b> became 100% and <b>${fmtN(outZero)}</b> moved out of 0%. <a href="${base}compare">Details &rsaquo;</a>`]);
            if (gainer && gainer.dO > 0) notes.push(['up', `Top gainer since ${fmtD(P.date)}: <b>${esc(gainer.block)}</b> (${signed(gainer.dO)} APAAR IDs).`]);
            if (still.length) notes.push(['info', `No progress since ${fmtD(P.date)} in ${still.length} block(s): ${still.map(esc).join(', ')}.`]);
            if (regressed) notes.push(['down', `<span class="down">${fmtN(regressed)} school(s) show fewer APAAR IDs than on ${fmtD(P.date)}</span> &mdash; please verify.`]);
        }
        notesCard(v, notes);

        const g = grid2(v);
        doughnutCard(g, 'Schools by APAAR Generation Level', ['100%', '1-99%', '0%', 'No students'], [T.full, T.part, T.zero, T.na], [COLORS.good, COLORS.mid, COLORS.bad, COLORS.na]);
        bandsCard(g, 'Blocks by Generation Level', [['Below 20%', 0, 20], ['20-40%', 20, 40], ['40-60%', 40, 60], ['60-80%', 60, 80], ['80% and above', 80, 101]], ranked,
            [COLORS.bad, '#ef6c00', COLORS.mid, COLORS.brand2, COLORS.good]);
        chart(card(v, 'Block-wise APAAR Generated %'), Math.max(320, ranked.length * 20 + 60), {
            type: 'bar',
            data: {
                labels: ranked.map(b => b.block),
                datasets: [{ label: 'Generated %', data: ranked.map(b => round2(b.p)), backgroundColor: ranked.map(b => COLORS[pctCls(b.p)]), borderRadius: 3, maxBarThickness: 18 }],
            },
            options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, max: 100, ticks: { callback: x => x + '%' } }, y: { ticks: { autoSkip: false, font: { size: 10 } } } } },
        });
        dashTrend(v, 'Generated %', [['0% schools', t => t.zero, COLORS.bad], ['100% schools', t => t.full, COLORS.good]]);
        topBottom(v, S, P, ranked, [C.rank, C.block, K.o, K.p, col(K.dO, { h: 'Change' })]);
        groupSummary(v, S, P);
    }

    const blocks = v => blocksPage(v, {
        heading: 'Block-wise APAAR Status',
        cols: [C.rank, C.block, C.schools, K.t, K.o, K.pend, K.p, K.dO, C.dP, K.rq, K.fl, C.full, C.part, C.zero, C.status],
        measure: 'generated %',
        extra: ' <b>Not Generated</b> = Total Students &minus; APAAR Generated; it includes the Requested and Failed students.',
        chartTitle: 'School generation levels by block',
        chartSets: [['100%', 'full', COLORS.good], ['1-99%', 'part', COLORS.mid], ['0%', 'zero', COLORS.bad], ['No students', 'na', COLORS.na]],
    });

    const schools = (v, r) => schoolsPage(v, r, {
        lists: {
            all: ['All Schools', 'All schools', () => true],
            full: ['100% APAAR Generated Schools', '100% generated', x => x.c === 'full'],
            part: ['Partially Generated Schools (1-99%)', '1-99% generated', x => x.c === 'part'],
            zero: ['0% APAAR Generated Schools', '0% generated', x => x.c === 'zero'],
            na: ['Schools with No Students', 'No students', x => x.c === 'na'],
            requested: ['Schools with APAAR Requests in Process', 'Has requests in process', x => x.rq > 0],
            failed: ['Schools with Failed APAAR Requests', 'Has failed requests', x => x.fl > 0],
        },
        filterLabel: 'APAAR status',
        cols: (catKey, P) => [K.t, K.o, K.pend, K.p, K.rq, K.fl,
            ...(P ? [{ k: 'oPrev', h: `Gen. on ${fmtD(P.date)}`, type: 'n' }, K.dO] : []),
            ...(catKey === 'all' ? [K.cat] : [])],
        sorts: { zero: ['t', 'desc'], part: ['p', 'asc'], failed: ['fl', 'desc'], requested: ['rq', 'desc'] },
        chips: t => [['Students', fmtN(t.t)], ['Generated', fmtN(t.o)], ['Not generated', fmtN(t.pend)], ['Generated %', fmtP(t.p)], ['Requested', fmtN(t.rq)], ['Failed', fmtN(t.fl)]],
    });

    const compare = (v, r) => comparePage(v, r, {
        kpis: [['APAAR Generated', 'o', { cls: 'good' }], ['Generated %', 'p', { pct: true }], ['Total Students', 't'], ['Failed', 'fl', { invert: true, cls: 'bad' }],
            ['100% Schools', 'full', { cls: 'good' }], ['1-99% Schools', 'part', { cls: 'mid' }], ['0% Schools', 'zero', { invert: true, cls: 'bad' }]],
        blockCols: (dA, dB) => [K.t, { k: 'oA', h: `Gen. ${dA}`, type: 'n' }, { k: 'o', h: `Gen. ${dB}`, type: 'n' }, K.dO,
            { k: 'pA', h: `% ${dA}`, type: 'p' }, { k: 'p', h: `% ${dB}`, type: 'p' }, C.dP,
            { k: 'fullA', h: `100% ${dA}`, type: 'n' }, { k: 'full', h: `100% ${dB}`, type: 'n' },
            { k: 'zeroA', h: `0% ${dA}`, type: 'n' }, { k: 'zero', h: `0% ${dB}`, type: 'n' }, { k: 'dZero', h: 'Change (0% sch.)', type: 'd', invert: true }],
        moves: [
            ['Schools improved', x => x.dO > 0],
            ['Became 100%', x => x.c === 'full' && x.cPrev && x.cPrev !== 'full'],
            ['Moved out of 0%', x => x.cPrev === 'zero' && x.c !== 'zero'],
            ['Still 0% on both dates', x => x.c === 'zero' && x.cPrev === 'zero'],
            ['Generated count decreased', x => x.dO < 0],
            ['New in later file', x => x.cPrev == null],
        ],
        moveCols: (dA, dB) => [K.t, { k: 'oPrev', h: `Gen. ${dA}`, type: 'n' }, { k: 'o', h: `Gen. ${dB}`, type: 'n' }, K.dO, K.p, K.cat],
        moveSort: 'dO',
    });

    const trend = v => trendPage(v, {
        bar: ['APAAR generated', 'rgba(37,99,235,.35)'],
        cols: [C.schools, K.t, K.o, col(K.dO, { h: 'Daily change' }), K.p, C.dP, K.rq, K.fl, C.full, C.part, C.zero, K.pend],
        metrics: [['p', 'Generated %'], ['o', 'APAAR generated'], ['pend', 'Not generated'], ['fl', 'Failed'], ['zero', '0% schools'], ['full', '100% schools']],
        invert: ['zero', 'pend', 'fl'],
    });

    function rank(v) {
        const S = cur(), P = prev();
        const ranked = rankedBlocks(S, P);
        const sub = plainSub(S, P);
        pageHead(v, 'Leading & Lagging', subLine(S, P));
        const bcols = [C.rank, C.block, K.t, K.o, K.pend, K.p, K.dO];

        const g1 = grid2(v);
        tableCard(g1, 'Top 10 Leading Blocks (by generated %)', { cols: bcols, rows: ranked.slice(0, 10), onRow: blockGo }, sub);
        tableCard(g1, 'Bottom 10 Lagging Blocks (by generated %)', { cols: bcols, rows: ranked.slice(-10).reverse(), onRow: blockGo }, sub);

        const g2 = grid2(v, true);
        if (P) {
            tableCard(g2, `Top Gainers since ${fmtD(P.date)}`, { cols: [C.idx, C.block, K.dO, C.dP, K.p, { k: 'dFull', h: 'New 100% sch.', type: 'd' }], rows: [...ranked].sort((a, b) => b.dO - a.dO).slice(0, 10), onRow: blockGo }, sub);
            tableCard(g2, `Least Progress since ${fmtD(P.date)}`, { cols: [C.idx, C.block, K.dO, C.dP, K.p, K.pend], rows: [...ranked].sort((a, b) => a.dO - b.dO || a.p - b.p).slice(0, 10), onRow: blockGo }, sub);
        }
        tableCard(g2, 'Blocks with Most Students without APAAR', { cols: [C.idx, C.block, K.t, K.o, K.pend, K.p], rows: [...ranked].sort((a, b) => b.pend - a.pend).slice(0, 10), onRow: blockGo }, sub);
        tableCard(g2, 'Blocks with Most 0% Schools', { cols: [C.idx, C.block, C.schools, C.zero, { k: 'zp', h: '% of schools at 0%', type: 'p', v: r => pct(r.zero, r.schools) }, K.p], rows: [...ranked].sort((a, b) => b.zero - a.zero).slice(0, 10), onRow: blockGo }, sub);
        tableCard(g2, 'Blocks with Most Failed Requests', { cols: [C.idx, C.block, K.fl, K.rq, K.o, K.p], rows: [...ranked].filter(b => b.fl > 0).sort((a, b) => b.fl - a.fl).slice(0, 10), onRow: blockGo }, sub);

        const sr = schoolRows(S, P);
        const scols = [C.idx, C.sb, C.school, C.udise, K.t, K.o, K.pend, K.p];
        const g3 = h('<div class="stack" style="margin-top:16px"></div>');
        v.append(g3);
        tableCard(g3, 'Priority Schools - Most Students without APAAR (Top 50)', { cols: scols, rows: [...sr].sort((a, b) => b.pend - a.pend).slice(0, 50), onRow: schoolGo }, sub);
        tableCard(g3, 'Large Schools at 0% (Top 50 by students)', { cols: scols, rows: sr.filter(x => x.c === 'zero').sort((a, b) => b.t - a.t).slice(0, 50), onRow: schoolGo }, sub);
        tableCard(g3, 'Schools with Most Failed Requests (Top 50)', { cols: [...scols, K.fl], rows: sr.filter(x => x.fl > 0).sort((a, b) => b.fl - a.fl).slice(0, 50), onRow: schoolGo }, sub);
        if (P) tableCard(g3, `Best Performing Schools since ${fmtD(P.date)} (Top 50)`, { cols: [...scols, K.dO], rows: sr.filter(x => x.dO > 0).sort((a, b) => b.dO - a.dO).slice(0, 50), onRow: schoolGo }, sub);
    }

    // ------------------------------------------------------------ Block x Management report (fits two slides)
    // Dept. of Education, SSK & MSK and Govt. Sponsored schools side by side, every other management together
    const MG4 = [
        { k: 'doe', h: 'Dept. of Education', names: ['Department of Education'], tone: '#2563eb' },
        { k: 'ssk', h: 'SSK & MSK', names: ['SSKs & MSKs'], tone: '#7c3aed' },
        { k: 'gs', h: 'Govt. Sponsored', names: ['Govt. Sponsored'], tone: '#0891b2' },
        { k: 'oth', h: 'Other Managements', names: null, tone: '#d97706' },
        { k: 'all', h: 'All Managements', names: null, tone: '#0b1f44' },
    ];
    const MG_SUB = [['schools', 'Schools'], ['t', 'Enrolment'], ['o', 'APAAR'], ['pend', 'Pending'], ['p', '%']];
    const MG_SHORT = ['Sch.', 'Enrol.', 'APAAR', 'Pending', '%']; // headings for the narrow PDF / slide columns
    const MG_TITLE = 'APAAR Creation Status - Block & Management-wise';
    const mg4Of = x => { const n = groupOf(x, 'mg'); const g = MG4.find(m => m.names && m.names.includes(n)); return g ? g.k : 'oth'; };

    function mgReport(S) {
        return memo(`mg4|${S.date}`, () => {
            const m = MODULES[S.kind];
            const mk = name => Object.fromEntries(MG4.map(g => [g.k, blank(name, m)]));
            const rows = S.blocks.map(b => ({ block: b.block, g: mk(b.block) }));
            const byB = new Map(rows.map(r => [r.block, r]));
            const tot = { block: 'District Total', g: mk('District Total') };
            const others = new Map();
            S.schools.forEach(x => {
                const k = mg4Of(x);
                [byB.get(x.b), tot].forEach(r => { addTo(r.g[k], x, m); addTo(r.g.all, x, m); });
                if (k === 'oth') { const n = groupOf(x, 'mg'); others.set(n, (others.get(n) || 0) + 1); }
            });
            [...rows, tot].forEach(r => Object.values(r.g).forEach(a => finish(a, m)));
            return { rows, tot, others: [...others].sort((a, b) => b[1] - a[1]) };
        });
    }

    // One cell: { text, cls } where cls marks a % above (hi) / below (lo) the district % of the same management
    function mgCell(R, r, gk, sk, total) {
        const a = r.g[gk];
        if (!a.schools) return { text: '-', cls: '' };
        if (sk !== 'p') return { text: fmtN(a[sk]), cls: '' };
        const d = R.tot.g[gk].p;
        return { text: fmtP(a.p), cls: total || !a.t ? '' : a.p >= d ? 'hi' : 'lo' };
    }
    const othersNote = R => R.others.map(([n, c]) => `${n} (${fmtN(c)})`).join(', ');

    function mgmt(v) {
        const S = cur(), R = mgReport(S);
        const btns = h('<div class="actions"><button class="btn xls">Excel</button><button class="btn pdf">PDF</button><button class="btn ppt">PowerPoint (2 slides)</button></div>');
        const run = fn => async e => {
            const b = e.currentTarget;
            b.disabled = true;
            try { await fn(R); } catch (err) { console.error(err); toast('Export failed: ' + err.message, true); }
            b.disabled = false;
        };
        btns.children[0].onclick = run(mgExcel);
        btns.children[1].onclick = run(mgPDF);
        btns.children[2].onclick = run(mgPPT);
        pageHead(v, 'Block & Management-wise Report', `Data as on <b>${fmtD(S.date)}</b> &middot; schools, enrolment, APAAR created, pending and % for each management`, btns);

        // district tiles, one per management group
        v.append(h(`<div class="mg-tiles">${MG4.map(g => {
            const a = R.tot.g[g.k];
            return `<div class="mg-tile ${g.k}" style="--tone:${g.tone}">
                <h3>${esc(g.h)}</h3>
                <div class="mg-pct">${fmtP(a.p)}% <small>created</small></div>
                <div class="cat-bar"><span style="width:${Math.min(100, a.p)}%"></span></div>
                <dl><dt>Schools</dt><dd>${fmtN(a.schools)}</dd><dt>Enrolment</dt><dd>${fmtN(a.t)}</dd><dt>APAAR created</dt><dd>${fmtN(a.o)}</dd><dt>Pending</dt><dd>${fmtN(a.pend)}</dd>
                <dt>Share of pending</dt><dd>${fmtP(pct(a.pend, R.tot.g.all.pend))}%</dd></dl>
            </div>`;
        }).join('')}</div>`));
        v.append(h(`<p class="help mg-note"><b>Other Managements:</b> ${esc(othersNote(R)) || 'none'}.</p>`));

        const head1 = `<tr><th rowspan="2" class="sticky">#</th><th rowspan="2" class="sticky2">Block</th>${MG4.map(g => `<th colspan="${MG_SUB.length}" class="g ${g.k === 'all' ? 'all' : ''}">${esc(g.h)}</th>`).join('')}</tr>`;
        const head2 = `<tr>${MG4.map(g => MG_SUB.map(([, t], i) => `<th class="num${i === 0 ? ' gs' : ''}${g.k === 'all' ? ' all' : ''}">${t}</th>`).join('')).join('')}</tr>`;
        const line = (r, i, total) => `<td class="sticky num">${total ? '' : i + 1}</td><td class="sticky2 nowrap">${esc(r.block)}</td>` + MG4.map(g => MG_SUB.map(([sk], j) => {
            const c = mgCell(R, r, g.k, sk, total);
            return `<td class="num${j === 0 ? ' gs' : ''}${g.k === 'all' ? ' all' : ''}${sk === 'p' ? ' pc ' + c.cls : ''}">${c.text}</td>`;
        }).join('')).join('');
        const body = card(v, `Block-wise by Management (${R.rows.length} blocks)`, null, true);
        body.append(h(`<div class="table-wrap"><table class="mg-table"><thead>${head1}${head2}</thead>
            <tbody>${R.rows.map((r, i) => `<tr class="clickable" data-b="${esc(r.block)}">${line(r, i)}</tr>`).join('')}</tbody>
            <tfoot><tr>${line(R.tot, 0, true)}</tr></tfoot></table></div>`));
        body.onclick = e => { const tr = e.target.closest('tr[data-b]'); if (tr) blockGo({ block: tr.dataset.b }); };
        v.append(h(`<p class="help"><span class="legend"><i style="background:var(--good)"></i>% at or above the district % of the same management</span>
            <span class="legend"><i style="background:var(--bad)"></i>below it</span> &middot; Pending = Enrolment &minus; APAAR created &middot; tap a block to see its schools.</p>`));
    }

    // Flat rows for Excel / PDF: Sl, Block, then Schools .. % for each management group
    const mgFlat = (R, r, i, total, pdf) => [total ? '' : i + 1, r.block, ...MG4.flatMap(g => MG_SUB.map(([sk]) => {
        const a = r.g[g.k];
        if (!a.schools) return pdf ? '-' : '';
        return sk === 'p' ? (pdf ? fmtP(a.p) : round2(a.p)) : pdf ? fmtN(a[sk]) : a[sk];
    }))];

    function mgExcel(R) {
        const n = 2 + MG4.length * MG_SUB.length;
        const aoa = [
            ...excelHead(MG_TITLE, 'Pending = Enrolment - APAAR created'),
            ['Sl', 'Block', ...MG4.flatMap(g => [g.h, ...Array(MG_SUB.length - 1).fill('')])],
            ['', '', ...MG4.flatMap(() => MG_SUB.map(s => s[1]))],
            ...R.rows.map((r, i) => mgFlat(R, r, i)),
            mgFlat(R, R.tot, 0, true),
            [],
            [`Other Managements: ${othersNote(R)}`],
        ];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!merges'] = [
            ...[0, 1, 2, 3].map(r => ({ s: { r, c: 0 }, e: { r, c: n - 1 } })),
            { s: { r: 5, c: 0 }, e: { r: 6, c: 0 } }, { s: { r: 5, c: 1 }, e: { r: 6, c: 1 } },
            ...MG4.map((g, i) => ({ s: { r: 5, c: 2 + i * MG_SUB.length }, e: { r: 5, c: 1 + (i + 1) * MG_SUB.length } })),
        ];
        ws['!cols'] = [{ wch: 5 }, { wch: 22 }, ...MG4.flatMap(() => [{ wch: 8 }, { wch: 11 }, { wch: 10 }, { wch: 10 }, { wch: 7 }])];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Block x Management');
        XLSX.writeFile(wb, fileName(MG_TITLE, 'xlsx'));
    }

    function mgPDF(R) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const TP = '{total_pages}', generated = new Date().toLocaleString('en-IN');
        const pIdx = new Set(MG4.map((g, i) => 2 + i * MG_SUB.length + MG_SUB.length - 1));
        const gOf = c => Math.floor((c - 2) / MG_SUB.length);
        doc.autoTable({
            head: [
                [{ content: 'Sl', rowSpan: 2 }, { content: 'Block', rowSpan: 2 }, ...MG4.map(g => ({ content: g.h, colSpan: MG_SUB.length, styles: { halign: 'center' } }))],
                MG4.flatMap(() => MG_SHORT),
            ],
            body: R.rows.map((r, i) => mgFlat(R, r, i, false, true)),
            foot: [mgFlat(R, R.tot, 0, true, true)],
            showFoot: 'lastPage',
            startY: 34,
            margin: { top: 34, left: 6, right: 6, bottom: 14 },
            ...PDF_STYLE,
            styles: { ...PDF_STYLE.styles, fontSize: 6.6, cellPadding: 1.1, halign: 'right', overflow: 'visible' },
            columnStyles: {
                0: { halign: 'center', cellWidth: 7 }, 1: { halign: 'left', cellWidth: 26 },
                ...Object.fromEntries(MG4.flatMap((g, i) => [8.5, 11, 10.5, 11, 9.4].map((w, j) => [2 + i * MG_SUB.length + j, { cellWidth: w }]))),
            },
            didParseCell: d => {
                const c = d.column.index;
                if (d.section !== 'body' && c === 1) d.cell.styles.halign = 'left';
                if (d.section === 'head' && c > 1) d.cell.styles.halign = d.row.index === 0 ? 'center' : 'right';
                if (d.section === 'head' && d.row.index === 1) Object.assign(d.cell.styles, { fillColor: [224, 233, 255], textColor: [30, 58, 138] });
                if (c < 2 || d.section !== 'body') return;
                if (MG4[gOf(c)].k === 'all') d.cell.styles.fillColor = [238, 243, 255];
                if (pIdx.has(c)) {
                    const r = R.rows[d.row.index], a = r.g[MG4[gOf(c)].k];
                    if (a.schools && a.t) d.cell.styles.textColor = a.p >= R.tot.g[MG4[gOf(c)].k].p ? [21, 128, 61] : [185, 28, 28];
                    d.cell.styles.fontStyle = 'bold';
                }
            },
            didDrawPage: () => pdfFrame(doc, MG_TITLE, 'Pending = Enrolment - APAAR created', generated, TP),
        });
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(doc.splitTextToSize(`Other Managements: ${othersNote(R)}.  Green / red %: at or above / below the district % of the same management.`, 280), 8, doc.lastAutoTable.finalY + 5);
        if (typeof doc.putTotalPages === 'function') doc.putTotalPages(TP);
        doc.save(fileName(MG_TITLE, 'pdf'));
    }

    const PPTX_SRC = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
    const loadScript = src => new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = res;
        s.onerror = () => rej(new Error('could not load the PowerPoint library; check the internet connection'));
        document.head.append(s);
    });

    async function mgPPT(R) {
        if (typeof PptxGenJS === 'undefined') await loadScript(PPTX_SRC);
        await buildMgPPT(R).writeFile({ fileName: fileName(MG_TITLE, 'pptx') });
    }

    // Two 16:9 slides: the blocks split in half, the district total on the second slide
    function buildMgPPT(R) {
        const pptx = new PptxGenJS();
        pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in
        Object.assign(pptx, { author: ORG, company: ORG, title: MG_TITLE });
        const F = 'Calibri', NAVY = '0B1F44', BLUE = '1E3A8A', LINE = 'D5DCE8';
        const T = R.tot.g.all;
        const half = Math.ceil(R.rows.length / 2);
        const parts = [R.rows.slice(0, half), R.rows.slice(half)];
        const border = { type: 'solid', pt: 0.5, color: LINE };
        const colW = [0.3, 1.3, ...MG4.flatMap(() => [0.36, 0.5, 0.49, 0.5, 0.392])];
        const hdr = (text, o = {}) => ({ text, options: { bold: true, color: 'FFFFFF', fill: { color: BLUE }, align: 'center', ...o } });
        const sub = text => ({ text, options: { bold: true, color: BLUE, fill: { color: 'E0E9FF' }, align: 'center', fontSize: 7 } });
        const generated = new Date().toLocaleString('en-IN');

        parts.forEach((rows, pi) => {
            const s = pptx.addSlide();
            s.background = { color: 'FFFFFF' };
            s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.62, fill: { color: NAVY }, line: { color: NAVY } });
            s.addText(MG_TITLE, { x: 0.25, y: 0.08, w: 9, h: 0.46, fontFace: F, fontSize: 18, bold: true, color: 'FFFFFF', margin: 0 });
            s.addText(`Purba Bardhaman  |  Data as on ${fmtD(state.cur)}  |  Part ${pi + 1} of ${parts.length}`, { x: 8.3, y: 0.08, w: 4.78, h: 0.46, fontFace: F, fontSize: 11, color: 'BFDBFE', align: 'right', margin: 0 });
            s.addText([
                { text: 'District: ', options: { bold: true, color: BLUE } },
                { text: `${fmtN(T.schools)} schools  |  Enrolment ${fmtN(T.t)}  |  APAAR created ${fmtN(T.o)}  |  Pending ${fmtN(T.pend)}  |  ` },
                { text: `${fmtP(T.p)}% created`, options: { bold: true, color: BLUE } },
                { text: '   (' + MG4.filter(g => g.k !== 'all').map(g => `${g.h} ${fmtP(R.tot.g[g.k].p)}%`).join(', ') + ')', options: { color: '64748B' } },
            ], { x: 0.25, y: 0.68, w: 12.83, h: 0.3, fontFace: F, fontSize: 10, color: '334155', margin: 0 });

            const body = rows.map((r, i) => {
                const n = pi * half + i;
                const fill = { color: n % 2 ? 'F8FAFC' : 'FFFFFF' };
                return [
                    { text: String(n + 1), options: { align: 'center', fill } },
                    { text: r.block, options: { align: 'left', fill } },
                    ...MG4.flatMap(g => MG_SUB.map(([sk]) => {
                        const c = mgCell(R, r, g.k, sk);
                        const o = { align: 'right', fill: g.k === 'all' ? { color: n % 2 ? 'E8EEFF' : 'EEF3FF' } : fill };
                        if (sk === 'p') Object.assign(o, { bold: true, color: c.cls === 'hi' ? '15803D' : c.cls === 'lo' ? 'B91C1C' : '334155' });
                        return { text: c.text, options: o };
                    })),
                ];
            });
            if (pi === parts.length - 1) body.push([
                { text: '', options: { fill: { color: 'DCE6FF' } } },
                { text: 'District Total', options: { align: 'left', bold: true, fill: { color: 'DCE6FF' } } },
                ...MG4.flatMap(g => MG_SUB.map(([sk]) => ({ text: mgCell(R, R.tot, g.k, sk, true).text, options: { align: 'right', bold: true, fill: { color: 'DCE6FF' } } }))),
            ]);
            s.addTable([
                [hdr('Sl', { rowspan: 2 }), hdr('Block', { rowspan: 2, align: 'left' }), ...MG4.map(g => hdr(g.h, { colspan: MG_SUB.length }))],
                MG4.flatMap(() => MG_SHORT.map(sub)),
                ...body,
            ], { x: 0.25, y: 1.04, w: 12.83, colW, rowH: 0.215, fontFace: F, fontSize: 7.5, color: '1E293B', border, valign: 'middle', margin: [0, 0.04, 0, 0.04], autoPage: false });

            const notes = ['Pending = Enrolment - APAAR created.  % in green: at or above the district % of the same management; red: below.'];
            if (pi === parts.length - 1) notes.unshift(`Other Managements: ${othersNote(R)}.`);
            s.addText(notes.join('\n'), { x: 0.25, y: 6.62, w: 9.6, h: 0.5, fontFace: F, fontSize: 8, color: '64748B', valign: 'top', margin: 0 });
            s.addText(`${CREDIT}\nGenerated on ${generated}`, { x: 9.9, y: 6.62, w: 3.18, h: 0.5, fontFace: F, fontSize: 8, color: '64748B', align: 'right', valign: 'top', margin: 0 });
            s.addShape(pptx.ShapeType.rect, { x: 0, y: 7.38, w: 13.333, h: 0.12, fill: { color: BLUE }, line: { color: BLUE } });
        });
        return pptx;
    }

    registerModule({
        key: 'apaar', program: 'APAAR', title: 'APAAR Creation', tag: 'APAAR', icon: '&#127380;',
        header: 'APAAR Creation status :: SSM, Purba Bardhaman',
        source: 'UDISE+ - APAAR Entry Status, School Wise (Only Operational)',
        priority: 40,
        detect: H => H.some(x => /generated/i.test(x)) && H.some(x => /total\s*student/i.test(x)),
        parse,
        prep: x => { x.c = levelOf(x); },
        finish: a => { a.nr = Math.max(0, a.pend - a.rq - a.fl); },
        codes: true, // Management / Category codes are in the file itself
        cats: ['full', 'part', 'zero', 'na'],
        sums: ['rq', 'fl'],
        fields: ['b', 'n', 'u', 'mc', 'cc', 't', 'o', 'rq', 'fl'],
        cat: { full: '100%', part: '1-99%', zero: '0%', na: 'No students' },
        pctLabel: 'Generated %',
        fileHint: '<code>APAAR_Entry_Status_School_Wise_Only_Operational DD-MM-YYYY ....xlsx</code> as downloaded from UDISE+ (no script needed)',
        emptyText: '<b>APAAR Entry Status - School Wise (Only Operational)</b> Excel file (Block Name, School Name, UDISE Code, School Management, School Category, Total Student, Total Generated, Total Requested, Total Failed)',
        nav: [
            ['Overview', NAV_OVERVIEW.slice(0, 3)],
            ['Management', [['mgmt', 'Block × Management', 'i-grid'], NAV_OVERVIEW[3]]],
            ['Schools', [['schools', 'All Schools', 'i-list'], ['schools/full', '100% Generated', 'dot-full'], ['schools/part', '1-99% Generated', 'dot-part'],
                ['schools/zero', '0% Generated', 'dot-zero'], ['schools/failed', 'Failed Requests', 'dot-zero'], ['schools/requested', 'Requests in Process', 'dot-info']]],
            ['Progress', NAV_PROGRESS],
        ],
        dataCols: [['schools', 'Schools'], ['t', 'Students'], ['o', 'Generated'], ['p', '%', 'p'], ['rq', 'Requested'], ['fl', 'Failed'], ['full', '100%'], ['zero', '0%']],
        home: T => ({ line: `<b>${fmtN(T.o)}</b> of ${fmtN(T.t)} students have an APAAR ID`, stats: [['Failed requests', fmtN(T.fl)], ['0% schools', fmtN(T.zero)]] }),
        profile: x => [['Total students', fmtN(x.t)], ['APAAR generated', fmtN(x.o)], ['Requested', fmtN(x.rq)], ['Failed', fmtN(x.fl)]],
        groupCols: g => [g, C.schools, K.t, K.o, K.pend, K.p, K.dO, C.dP, K.rq, K.fl, C.full, C.part, C.zero],
        groupMetrics: [['p', 'Generated %'], ['o', 'APAAR generated'], ['pend', 'Not generated'], ['t', 'Total students'], ['fl', 'Failed'], ['zero', '0% schools'], ['full', '100% schools'], ['schools', 'Total schools']],
        summaryCols: g => [g, K.t, K.o, K.p, col(K.dO, { h: 'Change' })],
        summarySort: 't',
        pages: { dashboard, blocks, schools, compare, trend, rank, groups: pageGroups, mgmt },
    });
})();
