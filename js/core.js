/* School Monitoring Portal - SSM, Purba Bardhaman
 * One static app (GitHub Pages) for all school monitoring programmes. Every programme is a module
 * (js/modules/*.js) that calls registerModule(); all modules share the same school master.
 * Daily snapshots are stored per module in IndexedDB and can also be published for everyone
 * through data/manifest.json in the repo. */
'use strict';

const ORG = 'SSM, Purba Bardhaman';
const APP_NAME = 'School Monitoring Portal';
const APP_HEADER = `${APP_NAME} :: ${ORG}`;
const CREDIT = 'An in-house production of SSM, Purba Bardhaman';
const NUM_TYPES = new Set(['idx', 'n', 'p', 'd', 'dp']);

// ---------------------------------------------------------------- module registry
// A module definition (see js/modules/*.js and README "Adding a monitoring module"):
//   key, program, title, tag, header, source, priority, detect(H), parse(rows, hi, H), prep(x),
//   cats, sums, fields, cat, finish?, codes?, nav, pages, dataCols, home(T), profile(x),
//   groupCols(g), groupMetrics, summaryCols(g), summarySort, pctLabel, fileHint, emptyText
const MODULES = {};
function registerModule(m) {
    MODULES[m.key] = Object.assign({ sums: [], priority: 0, finish: null }, m);
}
const M = () => MODULES[state.mod];
const modBase = (k = state.mod) => `#/${k}/`;

// state.snaps / cur / prev always refer to the active module (state.mod)
const state = { mod: '', mods: {}, route: null, charts: [], cache: {}, master: null, masterInfo: null };
['snaps', 'cur', 'prev'].forEach(k => Object.defineProperty(state, k, {
    get() { return this.mods[this.mod][k]; },
    set(v) { this.mods[this.mod][k] = v; },
}));

// ---------------------------------------------------------------- helpers
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const num = v => { const x = Number(String(v ?? '').replace(/,/g, '')); return isFinite(x) ? x : 0; };
const pct = (o, t) => (t ? (o * 100) / t : 0);
const round2 = n => Math.round(n * 100) / 100;
const fmtN = n => (n == null || n === '' ? '' : Number(n).toLocaleString('en-IN'));
const fmtP = n => (n == null ? '' : round2(n).toFixed(2));
const fmtD = d => (d ? d.split('-').reverse().join('-') : '');
const signed = (n, dec) => { if (n == null) return ''; const v = dec ? round2(n).toFixed(2) : fmtN(n); return n > 0 ? '+' + v : v; };
const pctCls = p => (p >= 80 ? 'good' : p >= 50 ? 'mid' : 'bad');
const slug = s => s.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '');
const byDate = (a, b) => a.date.localeCompare(b.date);
const today = () => new Date().toISOString().slice(0, 10);
const dKey = k => 'd' + k[0].toUpperCase() + k.slice(1); // o -> dO, sst -> dSst

function deltaHtml(n, dec, invert) {
    if (n == null) return '<span class="muted">&ndash;</span>';
    const r = round2(n);
    if (r === 0) return '<span class="muted">0</span>';
    const good = (r > 0) !== !!invert;
    return `<span class="${good ? 'up' : 'down'}">${r > 0 ? '&#9650;' : '&#9660;'} ${signed(n, dec)}</span>`;
}

function toast(msg, err) {
    const d = document.createElement('div');
    d.textContent = msg;
    if (err) d.className = 'err';
    $('#toast').append(d);
    setTimeout(() => d.remove(), err ? 7000 : 3500);
}

function dateFromName(name) {
    let m = name.match(/(20\d{2})[-_.](\d{2})[-_.](\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = name.match(/(\d{2})[-_.](\d{2})[-_.](20\d{2})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ---------------------------------------------------------------- storage (IndexedDB, falls back to memory)
// One object store per module (named after the module key), keyed by date; "meta" holds the uploaded
// school master (key 'master'). A store for a newly added module is created automatically.
const DB_NAME = 'ssm-monitoring';
const DB = {
    db: null,
    mem: {},
    stores: () => [...Object.keys(MODULES), 'meta'],
    open() {
        return new Promise(res => {
            const timer = setTimeout(res, 3000); // some browsers/private modes never answer; fall back to memory
            const need = this.stores();
            const attempt = version => {
                let r;
                try { r = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME); } catch (e) { res(); return; }
                r.onupgradeneeded = () => need.forEach(n => {
                    if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n, { keyPath: n === 'meta' ? 'key' : 'date' });
                });
                r.onsuccess = () => {
                    const db = r.result;
                    if (need.some(n => !db.objectStoreNames.contains(n))) { const v = db.version + 1; db.close(); attempt(v); return; }
                    this.db = db;
                    clearTimeout(timer);
                    res();
                };
                r.onerror = () => res();
            };
            attempt();
        });
    },
    tx(store, mode, fn) {
        return new Promise((res, rej) => {
            const t = this.db.transaction(store, mode);
            const req = fn(t.objectStore(store));
            t.oncomplete = () => res(req && req.result);
            t.onerror = () => rej(t.error);
        });
    },
    m(store) { return this.mem[store] || (this.mem[store] = new Map()); },
    all(store) { return this.db ? this.tx(store, 'readonly', s => s.getAll()) : Promise.resolve([...this.m(store).values()]); },
    put(store, v) { if (!this.db) { this.m(store).set(v.date ?? v.key, v); return Promise.resolve(); } return this.tx(store, 'readwrite', s => s.put(v)); },
    del(store, k) { if (!this.db) { this.m(store).delete(k); return Promise.resolve(); } return this.tx(store, 'readwrite', s => s.delete(k)); },
    clear(store) { if (!this.db) { this.m(store).clear(); return Promise.resolve(); } return this.tx(store, 'readwrite', s => s.clear()); },
};

// Reads every store of another IndexedDB database of this site (the old single-programme portals).
// Resolves {} when the database does not exist (it is not created).
function readOtherDB(name) {
    return new Promise(res => {
        let r;
        try { r = indexedDB.open(name); } catch (e) { res({}); return; }
        r.onupgradeneeded = () => r.transaction.abort(); // did not exist
        r.onerror = () => res({});
        r.onsuccess = async () => {
            const db = r.result, out = {};
            for (const n of db.objectStoreNames) {
                out[n] = await new Promise(ok => {
                    const q = db.transaction(n, 'readonly').objectStore(n).getAll();
                    q.onsuccess = () => ok(q.result);
                    q.onerror = () => ok([]);
                });
            }
            db.close();
            res(out);
        };
    });
}

// ---------------------------------------------------------------- Excel parsing
// Each sheet's header row (the first row with a "School Name" column) is offered to the modules, highest
// priority first; the first module whose detect(H) accepts it parses the rows.
const readBook = buf => XLSX.read(buf, { type: 'array' });
const sheetRows = (wb, name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true });
const colFinder = H => (...tests) => H.findIndex(x => tests.every(t => t(x)));
const cellText = (r, i) => (i >= 0 ? String(r[i] ?? '').trim() : '');
const byPriority = () => Object.values(MODULES).sort((a, b) => b.priority - a.priority);
const detectModule = H => byPriority().find(m => m.detect(H));

const isSchoolHeader = c => /school\s*name/i.test(c) || /^\s*school\s*$/i.test(c);

// Returns { kind, schools, asOn, meta } (meta: optional file-level data of the module, kept with the day's data)
function parseWorkbook(wb) {
    const names = [...wb.SheetNames].sort((a, b) => /all schools/i.test(b) - /all schools/i.test(a));
    let unknown = null;
    for (const name of names) {
        const rows = sheetRows(wb, name);
        const hi = rows.findIndex(r => r.some(c => isSchoolHeader(String(c))));
        if (hi < 0) continue;
        const H = rows[hi].map(c => String(c).trim());
        const m = detectModule(H);
        if (!m) { unknown = unknown || name; continue; }
        const { schools, asOn, meta } = m.parse(rows, hi, H, wb);
        if (schools.length) return { kind: m.key, schools, asOn: asOn || null, meta: meta || null };
    }
    if (unknown) throw new Error(`Sheet "${unknown}": the columns do not match any programme (${Object.values(MODULES).map(m => m.title).join(', ')})`);
    throw new Error('No sheet with a "School Name" column was found');
}

// School master (School Search export): UDISE Code, School Name, Circle, Block, Management, Category, Type.
// Returns [{ u, n, b, cl, mg, ct, ty }] or null when the file is not a master file (a programme file that
// also has UDISE and management columns is told apart by its module).
function parseMaster(wb) {
    for (const name of wb.SheetNames) {
        const rows = sheetRows(wb, name);
        const hi = rows.findIndex(r => r.some(c => /udise/i.test(String(c))) && r.some(c => /management/i.test(String(c))));
        if (hi < 0) continue;
        const H = rows[hi].map(c => String(c).trim());
        if (detectModule(H)) return null;
        const find = colFinder(H);
        const iU = find(x => /udise/i.test(x)), iN = find(x => /school\s*name/i.test(x));
        const iB = find(x => /^block/i.test(x)), iCl = find(x => /circle/i.test(x));
        const iM = find(x => /management/i.test(x)), iC = find(x => /category/i.test(x)), iT = find(x => /^(school\s*)?type$/i.test(x));
        const out = rows.slice(hi + 1).map(r => ({
            u: cellText(r, iU), n: cellText(r, iN), b: cellText(r, iB), cl: cellText(r, iCl),
            mg: cellText(r, iM), ct: cellText(r, iC), ty: cellText(r, iT),
        })).filter(x => x.u);
        if (out.length) return out;
    }
    return null;
}

// ---------------------------------------------------------------- calculations
// Every school has t (total) and o (done), giving p (%) and pend (t - o), and a category c (one of m.cats).
// Aggregates (blocks, district, groups) sum t, o, m.sums and count schools per category.
const sumKeys = m => ['t', 'o', ...m.cats, ...m.sums];
const deltaKeys = m => ['o', ...m.cats, ...m.sums];
const levelOf = x => (!x.t ? 'na' : x.o >= x.t ? 'full' : x.o <= 0 ? 'zero' : 'part');

function blank(block, m = M()) {
    const a = { block, schools: 0 };
    sumKeys(m).forEach(k => { a[k] = 0; });
    return a;
}
function addTo(a, x, m) {
    a.schools++;
    a.t += x.t;
    a.o += x.o;
    a[x.c] = (a[x.c] || 0) + 1;
    m.sums.forEach(k => { a[k] += x[k] || 0; });
}
function finish(a, m = M()) {
    a.p = pct(a.o, a.t);
    a.pend = Math.max(0, a.t - a.o);
    if (m.finish) m.finish(a);
    return a;
}

// For programmes whose files list only the schools that took part: every other school of the school master is
// added with fill() as its record, and every school's block is taken from the master (file block x.fb as a
// fallback), so all programmes count the same schools in the same blocks.
function withMaster(schools, fill) {
    if (!state.master) return schools.map(x => Object.assign(x, { b: x.fb || 'UNKNOWN' }));
    const seen = new Set();
    schools.forEach(x => { const ms = state.master.get(x.u); x.b = (ms && ms.b) || x.fb || 'UNKNOWN'; seen.add(x.u); });
    const extra = [];
    state.master.forEach(ms => { if (!seen.has(ms.u)) extra.push({ b: ms.b || 'UNKNOWN', n: ms.n || ms.u, u: ms.u, ...fill() }); });
    return [...schools, ...extra];
}

function enrich(s) {
    if (!s || s._e) return s;
    const m = MODULES[s.kind];
    if (m.complete) s.schools = m.complete(s.schools);
    const blocks = new Map();
    const T = blank('District Total', m);
    s.schools.forEach(x => {
        m.prep(x);
        finish(x, m);
        x.k = x.u || x.b + '|' + x.n;
        if (!blocks.has(x.b)) blocks.set(x.b, blank(x.b, m));
        addTo(blocks.get(x.b), x, m);
        addTo(T, x, m);
    });
    s.blocks = [...blocks.values()].map(b => finish(b, m)).sort((a, b) => a.block.localeCompare(b.block));
    s.total = finish(T, m);
    s.byKey = new Map(s.schools.map(x => [x.k, x]));
    s.byBlock = new Map(s.blocks.map(b => [b.block, b]));
    Object.defineProperty(s, '_e', { value: true, enumerable: false });
    return s;
}

const snap = d => enrich(state.snaps.find(s => s.date === d));
const cur = () => snap(state.cur);
const prev = () => (state.prev ? snap(state.prev) : null);
const blockNames = () => cur().blocks.map(b => b.block);
const latestOf = k => { const s = state.mods[k].snaps; return s.length ? enrich(s[s.length - 1]) : null; };
const beforeLatestOf = k => { const s = state.mods[k].snaps; return s.length > 1 ? enrich(s[s.length - 2]) : null; };

function memo(key, fn) {
    if (!(key in state.cache)) state.cache[key] = fn();
    return state.cache[key];
}

// Blocks ranked by %, with changes vs P (dO, dP, dFull, ...) and Leading/Moderate/Lagging status (top/bottom quarter)
function rankedBlocks(S, P) {
    return memo(`rank|${S.kind}|${S.date}|${P ? P.date : ''}`, () => {
        const m = MODULES[S.kind];
        const rows = S.blocks.map(b => {
            const pb = P && P.byBlock.get(b.block);
            const r = { ...b, dP: pb ? b.p - pb.p : null };
            deltaKeys(m).forEach(k => { r[dKey(k)] = pb ? b[k] - pb[k] : null; });
            return r;
        }).sort((a, b) => b.p - a.p || b.o - a.o);
        const n = rows.length, q = Math.ceil(n / 4);
        rows.forEach((r, i) => {
            r.rank = i + 1;
            r.status = i < q ? 'Leading' : i >= n - q ? 'Lagging' : 'Moderate';
        });
        return rows;
    });
}

// School rows with the earlier date's values: oPrev, pPrev, cPrev, dO, and <sum>Prev / d<Sum> for each module sum
function schoolRows(S, P) {
    return memo(`sch|${S.kind}|${S.date}|${P ? P.date : ''}`, () => {
        const sums = MODULES[S.kind].sums;
        return S.schools.map(x => {
            const a = P && P.byKey.get(x.k);
            const r = { ...x, oPrev: a ? a.o : null, pPrev: a ? a.p : null, dO: a ? x.o - a.o : null, cPrev: a ? a.c : null };
            sums.forEach(k => { r[k + 'Prev'] = a ? a[k] : null; r[dKey(k)] = a ? x[k] - a[k] : null; });
            return r;
        });
    });
}

function totalsRow(rows, label = 'District Total', m = M()) {
    const T = blank(label, m);
    rows.forEach(r => { T.schools += r.schools ?? 1; sumKeys(m).forEach(k => { T[k] += r[k] || 0; }); });
    finish(T, m);
    deltaKeys(m).map(dKey).forEach(k => {
        T[k] = rows.some(r => r[k] != null) ? rows.reduce((s, r) => s + (r[k] || 0), 0) : null;
    });
    return T;
}

// ---------------------------------------------------------------- school master groups (Management / Category / Type)
// Management and Category come from UDISE+ codes when the programme file has them (x.mc / x.cc, named below);
// otherwise, and for School Type, from the school master by UDISE code.
const GROUPS = { mg: 'Management', ct: 'Category', ty: 'School Type' };
const NO_MASTER = 'Not in school master';
const UDISE_CODES = {
    mg: {
        1: 'Department of Education', 3: 'Local Body', 5: 'Private Unaided (Recognized)', 8: 'Unrecognized',
        12: 'SSKs & MSKs', 13: 'Madrasa Siksha Kendra', 15: 'Govt. Sponsored', 16: 'Mass Education',
        89: 'Minority Affairs Department', 97: 'Madrasa Private and Aided (Recognized)', 99: 'Madrasa Aided (Recognized)',
    },
    ct: {
        1: 'Primary only with grades 1 to 5 (PRY)', 2: 'Upper Primary with grades 1 to 8 (PRY-UPR)',
        3: 'Higher Secondary with grades 1 to 12 (PRY-UPR-SEC-HSEC)', 4: 'Upper Primary only with grades 6 to 8 (UPR)',
        5: 'Higher Secondary with grades 6 to 12 (UPR-SEC-HSEC)', 6: 'Secondary with grades 1 to 10 (PRY-UPR-SEC)',
        7: 'Secondary with grades 6 to 10 (UPR-SEC)', 8: 'Secondary only with grades 9 & 10 (SEC)',
        10: 'Higher Secondary with grades 9 to 12 (SEC-HSEC)', 11: 'Higher Secondary only with grades 11 & 12 (HSEC)',
    },
};
function groupOf(x, by) {
    const m = state.master && state.master.get(x.u);
    const code = by === 'mg' ? x.mc : by === 'ct' ? x.cc : '';
    if (code) return UDISE_CODES[by][code] || (m && m[by]) || `${GROUPS[by]} code ${code}`;
    return (m && m[by]) || NO_MASTER;
}
const shortCat = c => { const m = String(c || '').match(/\(([^)]+)\)\s*$/); return m ? m[1] : c || ''; };
// Groups available for the active module: all with a school master, else only those coded in its files
const groupKeys = () => (state.master ? Object.keys(GROUPS) : M().codes ? ['mg', 'ct'] : []);

// Rows shaped like block rows (group name in "block") so the block columns and totals can be reused
function groupRows(S, P, by, block) {
    return memo(`grp|${S.kind}|${by}|${block}|${S.date}|${P ? P.date : ''}`, () => {
        const m = MODULES[S.kind];
        const agg = X => {
            const map = new Map();
            X.schools.forEach(x => {
                if (block && x.b !== block) return;
                const g = groupOf(x, by);
                if (!map.has(g)) map.set(g, blank(g, m));
                addTo(map.get(g), x, m);
            });
            map.forEach(a => finish(a, m));
            return map;
        };
        const now = agg(S), before = P ? agg(P) : null;
        return [...now.values()].map(g => {
            const pg = before && before.get(g.block);
            return { ...g, dO: pg ? g.o - pg.o : null, dP: pg ? g.p - pg.p : null };
        }).sort((a, b) => b.schools - a.schools);
    });
}

// School list filters by group (?mg=..&ct=..&ty=..)
const groupParams = r => groupKeys().filter(k => r.q.get(k)).map(k => [k, r.q.get(k)]);
const inGroups = (x, gf) => gf.every(([k, val]) => groupOf(x, k) === val);
const groupTitle = gf => gf.map(([, val]) => ` - ${val}`).join('');
function listHash(cat, block, gf) {
    const q = new URLSearchParams();
    if (block) q.set('block', block);
    gf.forEach(([k, val]) => { if (val) q.set(k, val); });
    const s = q.toString();
    return `${modBase()}schools${cat && cat !== 'all' ? '/' + cat : ''}${s ? '?' + s : ''}`;
}
function groupSelects(S, gf) {
    return groupKeys().map(k => {
        const sel = (gf.find(g => g[0] === k) || [])[1] || '';
        const vals = [...new Set(S.schools.map(x => groupOf(x, k)))].sort();
        return `<label>${GROUPS[k]}<select data-grp="${k}"><option value="">All</option>${vals.map(x => `<option${x === sel ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>`;
    }).join('');
}
function wireGroupSelects(f, cat, block) {
    f.querySelectorAll('[data-grp]').forEach(s => {
        s.onchange = () => {
            const gf = [...f.querySelectorAll('[data-grp]')].map(x => [x.dataset.grp, x.value]).filter(g => g[1]);
            location.hash = listHash(cat, block, gf);
        };
    });
}
const groupCols = () => (groupKeys().length ? [
    { k: 'mg', h: 'Management', cls: 'wrap', v: x => groupOf(x, 'mg') },
    { k: 'ct', h: 'Category', cls: 'nowrap', v: x => shortCat(groupOf(x, 'ct')) },
] : []);

// ---------------------------------------------------------------- column definitions
// Generic columns; each module renames them with colSet({ t: 'Total Teachers', ... })
const C = {
    idx: { k: '_i', h: '#', type: 'idx' },
    rank: { k: 'rank', h: 'Rank', type: 'n' },
    block: { k: 'block', h: 'Block', cls: 'nowrap' },
    sb: { k: 'b', h: 'Block', cls: 'nowrap' },
    school: { k: 'n', h: 'School Name', cls: 'wrap' },
    udise: { k: 'u', h: 'UDISE Code', cls: 'nowrap' },
    schools: { k: 'schools', h: 'Schools', type: 'n' },
    t: { k: 't', h: 'Total', type: 'n' },
    o: { k: 'o', h: 'Done', type: 'n' },
    pend: { k: 'pend', h: 'Pending', type: 'n' },
    p: { k: 'p', h: '%', type: 'p' },
    dO: { k: 'dO', h: 'Change', type: 'd' },
    dP: { k: 'dP', h: 'Change (% pt)', type: 'dp' },
    full: { k: 'full', h: '100% Sch.', type: 'n' },
    part: { k: 'part', h: '1-99% Sch.', type: 'n' },
    zero: { k: 'zero', h: '0% Sch.', type: 'n' },
    status: { k: 'status', h: 'Status', type: 'status' },
    cat: { k: 'c', h: 'Level', type: 'cat' },
};
const col = (base, extra) => ({ ...base, ...extra });
// C with some columns renamed (string) or replaced / added (object)
const colSet = over => Object.fromEntries(Object.entries({ ...C, ...over }).map(([k, x]) => [k, typeof x === 'string' ? col(C[k], { h: x }) : x]));
const catName = v => (M().cat || {})[v] || v;

const val = (c, r) => (c.v ? c.v(r) : r[c.k]);

function cellHtml(c, r, i) {
    if (c.type === 'idx') return i + 1;
    const v = val(c, r);
    switch (c.type) {
        case 'n': return fmtN(v);
        case 'p': return v == null ? '' : `<span class="pcell"><span class="pbar"><span class="c-${pctCls(v)}" style="width:${Math.min(100, v)}%"></span></span>${fmtP(v)}</span>`;
        case 'd': return deltaHtml(v, false, c.invert);
        case 'dp': return deltaHtml(v, true, c.invert);
        case 'cat': return v ? `<span class="badge ${v}">${esc(catName(v))}</span>` : '';
        case 'status': return v ? `<span class="badge ${v}">${v}</span>` : '';
        default: return esc(c.show ? c.show(v) : v);
    }
}

// Value written to Excel (raw numbers) or PDF (formatted text)
function cellOut(c, r, i, pdf) {
    if (c.type === 'idx') return i + 1;
    const v = val(c, r);
    if (v == null) return '';
    switch (c.type) {
        case 'p': return pdf ? fmtP(v) : round2(v);
        case 'dp': return pdf ? signed(v, true) : round2(v);
        case 'd': return pdf ? signed(v) : v;
        case 'n': return pdf ? fmtN(v) : v;
        case 'cat': return catName(v);
        default: return c.show ? c.show(v) : v;
    }
}

// ---------------------------------------------------------------- table component
function makeTable({ cols, rows, sort = null, dir = 'desc', pageSize = 0, onRow = null, foot = null, empty = 'No records found' }) {
    const wrap = h('<div><div class="table-wrap"><table><thead></thead><tbody></tbody><tfoot></tfoot></table></div><div class="pager"></div></div>');
    const thead = $('thead', wrap), tbody = $('tbody', wrap), tfoot = $('tfoot', wrap), pager = $('.pager', wrap);
    let sk = sort, sd = dir, page = 0;

    const sorted = () => {
        if (!sk) return rows;
        const c = cols.find(x => x.k === sk);
        return [...rows].sort((a, b) => {
            const x = val(c, a), y = val(c, b);
            const r = NUM_TYPES.has(c.type)
                ? (x ?? -1e15) - (y ?? -1e15)
                : String(x ?? '').localeCompare(String(y ?? ''), 'en', { numeric: true });
            return sd === 'asc' ? r : -r;
        });
    };
    const tdCls = c => [NUM_TYPES.has(c.type) ? 'num' : '', c.cls || ''].join(' ').trim();

    function draw() {
        const all = sorted();
        const pages = pageSize ? Math.max(1, Math.ceil(all.length / pageSize)) : 1;
        page = Math.min(page, pages - 1);
        const start = pageSize ? page * pageSize : 0;
        const list = pageSize ? all.slice(start, start + pageSize) : all;

        thead.innerHTML = '<tr>' + cols.map(c => {
            const cls = [NUM_TYPES.has(c.type) ? 'num' : '', c.type === 'idx' ? '' : 'sortable', sk === c.k ? 'sorted ' + sd : ''].join(' ');
            return `<th data-k="${c.k}" class="${cls}">${esc(c.h)}</th>`;
        }).join('') + '</tr>';

        tbody.innerHTML = list.length
            ? list.map((r, i) => `<tr data-i="${start + i}" class="${onRow ? 'clickable' : ''}">${cols.map(c => `<td class="${tdCls(c)}">${cellHtml(c, r, start + i)}</td>`).join('')}</tr>`).join('')
            : `<tr><td colspan="${cols.length}" class="empty">${empty}</td></tr>`;

        tfoot.innerHTML = foot && list.length
            ? '<tr>' + cols.map(c => `<td class="${tdCls(c)}">${c.type === 'idx' ? '' : cellHtml(c, foot, 0)}</td>`).join('') + '</tr>'
            : '';

        pager.innerHTML = `<span>${fmtN(all.length)} record${all.length === 1 ? '' : 's'}</span>` + (pages > 1
            ? `<span class="pg"><button class="btn sm" data-p="-1" ${page === 0 ? 'disabled' : ''}>&lsaquo; Prev</button> Page ${page + 1} of ${pages} <button class="btn sm" data-p="1" ${page >= pages - 1 ? 'disabled' : ''}>Next &rsaquo;</button></span>`
            : '');
    }

    thead.addEventListener('click', e => {
        const th = e.target.closest('th.sortable');
        if (!th) return;
        const k = th.dataset.k;
        if (sk === k) sd = sd === 'asc' ? 'desc' : 'asc';
        else { sk = k; sd = NUM_TYPES.has(cols.find(c => c.k === k).type) ? 'desc' : 'asc'; }
        page = 0;
        draw();
    });
    pager.addEventListener('click', e => {
        const b = e.target.closest('[data-p]');
        if (!b) return;
        page += Number(b.dataset.p);
        draw();
        wrap.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    if (onRow) tbody.addEventListener('click', e => {
        const tr = e.target.closest('tr[data-i]');
        if (tr) onRow(sorted()[Number(tr.dataset.i)]);
    });

    draw();
    return {
        el: wrap,
        cols,
        get foot() { return foot; },
        rows: sorted,
        setRows(r, f) { rows = r; foot = f === undefined ? foot : f; page = 0; draw(); },
    };
}

// ---------------------------------------------------------------- export (Excel / PDF)
// On a module page reports carry the module's header and tag ("Teacher Onboarding - ...") and the selected
// date; on the shared pages they carry the portal header and today's date.
const inModule = () => !!(state.route && state.route.mod);
const exportHeader = () => (inModule() ? M().header : APP_HEADER);
const exportDate = () => (inModule() ? state.cur : today());
const tagged = t => { const tag = inModule() && M().tag; return tag && !t.startsWith(tag) ? `${tag} - ${t}` : t; };
const fileName = (title, ext) => `${slug(title)}_${exportDate()}.${ext}`;

// The four title rows and the blank row above every Excel report
const excelHead = (title, sub) => [
    [exportHeader()],
    [title],
    [`Data as on: ${fmtD(exportDate())}${sub ? '  |  ' + sub : ''}`],
    [`Generated on: ${new Date().toLocaleString('en-IN')}  |  ${CREDIT}`],
    [],
];

function exportExcel(spec) {
    const { cols, rows, foot, sub } = spec;
    const title = tagged(spec.title);
    const n = cols.length;
    const aoa = [
        ...excelHead(title, sub),
        cols.map(c => c.h),
        ...rows.map((r, i) => cols.map(c => cellOut(c, r, i, false))),
    ];
    if (foot) aoa.push(cols.map((c, i) => (c.type === 'idx' ? (i === 0 ? 'Total' : '') : cellOut(c, foot, 0, false))));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = [0, 1, 2, 3].map(r => ({ s: { r, c: 0 }, e: { r, c: Math.max(0, n - 1) } }));
    ws['!cols'] = cols.map((c, j) => {
        let w = c.h.length;
        for (let i = 6; i < Math.min(aoa.length, 400); i++) w = Math.max(w, String(aoa[i][j] ?? '').length);
        return { wch: Math.min(60, w + 2) };
    });
    if (rows.length) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 5, c: 0 }, e: { r: 5 + rows.length, c: n - 1 } }) };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, slug(title).slice(0, 31) || 'Report');
    XLSX.writeFile(wb, fileName(title, 'xlsx'));
}

const PDF_STYLE = {
    styles: { fontSize: 8, cellPadding: 1.6, overflow: 'linebreak', lineColor: [226, 232, 240], lineWidth: 0.1, textColor: [30, 41, 59] },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [224, 233, 255], textColor: [15, 23, 42], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
};

// Header (portal name, report title, data date) and footer drawn on every PDF page
function pdfFrame(doc, title, sub, generated, TP) {
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(30, 58, 138);
    doc.text(exportHeader(), W / 2, 11, { align: 'center' });
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(title, W / 2, 18, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Data as on: ${fmtD(exportDate())}${sub ? '   |   ' + sub : ''}`, W / 2, 24, { align: 'center' });
    doc.setDrawColor(30, 58, 138);
    doc.setLineWidth(0.5);
    doc.line(8, 28, W - 8, 28);
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated on ${generated}`, 8, H - 6);
    doc.text(CREDIT, W / 2, H - 6, { align: 'center' });
    doc.text(`Page ${doc.internal.getNumberOfPages()} of ${TP}`, W - 8, H - 6, { align: 'right' });
}

function exportPDF(spec) {
    const { cols, rows, foot, sub } = spec;
    const title = tagged(spec.title);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: cols.length > 6 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    const TP = '{total_pages}';
    const generated = new Date().toLocaleString('en-IN');
    const colStyles = {};
    cols.forEach((c, i) => { if (NUM_TYPES.has(c.type)) colStyles[i] = { halign: 'right' }; });

    doc.autoTable({
        head: [cols.map(c => c.h)],
        body: rows.map((r, i) => cols.map(c => cellOut(c, r, i, true))),
        foot: foot ? [cols.map((c, i) => (c.type === 'idx' ? (i === 0 ? 'Total' : '') : cellOut(c, foot, 0, true)))] : undefined,
        showFoot: 'lastPage',
        startY: 34,
        margin: { top: 34, left: 8, right: 8, bottom: 14 },
        ...PDF_STYLE,
        styles: { ...PDF_STYLE.styles, fontSize: cols.length > 10 ? 7 : 8 },
        columnStyles: colStyles,
        didParseCell: d => {
            if (d.section !== 'body' && NUM_TYPES.has(cols[d.column.index].type)) d.cell.styles.halign = 'right';
        },
        didDrawPage: () => pdfFrame(doc, title, sub, generated, TP),
    });
    if (typeof doc.putTotalPages === 'function') doc.putTotalPages(TP);
    doc.save(fileName(title, 'pdf'));
}

function exportBtns(spec) {
    const d = h('<div class="actions"><button class="btn xls">Excel</button><button class="btn pdf">PDF</button></div>');
    const run = fn => () => {
        try { fn(spec()); } catch (e) { console.error(e); toast('Export failed: ' + e.message, true); }
    };
    d.children[0].onclick = run(exportExcel);
    d.children[1].onclick = run(exportPDF);
    return d;
}
// Exported reports are always ordered by block name, then school name
const cmpText = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'en', { numeric: true, sensitivity: 'base' });
function exportOrder(rows) {
    if (!rows.length) return rows;
    if ('b' in rows[0]) return [...rows].sort((x, y) => cmpText(x.b, y.b) || cmpText(x.n, y.n));
    if ('block' in rows[0]) return [...rows].sort((x, y) => cmpText(x.block, y.block));
    return rows;
}
const tableSpec = (tbl, title, sub) => () => ({
    title: typeof title === 'function' ? title() : title,
    sub: typeof sub === 'function' ? sub() : sub,
    cols: tbl.cols,
    rows: exportOrder(tbl.rows()),
    foot: tbl.foot,
});

// ---------------------------------------------------------------- layout helpers
function pageHead(v, title, sub, actions) {
    const d = h(`<div class="page-head"><div><h1></h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div></div>`);
    $('h1', d).textContent = title;
    if (actions) d.append(actions);
    v.append(d);
    return d;
}
function card(parent, title, actions, flush) {
    const c = h(`<section class="card"><div class="card-head"><h2></h2></div><div class="card-body${flush ? ' flush' : ''}"></div></section>`);
    $('h2', c).textContent = title;
    if (actions) $('.card-head', c).append(actions);
    parent.append(c);
    return $('.card-body', c);
}
function tableCard(parent, title, opts, sub) {
    const tbl = makeTable(opts);
    const body = card(parent, title, exportBtns(tableSpec(tbl, title, sub)), true);
    body.append(tbl.el);
    return tbl;
}
const subLine = (S, P) => `Data as on <b>${fmtD(S.date)}</b>${P ? ` &middot; changes compared with <b>${fmtD(P.date)}</b>` : ''}`;
const plainSub = (S, P) => (P ? `Compared with: ${fmtD(P.date)}` : '');
const grid2 = (v, top) => { const g = h(`<div class="grid-2"${top ? ' style="margin-top:16px"' : ''}></div>`); v.append(g); return g; };
const blockGo = r => { location.hash = modBase() + 'schools?block=' + encodeURIComponent(r.block || r.b); };
const schoolGo = x => { if (x.u) location.hash = '#/lookup?u=' + encodeURIComponent(x.u); };

function chart(parent, height, config) {
    const box = h(`<div class="chart-box" style="height:${height}px"><canvas></canvas></div>`);
    parent.append(box);
    config.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: { duration: 300 } }, config.options);
    state.charts.push(new Chart($('canvas', box), config));
}
const COLORS = { good: '#16a34a', mid: '#f59e0b', bad: '#dc2626', na: '#94a3b8', brand: '#1e3a8a', brand2: '#2563eb' };
const legendPos = () => (window.innerWidth < 600 ? 'bottom' : 'right');

const ICONS = {
    person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    school: '<path d="M3 21h18M5 21V10l7-5 7 5v11M10 21v-5h4v5"/>',
    full: '<path d="M20 6 9 17l-5-5"/>',
    part: '<circle cx="12" cy="12" r="9"/><path d="M12 3v9h9"/>',
    zero: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    up: '<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    down: '<path d="m3 7 6 6 4-4 8 8"/><path d="M14 17h7v-7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    flag: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17h.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
};
const icon = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

// ---------------------------------------------------------------- dashboard building blocks
function heroCard(v, S, P, ranked, { ring, label, title, meta, unit }) {
    const T = S.total, PT = P && P.total;
    const count = s => ranked.filter(b => b.status === s).length;
    const chg = PT ? `<span class="hero-chip ${T.p >= PT.p ? 'pos' : 'neg'}">${icon(T.p >= PT.p ? 'up' : 'down')} ${signed(T.p - PT.p, true)} pt &middot; ${signed(T.o - PT.o)} ${unit} since ${fmtD(P.date)}</span>` : '';
    v.append(h(`<section class="hero">
        <div class="ring" style="--p:${Math.min(100, T.p)}"><div class="ring-in"><b>${fmtP(T.p)}%</b><small>${ring}</small></div></div>
        <div class="hero-main">
            <div class="hero-label">${label}</div>
            <div class="hero-title">${title}</div>
            <div class="hero-bar"><span style="width:${Math.min(100, T.p)}%"></span></div>
            <div class="hero-meta">${meta}</div>
            ${chg}
        </div>
        <div class="hero-stats">
            <div><b>${S.blocks.length}</b><span>Blocks</span></div>
            <div><b>${fmtN(T.schools)}</b><span>Schools</span></div>
            <div><b class="g">${count('Leading')}</b><span>Leading blocks</span></div>
            <div><b class="r">${count('Lagging')}</b><span>Lagging blocks</span></div>
        </div>
    </section>`));
}

function statCard({ label, value, delta, invert, pctDelta, foot, ic, tone, href }) {
    const d = delta == null ? '' : `<span class="stat-delta">${deltaHtml(delta, pctDelta, invert)} <small>since ${fmtD(state.prev)}</small></span>`;
    return `<a class="stat ${tone}"${href ? ` href="${href}"` : ''}>
        <span class="stat-icon">${icon(ic)}</span>
        <span class="stat-body"><span class="stat-label">${label}</span><span class="stat-val">${value}</span>${d}<span class="stat-foot">${foot}</span></span>
    </a>`;
}
const statGrid = (v, cards) => v.append(h(`<div class="stat-grid">${cards.map(statCard).join('')}</div>`));

// A school-category tile linking to its school list; T / PT = district totals now / before
function catCard({ key, label, ic, invert, cls = key }, T, PT) {
    const n = T[key], share = pct(n, T.schools), dd = PT ? n - PT[key] : null;
    return `<a class="cat-card ${cls}" href="${modBase()}schools/${key}">
        <div class="cat-top"><span class="cat-icon">${icon(ic)}</span><span class="cat-label">${label}</span><span class="cat-link">View list &rsaquo;</span></div>
        <div class="cat-val">${fmtN(n)} <small>schools</small></div>
        <div class="cat-bar"><span style="width:${share}%"></span></div>
        <div class="cat-foot"><span>${fmtP(share)}% of schools</span>${dd == null ? '' : deltaHtml(dd, false, invert)}</div>
    </a>`;
}
const catGrid = (v, cards, S, P) => v.append(h(`<div class="cat-grid${cards.length === 4 ? ' four' : ''}">${cards.map(c => catCard(c, S.total, P && P.total)).join('')}</div>`));

const notesCard = (v, notes) => card(v, 'Key Highlights').append(h(`<ul class="highlights">${notes.map(([i, t]) => `<li><span class="hl-icon">${icon(i)}</span><span>${t}</span></li>`).join('')}</ul>`));

function doughnutCard(parent, title, labels, data, colors) {
    chart(card(parent, title), 260, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] },
        options: { plugins: { legend: { position: legendPos(), labels: { usePointStyle: true, padding: 14 } } }, cutout: '64%' },
    });
}

// Number of blocks in each % band: bands = [[label, from, below], ...]
function bandsCard(parent, title, bands, ranked, colors = [COLORS.bad, COLORS.mid, COLORS.brand2, COLORS.good]) {
    chart(card(parent, title), 260, {
        type: 'bar',
        data: {
            labels: bands.map(b => b[0]),
            datasets: [{ label: 'Blocks', data: bands.map(([, lo, hi]) => ranked.filter(b => b.p >= lo && b.p < hi).length), backgroundColor: colors, borderRadius: 6, maxBarThickness: 56 }],
        },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Number of blocks' } }, x: { grid: { display: false } } } },
    });
}

// District % by date (filled) plus school counts on the right axis: sets = [[label, total => value, color], ...]
function dashTrend(v, pctLabel, sets) {
    if (state.snaps.length < 2) return;
    const all = state.snaps.map(enrich);
    chart(card(v, 'District Daily Trend'), 280, {
        type: 'line',
        data: {
            labels: all.map(s => fmtD(s.date)),
            datasets: [
                { label: pctLabel, data: all.map(s => round2(s.total.p)), borderColor: COLORS.brand, backgroundColor: 'rgba(30,58,138,.10)', fill: true, tension: .3, yAxisID: 'y', pointRadius: 3 },
                ...sets.map(([label, get, color]) => ({ label, data: all.map(s => get(s.total)), borderColor: color, tension: .3, yAxisID: 'y1', pointRadius: 3 })),
            ],
        },
        options: { interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { usePointStyle: true } } }, scales: { y: { ticks: { callback: x => x + '%' } }, y1: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Schools' } } } },
    });
}

function topBottom(v, S, P, ranked, cols) {
    const g = grid2(v, true);
    tableCard(g, 'Top 5 Leading Blocks', { cols, rows: ranked.slice(0, 5), onRow: blockGo }, plainSub(S, P));
    tableCard(g, 'Bottom 5 Lagging Blocks', { cols, rows: ranked.slice(-5).reverse(), onRow: blockGo }, plainSub(S, P));
}

const stackedBlocks = { indexAxis: 'y', scales: { x: { stacked: true }, y: { stacked: true, ticks: { autoSkip: false, font: { size: 10 } } } }, interaction: { mode: 'index', intersect: false } };

// ---------------------------------------------------------------- generic module pages
// Block-wise status: cols, measure ("onboarded %"), extra help html, chart of category counts per block
function blocksPage(v, { heading, cols, measure, extra = '', chartTitle, chartSets }) {
    const S = cur(), P = prev();
    const rows = rankedBlocks(S, P);
    const foot = Object.assign(totalsRow(rows), { dP: P ? S.total.p - P.total.p : null });
    const tbl = makeTable({ cols, rows, foot, onRow: blockGo });
    pageHead(v, heading, subLine(S, P) + ' &middot; tap a block to see its schools', exportBtns(tableSpec(tbl, heading, plainSub(S, P))));
    v.append(h(`<p class="help">Status: <span class="badge Leading">Leading</span> = top quarter of blocks by ${measure}, <span class="badge Lagging">Lagging</span> = bottom quarter, <span class="badge Moderate">Moderate</span> = the rest.${extra}</p>`));
    card(v, 'All Blocks', null, true).append(tbl.el);

    const byName = [...rows].sort((a, b) => a.block.localeCompare(b.block));
    chart(card(v, chartTitle), Math.max(320, rows.length * 20 + 60), {
        type: 'bar',
        data: { labels: byName.map(b => b.block), datasets: chartSets.map(([label, k, color]) => ({ label, data: byName.map(b => b[k]), backgroundColor: color })) },
        options: stackedBlocks,
    });
}

// School lists. lists = { key: [title, filter option label, test(x)] } (must include "all");
// cols(catKey, P) = the module columns after School / UDISE / Management / Category; chips(totals) = summary html
function schoolsPage(v, r, { lists, filterLabel, cols, sorts = {}, chips }) {
    const S = cur(), P = prev();
    const catKey = lists[r.arg] ? r.arg : 'all';
    const inList = lists[catKey][2];
    const block = r.q.get('block') || '';
    let search = '';
    const all = schoolRows(S, P);
    const gf = groupParams(r);
    const filtered = () => all.filter(x => (!block || x.b === block) && inList(x) && inGroups(x, gf) &&
        (!search || (x.n + ' ' + x.u).toLowerCase().includes(search)));
    const heading = lists[catKey][0] + (block ? ` - ${block} Block` : '') + groupTitle(gf);
    const go = (c, b) => { location.hash = listHash(c, b, gf); };

    const cs = [C.idx];
    if (!block) cs.push(C.sb);
    cs.push(C.school, C.udise, ...groupCols(), ...cols(catKey, P));
    const ds = sorts[catKey] || [null];
    const tbl = makeTable({ cols: cs, rows: filtered(), sort: ds[0], dir: ds[1], pageSize: 50, onRow: schoolGo });
    pageHead(v, heading, subLine(S, P) + ' &middot; tap a school to see it in every programme', exportBtns(tableSpec(tbl, () => heading + (search ? ` (search: ${search})` : ''), plainSub(S, P))));

    const f = h(`<div class="filters">
        <label>Block<select id="fBlock"><option value="">All blocks</option>${blockNames().map(b => `<option${b === block ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select></label>
        <label>${filterLabel}<select id="fCat">${Object.entries(lists).map(([k, x]) => `<option value="${k}"${k === catKey ? ' selected' : ''}>${esc(x[1])}</option>`).join('')}</select></label>
        ${groupSelects(S, gf)}
        <label>Search school / UDISE<input type="search" id="fSearch" placeholder="Type to search..."></label>
    </div>`);
    v.append(f);
    $('#fBlock', f).onchange = e => go(catKey, e.target.value);
    $('#fCat', f).onchange = e => go(e.target.value, block);
    wireGroupSelects(f, catKey, block);

    const chipBox = h('<div class="chips"></div>');
    v.append(chipBox);
    const chip = ([label, value]) => `<span class="chip">${label} <b>${value}</b></span>`;
    const drawChips = rows => { chipBox.innerHTML = [['Schools', fmtN(rows.length)], ...chips(totalsRow(rows))].map(chip).join(''); };
    drawChips(tbl.rows());
    let timer;
    $('#fSearch', f).oninput = e => {
        clearTimeout(timer);
        timer = setTimeout(() => { search = e.target.value.trim().toLowerCase(); const rows = filtered(); tbl.setRows(rows); drawChips(rows); }, 200);
    };
    card(v, 'Schools', null, true).append(tbl.el);
}

// Two dates side by side. Block rows carry every aggregate of the later date plus <key>A (earlier date) and
// d<Key> (change) for o, p and each category / sum. kpis = [[label, key, { pct, invert, cls }]];
// blockCols(dA, dB) / moveCols(dA, dB) = columns after Block / after School + UDISE; moves = [[label, test(x)]]
function comparePage(v, r, { kpis, blockCols, moves, moveCols, moveSort }) {
    if (state.snaps.length < 2) {
        pageHead(v, 'Day-wise Comparison');
        v.append(h(`<div class="card"><div class="card-body">Upload ${esc(M().title)} data for at least two dates to compare.</div></div>`));
        return;
    }
    const m = M();
    const dates = state.snaps.map(s => s.date);
    const bDate = r.q.get('b') || state.cur;
    const aDate = r.q.get('a') || state.prev || dates[Math.max(0, dates.indexOf(bDate) - 1)];
    const A = snap(aDate), B = snap(bDate);
    const opts = sel => dates.slice().reverse().map(d => `<option value="${d}"${d === sel ? ' selected' : ''}>${fmtD(d)}</option>`).join('');
    const sub = `${fmtD(A.date)} vs ${fmtD(B.date)}`;
    pageHead(v, 'Day-wise Comparison', `Changes from <b>${fmtD(A.date)}</b> to <b>${fmtD(B.date)}</b>`);

    const f = h(`<div class="filters"><label>From date<select id="cA">${opts(aDate)}</select></label><label>To date<select id="cB">${opts(bDate)}</select></label></div>`);
    v.append(f);
    const go = () => { location.hash = `${modBase()}compare?a=${$('#cA').value}&b=${$('#cB').value}`; };
    $('#cA', f).onchange = go;
    $('#cB', f).onchange = go;

    const TA = A.total, TB = B.total;
    const k = (label, key, o = {}) => `<div class="kpi ${o.cls || ''}"><span class="kpi-label">${label}</span><span class="kpi-val">${o.pct ? fmtP(TB[key]) + '%' : fmtN(TB[key])}</span><span class="kpi-delta">${deltaHtml(TB[key] - TA[key], o.pct, o.invert)} <small>from ${o.pct ? fmtP(TA[key]) + '%' : fmtN(TA[key])}</small></span></div>`;
    v.append(h(`<div class="kpis">${kpis.map(x => k(...x)).join('')}</div>`));

    const pair = (block, a, b) => {
        const row = { ...b, block, pA: a.p, dP: b.p - a.p };
        deltaKeys(m).forEach(key => { row[key + 'A'] = a[key]; row[dKey(key)] = b[key] - a[key]; });
        return row;
    };
    const names = [...new Set([...A.blocks, ...B.blocks].map(b => b.block))];
    const rows = names.map(n => pair(n, A.byBlock.get(n) || finish(blank(n)), B.byBlock.get(n) || finish(blank(n))));
    const dA = fmtD(A.date), dB = fmtD(B.date);
    tableCard(v, 'Block-wise Comparison', { cols: [C.idx, C.block, ...blockCols(dA, dB)], rows, sort: 'dO', foot: pair('District Total', TA, TB) }, sub);

    const sr = schoolRows(B, A);
    const groups = moves.map(([label, fn]) => ({ label, rows: sr.filter(fn) }));
    let active = groups[0];
    const tbl = makeTable({ cols: [C.idx, C.sb, C.school, C.udise, ...moveCols(dA, dB)], rows: active.rows, sort: moveSort, pageSize: 50, onRow: schoolGo });
    const body = card(v, 'School-level Movement', exportBtns(() => tableSpec(tbl, `School Movement - ${active.label}`, sub)()), true);
    const tabs = h(`<div class="tabs">${groups.map((g, i) => `<button class="tab${i === 0 ? ' active' : ''}" data-i="${i}">${g.label}<span class="count">${fmtN(g.rows.length)}</span></button>`).join('')}</div>`);
    tabs.onclick = e => {
        const b = e.target.closest('.tab');
        if (!b) return;
        active = groups[Number(b.dataset.i)];
        tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === b));
        tbl.setRows(active.rows);
    };
    body.append(tabs, tbl.el);
}

// District summary for every date and a block x date matrix.
// bar = [label, color] of the count bars; cols = summary columns after Date (rows have every total plus dP and
// d<Key> daily changes); metrics = [[key, label]] for the matrix, invert = keys where a fall is good
function trendPage(v, { bar, cols, metrics, invert = [] }) {
    const m = M();
    const all = state.snaps.map(enrich);
    const rows = all.map((s, i) => {
        const p = i ? all[i - 1].total : null, t = s.total;
        const row = { ...t, date: s.date, dP: p ? t.p - p.p : null };
        delete row.block;
        deltaKeys(m).forEach(k => { row[dKey(k)] = p ? t[k] - p[k] : null; });
        return row;
    }).reverse();
    pageHead(v, 'Daily Trend', `${all.length} day(s) of data, from <b>${fmtD(all[0].date)}</b> to <b>${fmtD(all[all.length - 1].date)}</b>`);

    if (all.length > 1) {
        chart(card(v, 'District progress by date'), 280, {
            type: 'bar',
            data: {
                labels: all.map(s => fmtD(s.date)),
                datasets: [
                    { type: 'line', label: m.pctLabel, data: all.map(s => round2(s.total.p)), borderColor: COLORS.brand, backgroundColor: COLORS.brand, yAxisID: 'y1', tension: .25 },
                    { label: bar[0], data: all.map(s => s.total.o), backgroundColor: bar[1], yAxisID: 'y' },
                ],
            },
            options: { interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true }, y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: x => x + '%' } } } },
        });
    }

    tableCard(v, 'District Date-wise Summary', { cols: [{ k: 'date', h: 'Date', cls: 'nowrap', show: fmtD }, ...cols], rows });

    const metricBox = card(v, 'Block-wise Trend (by date)');
    const sel = h(`<div class="filters"><label>Show<select>${metrics.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label></div>`);
    metricBox.append(sel);
    const holder = h('<div></div>');
    metricBox.append(holder);
    const draw = metric => {
        holder.innerHTML = '';
        const last = all[all.length - 1], first = all[0];
        const type = metric === 'p' ? 'p' : 'n';
        const tcols = [C.idx, C.block, ...all.map(s => ({ k: s.date, h: fmtD(s.date), type })),
            { k: 'chg', h: 'Change (first to last)', type: metric === 'p' ? 'dp' : 'd', invert: invert.includes(metric) }];
        const trows = last.blocks.map(b => {
            const row = { block: b.block };
            all.forEach(s => { const x = s.byBlock.get(b.block); row[s.date] = x ? x[metric] : null; });
            row.chg = row[last.date] != null && row[first.date] != null ? row[last.date] - row[first.date] : null;
            return row;
        });
        const label = sel.querySelector('option:checked').textContent;
        const tbl = makeTable({ cols: tcols, rows: trows, sort: last.date });
        const bar2 = h('<div class="actions" style="margin-bottom:8px"></div>');
        bar2.append(exportBtns(tableSpec(tbl, `Block-wise Trend - ${label}`, `${fmtD(first.date)} to ${fmtD(last.date)}`)));
        holder.append(bar2, tbl.el);
    };
    $('select', sel).onchange = e => draw(e.target.value);
    draw(metrics[0][0]);
}

// ---------------------------------------------------------------- Management / Category-wise report (every module)
const groupLink = (by, block) => r => {
    const q = new URLSearchParams({ [by]: r.block });
    if (block) q.set('block', block);
    location.hash = `${modBase()}schools?${q}`;
};

function pageGroups(v, r) {
    const S = cur(), P = prev(), m = M();
    const keys = groupKeys();
    const by = keys.includes(r.q.get('by')) ? r.q.get('by') : 'mg';
    const block = r.q.get('block') || '';
    const label = GROUPS[by];
    pageHead(v, `${label}-wise Report`, subLine(S, P) + ' &middot; tap a row to see its schools');
    if (!keys.length) {
        v.append(h('<div class="card"><div class="card-body">The school master is not loaded. Upload the School Search CSV (with <b>Management</b> and <b>Category</b> columns) on <a href="#/data">Upload / Manage Data</a>.</div></div>'));
        return;
    }

    const f = h(`<div class="filters">
        <label>Report by<select id="gBy">${keys.map(k => `<option value="${k}"${k === by ? ' selected' : ''}>${GROUPS[k]}</option>`).join('')}</select></label>
        <label>Block<select id="gBlock"><option value="">All blocks</option>${blockNames().map(b => `<option${b === block ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select></label>
    </div>`);
    v.append(f);
    const go = (b, bl) => { location.hash = `${modBase()}groups?by=${b}${bl ? '&block=' + encodeURIComponent(bl) : ''}`; };
    $('#gBy', f).onchange = e => go(e.target.value, block);
    $('#gBlock', f).onchange = e => go(by, e.target.value);

    const rows = groupRows(S, P, by, block);
    const foot = totalsRow(rows);
    if (P) foot.dP = foot.p - totalsRow(groupRows(P, null, by, block)).p;
    tableCard(v, `${label}-wise Report${block ? ` - ${block} Block` : ''}`, { cols: [C.idx, ...m.groupCols(col(C.block, { h: label, cls: 'wrap' }))], rows, foot, sort: 'schools', onRow: groupLink(by, block) }, plainSub(S, P));

    chart(card(v, `${m.pctLabel} by ${label}`), Math.max(220, rows.length * 34 + 60), {
        type: 'bar',
        data: {
            labels: rows.map(x => (by === 'ct' ? shortCat(x.block) : x.block)),
            datasets: [{ label: m.pctLabel, data: rows.map(x => round2(x.p)), backgroundColor: rows.map(x => COLORS[pctCls(x.p)] || COLORS.brand2), borderRadius: 4, maxBarThickness: 26 }],
        },
        options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, max: 100, ticks: { callback: x => x + '%' } }, y: { ticks: { autoSkip: false } } } },
    });

    // Block x group matrix
    const groups = rows.map(x => x.block);
    const box = card(v, `Block-wise by ${label}`);
    const sel = h(`<div class="filters"><label>Show<select>${m.groupMetrics.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label></div>`);
    const holder = h('<div></div>');
    box.append(sel, holder);
    const cells = new Map(); // "block|group" -> aggregate
    S.schools.forEach(x => {
        const key = x.b + '|' + groupOf(x, by);
        if (!cells.has(key)) cells.set(key, blank(key));
        addTo(cells.get(key), x, m);
    });
    cells.forEach(a => finish(a));
    const draw = metric => {
        holder.innerHTML = '';
        const type = metric === 'p' ? 'p' : 'n';
        const head = x => (by === 'ct' ? shortCat(x) : x);
        const cols = [C.idx, C.block, ...groups.map((x, i) => ({ k: 'g' + i, h: head(x), type })), { k: 'all', h: 'All', type }];
        const mrows = S.blocks.map(b => {
            const row = { block: b.block, all: b[metric] };
            groups.forEach((x, i) => { const c = cells.get(b.block + '|' + x); row['g' + i] = c ? c[metric] : null; });
            return row;
        });
        const dist = groupRows(S, null, by, '');
        const mfoot = { block: 'District Total', all: S.total[metric] };
        groups.forEach((x, i) => { const d = dist.find(y => y.block === x); mfoot['g' + i] = d ? d[metric] : null; });
        const tbl = makeTable({ cols, rows: mrows, foot: mfoot });
        const bar = h('<div class="actions" style="margin-bottom:8px"></div>');
        const mLabel = sel.querySelector('option:checked').textContent;
        bar.append(exportBtns(tableSpec(tbl, `Block-wise by ${label} - ${mLabel}`, plainSub(S, P))));
        holder.append(bar, tbl.el);
    };
    $('select', sel).onchange = e => draw(e.target.value);
    draw(m.groupMetrics[0][0]);
    if (by === 'ct') v.append(h(`<p class="help">Category codes: ${groups.filter(x => shortCat(x) !== x).map(x => `<b>${esc(shortCat(x))}</b> = ${esc(x)}`).join(' &middot; ')}</p>`));
}

// Management and Category summary tables shown at the end of every dashboard
function groupSummary(v, S, P) {
    if (!groupKeys().length) return;
    const m = M();
    const g = grid2(v, true);
    ['mg', 'ct'].forEach(by => {
        const label = GROUPS[by];
        const gc = col(C.block, { h: label, cls: 'wrap', v: by === 'ct' ? x => shortCat(x.block) : null });
        const tbl = tableCard(g, `By ${label}`, { cols: m.summaryCols(gc), rows: groupRows(S, P, by, ''), sort: m.summarySort, onRow: () => { location.hash = `${modBase()}groups?by=${by}`; } }, plainSub(S, P));
        tbl.el.append(h(`<p class="help" style="padding:0 16px 12px"><a href="${modBase()}groups?by=${by}">Full ${label.toLowerCase()}-wise report &rsaquo;</a></p>`));
    });
}

// Standard sidebar of a module: Overview, Schools (school list items), extra groups, Progress
const NAV_OVERVIEW = [['dashboard', 'Dashboard', 'i-dash'], ['blocks', 'Block-wise Status', 'i-block'], ['rank', 'Leading & Lagging', 'i-trophy'], ['groups', 'Management / Category', 'i-layers', 'groups?by=mg']];
const NAV_PROGRESS = [['compare', 'Day-wise Comparison', 'i-compare'], ['trend', 'Daily Trend', 'i-trend']];
const stdNav = (schools, extra = []) => [['Overview', NAV_OVERVIEW], ...extra, ['Schools', [['schools', 'All Schools', 'i-list'], ...schools]], ['Progress', NAV_PROGRESS]];

// ================================================================ shared pages
// ---------------------------------------------------------------- Home: every programme at a glance
function pageHome(v) {
    const mods = Object.values(MODULES);
    pageHead(v, 'Monitoring Home', `Latest data of every programme &middot; ${ORG}`);

    v.append(h(`<div class="prog-grid">${mods.map(m => {
        const S = latestOf(m.key), P = beforeLatestOf(m.key);
        if (!S) return `<div class="prog-card empty"><div class="prog-top"><span class="prog-tag">${esc(m.program)}</span><h3>${esc(m.title)}</h3></div>
            <p class="help">No data yet.</p><a class="btn sm" href="#/data">Upload data &rsaquo;</a></div>`;
        const T = S.total, info = m.home(T);
        const dp = P ? deltaHtml(T.p - P.total.p, true) + ` <small>pt since ${fmtD(P.date)}</small>` : '';
        return `<a class="prog-card" href="${modBase(m.key)}dashboard">
            <div class="prog-top"><span class="prog-tag">${esc(m.program)}</span><h3>${esc(m.title)}</h3><span class="prog-date">${fmtD(S.date)}</span></div>
            <div class="prog-main"><div class="ring sm" style="--p:${Math.min(100, T.p)}"><div class="ring-in"><b>${fmtP(T.p)}%</b></div></div>
                <div><div class="prog-line">${info.line}</div><div class="prog-delta">${dp}</div></div></div>
            <dl>${info.stats.map(([k, x]) => `<dt>${k}</dt><dd>${x}</dd>`).join('')}</dl>
            <span class="cat-link">Open dashboard &rsaquo;</span>
        </a>`;
    }).join('')}</div>`));

    // block x programme matrix (latest day of each programme)
    const live = mods.filter(m => latestOf(m.key));
    if (!live.length) return;
    const names = [...new Set(live.flatMap(m => latestOf(m.key).blocks.map(b => b.block)))].sort();
    const rows = names.map(n => {
        const row = { block: n };
        live.forEach(m => { const b = latestOf(m.key).byBlock.get(n); row[m.key] = b ? b.p : null; });
        const vals = live.map(m => row[m.key]).filter(x => x != null);
        row.avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        return row;
    });
    const foot = { block: 'District Total' };
    live.forEach(m => { foot[m.key] = latestOf(m.key).total.p; });
    foot.avg = live.reduce((a, m) => a + foot[m.key], 0) / live.length;
    const cols = [C.idx, C.block, ...live.map(m => ({ k: m.key, h: `${m.title} %`, type: 'p' })), { k: 'avg', h: 'Average %', type: 'p' }];
    const tbl = makeTable({ cols, rows, foot, sort: 'avg' });
    const sub = 'Latest day: ' + live.map(m => `${m.title} ${fmtD(latestOf(m.key).date)}`).join(', ');
    card(v, 'Block-wise Progress across Programmes', exportBtns(tableSpec(tbl, 'Block-wise Progress across Programmes', sub)), true).append(tbl.el);
    v.append(h(`<p class="help">${esc(sub)}. Each programme's % is its own measure: ${live.map(m => `<b>${esc(m.title)}</b> = ${esc(m.pctLabel)}`).join(', ')}. Average % is the simple average of the programmes with data.</p>`));

    const mi = state.masterInfo;
    if (mi) v.append(h(`<p class="help">School master in use: <b>${esc(mi.fileName)}</b> &middot; ${fmtN(mi.count)} schools &middot; shared by all programmes. <a href="#/lookup">Look up a school &rsaquo;</a></p>`));
}

// ---------------------------------------------------------------- School Lookup: one school in every programme
// Search index: the school master plus schools of the latest files that are not in the master
function lookupIndex() {
    return memo('lookup', () => {
        const map = new Map();
        if (state.master) state.master.forEach(x => map.set(x.u, { u: x.u, n: x.n, b: x.b }));
        Object.keys(MODULES).forEach(k => {
            const S = latestOf(k);
            if (S) S.schools.forEach(x => { if (x.u && !map.has(x.u)) map.set(x.u, { u: x.u, n: x.n, b: x.b }); });
        });
        return [...map.values()].map(x => ({ ...x, s: (x.n + ' ' + x.u).toLowerCase() }));
    });
}

function pageLookup(v, r) {
    const u = r.q.get('u') || '';
    if (u) { schoolProfile(v, u); return; }
    const q = r.q.get('q') || '';
    pageHead(v, 'School Lookup', 'Find a school by name or UDISE code to see its status in every programme');
    const f = h(`<div class="filters lookup-box"><label>School name / UDISE code<input type="search" id="lq" placeholder="Type at least 3 characters..." value="${esc(q)}"></label></div>`);
    v.append(f);
    const out = h('<div></div>');
    v.append(out);
    const cols = [C.idx, C.sb, C.school, C.udise, ...(state.master ? [{ k: 'mg', h: 'Management', cls: 'wrap', v: x => groupOf(x, 'mg') }, { k: 'ty', h: 'Type', cls: 'nowrap', v: x => groupOf(x, 'ty') }] : [])];
    const draw = text => {
        out.innerHTML = '';
        const t = text.trim().toLowerCase();
        if (t.length < 3) { out.append(h('<p class="help">Results appear here. Tap a school to open its profile.</p>')); return; }
        const rows = lookupIndex().filter(x => x.s.includes(t)).slice(0, 200);
        const tbl = makeTable({ cols, rows, pageSize: 50, onRow: schoolGo, empty: 'No school found' });
        card(out, `Schools found${rows.length === 200 ? ' (first 200)' : ''}`, null, true).append(tbl.el);
    };
    let timer;
    const inp = $('#lq', f);
    inp.oninput = () => {
        clearTimeout(timer);
        timer = setTimeout(() => { history.replaceState(null, '', '#/lookup?q=' + encodeURIComponent(inp.value)); draw(inp.value); }, 200);
    };
    draw(q);
    inp.focus();
}

function schoolProfile(v, u) {
    const ms = state.master && state.master.get(u);
    const found = Object.values(MODULES).map(m => {
        const S = latestOf(m.key);
        const x = S && S.byKey.get(u);
        const P = beforeLatestOf(m.key);
        return { m, S, x: x && schoolRows(S, P).find(y => y.k === u), P };
    });
    const any = found.find(f => f.x);
    const name = (ms && ms.n) || (any && any.x.n) || u;
    const back = h('<div class="actions"><a class="btn" href="#/lookup">&lsaquo; Search again</a></div>');
    pageHead(v, name, `UDISE <b>${esc(u)}</b>`, back);
    const info = [['Block', (ms && ms.b) || (any && any.x.b)], ['Circle', ms && ms.cl], ['Management', ms && ms.mg], ['Category', ms && ms.ct], ['Type', ms && ms.ty]].filter(x => x[1]);
    v.append(h(`<div class="card"><div class="card-body"><dl class="kv">${info.map(([k, x]) => `<dt>${k}</dt><dd>${esc(x)}</dd>`).join('')}</dl>
        ${ms ? '' : '<p class="help">This school is not in the school master.</p>'}</div></div>`));

    v.append(h(`<div class="profile-grid">${found.map(({ m, S, x, P }) => {
        const head = `<div class="prog-top"><span class="prog-tag">${esc(m.program)}</span><h3>${esc(m.title)}</h3>${S ? `<span class="prog-date">${fmtD(S.date)}</span>` : ''}</div>`;
        if (!S) return `<div class="prog-card empty">${head}<p class="help">No data uploaded for this programme.</p></div>`;
        if (!x) return `<div class="prog-card empty">${head}<p class="help">Not in the file of ${fmtD(S.date)}.</p></div>`;
        const badge = `<span class="badge ${x.c}">${esc(m.cat[x.c] || x.c)}</span>`;
        const chg = P ? `<dt>Change since ${fmtD(P.date)}</dt><dd>${x.dO == null ? 'not in that file' : deltaHtml(x.dO)}</dd>` : '';
        return `<a class="prog-card" href="${modBase(m.key)}schools?block=${encodeURIComponent(x.b)}">${head}
            <div class="prog-main"><div class="ring sm" style="--p:${Math.min(100, x.p)}"><div class="ring-in"><b>${fmtP(x.p)}%</b></div></div><div>${badge}</div></div>
            <dl>${m.profile(x).map(([k, y]) => `<dt>${k}</dt><dd>${y}</dd>`).join('')}${chg}</dl>
            <span class="cat-link">Block school list &rsaquo;</span></a>`;
    }).join('')}</div>`));
}

// ---------------------------------------------------------------- Upload / Manage Data password
// Static site: only the SHA-256 hash of the password is kept here; unlocking lasts for the browser tab session.
const ADMIN_HASH = 'ab05e582c7455107115fe4a1de5320598c3e9e879d7a243b3f944bb265ea6573';
const UNLOCK_KEY = 'ssm-monitoring-admin-unlocked';
let adminUnlocked = false;
const isUnlocked = () => {
    if (adminUnlocked) return true;
    try { return sessionStorage.getItem(UNLOCK_KEY) === ADMIN_HASH; } catch (e) { return false; }
};
async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function lockAdmin() {
    adminUnlocked = false;
    try { sessionStorage.removeItem(UNLOCK_KEY); } catch (e) { /* storage blocked */ }
}

function pageLogin(v) {
    pageHead(v, 'Upload / Manage Data', 'This section is password protected.');
    const box = h(`<div class="card login-card"><div class="card-body">
        <form class="login">
            <label for="admPwd">Admin password</label>
            <input type="password" id="admPwd" autocomplete="current-password" required>
            <button class="btn primary" type="submit">Unlock</button>
            <p class="login-err" hidden>Incorrect password. Please try again.</p>
        </form>
    </div></div>`);
    v.append(box);
    const form = $('form', box), pwd = $('#admPwd', box), err = $('.login-err', box);
    pwd.focus();
    form.onsubmit = async e => {
        e.preventDefault();
        if (!window.crypto || !crypto.subtle) { err.textContent = 'This browser cannot check the password here. Open the portal over https.'; err.hidden = false; return; }
        if (await sha256(pwd.value) !== ADMIN_HASH) { err.hidden = false; pwd.select(); return; }
        adminUnlocked = true;
        try { sessionStorage.setItem(UNLOCK_KEY, ADMIN_HASH); } catch (e2) { /* storage blocked: unlocked for this page load only */ }
        render();
    };
}

// ---------------------------------------------------------------- Upload / Manage Data
function pageData(v) {
    if (!isUnlocked()) { pageLogin(v); return; }
    const mods = Object.values(MODULES);
    const lock = h('<div class="actions"><button class="btn">&#128274; Lock</button></div>');
    lock.firstElementChild.onclick = () => { lockAdmin(); render(); };
    pageHead(v, 'Upload / Manage Data', 'Upload the daily Excel files of any programme. One file is kept per date for each programme; the programme is detected from the columns of the file.', lock);

    const up = card(v, 'Upload daily Excel');
    up.append(h(`<div class="upload">
        <label class="drop" id="drop">
            <input type="file" id="file" accept=".xlsx,.xls,.csv" multiple hidden>
            <span class="drop-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg></span>
            <strong>Drag &amp; drop the Excel file(s) here</strong>
            <span class="help">or</span>
            <span class="btn primary">Browse files</span>
            <span class="help drop-note">Several files of different programmes can be uploaded together, and the School Search <code>.csv</code> (school master).</span>
        </label>
        <ul class="file-hints">${mods.map(m => `<li><b>${esc(m.title)}</b> &middot; ${m.fileHint}</li>`).join('')}</ul>
        <div class="upload-opts">
            <div class="field">
                <label for="upDate">Data date <em>(optional)</em></label>
                <input type="date" id="upDate">
            </div>
            <div class="upload-hint">
                <span class="hl-icon">${icon('info')}</span>
                <p>The date is read automatically from the <b>Data as on</b> line inside the file (APAAR) or from the file name (<code>YYYY-MM-DD</code> or <code>DD-MM-YYYY</code>). Set a date here only when uploading a single file without a date, or to override it.</p>
            </div>
        </div>
    </div>`));
    const drop = $('#drop', up), file = $('#file', up);
    file.onchange = () => { handleFiles([...file.files]); file.value = ''; };
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); handleFiles([...e.dataTransfer.files]); };

    // one list per programme
    const delBtn = (kind, r) => (r.src === 'repo' ? '' : `<button class="btn sm danger" data-kind="${kind}" data-del="${r.date}">Delete</button>`);
    const fileCell = r => `${esc(r.file)} ${r.src === 'repo' ? '<span class="badge repo">from repo</span>' : ''}`;
    const fmtCell = (f, x) => (f === 'p' ? fmtP(x) : fmtN(x));
    mods.forEach(m => {
        const rows = state.mods[m.key].snaps.map(s => ({ date: s.date, file: s.fileName || '', src: s.source, ...enrich(s).total })).reverse();
        const box = card(v, `${m.title} data (${rows.length} day${rows.length === 1 ? '' : 's'})`, null, true);
        box.append(h(`<div class="table-wrap"><table><thead><tr><th>Date</th><th>File</th>${m.dataCols.map(([, t]) => `<th class="num">${t}</th>`).join('')}<th></th></tr></thead><tbody>
            ${rows.map(r => `<tr><td class="nowrap"><b>${fmtD(r.date)}</b></td><td>${fileCell(r)}</td>${m.dataCols.map(([k, , f]) => `<td class="num">${fmtCell(f, r[k])}</td>`).join('')}
            <td class="nowrap">${delBtn(m.key, r)}</td></tr>`).join('') || `<tr><td colspan="${m.dataCols.length + 3}" class="empty">No data uploaded yet</td></tr>`}
        </tbody></table></div>`));
        box.onclick = async e => {
            const b = e.target.closest('[data-del]');
            if (!b || !confirm(`Delete ${MODULES[b.dataset.kind].title} data of ${fmtD(b.dataset.del)}?`)) return;
            await DB.del(b.dataset.kind, b.dataset.del);
            await reload();
            toast('Deleted');
        };
    });

    const mi = state.masterInfo;
    const mBox = card(v, 'School master (common to all programmes)');
    const unmatched = k => { const s = state.mods[k].snaps; const last = s[s.length - 1]; return last ? last.schools.filter(x => !state.master || !state.master.has(x.u)).length : null; };
    const um = mods.map(m => [m, unmatched(m.key)]).filter(([, n]) => n != null);
    mBox.append(h(`<div class="help" style="font-size:13px">
        <p>The <b>Management</b>, <b>Category</b> and <b>Type</b> of each school, and the School Lookup, come from the School Search export
        (columns UDISE Code, School Name, Circle, Block, Management, Category, Type), matched by UDISE code. Where a programme file has its own UDISE+
        management / category codes (APAAR), those are used. Upload a newer CSV here at any time; it replaces the one in use in this browser.</p>
        ${mi ? `<p>In use: <b>${esc(mi.fileName)}</b> ${mi.source === 'repo' ? '<span class="badge repo">from repo</span>' : `(uploaded ${new Date(mi.uploadedAt).toLocaleString('en-IN')})`} &middot; ${fmtN(mi.count)} schools</p>
            <p>${um.map(([m, n]) => `${esc(m.title)} (latest day): ${n ? `<span class="down">${fmtN(n)} school(s) not found in the master</span>` : 'all schools matched'}`).join(' &middot; ')}</p>
            ${mi.source === 'repo' ? '' : '<p><button class="btn sm danger" id="mDel">Remove uploaded master</button></p>'}`
        : '<p class="down">No school master loaded. Upload the School Search CSV to enable the Management / Category reports.</p>'}
    </div>`));
    if ($('#mDel', mBox)) $('#mDel', mBox).onclick = async () => {
        if (!confirm('Remove the uploaded school master from this browser?')) return;
        await DB.del('meta', 'master');
        await reload();
        toast('School master removed');
    };

    const bk = card(v, 'Backup & restore');
    bk.append(h(`<div><p class="help">Uploaded data is saved only in this browser. Download a backup regularly, and restore it on another phone or computer.
        Backups of the old PRASHAST and APAAR portals can be restored here too.</p>
        <div class="actions"><button class="btn primary" id="bkDown">&#11015; Download backup (.json)</button>
        <label class="btn">&#11014; Restore backup<input type="file" id="bkUp" accept=".json" hidden></label>
        <button class="btn" id="bkOld">Import data of the old portals (this browser)</button>
        <button class="btn danger" id="bkClear">Delete all uploaded data</button></div></div>`));
    $('#bkDown', bk).onclick = async () => {
        const data = { app: 'ssm-monitoring', version: 1, exported: new Date().toISOString(), modules: {} };
        for (const m of mods) {
            const pick = x => Object.fromEntries(m.fields.map(f => [f, x[f]]));
            data.modules[m.key] = (await DB.all(m.key)).sort(byDate).map(s => ({ date: s.date, fileName: s.fileName, uploadedAt: s.uploadedAt, meta: s.meta || null, schools: s.schools.map(pick) }));
        }
        data.master = (await DB.all('meta')).find(x => x.key === 'master') || null;
        download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `ssm-monitoring-backup_${today()}.json`);
    };
    $('#bkUp', bk).onchange = async e => {
        const f = e.target.files[0];
        if (!f) return;
        try {
            const data = JSON.parse(await f.text());
            const sets = backupSets(data);
            if (!sets) throw new Error('Not a backup file of this portal or of the old PRASHAST / APAAR portals');
            await importSets(sets, data.master);
        } catch (err) { toast('Restore failed: ' + err.message, true); }
    };
    $('#bkOld', bk).onclick = async () => {
        const [p, a] = await Promise.all([readOtherDB('prashast-monitor'), readOtherDB('apaar-monitor')]);
        const sets = { teacher: p.snapshots, school: p.school_snapshots, screening: p.screening_snapshots, apaar: a.snapshots };
        const master = [...(p.meta || []), ...(a.meta || [])].find(x => x.key === 'master');
        if (!Object.values(sets).some(x => x && x.length)) { toast('No data of the old portals was found in this browser (they must have been opened on this same site).', true); return; }
        if (!confirm('Copy the data of the old PRASHAST / APAAR portals of this browser into this portal? Dates that exist here already are replaced.')) return;
        await importSets(sets, master);
    };
    $('#bkClear', bk).onclick = async () => {
        if (!confirm('Delete ALL uploaded data of every programme and the uploaded school master from this browser? Download a backup first if needed.')) return;
        for (const s of DB.stores()) await DB.clear(s);
        await reload();
        toast('All uploaded data deleted');
    };

    const gh = card(v, 'Share data with everyone (GitHub)');
    gh.append(h(`<div class="help" style="font-size:13px">
        <p>Data uploaded here stays on this device. To let every officer who opens the portal see the same history, add the daily files to the repository:</p>
        <ol>
            <li>Put the Excel file in the <code>data/</code> folder of the repository, with the data date in the file name (for example <code>APAAR_Entry_Status_School_Wise_2026-10-28.xlsx</code>).</li>
            <li>Add the file name to <code>data/manifest.json</code>. Files of all programmes go in the same list; the programme is detected from the columns, for example:<br><code>["Teacher_Onboarding_School_Wise_All_Blocks_2026-10-28.xlsx", "APAAR_Entry_Status_School_Wise_2026-10-28.xlsx"]</code></li>
            <li>Commit. GitHub Pages updates in a minute or two; those dates then show as <span class="badge repo">from repo</span> for everyone.</li>
        </ol>
    </div>`));
}

// Snapshot lists per module from a backup: this portal's format, or the old PRASHAST / APAAR backups
function backupSets(data) {
    if (data.app === 'ssm-monitoring' && data.modules) return data.modules;
    if (data.app === 'apaar-monitor' && Array.isArray(data.snapshots)) return { apaar: data.snapshots };
    if (Array.isArray(data.snapshots)) return { teacher: data.snapshots, school: data.schoolSnapshots, screening: data.screeningSnapshots };
    return null;
}

async function importSets(sets, master) {
    const done = [];
    for (const [k, list] of Object.entries(sets)) {
        if (!MODULES[k] || !Array.isArray(list) || !list.length) continue;
        for (const s of list) await DB.put(k, { date: s.date, fileName: s.fileName, uploadedAt: s.uploadedAt, source: 'upload', meta: s.meta || null, schools: s.schools });
        done.push(`${list.length} ${MODULES[k].title} day(s)`);
    }
    if (master && master.rows) await DB.put('meta', { ...master, key: 'master', source: 'upload' });
    await reload(new Set(Object.keys(sets)));
    toast(done.length ? `Restored ${done.join(', ')}` : 'Nothing to restore');
}

function emptyState() {
    const m = M();
    return h(`<div class="card empty-state"><h2>No ${esc(m.title)} data yet</h2>
        <p>Upload the ${m.emptyText} to start monitoring.</p>
        <p><a class="btn primary" href="#/data">&#11014; Upload Excel</a></p>
        <p class="help">${CREDIT}</p></div>`);
}

// ---------------------------------------------------------------- upload handling
async function handleFiles(files) {
    if (!files.length) return;
    const override = $('#upDate') && $('#upDate').value;
    if (override && files.length > 1) { toast('Pick a date only when uploading a single file.', true); return; }
    const kinds = new Set();
    let masterChanged = false;
    for (const f of files) {
        try {
            const wb = readBook(await f.arrayBuffer());
            const master = parseMaster(wb);
            if (master) {
                await DB.put('meta', { key: 'master', fileName: f.name, uploadedAt: new Date().toISOString(), rows: master });
                masterChanged = true;
                toast(`School master ${f.name}: ${fmtN(master.length)} schools loaded`);
                continue;
            }
            const { kind, schools, asOn, meta } = parseWorkbook(wb);
            const date = override || asOn || dateFromName(f.name);
            if (!date) throw new Error('no date found in the file or its name; choose the "Data date" and upload again');
            const title = MODULES[kind].title;
            const exists = state.mods[kind].snaps.find(s => s.date === date && s.source !== 'repo');
            if (exists && !confirm(`${title} data for ${fmtD(date)} already exists. Replace it with ${f.name}?`)) continue;
            await DB.put(kind, { date, fileName: f.name, uploadedAt: new Date().toISOString(), source: 'upload', meta, schools });
            kinds.add(kind);
            toast(`${title} ${fmtD(date)}: ${fmtN(schools.length)} schools loaded`);
        } catch (e) {
            console.error(e);
            toast(`${f.name}: ${e.message}`, true);
        }
    }
    if (kinds.size || masterChanged) await reload(kinds);
}

// ---------------------------------------------------------------- data loading
async function loadRepo() {
    try {
        const res = await fetch('data/manifest.json', { cache: 'no-store' });
        if (!res.ok) return [];
        const list = await res.json();
        const out = [];
        for (const e of list) {
            const file = typeof e === 'string' ? e : e.file;
            if (!file) continue;
            try {
                const r = await fetch('data/' + encodeURIComponent(file), { cache: 'no-store' });
                if (!r.ok) throw new Error('HTTP ' + r.status);
                const { kind, schools, asOn, meta } = parseWorkbook(readBook(await r.arrayBuffer()));
                // same order as uploads: a date given in the manifest, the date inside the file, the file name
                const date = (typeof e === 'object' && e.date) || asOn || dateFromName(file);
                if (date) out.push({ date, fileName: file, source: 'repo', kind, meta, schools });
            } catch (err) { toast(`data/${file}: ${err.message}`, true); }
        }
        return out;
    } catch (e) { return []; }
}

// School master: data/school_master.csv in the repo, overridden by an uploaded master in this browser
async function loadRepoMaster() {
    try {
        const r = await fetch('data/school_master.csv', { cache: 'no-store' });
        if (!r.ok) return null;
        const rows = parseMaster(readBook(await r.arrayBuffer()));
        return rows ? { fileName: 'school_master.csv', source: 'repo', rows } : null;
    } catch (e) { return null; }
}

let repoSnaps = null, repoMaster;
// jumpTo: a Set of modules whose date should move to their latest day (after an upload)
async function reload(jumpTo) {
    if (repoSnaps === null) [repoSnaps, repoMaster] = await Promise.all([loadRepo(), loadRepoMaster()]);
    const m = (await DB.all('meta')).find(x => x.key === 'master') || repoMaster;
    state.master = m ? new Map(m.rows.map(x => [x.u, x])) : null;
    state.masterInfo = m ? { fileName: m.fileName, source: m.source || 'upload', uploadedAt: m.uploadedAt, count: m.rows.length } : null;
    const active = state.mod;
    for (const kind of Object.keys(MODULES)) {
        const local = await DB.all(kind);
        // copies, so that a day is worked out again with the current school master
        const map = new Map(repoSnaps.filter(s => s.kind === kind).map(s => [s.date, { ...s }]));
        local.forEach(s => map.set(s.date, { ...s, kind })); // uploaded data overrides repo data of the same date
        state.mod = kind;
        state.snaps = [...map.values()].sort(byDate);
        const dates = state.snaps.map(s => s.date);
        if ((jumpTo && jumpTo.has(kind)) || !dates.includes(state.cur)) setCur(dates[dates.length - 1] || '');
        else if (state.prev && !dates.includes(state.prev)) setCur(state.cur);
    }
    state.mod = active;
    state.cache = {};
    fillDateSelects();
    render();
}

function setCur(d) {
    state.cur = d;
    const i = state.snaps.findIndex(s => s.date === d);
    state.prev = i > 0 ? state.snaps[i - 1].date : '';
}

function fillDateSelects() {
    const cs = $('#curDate'), ps = $('#prevDate');
    const dates = state.snaps.map(s => s.date).reverse();
    cs.innerHTML = dates.length ? dates.map(d => `<option value="${d}">${fmtD(d)}</option>`).join('') : '<option value="">No data</option>';
    cs.value = state.cur;
    ps.innerHTML = '<option value="">None</option>' + dates.filter(d => d !== state.cur).map(d => `<option value="${d}">${fmtD(d)}</option>`).join('');
    ps.value = state.prev;
}

// ---------------------------------------------------------------- sidebar
function buildModSwitch() {
    const programs = [...new Set(Object.values(MODULES).map(m => m.program))];
    $('#modSwitch').innerHTML = programs.map(p => `<div class="mod-prog">${esc(p)}</div>` +
        Object.values(MODULES).filter(m => m.program === p).map(m => `<button data-mod="${m.key}"><span class="mod-ic">${m.icon}</span>${esc(m.title)}</button>`).join('')).join('');
    $('#modSwitch').onclick = e => {
        const b = e.target.closest('[data-mod]');
        if (!b) return;
        const r = parseHash(), k = b.dataset.mod;
        // keep the same page (dashboard, blocks, ...) where the other module has it
        const page = r.mod && MODULES[k].pages[r.name] ? r.name + (r.arg && k === r.mod ? '/' + r.arg : '') : 'dashboard';
        location.hash = modBase(k) + page;
    };
}

function buildModNav() {
    const m = M();
    $('#modNav').innerHTML = `<div class="nav-mod">${esc(m.title)}</div>` + m.nav.map(([group, items]) => `<div class="nav-group">${esc(group)}</div>` +
        items.map(([route, label, ic, href]) => {
            const mark = ic.startsWith('dot-') ? `<i class="dot ${ic.slice(4)}"></i>` : `<svg class="ni"><use href="#${ic}"/></svg>`;
            return `<a href="${modBase()}${href || route}" data-route="${m.key}/${route}">${mark} ${esc(label)}</a>`;
        }).join('')).join('');
    $('#sideSource').textContent = 'Source: ' + m.source;
}

// ---------------------------------------------------------------- routing
// Module pages: #/<module>/<page>[/<arg>][?query]; shared pages: #/home, #/lookup, #/data
const SHARED = { home: pageHome, lookup: pageLookup, data: pageData };

function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, q = ''] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    if (MODULES[parts[0]]) {
        const mod = parts.shift();
        return { mod, name: MODULES[mod].pages[parts[0]] ? parts[0] : 'dashboard', arg: parts[1] || '', q: new URLSearchParams(q) };
    }
    return { mod: null, name: SHARED[parts[0]] ? parts[0] : 'home', arg: parts[1] || '', q: new URLSearchParams(q) };
}

let navMod = null;
function render() {
    state.charts.forEach(c => c.destroy());
    state.charts = [];
    const r = parseHash();
    state.route = r;
    if (r.mod && r.mod !== state.mod) { state.mod = r.mod; fillDateSelects(); }
    if (navMod !== state.mod) { navMod = state.mod; buildModNav(); }
    document.body.classList.toggle('shared-page', !r.mod);
    document.querySelectorAll('#modSwitch [data-mod]').forEach(b => b.classList.toggle('active', b.dataset.mod === r.mod));
    const key = r.mod ? `${r.mod}/${r.name}${r.arg ? '/' + r.arg : ''}` : r.name;
    const links = [...document.querySelectorAll('#sidebar nav a[data-route]')];
    links.forEach(a => a.classList.toggle('active', a.dataset.route === key));
    const link = links.find(a => a.dataset.route === key) || links.find(a => a.dataset.route === (r.mod ? `${r.mod}/${r.name}` : r.name));
    $('#crumbOrg').textContent = r.mod ? `${M().program} · ${M().title} · ${ORG}` : `${APP_NAME} · ${ORG}`;
    $('#crumbTitle').textContent = link ? link.textContent.trim() : 'Dashboard';
    const v = $('#view');
    v.innerHTML = '';
    document.body.classList.remove('menu-open');
    try {
        if (!r.mod) SHARED[r.name](v, r);
        else if (!state.snaps.length) v.append(emptyState());
        else MODULES[r.mod].pages[r.name](v, r);
    } catch (e) {
        console.error(e);
        v.append(h(`<div class="card"><div class="card-body">Something went wrong: ${esc(e.message)}</div></div>`));
    }
}

async function init() {
    if (typeof XLSX === 'undefined' || !window.jspdf || typeof Chart === 'undefined') {
        $('#view').innerHTML = '<div class="card"><div class="card-body">Could not load required libraries. Please check the internet connection and reload.</div></div>';
        return;
    }
    Object.keys(MODULES).forEach(k => { state.mods[k] = { snaps: [], cur: '', prev: '' }; });
    state.mod = Object.keys(MODULES)[0];
    $('#year').textContent = new Date().getFullYear();
    Object.assign(Chart.defaults, { color: '#64748b', borderColor: '#eef2f7' });
    Chart.defaults.font.family = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    Object.assign(Chart.defaults.plugins.tooltip, { backgroundColor: '#0f172a', padding: 10, cornerRadius: 6 });
    buildModSwitch();
    $('#menuBtn').onclick = () => document.body.classList.toggle('menu-open');
    $('#backdrop').onclick = () => document.body.classList.remove('menu-open');
    $('#curDate').onchange = e => { setCur(e.target.value); fillDateSelects(); render(); };
    $('#prevDate').onchange = e => { state.prev = e.target.value; render(); };
    window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
    await DB.open();
    await reload();
}

// Modules are loaded by the script tags after this file; start once they have all registered
document.addEventListener('DOMContentLoaded', init);
