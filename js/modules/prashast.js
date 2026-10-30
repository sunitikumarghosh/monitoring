/* PRASHAST modules: Teacher Onboarding, School Onboarding and Screening (Part-1).
 * Files: the combined "All Blocks" Excel files saved by the Tampermonkey scripts in tools/userscripts/. */
'use strict';

(() => {
    const HEADER = 'Prashast On boarding status :: SSM, Purba Bardhaman';
    const isDone = st => /^(completed?|on-?\s*boarded|yes)$/i.test(String(st).trim());
    const isStarted = st => !!String(st ?? '').trim() && !/not\s*started|^no$/i.test(String(st));
    const has = (H, re, not) => H.some(x => re.test(x) && !(not && not.test(x)));

    // Column positions shared by the three PRASHAST reports
    function prashastCols(H) {
        const find = colFinder(H);
        return {
            block: find(x => /block/i.test(x), x => !/s\.?\s*no/i.test(x)),
            school: find(x => /school\s*name/i.test(x)),
            udise: find(x => /udise/i.test(x), x => !/school\s*name/i.test(x)),
            total: find(x => /total/i.test(x)),
            onb: find(x => /onboarded/i.test(x), x => !/%|percent/i.test(x)),
            status: find(x => /status/i.test(x)),
            screened: find(x => /screened/i.test(x)),
            started: find(x => /screening\s*started/i.test(x)),
            students: find(x => /total\s*students/i.test(x)),
        };
    }
    // Every row with a school name -> { b, n, u, ...fields(row, columns) }. The portal's own format
    // "School Name | UDISE" in one column also works.
    const prashastParse = fields => (rows, hi, H) => {
        const I = prashastCols(H);
        const schools = [];
        for (const r of rows.slice(hi + 1)) {
            let n = cellText(r, I.school);
            if (!n) continue;
            let u = cellText(r, I.udise);
            const k = n.lastIndexOf('|');
            if (!u && k >= 0) { u = n.slice(k + 1).trim(); n = n.slice(0, k).trim(); }
            schools.push({ b: cellText(r, I.block) || 'UNKNOWN', n, u, ...fields(r, I) });
        }
        return { schools };
    };
    const SOURCE = 'PRASHAST portal';

    // ============================================================ Teacher Onboarding
    // Each school: t = total teachers, o = teachers onboarded, c = 100% / 1-99% / 0% / no teachers
    const TK = colSet({ t: 'Total Teachers', o: 'Onboarded', pend: 'Pending', p: 'Onboarded %', dO: 'Change (Onb.)', cat: 'Category' });

    function tDashboard(v) {
        const S = cur(), P = prev(), T = S.total, PT = P && P.total;
        const d = k => (PT ? T[k] - PT[k] : null);
        const ranked = rankedBlocks(S, P);
        const base = modBase();
        pageHead(v, 'District Dashboard', subLine(S, P));
        heroCard(v, S, P, ranked, {
            ring: 'onboarded', unit: 'teachers',
            label: 'District teacher onboarding &middot; Purba Bardhaman',
            title: `<b>${fmtN(T.o)}</b> of ${fmtN(T.t)} teachers onboarded`,
            meta: `${fmtN(T.pend)} teachers still to be onboarded across ${fmtN(T.schools)} schools`,
        });
        statGrid(v, [
            { label: 'Total Teachers', value: fmtN(T.t), delta: d('t'), foot: `in ${fmtN(T.schools)} schools`, ic: 'person', tone: 'blue' },
            { label: 'Teachers Onboarded', value: fmtN(T.o), delta: d('o'), foot: `${fmtP(T.p)}% of all teachers`, ic: 'check', tone: 'green' },
            { label: 'Pending Teachers', value: fmtN(T.pend), delta: d('pend'), invert: true, foot: `${fmtP(100 - T.p)}% yet to onboard`, ic: 'clock', tone: 'red' },
            { label: 'Onboarded %', value: fmtP(T.p) + '%', delta: d('p'), pctDelta: true, foot: `best block ${fmtP(ranked[0].p)}%`, ic: 'up', tone: 'indigo' },
        ]);
        catGrid(v, [
            { key: 'full', label: '100% Onboarded Schools', ic: 'full' },
            { key: 'part', label: 'Partially Onboarded (1-99%)', ic: 'part' },
            { key: 'zero', label: '0% Onboarded Schools', ic: 'zero', invert: true },
        ], S, P);

        const best = ranked[0], worst = ranked[ranked.length - 1];
        const most = [...ranked].sort((a, b) => b.pend - a.pend)[0];
        const notes = [
            ['up', `Highest onboarding: <b>${esc(best.block)}</b> at ${fmtP(best.p)}%; lowest: <b>${esc(worst.block)}</b> at ${fmtP(worst.p)}%.`],
            ['zero', `<b>${fmtN(T.zero)}</b> schools (${fmtP(pct(T.zero, T.schools))}%) have not onboarded any teacher. <a href="${base}schools/zero">See list &rsaquo;</a>`],
            ['flag', `Most pending teachers: <b>${esc(most.block)}</b> (${fmtN(most.pend)} pending).`],
        ];
        if (P) {
            const sr = schoolRows(S, P);
            const newFull = sr.filter(x => x.c === 'full' && x.cPrev && x.cPrev !== 'full').length;
            const outZero = sr.filter(x => x.cPrev === 'zero' && x.c !== 'zero').length;
            const improved = sr.filter(x => x.dO > 0).length;
            const regressed = sr.filter(x => x.dO < 0).length;
            const still = ranked.filter(b => b.dO === 0).map(b => b.block);
            const gainer = [...ranked].sort((a, b) => (b.dO || 0) - (a.dO || 0))[0];
            notes.unshift(['check', `Since ${fmtD(P.date)}: <b>${fmtN(improved)}</b> schools improved, <b>${fmtN(newFull)}</b> became 100% and <b>${fmtN(outZero)}</b> moved out of 0%. <a href="${base}compare">Details &rsaquo;</a>`]);
            if (gainer && gainer.dO > 0) notes.push(['up', `Top gainer since ${fmtD(P.date)}: <b>${esc(gainer.block)}</b> (${signed(gainer.dO)} teachers).`]);
            if (still.length) notes.push(['info', `No progress since ${fmtD(P.date)} in ${still.length} block(s): ${still.map(esc).join(', ')}.`]);
            if (regressed) notes.push(['down', `<span class="down">${fmtN(regressed)} school(s) show fewer onboarded teachers than on ${fmtD(P.date)}</span> &mdash; please verify.`]);
        }
        notesCard(v, notes);

        const g = grid2(v);
        doughnutCard(g, 'Schools by Onboarding Category', ['100%', '1-99%', '0%', 'No teachers'], [T.full, T.part, T.zero, T.na], [COLORS.good, COLORS.mid, COLORS.bad, COLORS.na]);
        bandsCard(g, 'Blocks by Onboarding Level', [['Below 40%', 0, 40], ['40-60%', 40, 60], ['60-80%', 60, 80], ['80% and above', 80, 101]], ranked);
        dashTrend(v, 'Onboarded %', [['0% schools', t => t.zero, COLORS.bad], ['100% schools', t => t.full, COLORS.good]]);
        topBottom(v, S, P, ranked, [C.rank, C.block, TK.o, TK.p, col(TK.dO, { h: 'Change' })]);
        groupSummary(v, S, P);
    }

    const tBlocks = v => blocksPage(v, {
        heading: 'Block-wise Onboarding Status',
        cols: [C.rank, C.block, C.schools, TK.t, TK.o, TK.pend, TK.p, TK.dO, C.dP, C.full, C.part, C.zero, C.status],
        measure: 'onboarded %',
        chartTitle: 'School categories by block',
        chartSets: [['100%', 'full', COLORS.good], ['1-99%', 'part', COLORS.mid], ['0%', 'zero', COLORS.bad], ['No teachers', 'na', COLORS.na]],
    });

    const tSchools = (v, r) => schoolsPage(v, r, {
        lists: {
            all: ['All Schools', 'All levels', () => true],
            full: ['100% Onboarded Schools', '100% onboarded', x => x.c === 'full'],
            part: ['Partially Onboarded Schools (1-99%)', '1-99% onboarded', x => x.c === 'part'],
            zero: ['0% Onboarded Schools', '0% onboarded', x => x.c === 'zero'],
            na: ['Schools with No Teachers', 'No teachers', x => x.c === 'na'],
        },
        filterLabel: 'Onboarding',
        cols: (catKey, P) => [TK.t, TK.o, TK.pend, TK.p,
            ...(P ? [{ k: 'oPrev', h: `Onb. on ${fmtD(P.date)}`, type: 'n' }, TK.dO] : []),
            ...(catKey === 'all' ? [TK.cat] : [])],
        sorts: { zero: ['t', 'desc'], part: ['p', 'asc'] },
        chips: t => [['Teachers', fmtN(t.t)], ['Onboarded', fmtN(t.o)], ['Pending', fmtN(t.pend)], ['Onboarded %', fmtP(t.p)]],
    });

    const tCompare = (v, r) => comparePage(v, r, {
        kpis: [['Teachers Onboarded', 'o', { cls: 'good' }], ['Onboarded %', 'p', { pct: true }], ['Total Teachers', 't'],
            ['100% Schools', 'full', { cls: 'good' }], ['1-99% Schools', 'part', { cls: 'mid' }], ['0% Schools', 'zero', { invert: true, cls: 'bad' }]],
        blockCols: (dA, dB) => [TK.t, { k: 'oA', h: `Onb. ${dA}`, type: 'n' }, { k: 'o', h: `Onb. ${dB}`, type: 'n' }, TK.dO,
            { k: 'pA', h: `% ${dA}`, type: 'p' }, { k: 'p', h: `% ${dB}`, type: 'p' }, C.dP,
            { k: 'fullA', h: `100% ${dA}`, type: 'n' }, { k: 'full', h: `100% ${dB}`, type: 'n' },
            { k: 'zeroA', h: `0% ${dA}`, type: 'n' }, { k: 'zero', h: `0% ${dB}`, type: 'n' }, { k: 'dZero', h: 'Change (0% sch.)', type: 'd', invert: true }],
        moves: [
            ['Schools improved', x => x.dO > 0],
            ['Became 100%', x => x.c === 'full' && x.cPrev && x.cPrev !== 'full'],
            ['Moved out of 0%', x => x.cPrev === 'zero' && x.c !== 'zero'],
            ['Still 0% on both dates', x => x.c === 'zero' && x.cPrev === 'zero'],
            ['Onboarded count decreased', x => x.dO < 0],
            ['New in later file', x => x.cPrev == null],
        ],
        moveCols: (dA, dB) => [TK.t, { k: 'oPrev', h: `Onb. ${dA}`, type: 'n' }, { k: 'o', h: `Onb. ${dB}`, type: 'n' }, TK.dO, TK.p, TK.cat],
        moveSort: 'dO',
    });

    const tTrend = v => trendPage(v, {
        bar: ['Teachers onboarded', 'rgba(37,99,235,.35)'],
        cols: [C.schools, TK.t, TK.o, col(TK.dO, { h: 'Daily change' }), TK.p, C.dP, C.full, C.part, C.zero, TK.pend],
        metrics: [['p', 'Onboarded %'], ['o', 'Teachers onboarded'], ['zero', '0% schools'], ['full', '100% schools']],
        invert: ['zero'],
    });

    function tRank(v) {
        const S = cur(), P = prev();
        const ranked = rankedBlocks(S, P);
        const sub = plainSub(S, P);
        pageHead(v, 'Leading & Lagging', subLine(S, P));
        const bcols = [C.rank, C.block, TK.t, TK.o, TK.pend, TK.p, TK.dO];

        const g1 = grid2(v);
        tableCard(g1, 'Top 10 Leading Blocks (by onboarded %)', { cols: bcols, rows: ranked.slice(0, 10), onRow: blockGo }, sub);
        tableCard(g1, 'Bottom 10 Lagging Blocks (by onboarded %)', { cols: bcols, rows: ranked.slice(-10).reverse(), onRow: blockGo }, sub);

        const g2 = grid2(v, true);
        if (P) {
            tableCard(g2, `Top Gainers since ${fmtD(P.date)}`, { cols: [C.idx, C.block, TK.dO, C.dP, TK.p, { k: 'dFull', h: 'New 100% sch.', type: 'd' }], rows: [...ranked].sort((a, b) => b.dO - a.dO).slice(0, 10), onRow: blockGo }, sub);
            tableCard(g2, `Least Progress since ${fmtD(P.date)}`, { cols: [C.idx, C.block, TK.dO, C.dP, TK.p, TK.pend], rows: [...ranked].sort((a, b) => a.dO - b.dO || a.p - b.p).slice(0, 10), onRow: blockGo }, sub);
        }
        tableCard(g2, 'Blocks with Most Pending Teachers', { cols: [C.idx, C.block, TK.t, TK.o, TK.pend, TK.p], rows: [...ranked].sort((a, b) => b.pend - a.pend).slice(0, 10), onRow: blockGo }, sub);
        tableCard(g2, 'Blocks with Most 0% Schools', { cols: [C.idx, C.block, C.schools, C.zero, { k: 'zp', h: '% of schools at 0%', type: 'p', v: r => pct(r.zero, r.schools) }, TK.p], rows: [...ranked].sort((a, b) => b.zero - a.zero).slice(0, 10), onRow: blockGo }, sub);

        const sr = schoolRows(S, P);
        const scols = [C.idx, C.sb, C.school, C.udise, TK.t, TK.o, TK.pend, TK.p];
        const g3 = h('<div class="stack" style="margin-top:16px"></div>');
        v.append(g3);
        tableCard(g3, 'Priority Schools - Most Pending Teachers (Top 50)', { cols: scols, rows: [...sr].sort((a, b) => b.pend - a.pend).slice(0, 50), onRow: schoolGo }, sub);
        tableCard(g3, 'Large Schools at 0% (Top 50 by teachers)', { cols: scols, rows: sr.filter(x => x.c === 'zero').sort((a, b) => b.t - a.t).slice(0, 50), onRow: schoolGo }, sub);
        if (P) tableCard(g3, `Best Performing Schools since ${fmtD(P.date)} (Top 50)`, { cols: [...scols, TK.dO], rows: sr.filter(x => x.dO > 0).sort((a, b) => b.dO - a.dO).slice(0, 50), onRow: schoolGo }, sub);
    }

    registerModule({
        key: 'teacher', program: 'PRASHAST', title: 'Teacher Onboarding', tag: 'Teacher Onboarding', icon: '&#128105;&#8205;&#127979;',
        header: HEADER, source: `${SOURCE} - Teacher Onboarding (School Wise Report)`,
        priority: 20,
        detect: H => has(H, /total/i) && has(H, /onboarded/i, /%|percent/i),
        parse: prashastParse((r, I) => ({ t: num(r[I.total]), o: num(r[I.onb]) })),
        prep: x => { x.c = levelOf(x); },
        cats: ['full', 'part', 'zero', 'na'],
        fields: ['b', 'n', 'u', 't', 'o'],
        cat: { full: '100%', part: '1-99%', zero: '0%', na: 'No teachers' },
        pctLabel: 'Onboarded %',
        fileHint: '<code>Teacher_Onboarding_School_Wise_All_Blocks_YYYY-MM-DD.xlsx</code> (Tampermonkey script)',
        emptyText: 'combined school-wise <b>Teacher Onboarding</b> Excel file (Block Name, School Name, UDISE Code, Total Teachers, Teachers Onboarded)',
        nav: stdNav([['schools/full', '100% Schools', 'dot-full'], ['schools/part', '1-99% Schools', 'dot-part'], ['schools/zero', '0% Schools', 'dot-zero']]),
        dataCols: [['schools', 'Schools'], ['t', 'Teachers'], ['o', 'Onboarded'], ['p', '%', 'p'], ['full', '100%'], ['zero', '0%']],
        home: T => ({ line: `<b>${fmtN(T.o)}</b> of ${fmtN(T.t)} teachers onboarded`, stats: [['Schools', fmtN(T.schools)], ['100% schools', fmtN(T.full)], ['0% schools', fmtN(T.zero)]] }),
        profile: x => [['Total teachers', fmtN(x.t)], ['Onboarded', fmtN(x.o)], ['Pending', fmtN(x.pend)]],
        groupCols: g => [g, C.schools, TK.t, TK.o, TK.pend, TK.p, TK.dO, C.dP, C.full, C.part, C.zero],
        groupMetrics: [['p', 'Onboarded %'], ['o', 'Teachers onboarded'], ['pend', 'Pending teachers'], ['zero', '0% schools'], ['full', '100% schools'], ['schools', 'Total schools']],
        summaryCols: g => [g, TK.t, TK.o, TK.p, col(TK.dO, { h: 'Change' })],
        summarySort: 't',
        pages: { dashboard: tDashboard, blocks: tBlocks, schools: tSchools, compare: tCompare, trend: tTrend, rank: tRank, groups: pageGroups },
    });

    // ============================================================ School Onboarding
    // Each school counts as t = 1 and o = 1 when its status is Completed, so block / district totals, %,
    // ranking and comparisons work the same way as for teachers.
    const SK = colSet({
        schools: 'Total Schools', o: 'Schools Onboarded', pend: col(C.pend, { h: 'Pending Schools', invert: true }),
        p: 'Onboarded %', dO: 'Change (Onb.)', cat: 'Status',
    });

    function sDashboard(v) {
        const S = cur(), P = prev(), T = S.total, PT = P && P.total;
        const d = k => (PT ? T[k] - PT[k] : null);
        const ranked = rankedBlocks(S, P);
        const base = modBase();
        pageHead(v, 'School Onboarding Dashboard', subLine(S, P));
        heroCard(v, S, P, ranked, {
            ring: 'onboarded', unit: 'schools',
            label: 'District school onboarding &middot; Purba Bardhaman',
            title: `<b>${fmtN(T.o)}</b> of ${fmtN(T.schools)} schools onboarded`,
            meta: `${fmtN(T.pend)} schools still pending across ${S.blocks.length} blocks`,
        });
        statGrid(v, [
            { label: 'Total Schools', value: fmtN(T.schools), delta: d('schools'), foot: `in ${S.blocks.length} blocks`, ic: 'school', tone: 'blue', href: `${base}schools` },
            { label: 'Schools Onboarded', value: fmtN(T.o), delta: d('o'), foot: 'status "Completed"', ic: 'check', tone: 'green', href: `${base}schools/done` },
            { label: 'Pending Schools', value: fmtN(T.pend), delta: d('pend'), invert: true, foot: `${fmtP(100 - T.p)}% yet to onboard`, ic: 'clock', tone: 'red', href: `${base}schools/pending` },
            { label: 'Onboarded %', value: fmtP(T.p) + '%', delta: d('p'), pctDelta: true, foot: `best block ${fmtP(ranked[0].p)}%`, ic: 'up', tone: 'indigo' },
        ]);

        const best = ranked[0], worst = ranked[ranked.length - 1];
        const none = ranked.filter(b => b.o === 0).map(b => b.block);
        const mostPend = [...ranked].sort((a, b) => b.pend - a.pend)[0];
        const notes = [
            ['up', `Highest school onboarding: <b>${esc(best.block)}</b> at ${fmtP(best.p)}%; lowest: <b>${esc(worst.block)}</b> at ${fmtP(worst.p)}%.`],
            ['flag', `Most pending schools: <b>${esc(mostPend.block)}</b> (${fmtN(mostPend.pend)} of ${fmtN(mostPend.schools)} pending). <a href="${base}schools/pending?block=${encodeURIComponent(mostPend.block)}">See list &rsaquo;</a>`],
            ['zero', none.length ? `<b>${none.length}</b> block(s) have not onboarded any school: ${none.map(esc).join(', ')}.` : 'Every block has onboarded at least one school.'],
        ];
        if (P) {
            const sr = schoolRows(S, P);
            const newly = sr.filter(x => x.dO > 0).length;
            const reverted = sr.filter(x => x.dO < 0).length;
            const still = ranked.filter(b => b.dO === 0).map(b => b.block);
            const gainer = [...ranked].sort((a, b) => (b.dO || 0) - (a.dO || 0))[0];
            notes.unshift(['check', `Since ${fmtD(P.date)}: <b>${fmtN(newly)}</b> schools newly onboarded. <a href="${base}compare">Details &rsaquo;</a>`]);
            if (gainer && gainer.dO > 0) notes.push(['up', `Top gainer since ${fmtD(P.date)}: <b>${esc(gainer.block)}</b> (${signed(gainer.dO)} schools).`]);
            if (still.length) notes.push(['info', `No progress since ${fmtD(P.date)} in ${still.length} block(s): ${still.map(esc).join(', ')}.`]);
            if (reverted) notes.push(['down', `<span class="down">${fmtN(reverted)} school(s) were Completed on ${fmtD(P.date)} but are Pending now</span> &mdash; please verify.`]);
        }
        notesCard(v, notes);

        const g = grid2(v);
        doughnutCard(g, 'Schools by Status', ['Completed', 'Pending'], [T.o, T.pend], [COLORS.good, COLORS.bad]);
        bandsCard(g, 'Blocks by School Onboarding Level', [['Below 10%', 0, 10], ['10-25%', 10, 25], ['25-50%', 25, 50], ['50% and above', 50, 101]], ranked);
        dashTrend(v, 'Onboarded %', [['Schools onboarded', t => t.o, COLORS.good], ['Pending schools', t => t.pend, COLORS.bad]]);
        topBottom(v, S, P, ranked, [C.rank, C.block, SK.schools, SK.o, SK.p, col(SK.dO, { h: 'Change' })]);
        groupSummary(v, S, P);
    }

    const sBlocks = v => blocksPage(v, {
        heading: 'Block-wise School Onboarding',
        cols: [C.rank, C.block, SK.schools, SK.o, SK.pend, SK.p, SK.dO, C.dP, C.status],
        measure: '% of schools onboarded',
        chartTitle: 'Onboarded and pending schools by block',
        chartSets: [['Completed', 'o', COLORS.good], ['Pending', 'pend', COLORS.bad]],
    });

    const sSchools = (v, r) => schoolsPage(v, r, {
        lists: {
            all: ['All Schools', 'All statuses', () => true],
            done: ['Onboarded Schools (Completed)', 'Completed', x => x.c === 'done'],
            pending: ['Pending Schools', 'Pending', x => x.c === 'pending'],
        },
        filterLabel: 'Status',
        cols: (catKey, P) => [SK.cat, ...(P ? [{ k: 'cPrev', h: `Status on ${fmtD(P.date)}`, type: 'cat' },
            { k: 'move', h: 'Change', v: x => (x.cPrev == null ? 'New' : x.dO > 0 ? 'Newly onboarded' : x.dO < 0 ? 'Reverted' : '') }] : [])],
        chips: t => [['Completed', fmtN(t.o)], ['Pending', fmtN(t.pend)], ['Onboarded %', fmtP(t.p)]],
    });

    const sCompare = (v, r) => comparePage(v, r, {
        kpis: [['Schools Onboarded', 'o', { cls: 'good' }], ['Onboarded %', 'p', { pct: true }], ['Pending Schools', 'pend', { invert: true, cls: 'bad' }], ['Total Schools', 'schools']],
        blockCols: (dA, dB) => [SK.schools, { k: 'oA', h: `Onb. ${dA}`, type: 'n' }, { k: 'o', h: `Onb. ${dB}`, type: 'n' }, SK.dO,
            { k: 'pA', h: `% ${dA}`, type: 'p' }, { k: 'p', h: `% ${dB}`, type: 'p' }, C.dP, SK.pend],
        moves: [
            ['Newly onboarded', x => x.dO > 0],
            ['Still pending on both dates', x => x.c === 'pending' && x.cPrev === 'pending'],
            ['Completed on both dates', x => x.c === 'done' && x.cPrev === 'done'],
            ['Reverted to pending', x => x.dO < 0],
            ['New in later file', x => x.cPrev == null],
        ],
        moveCols: (dA, dB) => [{ k: 'cPrev', h: `Status ${dA}`, type: 'cat' }, { k: 'c', h: `Status ${dB}`, type: 'cat' }],
    });

    const sTrend = v => trendPage(v, {
        bar: ['Schools onboarded', 'rgba(22,163,74,.4)'],
        cols: [SK.schools, SK.o, col(SK.dO, { h: 'Daily change' }), SK.p, C.dP, SK.pend],
        metrics: [['p', 'Onboarded %'], ['o', 'Schools onboarded'], ['pend', 'Pending schools']],
        invert: ['pend'],
    });

    function sRank(v) {
        const S = cur(), P = prev();
        const ranked = rankedBlocks(S, P);
        const sub = plainSub(S, P);
        pageHead(v, 'Leading & Lagging', subLine(S, P));
        const bcols = [C.rank, C.block, SK.schools, SK.o, SK.pend, SK.p, SK.dO];

        const g1 = grid2(v);
        tableCard(g1, 'Top 10 Leading Blocks', { cols: bcols, rows: ranked.slice(0, 10), onRow: blockGo }, sub);
        tableCard(g1, 'Bottom 10 Lagging Blocks', { cols: bcols, rows: ranked.slice(-10).reverse(), onRow: blockGo }, sub);

        const g2 = grid2(v, true);
        if (P) {
            tableCard(g2, `Top Gainers since ${fmtD(P.date)}`, { cols: [C.idx, C.block, SK.dO, C.dP, SK.p], rows: [...ranked].sort((a, b) => b.dO - a.dO).slice(0, 10), onRow: blockGo }, sub);
            tableCard(g2, `Least Progress since ${fmtD(P.date)}`, { cols: [C.idx, C.block, SK.dO, C.dP, SK.p, SK.pend], rows: [...ranked].sort((a, b) => a.dO - b.dO || a.p - b.p).slice(0, 10), onRow: blockGo }, sub);
        }
        tableCard(g2, 'Blocks with Most Pending Schools', { cols: [C.idx, C.block, SK.schools, SK.o, SK.pend, SK.p], rows: [...ranked].sort((a, b) => b.pend - a.pend).slice(0, 10), onRow: blockGo }, sub);
    }

    registerModule({
        key: 'school', program: 'PRASHAST', title: 'School Onboarding', tag: 'School Onboarding', icon: '&#127979;',
        header: HEADER, source: `${SOURCE} - Schools Onboarding Status`,
        priority: 10,
        detect: H => has(H, /status/i),
        parse: prashastParse((r, I) => ({ st: cellText(r, I.status) || 'Pending' })),
        prep: x => { x.t = 1; x.o = isDone(x.st) ? 1 : 0; x.c = x.o ? 'done' : 'pending'; },
        cats: ['done', 'pending'],
        fields: ['b', 'n', 'u', 'st'],
        cat: { done: 'Completed', pending: 'Pending' },
        pctLabel: 'Onboarded %',
        fileHint: '<code>Schools_Onboarding_Status_All_Blocks_YYYY-MM-DD.xlsx</code> (Tampermonkey script)',
        emptyText: '<b>Schools_Onboarding_Status_All_Blocks</b> Excel file (Block Name, School Name, UDISE Code, Status)',
        nav: stdNav([['schools/done', 'Onboarded Schools', 'dot-full'], ['schools/pending', 'Pending Schools', 'dot-zero']]),
        dataCols: [['schools', 'Schools'], ['o', 'Completed'], ['pend', 'Pending'], ['p', '%', 'p']],
        home: T => ({ line: `<b>${fmtN(T.o)}</b> of ${fmtN(T.schools)} schools onboarded`, stats: [['Pending schools', fmtN(T.pend)]] }),
        profile: x => [['Status', esc(x.st)]],
        groupCols: g => [g, SK.schools, SK.o, SK.pend, SK.p, SK.dO, C.dP],
        groupMetrics: [['p', 'Onboarded %'], ['o', 'Schools onboarded'], ['pend', 'Pending schools'], ['schools', 'Total schools']],
        summaryCols: g => [g, SK.schools, SK.o, SK.p, col(SK.dO, { h: 'Change' })],
        summarySort: 'schools',
        pages: { dashboard: sDashboard, blocks: sBlocks, schools: sSchools, compare: sCompare, trend: sTrend, rank: sRank, groups: pageGroups },
    });

    // ============================================================ Screening (Part-1)
    // Each school: t / o = total / screened students, so = onboarded (0/1), sst = screening started (0/1),
    // c = stage: notonb -> onb (onboarded, not started) -> scr (started) -> scrfull (all students screened).
    const XC = colSet({
        schools: 'Total Schools',
        so: { k: 'so', h: 'Schools Onboarded', type: 'n' },
        sop: { k: 'sop', h: 'Onboarded %', type: 'p', v: r => pct(r.so, r.schools) },
        sst: { k: 'sst', h: 'Screening Started', type: 'n' },
        sstp: { k: 'sstp', h: 'Started %', type: 'p', v: r => pct(r.sst, r.schools) },
        t: 'Total Students', o: 'Screened Students', pend: 'Not Screened', p: 'Screened %', dO: 'Change (Screened)',
        dSst: { k: 'dSst', h: 'Change (Started)', type: 'd' },
        cat: 'Stage',
    });
    const STAGES = ['notonb', 'onb', 'scr', 'scrfull'];
    const STAGE_NAME = { notonb: 'Not onboarded', onb: 'Onboarded, not started', scr: 'Screening started', scrfull: 'All students screened' };
    const STAGE_COLOR = { notonb: COLORS.bad, onb: COLORS.mid, scr: COLORS.brand2, scrfull: COLORS.good };

    function xDashboard(v) {
        const S = cur(), P = prev(), T = S.total, PT = P && P.total;
        const d = k => (PT ? T[k] - PT[k] : null);
        const ranked = rankedBlocks(S, P);
        const base = modBase();
        pageHead(v, 'Screening (Part-1) Dashboard', subLine(S, P));
        heroCard(v, S, P, ranked, {
            ring: 'screened', unit: 'students',
            label: 'District student screening (Part-1) &middot; Purba Bardhaman',
            title: `<b>${fmtN(T.o)}</b> of ${fmtN(T.t)} students screened`,
            meta: `Screening started in ${fmtN(T.sst)} of ${fmtN(T.schools)} schools &middot; ${fmtN(T.so)} schools onboarded`,
        });
        statGrid(v, [
            { label: 'Total Students', value: fmtN(T.t), delta: d('t'), foot: `in ${fmtN(T.schools)} schools`, ic: 'person', tone: 'blue' },
            { label: 'Students Screened', value: fmtN(T.o), delta: d('o'), foot: `${fmtP(T.p)}% of all students`, ic: 'check', tone: 'green' },
            { label: 'Schools Onboarded', value: fmtN(T.so), delta: d('so'), foot: `${fmtP(pct(T.so, T.schools))}% of schools`, ic: 'school', tone: 'indigo', href: `${base}schools` },
            { label: 'Screening Started', value: fmtN(T.sst), delta: d('sst'), foot: `${fmtP(pct(T.sst, T.schools))}% of schools`, ic: 'up', tone: 'red', href: `${base}schools/started` },
        ]);
        catGrid(v, [
            { key: 'notonb', cls: 'zero', label: STAGE_NAME.notonb, ic: 'zero', invert: true },
            { key: 'onb', cls: 'part', label: STAGE_NAME.onb, ic: 'clock', invert: true },
            { key: 'scr', cls: 'info', label: STAGE_NAME.scr, ic: 'part' },
            { key: 'scrfull', cls: 'full', label: STAGE_NAME.scrfull, ic: 'full' },
        ], S, P);

        const best = ranked[0], worst = ranked[ranked.length - 1];
        const noStart = ranked.filter(b => b.sst === 0).map(b => b.block);
        const mostWaiting = [...ranked].sort((a, b) => b.onb - a.onb)[0];
        const notes = [
            ['up', `Highest screening: <b>${esc(best.block)}</b> at ${fmtP(best.p)}% of students; lowest: <b>${esc(worst.block)}</b> at ${fmtP(worst.p)}%.`],
            ['flag', `<b>${fmtN(T.onb)}</b> onboarded schools have not started screening; most in <b>${esc(mostWaiting.block)}</b> (${fmtN(mostWaiting.onb)}). <a href="${base}schools/onb">See list &rsaquo;</a>`],
            ['zero', noStart.length ? `Screening has not started in any school of ${noStart.length} block(s): ${noStart.map(esc).join(', ')}.` : 'Screening has started in every block.'],
        ];
        if (P) {
            const sr = schoolRows(S, P);
            const newStart = sr.filter(x => x.sst && x.cPrev && !['scr', 'scrfull'].includes(x.cPrev)).length;
            const newOnb = sr.filter(x => x.so && x.cPrev === 'notonb').length;
            const regressed = sr.filter(x => x.dO < 0).length;
            const gainer = [...ranked].sort((a, b) => (b.dO || 0) - (a.dO || 0))[0];
            notes.unshift(['check', `Since ${fmtD(P.date)}: screening started in <b>${fmtN(newStart)}</b> more schools and <b>${fmtN(newOnb)}</b> schools were newly onboarded. <a href="${base}compare">Details &rsaquo;</a>`]);
            if (gainer && gainer.dO > 0) notes.push(['up', `Top gainer since ${fmtD(P.date)}: <b>${esc(gainer.block)}</b> (${signed(gainer.dO)} students screened).`]);
            if (regressed) notes.push(['down', `<span class="down">${fmtN(regressed)} school(s) show fewer screened students than on ${fmtD(P.date)}</span> &mdash; please verify.`]);
        }
        notesCard(v, notes);

        const g = grid2(v);
        doughnutCard(g, 'Schools by Screening Stage', STAGES.map(k => STAGE_NAME[k]), STAGES.map(k => T[k]), STAGES.map(k => STAGE_COLOR[k]));
        bandsCard(g, 'Blocks by % of Students Screened', [['Below 5%', 0, 5], ['5-20%', 5, 20], ['20-50%', 20, 50], ['50% and above', 50, 101]], ranked);
        dashTrend(v, 'Students screened %', [['Schools screening started', t => t.sst, COLORS.good], ['Schools onboarded', t => t.so, COLORS.mid]]);
        topBottom(v, S, P, ranked, [C.rank, C.block, XC.sst, XC.o, XC.p, col(XC.dO, { h: 'Change' })]);
        groupSummary(v, S, P);
    }

    const xBlocks = v => blocksPage(v, {
        heading: 'Block-wise Screening Status (Part-1)',
        cols: [C.rank, C.block, XC.schools, XC.so, XC.sop, XC.sst, XC.sstp, XC.t, XC.o, XC.pend, XC.p, XC.dO, XC.dSst, C.status],
        measure: '% of students screened',
        chartTitle: 'Schools by screening stage, by block',
        chartSets: STAGES.map(k => [STAGE_NAME[k], k, STAGE_COLOR[k]]),
    });

    const xSchools = (v, r) => schoolsPage(v, r, {
        lists: {
            all: ['All Schools', 'All stages', () => true],
            notonb: ['Schools Not Onboarded', 'Schools Not Onboarded', x => x.c === 'notonb'],
            onb: ['Onboarded, Screening Not Started', 'Onboarded, Screening Not Started', x => x.c === 'onb'],
            started: ['Screening Started', 'Screening Started', x => x.sst],
            scr: ['Screening Started, Not All Screened', 'Started, not all screened', x => x.c === 'scr'],
            scrfull: ['All Students Screened', 'All Students Screened', x => x.c === 'scrfull'],
        },
        filterLabel: 'Stage',
        cols: (catKey, P) => [{ k: 'ob', h: 'Onboarding', cls: 'nowrap' }, { k: 'ss', h: 'Screening', cls: 'nowrap' }, XC.t, XC.o, XC.pend, XC.p,
            ...(P ? [{ k: 'oPrev', h: `Screened on ${fmtD(P.date)}`, type: 'n' }, XC.dO] : []),
            ...(catKey === 'all' ? [XC.cat] : [])],
        sorts: { onb: ['t', 'desc'], notonb: ['t', 'desc'], started: ['p', 'asc'] },
        chips: t => [['Onboarded', fmtN(t.so)], ['Screening started', fmtN(t.sst)], ['Students', fmtN(t.t)], ['Screened', fmtN(t.o)], ['Screened %', fmtP(t.p)]],
    });

    const xCompare = (v, r) => comparePage(v, r, {
        kpis: [['Students Screened', 'o', { cls: 'good' }], ['Screened %', 'p', { pct: true }], ['Screening Started', 'sst', { cls: 'good' }],
            ['Schools Onboarded', 'so', { cls: 'mid' }], ['Not Onboarded', 'notonb', { invert: true, cls: 'bad' }], ['Total Students', 't']],
        blockCols: (dA, dB) => [XC.t, { k: 'oA', h: `Screened ${dA}`, type: 'n' }, { k: 'o', h: `Screened ${dB}`, type: 'n' }, XC.dO,
            { k: 'pA', h: `% ${dA}`, type: 'p' }, { k: 'p', h: `% ${dB}`, type: 'p' }, C.dP,
            { k: 'sstA', h: `Started ${dA}`, type: 'n' }, { k: 'sst', h: `Started ${dB}`, type: 'n' }, XC.dSst,
            { k: 'soA', h: `Onboarded ${dA}`, type: 'n' }, { k: 'so', h: `Onboarded ${dB}`, type: 'n' }],
        moves: [
            ['Screening newly started', x => x.sst && x.cPrev && !['scr', 'scrfull'].includes(x.cPrev)],
            ['Newly onboarded', x => x.so && x.cPrev === 'notonb'],
            ['More students screened', x => x.dO > 0],
            ['Onboarded, still not started', x => x.c === 'onb' && x.cPrev && x.cPrev !== 'notonb'],
            ['Still not onboarded', x => x.c === 'notonb' && x.cPrev === 'notonb'],
            ['Screened count decreased', x => x.dO < 0],
            ['New in later file', x => x.cPrev == null],
        ],
        moveCols: (dA, dB) => [XC.t, { k: 'oPrev', h: `Screened ${dA}`, type: 'n' }, { k: 'o', h: `Screened ${dB}`, type: 'n' }, XC.dO,
            { k: 'cPrev', h: `Stage ${dA}`, type: 'cat' }, { k: 'c', h: `Stage ${dB}`, type: 'cat' }],
        moveSort: 'dO',
    });

    const xTrend = v => trendPage(v, {
        bar: ['Students screened', 'rgba(22,163,74,.4)'],
        cols: [XC.schools, XC.so, XC.sst, col(XC.dSst, { h: 'Daily change (started)' }), XC.t, XC.o, col(XC.dO, { h: 'Daily change (screened)' }), XC.p, C.dP, XC.pend],
        metrics: [['p', 'Students screened %'], ['o', 'Students screened'], ['sst', 'Schools screening started'], ['so', 'Schools onboarded']],
    });

    function xRank(v) {
        const S = cur(), P = prev();
        const ranked = rankedBlocks(S, P);
        const sub = plainSub(S, P);
        pageHead(v, 'Leading & Lagging', subLine(S, P));
        const bcols = [C.rank, C.block, XC.sst, XC.sstp, XC.t, XC.o, XC.p, XC.dO];

        const g1 = grid2(v);
        tableCard(g1, 'Top 10 Leading Blocks', { cols: bcols, rows: ranked.slice(0, 10), onRow: blockGo }, sub);
        tableCard(g1, 'Bottom 10 Lagging Blocks', { cols: bcols, rows: ranked.slice(-10).reverse(), onRow: blockGo }, sub);

        const g2 = grid2(v, true);
        if (P) {
            tableCard(g2, `Top Gainers since ${fmtD(P.date)}`, { cols: [C.idx, C.block, XC.dO, C.dP, XC.dSst, XC.p], rows: [...ranked].sort((a, b) => b.dO - a.dO).slice(0, 10), onRow: blockGo }, sub);
            tableCard(g2, `Least Progress since ${fmtD(P.date)}`, { cols: [C.idx, C.block, XC.dO, C.dP, XC.p, XC.pend], rows: [...ranked].sort((a, b) => a.dO - b.dO || a.p - b.p).slice(0, 10), onRow: blockGo }, sub);
        }
        tableCard(g2, 'Most Onboarded Schools Not Started', { cols: [C.idx, C.block, XC.so, { k: 'onb', h: 'Onboarded, not started', type: 'n' }, XC.sst], rows: [...ranked].sort((a, b) => b.onb - a.onb).slice(0, 10), onRow: blockGo }, sub);
        tableCard(g2, 'Most Students Not Screened', { cols: [C.idx, C.block, XC.t, XC.o, XC.pend, XC.p], rows: [...ranked].sort((a, b) => b.pend - a.pend).slice(0, 10), onRow: blockGo }, sub);

        const sr = schoolRows(S, P);
        const scols = [C.idx, C.sb, C.school, C.udise, XC.t, XC.o, XC.pend, XC.p];
        const g3 = h('<div class="stack" style="margin-top:16px"></div>');
        v.append(g3);
        tableCard(g3, 'Large Onboarded Schools Not Started (Top 50 by students)', { cols: scols, rows: sr.filter(x => x.c === 'onb').sort((a, b) => b.t - a.t).slice(0, 50), onRow: schoolGo }, sub);
        tableCard(g3, 'Large Schools Not Onboarded (Top 50 by students)', { cols: scols, rows: sr.filter(x => x.c === 'notonb').sort((a, b) => b.t - a.t).slice(0, 50), onRow: schoolGo }, sub);
        if (P) tableCard(g3, `Best Performing Schools since ${fmtD(P.date)} (Top 50)`, { cols: [...scols, XC.dO], rows: sr.filter(x => x.dO > 0).sort((a, b) => b.dO - a.dO).slice(0, 50), onRow: schoolGo }, sub);
    }

    registerModule({
        key: 'screening', program: 'PRASHAST', title: 'Screening (Part-1)', tag: 'Screening (Part-1)', icon: '&#129658;',
        header: HEADER, source: `${SOURCE} - Schools Screening Status [Part-1]`,
        priority: 30,
        detect: H => has(H, /screened/i),
        parse: prashastParse((r, I) => ({
            ob: cellText(r, I.onb), ss: cellText(r, I.started),
            ts: I.students >= 0 ? num(r[I.students]) : 0, sc: num(r[I.screened]),
        })),
        prep: x => {
            x.t = x.ts;
            x.o = x.sc;
            x.sst = isStarted(x.ss) || x.sc > 0 ? 1 : 0;
            x.so = isDone(x.ob) || x.sst ? 1 : 0;
            x.c = x.sst ? (x.t && x.o >= x.t ? 'scrfull' : 'scr') : x.so ? 'onb' : 'notonb';
        },
        cats: STAGES,
        sums: ['so', 'sst'],
        fields: ['b', 'n', 'u', 'ob', 'ss', 'ts', 'sc'],
        cat: STAGE_NAME,
        pctLabel: 'Students screened %',
        fileHint: '<code>Schools_Screening_Status_Part1_All_Blocks_YYYY-MM-DD.xlsx</code> (Tampermonkey script)',
        emptyText: '<b>Schools_Screening_Status_Part1_All_Blocks</b> Excel file (Block Name, School Name, UDISE Code, Schools Onboarded, Screening Started, Total Students, Screened Students)',
        nav: stdNav([['schools/notonb', 'Not Onboarded', 'dot-zero'], ['schools/onb', 'Onboarded, Not Started', 'dot-part'], ['schools/started', 'Screening Started', 'dot-info'], ['schools/scrfull', 'All Students Screened', 'dot-full']]),
        dataCols: [['schools', 'Schools'], ['so', 'Onboarded'], ['sst', 'Screening started'], ['t', 'Students'], ['o', 'Screened'], ['p', '%', 'p']],
        home: T => ({ line: `<b>${fmtN(T.o)}</b> of ${fmtN(T.t)} students screened`, stats: [['Schools onboarded', fmtN(T.so)], ['Screening started', `${fmtN(T.sst)} schools`]] }),
        profile: x => [['Onboarding', esc(x.ob) || '-'], ['Screening', esc(x.ss) || '-'], ['Total students', fmtN(x.t)], ['Screened', fmtN(x.o)]],
        groupCols: g => [g, XC.schools, XC.so, XC.sop, XC.sst, XC.sstp, XC.t, XC.o, XC.pend, XC.p, XC.dO],
        groupMetrics: [['p', 'Students screened %'], ['o', 'Screened students'], ['t', 'Total students'], ['sst', 'Schools screening started'], ['so', 'Schools onboarded'], ['schools', 'Total schools']],
        summaryCols: g => [g, XC.schools, XC.sst, XC.t, XC.o, XC.p],
        summarySort: 'schools',
        pages: { dashboard: xDashboard, blocks: xBlocks, schools: xSchools, compare: xCompare, trend: xTrend, rank: xRank, groups: pageGroups },
    });
})();
