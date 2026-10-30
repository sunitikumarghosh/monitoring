# School Monitoring Portal :: SSM, Purba Bardhaman

One web portal for monitoring school programmes in Purba Bardhaman district by block, school and day.
All programmes share one **school master** (UDISE code, school name, block, management, category, type).
It is a static site: no server or database is needed, and it runs on **GitHub Pages**.

It brings together the earlier *Prashast On boarding status* and *APAAR Creation status* portals:

| Programme | Module | Source file |
|---|---|---|
| PRASHAST | Teacher Onboarding | `Teacher_Onboarding_School_Wise_All_Blocks_YYYY-MM-DD.xlsx` (Tampermonkey script) |
| PRASHAST | School Onboarding | `Schools_Onboarding_Status_All_Blocks_YYYY-MM-DD.xlsx` (Tampermonkey script) |
| PRASHAST | Screening (Part-1) | `Schools_Screening_Status_Part1_All_Blocks_YYYY-MM-DD.xlsx` (Tampermonkey script) |
| APAAR | APAAR Creation | UDISE+ *APAAR Entry Status - School Wise (Only Operational)*, uploaded as downloaded |
| ECO CLUB | Eco Club Registration | `Registration of schools under eco_club-DD-MM-YYYY.xlsx` (the registered schools) |
| ECO CLUB | Eco Club Plantation | `Eco_Clubs_plantation_West_Bengal_all_schools_DD-MM-YYYY.xlsx` (schools that planted trees, and the district target) |

More programmes can be added as modules (see [Adding a monitoring module](#adding-a-monitoring-module)).

## Pages

**Shared pages**

| Page | What it shows |
|---|---|
| Home | One card per programme (latest date, district %, change since the previous day), and a block × programme table of the % of every programme |
| School Lookup | Search a school by name or UDISE code and see its master details and its status in every programme. Tapping a school in any school list opens it here |
| Upload / Manage Data | Upload daily files of any programme or the school master, delete a day, back up and restore, import data of the old portals |

**Pages of every programme** (chosen with the programme switch in the side menu)

| Page | What it shows |
|---|---|
| Dashboard | District KPIs with change since the previous day, key insights, charts, daily trend, top / bottom 5 blocks, Management and Category summaries |
| Block-wise Status | Rank, counts, %, daily change, school levels and Leading / Moderate / Lagging status. Tap a block to open its schools |
| Leading & Lagging | Top / bottom 10 blocks, top gainers, least progress and the programme's priority lists |
| Management / Category | The programme by school Management, Category or School Type (optionally for one block), with a block × group matrix |
| School lists | All schools and the programme's levels or stages, filtered by block, Management, Category, Type and search |
| Day-wise Comparison | Any two dates side by side: block-wise change and school-level movement |
| Daily Trend | District summary for every date, plus a block × date matrix |

APAAR also has **Block × Management** (Dept. of Education, SSK & MSK, Govt. Sponsored, Other and All managements side by side),
downloadable as Excel, PDF (2 A4 pages) or PowerPoint (2 slides).

Every table has **Excel** and **PDF** download buttons. Each file carries the programme's header
(for example *"Prashast On boarding status :: SSM, Purba Bardhaman"* or *"APAAR Creation status :: SSM, Purba Bardhaman"*),
the report title, the data date and the generation time. The layout works on phones, tablets and desktops.

**Leading / Lagging rule:** blocks are ranked by the programme's %. The top quarter are *Leading*, the bottom quarter are *Lagging*, and the rest are *Moderate*.

The Eco Club modules have the lists **Registered, No Plantation** and **Planted, Not Registered**, which match each school of one
module against the latest day of the other. Eco Club Plantation also shows the district plantation target from the summary sheet of
the file (target, % achieved, trees still to plant) and the schools in trees-planted brackets: 0, 1-9, 10-19, 20-49, 50-99, 100-249, 250-499, 500+.

### Measures

- **Teacher Onboarding**: Onboarded % = Teachers Onboarded / Total Teachers. A school is *100%*, *1-99%*, *0%* or *No teachers*.
- **School Onboarding**: Onboarded % = schools with status *Completed* / all schools.
- **Screening (Part-1)**: Screened % = Screened Students / Total Students. Each school is in a stage:
  *Not onboarded* → *Onboarded, not started* → *Screening started* → *All students screened*.
- **APAAR Creation**: Generated % = Total Generated / Total Student. *Not Generated* = Total Student − Total Generated (includes Requested and Failed);
  *Not yet requested* = Not Generated − Requested − Failed.
- **Eco Club Registration**: Registered % = registered schools / all schools of the school master. The file lists only the registered
  schools; every other school of the master counts as *Not registered*.
- **Eco Club Plantation**: % Schools Planted = schools with at least one tree / all schools of the school master. The file lists only the
  schools that planted; every other school of the master counts as *0 trees*. Trees, students, teachers and participants are summed per block.
- The two Eco Club files use their own block names (e.g. BURDWAN-I, KALNA-II, … MUNICIPALITY). The block of each school is taken from the
  school master by UDISE code, so that all programmes use the same blocks; the Eco Club file's block is shown in the registration school lists.
  Rows of other districts (the plantation file is for all of West Bengal) are skipped.

## School master (common to all programmes)

The School Search export (`UDISE Code`, `School Name`, `Circle`, `Block`, `Management`, `Category`, `Type`) is matched by UDISE code.
It gives the Management / Category / Type of each school and feeds the School Lookup.
The APAAR file has its own UDISE+ management and category codes; those are used for APAAR (names in `js/core.js`, `UDISE_CODES`).

- For everyone: save it as `data/school_master.csv` in the repository (the name is fixed; it is not listed in the manifest).
- For one browser: upload the CSV on **Upload / Manage Data**. It overrides the repo copy in that browser.

## Daily use

1. Get the day's files:
   - PRASHAST: on the PRASHAST portal, run the Tampermonkey scripts in `tools/userscripts/` on the matching *Block Wise Report* page
     (Teacher Onboarding, Schools Onboarding Status, Schools Screening Status [Part-1]). Each saves one combined Excel for all blocks.
   - APAAR: on UDISE+, download **APAAR Entry Status - School Wise (Only Operational)** for the district as Excel.
   - Eco Club: download the school-wise registration list and the plantation file (all schools), keeping the date in the file names.
2. Open the portal, go to **Upload / Manage Data** and upload the files, several at a time if you like.
   The programme is detected from the columns of each file.
3. The date is read from the *Data as on* line inside the file (APAAR) or from the file name (`YYYY-MM-DD` or `DD-MM-YYYY`).
   To override it, upload one file at a time and choose the *Data date*.
4. Uploading again for the same date replaces that day's data.

**Upload / Manage Data is password protected** (same password as the earlier portals). After unlocking, it stays open until the browser tab is closed or *Lock* is pressed.
Only a SHA-256 hash of the password is in `js/core.js` (`ADMIN_HASH`). To change the password, put the hash of the new one there.
This is a static site, so the lock keeps casual visitors out of the upload page; it is not server-side security.

Uploaded data is stored **in that browser only** (IndexedDB). Use *Download backup* to move it to another device.

### Moving from the old portals

- **Backups** downloaded from the old PRASHAST or APAAR portals can be restored on *Upload / Manage Data → Restore backup*.
- **Import data of the old portals** copies the data uploaded in the old portals into this one, in the same browser, when they ran on the
  same site (for example `localhost/prashast-monitor` and `localhost/monitoring`, or `<you>.github.io/apaar` and `<you>.github.io/monitoring`).

## Publish on GitHub Pages

1. Create a repository, for example `monitoring`, and upload all the files in this folder:
   `index.html`, `css/`, `js/`, `data/`, `tools/`, `.nojekyll`, `.gitignore`, `README.md`.
2. Go to **Settings → Pages → Build and deployment**. Set *Source* to **Deploy from a branch**, choose branch `main` and folder `/ (root)`, then save.
3. After about a minute the portal is live at `https://<your-username>.github.io/monitoring/`.

### Let everyone see the same data

So that every officer who opens the link sees the full history without uploading anything, commit the daily files to the repo:

1. Put each day's Excel file in `data/`.
2. List the files in `data/manifest.json`. Files of all programmes go in the same list:
   ```json
   [
     "Teacher_Onboarding_School_Wise_All_Blocks_2026-10-28.xlsx",
     "Schools_Onboarding_Status_All_Blocks_2026-10-29.xlsx",
     "APAAR_Entry_Status_School_Wise_2026-10-28.xlsx"
   ]
   ```
   An entry can also be `{ "file": "...", "date": "2026-10-29" }`. The date is taken from the entry, else from the *Data as on* line inside the file, else from the file name.
3. Commit. These dates appear for everyone, marked "from repo". If someone uploads a file for the same date in their own browser, their upload is used instead.

> If the repository is public, anyone with the link can download files in `data/`. Make the repo private (GitHub Pages on private repos needs a paid plan) or keep data upload-only if that matters.

## Accepted file formats

The first sheet that has a **School Name** column is used (a sheet named *All Schools* is preferred). The columns are found by name:

- Teacher Onboarding: `Block Name`, `School Name`, `UDISE Code`, `Total Teachers`, `Teachers Onboarded`.
- School Onboarding: `Block Name`, `School Name`, `UDISE Code`, `Status` (`Completed` counts as onboarded, anything else as pending).
- Screening (Part-1): `Block Name`, `School Name`, `UDISE Code`, `Schools Onboarded` (`On-boarded` / `Pending`), `Screening Started` (`Not Started` = not started), `Total Students`, `Screened Students`.
- APAAR: `Block Name`, `School Name`, `UDISE Code`, `School Management`, `School Category`, `Total Student`, `Total Generated`, `Total Requested`, `Total Failed`.
  The title rows above the header and the `(1) (2) (3)…` column-number row are skipped.
- Eco Club Registration: `School Name`, `UDISE ID`, `District`, `Block Name`, `School Type`.
- Eco Club Plantation: `School`, `UDISE`, `Students`, `Teachers`, `Total Participants`, `Trees Planted` (sheet *Schools*), and a summary sheet
  with `District`, `Plantation Target`, `No of Plantation Done`.

For PRASHAST files the portal's own format `School Name | UDISE` in one column also works. Percentages are always recalculated from the counts.

## Project structure

```
index.html                 page shell: side menu, top bar, library and module script tags
css/style.css              all styles
js/core.js                 everything shared: storage, Excel parsing, calculations, school master and groups,
                           tables, Excel / PDF export, charts, generic pages (blocks, school lists, comparison,
                           trend, management / category), Home, School Lookup, Upload / Manage Data, routing
js/modules/prashast.js     Teacher Onboarding, School Onboarding, Screening (Part-1)
js/modules/apaar.js        APAAR Creation, including the Block x Management report
js/modules/ecoclub.js      Eco Club Registration and Eco Club Plantation
data/                      school_master.csv, manifest.json and the published daily files
tools/userscripts/         Tampermonkey scripts that build the combined PRASHAST files
```

Page addresses: `#/home`, `#/lookup`, `#/data`, and `#/<module>/<page>` for programme pages, for example `#/apaar/blocks` or `#/teacher/schools/zero?block=RAINA-I`.

## Adding a monitoring module

A new programme on the same schools needs one new file, for example `js/modules/mdm.js`, and one script tag in `index.html`
after the other modules. The file calls `registerModule({...})`; the existing modules are complete examples. The main fields:

| Field | Meaning |
|---|---|
| `key`, `program`, `title`, `tag`, `icon` | Address (`#/<key>/...`), programme group in the menu, name, prefix of exported report titles, menu icon |
| `header`, `source` | First line of every exported report; source shown at the foot of the menu |
| `priority`, `detect(H)` | Header row → is this file mine? Modules are asked from the highest priority down |
| `parse(rows, hi, H)` | Rows of the sheet → `{ schools: [{ b, n, u, ... }], asOn }` (block, school name, UDISE, own fields; optional date inside the file) |
| `complete(schools)` | Optional, for files that list only the schools that took part: `withMaster(schools, fill)` adds every other school of the master and takes blocks from the master (as the Eco Club modules do) |
| `prep(x)` | Sets `x.t` (total), `x.o` (done) and `x.c` (category) of a school; `levelOf(x)` gives `full` / `part` / `zero` / `na` |
| `cats`, `sums`, `fields`, `cat` | Categories counted per block, extra fields summed per block, fields kept in backups, category labels |
| `pctLabel`, `nav`, `pages` | Name of the %, side menu (`stdNav(...)` gives the standard one), page functions (`blocksPage`, `schoolsPage`, `comparePage`, `trendPage`, `pageGroups` and the dashboard helpers do most of the work) |
| `dataCols`, `home(T)`, `profile(x)`, `fileHint`, `emptyText` | Upload page list, Home card, School Lookup card, upload hint, empty-state text |
| `groupCols`, `groupMetrics`, `summaryCols`, `summarySort` | Columns of the Management / Category report and of the dashboard summaries |

Its data is stored in its own IndexedDB store (created automatically), uploads are routed to it by `detect`, and it appears on Home and in School Lookup.

## Local testing

Open the folder through any web server, for example XAMPP: `http://localhost/monitoring/`.
Opening `index.html` directly from disk also works, but loading `data/manifest.json` and `data/school_master.csv` needs a web server.
