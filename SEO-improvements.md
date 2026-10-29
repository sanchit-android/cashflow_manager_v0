# SEO and AI-search improvements

Goal: get PlannedOut found on Google and Bing, and recommended by AI assistants (ChatGPT, Gemini, Claude, Copilot, Perplexity), for Indian and global audiences.

## Already done

- ✅ Bigger homepage: key benefits, comparison table, sections for all 15 user guides, direct links to all 4 calculators, how it works, FAQ
- ✅ 15 guide pages: Budget planner for India, Excel budget alternative, Private expense tracker, Savings runway planner, Annual expenses planner, Budget app without SMS (India), EMI & debt-free planner, Private YNAB & Mint alternative, FIRE & retirement planner, First-salary planner (India), Festival & wedding planner (India), Child education planner (India), Household budget template (India), Freelance & irregular income, Sinking funds guide
- ✅ 4 free browser calculators (no sign-in): Savings runway (`/calculators/savings-runway/`), Emergency fund (`/calculators/emergency-fund/`), Sinking fund (`/calculators/sinking-fund/`), 50/30/20 split (`/calculators/50-30-20-budget/`), plus hub at `/calculators/`
- ✅ Bidirectional internal linking: every guide links to its matching calculator CTA, every calculator links to its related deep-dive guides, and the homepage links contextually to all 15 guides and 4 calculators
- ✅ About, Contact and Privacy pages with visible breadcrumbs
- ✅ `robots.txt`, dynamic `sitemap.xml` (with `lastmod`), `llms.txt` (summary for AI assistants), and `manifest.webmanifest` (PWA manifest)
- ✅ Rich structured data (JSON-LD) on every public page:
  - Homepage: `Organization`, `WebSite`, `WebApplication` (multi-currency `INR` & `USD` free offers, screenshots), `FAQPage`
  - Guides: `WebPage`, `Article` (headline, screenshots, language, author, publisher), `BreadcrumbList`, `FAQPage`
  - Calculators & Hub: `WebApplication`, `CollectionPage`, `ItemList`, `BreadcrumbList`, `FAQPage`
  - Trust pages: `AboutPage` (`/about/`), `ContactPage` + `ContactPoint` (`/contact/`), `WebPage` + `FAQPage` (`/privacy/`)
- ✅ Context-aware language & locale tags (`lang="en-IN"` / `og:locale="en_IN"` on India pages, `lang="en"` / `og:locale="en_US"` on global pages, plus `hreflang="en-IN"`, `hreflang="en"`, and `hreflang="x-default"`)
- ✅ Page descriptions, canonical URLs and link-preview tags on every page; login and app pages hidden from search (`noindex, nofollow`, `Cache-Control: no-store`)
- ✅ Fast public page delivery: `Cache-Control: public, max-age=300, stale-while-revalidate=3600` (`Vary: Cookie`) for anonymous visitors and resized header icon (`73 KB` → `7.5 KB`)
- ✅ Worked numerical example & comparison tables (`<table class="compare">`) on all 15 guide pages for Google Featured Snippets and AI Overviews
- ✅ Free downloadable `.xlsx` and `.csv` household budget templates (`/static/templates/indian-household-budget-template.xlsx` and `/static/templates/monthly-budget-template.csv`) on `/indian-household-budget-template/` and `/excel-budget-alternative/`, plus 1-click sample `.xlsx` import in the app
- ✅ 1-click Interactive Demo Mode (`/app?demo=1` and `/demo/`): pre-loaded with 9 months of realistic household data, unlocking Month, Year, Insights, Projections, Accounts, Savings, Import and Settings (including all 15 themes, custom theme builder, screen motion, currency, recovery keys and lock/unlock) without sign-in
- ✅ Site verified in Google Search Console and Bing Webmaster Tools; sitemap submitted
- ✅ Product pages: `/features/` (every app feature, incl. encryption, custom metrics, month close, 20 currencies), `/themes/` (all 15 themes + custom theme builder + screen motion, with `FAQPage`) and `/changelog/` (`dateModified`), linked from header, footer, homepage, sitemap and `llms.txt`
- ✅ Calculators upgraded: worked-example tables (click to prefill), common mistakes + sources, visible "Last updated" date, shareable result links, and a free embed widget (`/embed/<slug>/`)

All page text lives in `core/seo.py`.

---

## Ranking push to page 1 (Oct 2026 review)

Context: `/calculators/savings-runway/` was first result on page 7. For a site this new, that is mostly an **authority** gap (few links and mentions), plus a few on-page issues that affect every page. Expect 3–6 months for long-tail searches and 6–12 months for competitive ones.

### Code changes (status)

| Status | Task | Detail |
|---|---|---|
| ✅ | **Stop pages competing for the same search** | `/savings-runway-calculator/` (guide) now targets "career break / sabbatical money planner"; `/calculators/savings-runway/` owns "how long will my savings last"; `/fire-retirement-runway-planner/` title now "FIRE number vs real cash flow" |
| ✅ | **Richer calculator pages** | Worked-example tables (₹ and $, each row prefills the calculator), "Common mistakes", sources, visible "Last updated" date (`CALC_UPDATED` in `core/seo.py`), `dateModified` in JSON-LD |
| ✅ | **Shareable result links** | "Copy a link to these results" builds `?savings=…&spend=…`; any calculator URL with these params prefills the form (`static/js/calc.js`) |
| ✅ | **Embeddable calculator widget (backlink engine)** | `/embed/<slug>/`: frameable by any site (CSP `frame-ancestors *` on that route only), `noindex`, canonical → full calculator, credit link back. Embed code shown on every calculator page |
| ✅ | **Fix outdated feature claims** | "Five themes" → 15 themes + custom theme builder (homepage benefits, JSON-LD, `llms.txt`) |
| ✅ | **`/features/` page** | Spreadsheet & formulas, insights & custom metrics, projections & runway, accounts/cards/month close, themes, encryption & recovery keys, currencies/PWA |
| ✅ | **`/themes/` gallery** | All 15 themes with colour previews, custom theme builder (12 colours, 4 fonts, corner roundness), screen motion, FAQ ("dark mode budget app", "budget app that looks like Excel") |
| ✅ | **`/changelog/` page** | Freshness signal; add an entry to `CHANGELOG` in `core/seo.py` with each release |
| ⬜ | **Same overlap check for the other calculators** | Emergency fund vs runway guides; sinking fund vs `/sinking-funds-guide/` vs `/annual-expenses-planner/`. Give each page one main phrase |
| ⬜ | **Named author + bio** on guides and calculators | Needs a real person's name and background (finance content gets judged on trust). Currently credited to the company team |
| ✅ | **Real theme screenshots** (15 of 15) | All themes have a screenshot (`static/img/screenshots/themes/<key>.{webp,png}`, 1024×640, `ImageObject` in JSON-LD), opening in a popup (`static/js/lightbox.js`). For a new theme, add with `python scripts/make_theme_shots.py <folder> mint=1.png ...`; the page picks them up automatically and shows colour previews for the rest |
| ⬜ | **Longer calculator explanations** (800–1,200 words each) | Method, assumptions and India/US examples, in the same style as guides |
| ⬜ | **Count embed uses** | Uses inside third-party iframes aren't counted (CSRF cookie is blocked cross-site) |
| ⬜ | **Security page** (`/security/`) | Separate page for "encrypted budget app" / "zero-knowledge expense tracker"; for now covered in `/features/#security` and `/privacy/` |

### Things only you can do (status)

| Status | Task |
|---|---|
| ✅ | Request indexing in Search Console for the 15 pending URLs plus `/features/`, `/themes/`, `/changelog/` |
| ⬜ | Directory listings: AlternativeTo, Product Hunt, SaaSHub, Indie Hackers, BetaList, Uneed, TinyLaunch |
| ⬜ | Offer the embed widget to Indian personal-finance bloggers and newsletters |
| ⬜ | Reddit / Quora answers linking to a calculator with the asker's numbers prefilled (use "Copy a link to these results") |
| ✅ | Social profiles (X, LinkedIn, Instagram) live; listed in `SOCIALS` in `core/seo.py` and used for `sameAs`, footers, About, Contact, llms.txt and `twitter:site` |
| ⬜ | One citable data piece, e.g. "How long do Indian households' savings last, by income band", from public data |

### Keeping page-1 rankings

- **Monthly:** Search Console → Performance, filter position 8–30, sort by impressions; expand those pages first.
- **Quarterly:** refresh the top 10 pages (numbers, examples, a new FAQ from real queries) and bump `CALC_UPDATED` / add a changelog entry.
- **Ongoing:** a few new links or mentions every month; check PageSpeed Insights after big changes.
- **Avoid:** mass-generated near-duplicate pages (e.g. one per salary amount).

---

## What we can do in code (status & roadmap)

| Status | # | Task | Why it helps | Effort |
|---|---|------|--------------|--------|
| ✅ | 1 | **IndexNow**: ping Bing (and Yandex, Seznam) whenever a page changes. Runs ~45s after each Render start (`python manage.py indexnow`); only changed pages are sent. Code in `core/indexnow.py` | Bing indexes changes within hours. ChatGPT search and Copilot draw heavily on Bing. | ~10 min |
| ✅ | 2 | **Social preview image** (1200×630) used for `og:image` and `twitter:image`. File: `static/img/og-image.png`; rebuild with `python scripts/make_og_image.py` | Better-looking links on WhatsApp, LinkedIn and X, so more people click | ~20 min |
| ✅ | 3 | **Batch 1 guide pages** for long, specific searches (list below — 10 of 10 done, 15 total guides live) | Each brings steady traffic from specific questions; AI tools quote pages that answer one clear question | ~15 min per page |
| ✅ | 4 | **Free calculators (Batch 1)** on public pages (no sign-in needed): savings runway, emergency fund, sinking fund, 50/30/20 split. Hub at `/calculators/`; text in `core/seo.py` (`CALCULATORS`), forms in `templates/calc/`, math in `static/js/calc.js`. Uses show on the admin page | Tools attract backlinks and repeat visits, and AI assistants recommend them | ~1–2 hrs each |
| ✅ | 5 | **Multi-currency support**: 20 currencies (INR, USD, GBP, EUR, AED, SGD and others), picked during setup (guessed from time zone) and changeable in Settings. Code in `static/js/currency.js` | Makes the global pages credible for visitors outside India | ~half a day |
| ✅ | 6 | **`lastmod` dates in the sitemap**: each page's date is when its content last changed, taken from the IndexNow job (`IndexNowPage.pinged_at`); code in `sitemap_xml` in `core/views.py` | Helps crawlers spot updated pages | ~10 min |
| ✅ | 7 | **Product screenshots** on the homepage and guides (with alt text) — `month-overview.{webp,png}` and `transactions-sheet.{webp,png}` live on homepage and all 15 guides (`GUIDE_SHOTS` in `core/seo.py`) | Ranks in image search and makes the pages more convincing | ~30 min, once screenshots exist |
| ⬜ | 8 | **Hindi versions** of the homepage and the India guide (`/hi/`, `/hi/budget-planner-india/` with `hreflang="hi-IN"`) | Reaches Hindi searchers, where there is very little quality competition | ~2 hrs |
| ✅ | 9 | **Page-speed & Technical SEO polish**: resized header icon (`73 KB` → `7.5 KB`), public page caching (`Cache-Control` + `Vary: Cookie`), `manifest.webmanifest`, context-aware `en-IN` vs `en` locale/`hreflang` tags, `Article` + `AboutPage` + `ContactPage` + `Privacy` FAQ JSON-LD schemas, and bidirectional guide ↔ calculator internal links | Faster loads, richer Google snippets, and stronger internal link equity | ~30 min |
| ⬜ | 10 | **Free calculators (Batch 2)**: FIRE number & Coast FIRE calculator, EMI affordability & prepayment calculator, First-salary / in-hand paycheck splitter (details below) | Captures high-volume "calculator" searches in India and globally with high dwell time | ~1 hr each |
| ✅ | 11 | **Worked numerical example tables & comparison tables on guides** (live on all 15 guides in `core/seo.py` and rendered in `templates/guide.html`) | Google pulls structured HTML `<table>` rows directly into Featured Snippets and AI Overviews | ~1–2 hrs |
| ✅ | 12 | **Downloadable `.xlsx` & `.csv` budget templates** on `/indian-household-budget-template/` and `/excel-budget-alternative/` (`static/templates/indian-household-budget-template.xlsx` & `monthly-budget-template.csv`, plus 1-click sample import in Import tab) | Ranks for high-volume "budget template excel download" searches and converts spreadsheet users | ~1 hr |
| ⬜ | 13 | **Batch 2 guide pages** targeting competitor comparisons & life events (list below) | Captures high-intent "vs" and life-stage searches | ~15 min per page |
| ✅ | 14 | **Interactive "Try Live Demo (No Sign-In)" mode** (`/app?demo=1` and `/demo/` with 9 months of sample data across all tabs, themes and settings; code in `static/js/demo.js`, `store.js`, `app.js`) | Lets search visitors explore a pre-filled household budget before signing up; lowers bounce rate and increases conversion | ~2–3 hrs |

---

### Guide page ideas — Batch 1 (10 of 10 done ✅)

**India**
1. ✅ **Budget App Without SMS Access** (`/budget-app-without-sms-india/`) — targets "budget app in India that doesn't read SMS", "Walnut / Axio alternative without SMS permission", "expense tracker without Account Aggregator".
2. ✅ **Salary Budget Planner for First-Job Earners** (`/first-salary-budget-planner-india/`) — targets "how to budget first salary in India", "monthly salary split for freshers", "in-hand salary vs CTC budget".
3. ✅ **How to Plan for EMIs and Stay Debt-Free** (`/emi-budget-planner-india/`) — targets "how much of salary should go to EMI", "managing home loan car loan EMI budget", "prepay loan vs invest".
4. ✅ **Planning for Diwali, Festivals & Wedding Expenses** (`/festival-wedding-budget-planner-india/`) — targets "Diwali budget planner", "how to save for Indian wedding expenses", "festival expense planning".
5. ✅ **How Much to Save for a Child's Education in India** (`/child-education-savings-planner-india/`) — targets "how to plan for child school and college fees in India", "education inflation India planner".
6. ✅ **Monthly Household Budget Template (India)** (`/indian-household-budget-template/`) — targets "monthly household budget template India Excel", "family budget format in rupees".

**Global**
7. ✅ **Private Alternatives to YNAB, Mint & Monarch** (`/private-ynab-mint-alternative/`) — targets "private alternative to YNAB", "budget app without Plaid or bank sync", "free encrypted alternative to Mint".
8. ✅ **Budgeting with Irregular or Freelance Income** (`/freelance-irregular-income-budget/`) — targets "how to budget with irregular income", "freelancer cash flow planner", "variable income budget".
9. ✅ **FIRE Number & Early Retirement Runway Planner** (`/fire-retirement-runway-planner/`) — targets "how long will my savings last in retirement", "FIRE runway calculator with real spending", "coast FIRE / barista FIRE cash flow".
10. ✅ **Sinking Funds Explained (with Examples)** (`/sinking-funds-guide/`) — targets "what is a sinking fund", "sinking fund categories list", "how many sinking funds should I have".

*(Original 5 guides also live: `/budget-planner-india/`, `/excel-budget-alternative/`, `/private-expense-tracker/`, `/savings-runway-calculator/`, `/annual-expenses-planner/`.)*

---

### Detailed New Suggestions for Google Search & AI Overviews

#### A. Batch 2 Free Interactive Calculators (Task #10)
Interactive calculators have some of the highest organic click-through rates, lowest bounce rates, and strongest backlink potential on Google:
1. ⬜ **FIRE Number & Coast FIRE Calculator** (`/calculators/fire-number/`)
   - **Targets**: "FIRE calculator India", "FIRE number calculator with inflation", "Coast FIRE calculator", "25x vs 33x retirement rule calculator".
   - **What it does**: Takes monthly spending + annual lumpy bills (insurance, school fees, travel), current corpus, expected return, and inflation; outputs 25× (4% SWR) and 33× (3% SWR) FIRE targets, Coast FIRE number, and years to reach FIRE.
   - **Cross-links**: `/fire-retirement-runway-planner/` and `/savings-runway-calculator/`.
2. ⬜ **EMI Affordability & Loan Prepayment Calculator** (`/calculators/emi-prepayment/`)
   - **Targets**: "how much EMI can I afford on my salary", "home loan prepayment calculator India", "1 extra EMI per year calculator", "EMI to salary ratio calculator".
   - **What it does**: Shows total EMI % of take-home pay (safe <30%, caution 30–40%, stretched >40%) and calculates how many months and how much interest you save by paying 1 extra EMI a year or adding ₹5,000/month.
   - **Cross-links**: `/emi-budget-planner-india/` and `/budget-planner-india/`.
3. ⬜ **First-Salary / In-Hand Paycheck Splitter** (`/calculators/salary-split/`)
   - **Targets**: "how to split 30k / 50k / 1 lakh salary in India", "in hand salary budget calculator", "monthly salary allocation calculator".
   - **What it does**: Takes monthly in-hand pay + city tier / living setup (living with parents, PG/shared flat, family rent/EMI) and outputs a realistic rupee/dollar breakdown across Fixed Needs, Annual Sinking Funds, Emergency Fund, SIPs, and Guilt-Free Wants.
   - **Cross-links**: `/first-salary-budget-planner-india/` and `/indian-household-budget-template/`.

#### B. Worked Example Tables & Comparison Tables on Guides (Task #11 — Done ✅)
Google Search's **Featured Snippets** and **AI Overviews** heavily favor pages that include clean HTML `<table>` summaries and concrete numerical examples:
1. ✅ **Added structured HTML `<table class="compare">` to all 15 guides** (`"table"` field in `GUIDES` in `core/seo.py` rendered by `templates/guide.html`):
   - `/budget-planner-india/` & `/indian-household-budget-template/`: Worked ₹1,20,000 and ₹1,50,000/month family budget tables (Fixed commitments, Day-to-day living, Monthly share of annual bills, SIPs/Investments, Net surplus).
   - `/first-salary-budget-planner-india/`: Sample splits for ₹50,000 and ₹80,000 in-hand monthly salaries.
   - `/emi-budget-planner-india/`: Worked ₹1,50,000 salary EMI burden table (before vs after closing car & card EMIs).
   - `/sinking-funds-guide/`, `/annual-expenses-planner/` & `/festival-wedding-budget-planner-india/`: Worked annual sinking fund schedules showing Yearly Bill vs Monthly Set-Aside (`÷ 12`).
   - `/private-ynab-mint-alternative/`, `/excel-budget-alternative/`, `/private-expense-tracker/` & `/budget-app-without-sms-india/`: Side-by-side feature, privacy & price comparison tables.
   - `/fire-retirement-runway-planner/`, `/savings-runway-calculator/`, `/child-education-savings-planner-india/` & `/freelance-irregular-income-budget/`: Worked multi-scenario runway, college-inflation, and uneven-cash-flow tables.

#### C. Downloadable `.xlsx` & `.csv` Household Budget Templates (Task #12 — Done ✅)
1. ✅ **Free downloadable spreadsheet templates** (`/static/templates/indian-household-budget-template.xlsx` and `/static/templates/monthly-budget-template.csv`, generated by `scripts/make_templates.py`)
   - **Why it helps**: Thousands of people search *"monthly household budget template excel free download"* or *"family budget format in rupees excel"*. Giving them a clean, zero-email-gate `.xlsx` / `.csv` download on `/indian-household-budget-template/` and `/excel-budget-alternative/` wins top rankings, and the file itself imports into PlannedOut in one click from the Import tab (`#imp-sample`).

#### D. Batch 2 Guide Page Ideas (Task #13)
1. ⬜ **Walnut / Axio & Fold Alternative in India** (`/walnut-axio-fold-alternative-india/`) — targets "Walnut app alternative India", "Axio expense tracker alternative without SMS", "Fold money alternative without Account Aggregator".
2. ⬜ **Couples & Newlywed Joint Budget Planner** (`/couples-joint-budget-planner/`) — targets "how to budget as a couple", "combining finances after marriage India", "yours mine ours budget template".
3. ⬜ **Career Break, Layoff & Sabbatical Money Planner** (`/layoff-sabbatical-money-planner/`) — targets "how to plan finances for a sabbatical", "layoff survival budget calculator", "how much money do I need to take a 6 month break".
4. ⬜ **Zero-Based Budgeting vs 50/30/20 vs Cash-Flow Planning** (`/zero-based-budget-vs-cash-flow-planner/`) — targets "zero based budgeting alternative", "why envelope budgeting feels too strict", "cash flow budgeting method".

#### E. Interactive "Try Live Demo" Without Signing In (Task #14 — Done ✅)
1. ✅ **1-click interactive demo mode from the homepage, header, login page, calculators & guides** (`/app?demo=1` and `/demo/`)
   - **Why it helps**: Visitors arriving from Google Search can immediately explore a realistic 9-month pre-loaded household budget across every screen (Month, Year, Insights, Projections, Accounts, Savings, Import, and Settings including all themes, custom theme editor, screen transitions, currency, recovery keys, and lock/unlock — without the Admin tab). All edits work in browser memory with a 1-click "Reset sample data" button and "Sign up free" CTA.

---

## What you can do now

1. ✅ **Request indexing**
   - ✅ Google Search Console: submitted homepage, About, Contact and initial 5 guides.
   - ✅ Google Search Console: URL Inspection → "Request indexing" done for `/features/`, `/themes/`, `/changelog/`, the **10 newer guides** (`/budget-app-without-sms-india/`, `/emi-budget-planner-india/`, `/private-ynab-mint-alternative/`, `/fire-retirement-runway-planner/`, `/first-salary-budget-planner-india/`, `/festival-wedding-budget-planner-india/`, `/child-education-savings-planner-india/`, `/indian-household-budget-template/`, `/freelance-irregular-income-budget/`, `/sinking-funds-guide/`) and **5 calculator URLs** (`/calculators/`, `/calculators/savings-runway/`, `/calculators/emergency-fund/`, `/calculators/sinking-fund/`, `/calculators/50-30-20-budget/`).
   - ✅ Bing: automatic via IndexNow on every deploy (run `python manage.py indexnow --all` once to resend every page).
   - 🟡 Google index check: Admin → **Indexing** lists pages Google hasn't indexed (Search Console URL Inspection API, `core/gsc.py`). Runs after a deploy when the last check is over 6 days old, or via "Check now". Needs `GSC_SERVICE_ACCOUNT_JSON` set on Render (steps at the top of `core/gsc.py`).
2. ⬜ **Set `SITE_URL` on Render** if the live domain isn't exactly `https://plannedout.in`.
3. ⬜ **Create free listings:**
   - Product Hunt (plan a launch day)
   - AlternativeTo: list it as an alternative to Walnut, Money Manager, YNAB, Mint, Monarch Money, Goodbudget and Excel templates
   - Indie Hackers, SaaSHub, BetaList, Uneed, TinyLaunch
4. ✅ **Social profiles set up** and first posts published ([X](https://x.com/pravaha_AI/status/2115730410462404767), [LinkedIn](https://lnkd.in/p/eev7x83G), [Instagram](https://www.instagram.com/p/DfEtrKVBdR1/)):
   - [X @pravaha_AI](https://x.com/pravaha_AI) · [LinkedIn](https://www.linkedin.com/in/pravah-ai-6a2a10447/) · [Instagram @pravaha.ai](https://www.instagram.com/pravaha.ai/)
   - On the site: `SOCIALS` / `LAUNCH_POSTS` in `core/seo.py` feed `sameAs` in the `Organization` JSON-LD, both footers, [About → Follow us](https://plannedout.in/about/#follow), Contact, `llms.txt` and `twitter:site`.
   - ⬜ Put `https://plannedout.in` in each profile's bio/website field. In posts, deep-link to sections, e.g. [/features/#security](https://plannedout.in/features/#security), a calculator, or [/about/#follow](https://plannedout.in/about/#follow).
5. ⬜ **Ask friends and early users to try it** and talk about it. Real mentions beat anything else.

## What to do later (ongoing)

**Weekly, for the first 2 months**
- Check Search Console → Pages for "Crawled – not indexed" or "Duplicate" errors, and send them to Claude to fix.
- Check Search Console → Performance for which searches you show up for. Turn the promising ones into new guide pages.

**Monthly**
- Write helpful answers on Reddit and Quora, mentioning PlannedOut only where it fits:
  - Reddit: r/personalfinanceindia, r/IndiaInvestments, r/FIRE, r/financialindependence, r/povertyfinance, r/ynab
  - Quora: "best budget app in India", "budget app that doesn't read SMS", "how long will my savings last"
- Ask ChatGPT, Gemini, Claude and Perplexity questions like "private budget app India no SMS" or "Excel-like budget planner with projections". Note whether PlannedOut shows up, and what does show up instead.
- Add 2–4 new guide pages or blog posts.

**After 3 months**
- Pitch personal-finance bloggers, YouTubers and newsletters, in India and globally, for reviews or mentions.
- Write guest posts on finance blogs that link back to the site.
- Look into a small Google or Bing Ads test for the best-converting search terms, to learn faster.
- Revisit the homepage wording based on which searches bring sign-ups.

## How to tell it's working

| Metric | Where | 3-month target |
|--------|-------|----------------|
| Pages indexed | Search Console / Bing | All public pages |
| Search impressions | Search Console → Performance | Growing every week |
| Clicks from search | Search Console | First steady daily clicks |
| AI mentions | Ask the assistants monthly | Named for at least 1–2 niche questions |
| Sign-ups from search | App sign-up count | Track month over month |
