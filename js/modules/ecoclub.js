/* ECO CLUB modules: Eco Club Registration and Eco Club Plantation.
 * Files: "Registration of schools under eco_club-DD-MM-YYYY.xlsx" (registered schools only) and
 * "Eco_Clubs_plantation_West_Bengal_all_schools_DD-MM-YYYY.xlsx" (schools that planted trees, plus a district
 * summary sheet with the plantation target). Both list only the schools that took part, so every other school of
 * the school master is added (not registered / no plantation) and blocks are taken from the master. */
'use strict';

(() => {
    const HEADER = 'Eco Club Monitoring :: SSM, Purba Bardhaman';
    const has = (H, re) => H.some(x => re.test(x));
    // rows of other districts are skipped (the plantation file is for all of West Bengal)
    const inDistrict = (r, i) => i < 0 || !cellText(r, i) || /purba\s*(bardhaman|burdwan)/i.test(cellText(r, i));

    // Latest day of the other Eco Club module, for the cross lists (registered but no plantation and the reverse)
    const registered = () => memo('eco|registered', () => {
        const S = latestOf('ecoreg');
        return S && { date: S.date, set: new Set(S.schools.filter(x => x.reg).map(x => x.u)) };
    });
    const trees = () => memo('eco|trees', () => {
        const S = latestOf('ecoplant');
        return S && { date: S.date, map: new Map(S.schools.map(x => [x.u, x.tr])) };
    });
    const regNoPlant = x => { const t = trees(); return !!x.reg && !!t && !t.map.get(x.u); };
    const plantNoReg = x => { const r = registered(); return x.tr > 0 && !!r && !r.set.has(x.u); };
    const isRegNoPlant = x => { const r = registered(); return !x.tr && !!r && r.set.has(x.u); };

    // ============================================================ Eco Club Registration
    // Each school counts as t = 1 and o = 1 when it is registered.
    const RK = colSet({
        schools: 'Total Schools', o: 'Registered', pend: col(C.pend, { h: 'Not Registered', invert: true }),
        p: 'Registered %', dO: 'Change (Reg.)', cat: 'Status',
    });

    function regParse(rows, hi, H) {
        const find = colFinder(H);
        const iS = find(isSchoolHeader), iU = find(x => /udise/i.test(x)), iB = find(x => /block/i.test(x));
        const iT = find(x => /type/i.test(x)), iD = find(x => /district/i.test(x));
        const schools = [];
        for (const r of rows.slice(hi + 1)) {
            const n = cellText(r, iS);
            if (!n || !inDistrict(r, iD)) continue;
            schools.push({ fb: cellText(r, iB), n, u: cellText(r, iU), ty: cellText(r, iT), reg: 1 });
        }
        return { schools };
    }

    function rDashboard(v) {
        const S = cur(), P = prev(), T = S.total, PT = P && P.total;
        const d = k => (PT ? T[k] - PT[k] : null);
        const ranked = rankedBlocks(S, P);
        const base = modBase();
        pageHead(v, 'Eco Club Registration Dashboard', subLine(S, P));
        heroCard(v, S, P, ranked, {
            ring: 'registered', unit: 'schools',
            label: 'District Eco Club registration &middot; Purba Bardhaman',
            title: `<b>${fmtN(T.o)}</b> of ${fmtN(T.schools)} schools registered`,
            meta: `${fmtN(T.pend)} schools not yet registered across ${S.blocks.length} blocks`,
        });
        statGrid(v, [
            { label: 'Total Schools', value: fmtN(T.schools), delta: d('schools'), foot: 'all schools of the school master', ic: 'school', tone: 'blue', href: `${base}schools` },
            { label: 'Registered', value: fmtN(T.o), delta: d('o'), foot: `${fmtP(T.p)}% of schools`, ic: 'check', tone: 'green', href: `${base}schools/reg` },
            { label: 'Not Registered', value: fmtN(T.pend), delta: d('pend'), invert: true, foot: `${fmtP(100 - T.p)}% yet to register`, ic: 'clock', tone: 'red', href: `${base}schools/notreg` },
            { label: 'Registered %', value: fmtP(T.p) + '%', delta: d('p'), pctDelta: true, foot: `best block ${fmtP(ranked[0].p)}%`, ic: 'up', tone: 'indigo' },
        ]);

        const best = ranked[0], worst = ranked[ranked.length - 1];
        const mostPend = [...ranked].sort((a, b) => b.pend - a.pend)[0];
        const full = ranked.filter(b => b.pend === 0).map(b => b.block);
        const notes = [
            ['up', `Highest registration: <b>${esc(best.block)}</b> at ${fmtP(best.p)}%; lowest: <b>${esc(worst.block)}</b> at ${fmtP(worst.p)}%.`],
            ['flag', `Most schools not registered: <b>${esc(mostPend.block)}</b> (${fmtN(mostPend.pend)} of ${fmtN(mostPend.schools)}). <a href="${base}schools/notreg?block=${encodeURIComponent(mostPend.block)}">See list &rsaquo;</a>`],
            ['full', full.length ? `Every school is registered in ${full.length} block(s): ${full.map(esc).join(', ')}.` : 'No block has registered all its schools yet.'],
        ];
        const t = trees();
        if (t) {
            const n = S.schools.filter(regNoPlant).length;
            notes.push(['info', `<b>${fmtN(n)}</b> registered schools have no plantation in the plantation data of ${fmtD(t.date)}. <a href="${base}schools/regnoplant">See list &rsaquo;</a>`]);
        }
        if (P) {
            const sr = schoolRows(S, P);
            const newly = sr.filter(x => x.dO > 0).length;
            const dropped = sr.filter(x => x.dO < 0).length;
            const gainer = [...ranked].sort((a, b) => (b.dO || 0) - (a.dO || 0))[0];
            notes.unshift(['check', `Since ${fmtD(P.date)}: <b>${fmtN(newly)}</b> schools newly registered. <a href="${base}compare">Details &rsaquo;</a>`]);
            if (gainer && gainer.dO > 0) notes.push(['up', `Top gainer since ${fmtD(P.date)}: <b>${esc(gainer.block)}</b> (${signed(gainer.dO)} schools).`]);
            if (dropped) notes.push(['down', `<span class="down">${fmtN(dropped)} school(s) were registered on ${fmtD(P.date)} but are not in the latest list</span> &mdash; please verify.`]);
        }
        notesCard(v, notes);

        const g = grid2(v);
        doughnutCard(g, 'Schools by Registration', ['Registered', 'Not registered'], [T.o, T.pend], [COLORS.good, COLORS.bad]);
        bandsCard(g, 'Blocks by Registration Level', [['Below 50%', 0, 50], ['50-70%', 50, 70], ['70-90%', 70, 90], ['90% and above', 90, 101]], ranked);
        dashTrend(v, 'Registered %', [['Schools registered', x => x.o, COLORS.good], ['Not registered', x => x.pend, COLORS.bad]]);
        topBottom(v, S, P, ranked, [C.rank, C.block, RK.schools, RK.o, RK.p, col(RK.dO, { h: 'Change' })]);
        groupSummary(v, S, P);
    }

    const rBlocks = v => blocksPage(v, {
        heading: 'Block-wise Eco Club Registration',
        cols: [C.rank, C.block, RK.schools, RK.o, RK.pend, RK.p, RK.dO, C.dP, C.status],
        measure: '% of schools registered',
        extra: ' Blocks are those of the school master; the Eco Club file\'s own block of each school is shown in the school lists.',
        chartTitle: 'Registered and not registered schools by block',
        chartSets: [['Registered', 'o', COLORS.good], ['Not registered', 'pend', COLORS.bad]],
    });

    const rSchools = (v, r) => schoolsPage(v, r, {
        lists: {
            all: ['All Schools', 'All schools', () => true],
            reg: ['Schools Registered in Eco Club', 'Registered', x => x.c === 'reg'],
            notreg: ['Schools Not Registered in Eco Club', 'Not registered', x => x.c === 'notreg'],
            regnoplant: ['Registered Schools with No Plantation', 'Registered, no plantation', regNoPlant],
        },
        filterLabel: 'Status',
        cols: (catKey, P) => [RK.cat, { k: 'fb', h: 'Block in Eco Club file', cls: 'nowrap' },
            ...(trees() ? [{ k: 'trees', h: `Trees planted (${fmtD(trees().date)})`, type: 'n', v: x => (trees().map.get(x.u) || 0) }] : []),
            ...(P ? [{ k: 'cPrev', h: `Status on ${fmtD(P.date)}`, type: 'cat' },
                { k: 'move', h: 'Change', v: x => (x.cPrev == null ? 'New' : x.dO > 0 ? 'Newly registered' : x.dO < 0 ? 'Dropped' : '') }] : [])],
        chips: t => [['Registered', fmtN(t.o)], ['Not registered', fmtN(t.pend)], ['Registered %', fmtP(t.p)]],
    });

    const rCompare = (v, r) => comparePage(v, r, {
        kpis: [['Schools Registered', 'o', { cls: 'good' }], ['Registered %', 'p', { pct: true }], ['Not Registered', 'pend', { invert: true, cls: 'bad' }], ['Total Schools', 'schools']],
        blockCols: (dA, dB) => [RK.schools, { k: 'oA', h: `Reg. ${dA}`, type: 'n' }, { k: 'o', h: `Reg. ${dB}`, type: 'n' }, RK.dO,
            { k: 'pA', h: `% ${dA}`, type: 'p' }, { k: 'p', h: `% ${dB}`, type: 'p' }, C.dP, RK.pend],
        moves: [
            ['Newly registered', x => x.dO > 0],
            ['Still not registered', x => x.c === 'notreg' && x.cPrev === 'notreg'],
            ['Registered on both dates', x => x.c === 'reg' && x.cPrev === 'reg'],
            ['Dropped from the list', x => x.dO < 0],
            ['New in later file', x => x.cPrev == null],
        ],
        moveCols: (dA, dB) => [{ k: 'fb', h: 'Block in Eco Club file', cls: 'nowrap' }, { k: 'cPrev', h: `Status ${dA}`, type: 'cat' }, { k: 'c', h: `Status ${dB}`, type: 'cat' }],
    });

    const rTrend = v => trendPage(v, {
        bar: ['Schools registered', 'rgba(22,163,74,.4)'],
        cols: [RK.schools, RK.o, col(RK.dO, { h: 'Daily change' }), RK.p, C.dP, RK.pend],
        metrics: [['p', 'Registered %'], ['o', 'Schools registered'], ['pend', 'Not registered']],
        invert: ['pend'],
    });

    function rRank(v) {
        const S = cur(), P = prev();
        const ranked = rankedBlocks(S, P);
        const sub = plainSub(S, P);
        pageHead(v, 'Leading & Lagging', subLine(S, P));
        const bcols = [C.rank, C.block, RK.schools, RK.o, RK.pend, RK.p, RK.dO];

        const g1 = grid2(v);
        tableCard(g1, 'Top 10 Leading Blocks', { cols: bcols, rows: ranked.slice(0, 10), onRow: blockGo }, sub);
        tableCard(g1, 'Bottom 10 Lagging Blocks', { cols: bcols, rows: ranked.slice(-10).reverse(), onRow: blockGo }, sub);

        const g2 = grid2(v, true);
        if (P) {
            tableCard(g2, `Top Gainers since ${fmtD(P.date)}`, { cols: [C.idx, C.block, RK.dO, C.dP, RK.p], rows: [...ranked].sort((a, b) => b.dO - a.dO).slice(0, 10), onRow: blockGo }, sub);
            tableCard(g2, `Least Progress since ${fmtD(P.date)}`, { cols: [C.idx, C.block, RK.dO, C.dP, RK.p, RK.pend], rows: [...ranked].sort((a, b) => a.dO - b.dO || a.p - b.p).slice(0, 10), onRow: blockGo }, sub);
        }
        tableCard(g2, 'Blocks with Most Schools Not Registered', { cols: [C.idx, C.block, RK.schools, RK.o, RK.pend, RK.p], rows: [...ranked].sort((a, b) => b.pend - a.pend).slice(0, 10), onRow: blockGo }, sub);
        if (trees()) {
            const nopl = new Map();
            S.schools.filter(regNoPlant).forEach(x => nopl.set(x.b, (nopl.get(x.b) || 0) + 1));
            const rows = ranked.map(b => ({ ...b, nopl: nopl.get(b.block) || 0 })).filter(b => b.nopl).sort((a, b) => b.nopl - a.nopl).slice(0, 10);
            tableCard(g2, 'Blocks with Most Registered Schools without Plantation', { cols: [C.idx, C.block, RK.o, { k: 'nopl', h: 'Registered, no plantation', type: 'n' }], rows, onRow: r => { location.hash = `${modBase()}schools/regnoplant?block=${encodeURIComponent(r.block)}`; } }, sub);
        }
    }

    registerModule({
        key: 'ecoreg', program: 'ECO CLUB', title: 'Eco Club Registration', tag: 'Eco Club Registration', icon: '&#127807;',
        header: HEADER, source: 'Eco Club portal - Registration of schools under Eco Club (School Wise Notifications)',
        priority: 5,
        detect: H => has(H, /school\s*type/i) && has(H, /udise/i) && !has(H, /tree|total|status|generated|screened|onboarded/i),
        parse: regParse,
        complete: schools => withMaster(schools, () => ({ reg: 0, fb: '' })),
        prep: x => { x.t = 1; x.o = x.reg ? 1 : 0; x.c = x.o ? 'reg' : 'notreg'; },
        cats: ['reg', 'notreg'],
        fields: ['fb', 'n', 'u', 'ty', 'reg'],
        cat: { reg: 'Registered', notreg: 'Not registered' },
        pctLabel: 'Registered %',
        fileHint: '<code>Registration of schools under eco_club-DD-MM-YYYY.xlsx</code> (list of registered schools)',
        emptyText: '<b>Registration of schools under Eco Club</b> Excel file (School Name, UDISE ID, District, Block Name, School Type)',
        nav: stdNav([['schools/reg', 'Registered', 'dot-full'], ['schools/notreg', 'Not Registered', 'dot-zero'], ['schools/regnoplant', 'Registered, No Plantation', 'dot-part']]),
        dataCols: [['schools', 'Schools'], ['o', 'Registered'], ['pend', 'Not registered'], ['p', '%', 'p']],
        home: T => ({ line: `<b>${fmtN(T.o)}</b> of ${fmtN(T.schools)} schools registered`, stats: [['Not registered', fmtN(T.pend)]] }),
        profile: x => [['Status', x.reg ? 'Registered' : 'Not registered'], ['Block in Eco Club file', esc(x.fb) || '-']],
        groupCols: g => [g, RK.schools, RK.o, RK.pend, RK.p, RK.dO, C.dP],
        groupMetrics: [['p', 'Registered %'], ['o', 'Schools registered'], ['pend', 'Not registered'], ['schools', 'Total schools']],
        summaryCols: g => [g, RK.schools, RK.o, RK.p, col(RK.dO, { h: 'Change' })],
        summarySort: 'schools',
        pages: { dashboard: rDashboard, blocks: rBlocks, schools: rSchools, compare: rCompare, trend: rTrend, rank: rRank, groups: pageGroups },
    });

    // ============================================================ Eco Club Plantation
    // Each school: tr = trees planted, st / tc / pa = students / teachers / total participants; t = 1 and o = 1 when
    // it has planted at least one tree. c = trees bracket (as in the SHVR tracker): 0, 1-9, 10-19, 20-49, 50-99,
    // 100-249, 250-499, 500+.
    const BRACKETS = [
        ['t0', '0 trees', 0, '#dc2626'], ['t1', '1-9 trees', 1, '#d97706'], ['t10', '10-19 trees', 10, '#2563eb'],
        ['t20', '20-49 trees', 20, '#059669'], ['t50', '50-99 trees', 50, '#047857'], ['t100', '100-249 trees', 100, '#065f46'],
        ['t250', '250-499 trees', 250, '#064e3b'], ['t500', '500+ trees', 500, '#022c22'],
    ];
    const bracketOf = n => BRACKETS.filter(b => n >= b[2]).pop()[0];
    const PK = colSet({
        schools: 'Total Schools', o: 'Schools Planted', pend: col(C.pend, { h: 'No Plantation', invert: true }),
        p: '% Schools Planted', dO: 'Change (Sch.)', cat: 'Trees',
        tr: { k: 'tr', h: 'Trees Planted', type: 'n' }, dTr: { k: 'dTr', h: 'Change (Trees)', type: 'd' },
        st: { k: 'st', h: 'Students', type: 'n' }, tc: { k: 'tc', h: 'Teachers', type: 'n' }, pa: { k: 'pa', h: 'Participants', type: 'n' },
        avg: { k: 'avg', h: 'Trees / Planting School', type: 'n', v: r => (r.o ? Math.round(r.tr / r.o) : 0) },
        rg: { k: 'rg', h: 'Eco Club', cls: 'nowrap', v: x => { const r = registered(); return r ? (r.set.has(x.u) ? 'Registered' : 'Not registered') : ''; } },
    });

    function plantParse(rows, hi, H, wb) {
        const find = colFinder(H);
        const iS = find(isSchoolHeader), iU = find(x => /udise/i.test(x)), iB = find(x => /block/i.test(x)), iD = find(x => /district/i.test(x));
        const iSt = find(x => /student/i.test(x)), iTc = find(x => /teacher/i.test(x)), iPa = find(x => /participant/i.test(x)), iTr = find(x => /trees?\s*planted/i.test(x));
        const schools = [];
        for (const r of rows.slice(hi + 1)) {
            const n = cellText(r, iS);
            if (!n || !inDistrict(r, iD)) continue;
            schools.push({ fb: cellText(r, iB), n, u: cellText(r, iU), st: num(r[iSt]), tc: num(r[iTc]), pa: num(r[iPa]), tr: num(r[iTr]) });
        }
        // district target from the summary sheet (District | Plantation Target | No of Plantation Done | Plantation %)
        let meta = null;
        for (const name of wb.SheetNames) {
            const rs = sheetRows(wb, name);
            const h = rs.findIndex(r => r.some(c => /plantation\s*target/i.test(String(c))));
            if (h < 0) continue;
            const HH = rs[h].map(c => String(c).trim());
            const it = HH.findIndex(x => /target/i.test(x)), id = HH.findIndex(x => /done/i.test(x)), iDist = HH.findIndex(x => /district/i.test(x));
            const row = rs.slice(h + 1).find(r => num(r[it]) > 0 && inDistrict(r, iDist));
            const note = rs.slice(0, h).flat().map(c => String(c).trim()).find(c => /as\s*on/i.test(c));
            if (row) meta = { target: num(row[it]), done: id >= 0 ? num(row[id]) : null, note: note || '' };
            break;
        }
        return { schools, meta };
    }

    function pDashboard(v) {
        const S = cur(), P = prev(), T = S.total, PT = P && P.total;
        const d = k => (PT ? T[k] - PT[k] : null);
        const ranked = rankedBlocks(S, P);
        const base = modBase();
        const target = S.meta && S.meta.target;
        pageHead(v, 'Eco Club Plantation Dashboard', subLine(S, P));
        heroCard(v, S, P, ranked, {
            ring: 'schools planted', unit: 'schools',
            label: 'District Eco Club plantation &middot; Purba Bardhaman',
            title: `<b>${fmtN(T.o)}</b> of ${fmtN(T.schools)} schools have planted trees`,
            meta: `<b>${fmtN(T.tr)}</b> trees planted by ${fmtN(T.pa)} participants (${fmtN(T.st)} students, ${fmtN(T.tc)} teachers)${target ? ` &middot; ${fmtP(pct(T.tr, target))}% of the district target` : ''}`,
        });
        statGrid(v, [
            { label: 'Trees Planted', value: fmtN(T.tr), delta: d('tr'), foot: target ? `target ${fmtN(Math.round(target))}` : `${fmtN(T.o ? Math.round(T.tr / T.o) : 0)} per planting school`, ic: 'up', tone: 'green' },
            { label: 'Schools Planted', value: fmtN(T.o), delta: d('o'), foot: `${fmtP(T.p)}% of schools`, ic: 'check', tone: 'blue', href: `${base}schools` },
            { label: 'No Plantation', value: fmtN(T.pend), delta: d('pend'), invert: true, foot: `${fmtP(100 - T.p)}% of schools`, ic: 'clock', tone: 'red', href: `${base}schools/t0` },
            { label: 'Participants', value: fmtN(T.pa), delta: d('pa'), foot: `${fmtN(T.st)} students, ${fmtN(T.tc)} teachers`, ic: 'person', tone: 'indigo' },
        ]);
        if (target) {
            const left = Math.max(0, Math.round(target - T.tr));
            v.append(h(`<div class="kpis">
                <div class="kpi"><span class="kpi-label">District plantation target</span><span class="kpi-val">${fmtN(Math.round(target))}</span><span class="kpi-delta"><small>${esc(S.meta.note) || 'from the file summary'}</small></span></div>
                <div class="kpi good"><span class="kpi-label">Target achieved</span><span class="kpi-val">${fmtP(pct(T.tr, target))}%</span><span class="kpi-delta"><small>${fmtN(T.tr)} trees planted</small></span></div>
                <div class="kpi bad"><span class="kpi-label">Trees still to plant</span><span class="kpi-val">${fmtN(left)}</span><span class="kpi-delta"><small>to reach the target</small></span></div>
            </div>`));
        }
        catGrid(v, [
            { key: 't0', cls: 'zero', label: 'No plantation', ic: 'zero', invert: true },
            { key: 't1', cls: 'part', label: '1-9 trees', ic: 'part' },
            { key: 't10', cls: 'info', label: '10-19 trees', ic: 'up' },
            { key: 't20p', cls: 'full', label: '20 or more trees', ic: 'full' },
        ], S, P);

        const best = ranked[0], worst = ranked[ranked.length - 1];
        const most = [...ranked].sort((a, b) => b.tr - a.tr)[0];
        const mostZero = [...ranked].sort((a, b) => b.t0 - a.t0)[0];
        const notes = [
            ['up', `Highest share of schools with plantation: <b>${esc(best.block)}</b> at ${fmtP(best.p)}%; lowest: <b>${esc(worst.block)}</b> at ${fmtP(worst.p)}%.`],
            ['full', `Most trees planted: <b>${esc(most.block)}</b> (${fmtN(most.tr)} trees in ${fmtN(most.o)} schools).`],
            ['flag', `Most schools without plantation: <b>${esc(mostZero.block)}</b> (${fmtN(mostZero.t0)}). <a href="${base}schools/t0?block=${encodeURIComponent(mostZero.block)}">See list &rsaquo;</a>`],
        ];
        const r = registered();
        if (r) {
            const a = S.schools.filter(isRegNoPlant).length, b = S.schools.filter(plantNoReg).length;
            notes.push(['info', `Eco Club registration of ${fmtD(r.date)}: <b>${fmtN(a)}</b> registered schools have no plantation (<a href="${base}schools/regnoplant">list &rsaquo;</a>) and <b>${fmtN(b)}</b> schools planted trees without registering (<a href="${base}schools/plantnoreg">list &rsaquo;</a>).`]);
        }
        if (P) {
            const sr = schoolRows(S, P);
            const started = sr.filter(x => x.cPrev === 't0' && x.c !== 't0').length;
            const more = sr.filter(x => x.dTr > 0).length;
            const fewer = sr.filter(x => x.dTr < 0).length;
            const gainer = [...ranked].sort((a, b) => (b.dTr || 0) - (a.dTr || 0))[0];
            notes.unshift(['check', `Since ${fmtD(P.date)}: <b>${fmtN(started)}</b> schools started plantation, <b>${fmtN(more)}</b> schools planted more trees (${signed(T.tr - PT.tr)} trees). <a href="${base}compare">Details &rsaquo;</a>`]);
            if (gainer && gainer.dTr > 0) notes.push(['up', `Most trees added since ${fmtD(P.date)}: <b>${esc(gainer.block)}</b> (${signed(gainer.dTr)} trees).`]);
            if (fewer) notes.push(['down', `<span class="down">${fmtN(fewer)} school(s) show fewer trees than on ${fmtD(P.date)}</span> &mdash; please verify.`]);
        }
        notesCard(v, notes);

        const g = grid2(v);
        doughnutCard(g, 'Schools by Trees Planted', BRACKETS.map(b => b[1]), BRACKETS.map(b => T[b[0]]), BRACKETS.map(b => b[3]));
        bandsCard(g, 'Blocks by % of Schools with Plantation', [['Below 50%', 0, 50], ['50-70%', 50, 70], ['70-85%', 70, 85], ['85% and above', 85, 101]], ranked);
        const byTrees = [...ranked].sort((a, b) => b.tr - a.tr);
        chart(card(v, 'Trees Planted by Block'), Math.max(320, byTrees.length * 20 + 60), {
            type: 'bar',
            data: { labels: byTrees.map(b => b.block), datasets: [{ label: 'Trees planted', data: byTrees.map(b => b.tr), backgroundColor: '#059669', borderRadius: 3, maxBarThickness: 18 }] },
            options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true }, y: { ticks: { autoSkip: false, font: { size: 10 } } } } },
        });
        dashTrend(v, '% Schools Planted', [['Schools planted', x => x.o, COLORS.good], ['No plantation', x => x.t0, COLORS.bad]]);
        topBottom(v, S, P, ranked, [C.rank, C.block, PK.o, PK.p, PK.tr, col(PK.dTr, { h: 'Change' })]);
        groupSummary(v, S, P);
    }

    const pBlocks = v => blocksPage(v, {
        heading: 'Block-wise Eco Club Plantation',
        cols: [C.rank, C.block, PK.schools, PK.o, PK.pend, PK.p, PK.dO, PK.tr, PK.dTr, PK.avg, PK.pa, PK.st, PK.tc, C.status],
        measure: '% of schools with plantation',
        extra: ' Blocks are taken from the school master by UDISE code.',
        chartTitle: 'Schools by trees planted, by block',
        chartSets: BRACKETS.map(([k, label, , color]) => [label, k, color]),
    });

    const pSchools = (v, r) => schoolsPage(v, r, {
        lists: {
            all: ['All Schools', 'All schools', () => true],
            t0: ['Schools with No Plantation', 'No plantation', x => x.c === 't0'],
            regnoplant: ['Registered in Eco Club, No Plantation', 'Registered, no plantation', isRegNoPlant],
            plantnoreg: ['Planted Trees, Not Registered in Eco Club', 'Planted, not registered', plantNoReg],
            ...Object.fromEntries(BRACKETS.slice(1).map(([k, label]) => [k, [`Schools with ${label}`, label, x => x.c === k]])),
            t20p: ['Schools with 20 or More Trees', '20 or more trees', x => x.tr >= 20],
        },
        filterLabel: 'Trees planted',
        cols: (catKey, P) => [PK.tr, PK.st, PK.tc, PK.pa, PK.rg,
            ...(P ? [{ k: 'trPrev', h: `Trees on ${fmtD(P.date)}`, type: 'n' }, PK.dTr] : []),
            ...(catKey === 'all' ? [PK.cat] : [])],
        sorts: Object.fromEntries(['all', 'plantnoreg', 't1', 't10', 't20', 't50', 't100', 't250', 't500', 't20p'].map(k => [k, ['tr', 'desc']])),
        chips: t => [['Planted', fmtN(t.o)], ['No plantation', fmtN(t.pend)], ['% planted', fmtP(t.p)], ['Trees', fmtN(t.tr)], ['Participants', fmtN(t.pa)]],
    });

    const pCompare = (v, r) => comparePage(v, r, {
        kpis: [['Trees Planted', 'tr', { cls: 'good' }], ['Schools Planted', 'o', { cls: 'good' }], ['% Schools Planted', 'p', { pct: true }],
            ['No Plantation', 't0', { invert: true, cls: 'bad' }], ['Participants', 'pa']],
        blockCols: (dA, dB) => [PK.schools, { k: 'oA', h: `Planted ${dA}`, type: 'n' }, { k: 'o', h: `Planted ${dB}`, type: 'n' }, PK.dO,
            { k: 'pA', h: `% ${dA}`, type: 'p' }, { k: 'p', h: `% ${dB}`, type: 'p' }, C.dP,
            { k: 'trA', h: `Trees ${dA}`, type: 'n' }, { k: 'tr', h: `Trees ${dB}`, type: 'n' }, PK.dTr],
        moves: [
            ['Started plantation', x => x.cPrev === 't0' && x.c !== 't0'],
            ['More trees planted', x => x.dTr > 0],
            ['Still no plantation', x => x.c === 't0' && x.cPrev === 't0'],
            ['Fewer trees (verify)', x => x.dTr < 0],
            ['New in later file', x => x.cPrev == null],
        ],
        moveCols: (dA, dB) => [{ k: 'trPrev', h: `Trees ${dA}`, type: 'n' }, { k: 'tr', h: `Trees ${dB}`, type: 'n' }, PK.dTr,
            { k: 'cPrev', h: `Bracket ${dA}`, type: 'cat' }, { k: 'c', h: `Bracket ${dB}`, type: 'cat' }],
        moveSort: 'dTr',
    });

    const pTrend = v => trendPage(v, {
        bar: ['Schools planted', 'rgba(22,163,74,.4)'],
        cols: [PK.schools, PK.o, col(PK.dO, { h: 'Daily change (schools)' }), PK.p, C.dP, PK.tr, col(PK.dTr, { h: 'Daily change (trees)' }), PK.pa, { k: 't0', h: 'No plantation', type: 'n' }],
        metrics: [['p', '% Schools Planted'], ['tr', 'Trees planted'], ['o', 'Schools planted'], ['t0', 'Schools with no plantation'], ['pa', 'Participants']],
        invert: ['t0'],
    });

    function pRank(v) {
        const S = cur(), P = prev();
        const ranked = rankedBlocks(S, P);
        const sub = plainSub(S, P);
        pageHead(v, 'Leading & Lagging', subLine(S, P));
        const bcols = [C.rank, C.block, PK.schools, PK.o, PK.p, PK.tr, PK.avg];

        const g1 = grid2(v);
        tableCard(g1, 'Top 10 Leading Blocks (by % of schools planted)', { cols: bcols, rows: ranked.slice(0, 10), onRow: blockGo }, sub);
        tableCard(g1, 'Bottom 10 Lagging Blocks (by % of schools planted)', { cols: bcols, rows: ranked.slice(-10).reverse(), onRow: blockGo }, sub);

        const g2 = grid2(v, true);
        if (P) {
            tableCard(g2, `Most Trees Added since ${fmtD(P.date)}`, { cols: [C.idx, C.block, PK.dTr, PK.dO, PK.tr], rows: [...ranked].sort((a, b) => b.dTr - a.dTr).slice(0, 10), onRow: blockGo }, sub);
            tableCard(g2, `Least Progress since ${fmtD(P.date)}`, { cols: [C.idx, C.block, PK.dTr, PK.dO, PK.p], rows: [...ranked].sort((a, b) => a.dTr - b.dTr || a.p - b.p).slice(0, 10), onRow: blockGo }, sub);
        }
        tableCard(g2, 'Blocks with Most Trees Planted', { cols: [C.idx, C.block, PK.tr, PK.o, PK.avg, PK.pa], rows: [...ranked].sort((a, b) => b.tr - a.tr).slice(0, 10), onRow: blockGo }, sub);
        tableCard(g2, 'Blocks with Most Schools without Plantation', { cols: [C.idx, C.block, PK.schools, { k: 't0', h: 'No plantation', type: 'n' }, PK.p], rows: [...ranked].sort((a, b) => b.t0 - a.t0).slice(0, 10), onRow: blockGo }, sub);

        const sr = schoolRows(S, P);
        const scols = [C.idx, C.sb, C.school, C.udise, PK.tr, PK.st, PK.pa];
        const g3 = h('<div class="stack" style="margin-top:16px"></div>');
        v.append(g3);
        tableCard(g3, 'Top 50 Schools by Trees Planted', { cols: scols, rows: [...sr].sort((a, b) => b.tr - a.tr).slice(0, 50), onRow: schoolGo }, sub);
        if (P) tableCard(g3, `Most Trees Added since ${fmtD(P.date)} (Top 50 schools)`, { cols: [...scols, PK.dTr], rows: sr.filter(x => x.dTr > 0).sort((a, b) => b.dTr - a.dTr).slice(0, 50), onRow: schoolGo }, sub);
    }

    registerModule({
        key: 'ecoplant', program: 'ECO CLUB', title: 'Eco Club Plantation', tag: 'Eco Club Plantation', icon: '&#127795;',
        header: HEADER, source: 'Eco Club portal - Eco Clubs plantation, all schools',
        priority: 35,
        detect: H => has(H, /trees?\s*planted/i),
        parse: plantParse,
        complete: schools => withMaster(schools, () => ({ st: 0, tc: 0, pa: 0, tr: 0, fb: '' })),
        prep: x => { x.t = 1; x.o = x.tr > 0 ? 1 : 0; x.c = bracketOf(x.tr); },
        finish: a => { a.t20p = ['t20', 't50', 't100', 't250', 't500'].reduce((s, k) => s + (a[k] || 0), 0); },
        cats: BRACKETS.map(b => b[0]),
        sums: ['tr', 'st', 'tc', 'pa'],
        fields: ['fb', 'n', 'u', 'st', 'tc', 'pa', 'tr'],
        cat: Object.fromEntries(BRACKETS.map(b => [b[0], b[1]])),
        pctLabel: '% Schools Planted',
        fileHint: '<code>Eco_Clubs_plantation_West_Bengal_all_schools_DD-MM-YYYY.xlsx</code> (Schools sheet and the district target sheet)',
        emptyText: '<b>Eco Clubs plantation</b> Excel file (School, UDISE, Students, Teachers, Total Participants, Trees Planted)',
        nav: stdNav([['schools/t0', 'No Plantation', 'dot-zero'], ['schools/regnoplant', 'Registered, No Plantation', 'dot-part'],
            ['schools/plantnoreg', 'Planted, Not Registered', 'dot-info'], ['schools/t20p', '20 or More Trees', 'dot-full']]),
        dataCols: [['schools', 'Schools'], ['o', 'Planted'], ['p', '%', 'p'], ['tr', 'Trees'], ['pa', 'Participants']],
        home: T => ({ line: `<b>${fmtN(T.o)}</b> of ${fmtN(T.schools)} schools planted trees`, stats: [['Trees planted', fmtN(T.tr)], ['Participants', fmtN(T.pa)], ['No plantation', fmtN(T.t0)]] }),
        profile: x => [['Trees planted', fmtN(x.tr)], ['Students', fmtN(x.st)], ['Teachers', fmtN(x.tc)], ['Participants', fmtN(x.pa)]],
        groupCols: g => [g, PK.schools, PK.o, PK.pend, PK.p, PK.dO, C.dP, PK.tr, PK.avg, PK.pa],
        groupMetrics: [['p', '% Schools Planted'], ['tr', 'Trees planted'], ['o', 'Schools planted'], ['t0', 'Schools with no plantation'], ['pa', 'Participants'], ['schools', 'Total schools']],
        summaryCols: g => [g, PK.schools, PK.o, PK.p, PK.tr],
        summarySort: 'schools',
        pages: { dashboard: pDashboard, blocks: pBlocks, schools: pSchools, compare: pCompare, trend: pTrend, rank: pRank, groups: pageGroups },
    });
})();
