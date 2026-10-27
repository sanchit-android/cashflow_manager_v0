# SEO and AI-search improvements

Goal: get PlannedOut found on Google and Bing, and recommended by AI assistants (ChatGPT, Gemini, Claude, Copilot, Perplexity), for Indian and global audiences.

## Already done

- ✅ Bigger homepage: key benefits, comparison table, sections for different kinds of users, how it works, FAQ
- ✅ 9 guide pages: Budget planner for India, Excel budget alternative, Private expense tracker, Savings runway planner, Annual expenses planner, Budget app without SMS (India), EMI & debt-free planner, Private YNAB & Mint alternative, FIRE & retirement planner
- ✅ About and Contact pages
- ✅ `robots.txt`, `sitemap.xml`, `llms.txt` (summary for AI assistants)
- ✅ Structured data (JSON-LD) on public pages: app details, FAQ, breadcrumbs
- ✅ Page descriptions, canonical URLs and link-preview tags on every page; login and app pages hidden from search
- ✅ Site verified in Google Search Console and Bing Webmaster Tools; sitemap submitted

All page text lives in `core/seo.py`.

---

## What Claude can do (code changes)

| Status | # | Task | Why it helps | Effort |
|---|---|------|--------------|--------|
| ✅ | 1 | **IndexNow**: ping Bing (and Yandex, Seznam) whenever a page changes. Runs ~45s after each Render start (`python manage.py indexnow`); only changed pages are sent. Code in `core/indexnow.py` | Bing indexes changes within hours. ChatGPT search and Copilot draw heavily on Bing. | ~10 min |
| ✅ | 2 | **Social preview image** (1200×630) used for `og:image` and `twitter:image`. File: `static/img/og-image.png`; rebuild with `python scripts/make_og_image.py` | Better-looking links on WhatsApp, LinkedIn and X, so more people click | ~20 min |
| 🟡 | 3 | **More guide pages** for long, specific searches (list below — 4 of 10 done) | Each brings steady traffic from specific questions; AI tools quote pages that answer one clear question | ~15 min per page |
| ✅ | 4 | **Free calculators** on public pages (no sign-in needed): savings runway, emergency fund, sinking fund, 50/30/20 split. Hub at `/calculators/`; text in `core/seo.py` (`CALCULATORS`), forms in `templates/calc/`, math in `static/js/calc.js`. Uses show on the admin page | Tools attract backlinks and repeat visits, and AI assistants recommend them | ~1–2 hrs each |
| ✅ | 5 | **Multi-currency support**: 20 currencies (INR, USD, GBP, EUR, AED, SGD and others), picked during setup (guessed from time zone) and changeable in Settings. Code in `static/js/currency.js` | Makes the global pages credible for visitors outside India | ~half a day |
| ✅ | 6 | **`lastmod` dates in the sitemap**: each page's date is when its content last changed, taken from the IndexNow job (`IndexNowPage.pinged_at`); code in `sitemap_xml` in `core/views.py` | Helps crawlers spot updated pages | ~10 min |
| ⬜ | 7 | **Product screenshots** on the homepage and guides (with alt text) | Ranks in image search and makes the pages more convincing | ~30 min, once screenshots exist |
| ⬜ | 8 | **Hindi versions** of the homepage and the India guide (with `hreflang`) | Reaches Hindi searchers, where there is little competition | ~2 hrs |
| ⬜ | 9 | **Page-speed check** (Lighthouse): image sizes, caching headers | Speed is part of how Google ranks pages | ~30 min |

### Guide page ideas (work in chunks)

**India**
1. ✅ **Budget App Without SMS Access** (`/budget-app-without-sms-india/`) — targets "budget app in India that doesn't read SMS", "Walnut / Axio alternative without SMS permission", "expense tracker without Account Aggregator".
2. ⬜ **Salary Budget Planner for First-Job Earners** (`/first-salary-budget-planner-india/`) — targets "how to budget first salary in India", "monthly salary split for freshers", "in-hand salary vs CTC budget".
3. ✅ **How to Plan for EMIs and Stay Debt-Free** (`/emi-budget-planner-india/`) — targets "how much of salary should go to EMI", "managing home loan car loan EMI budget", "prepay loan vs invest".
4. ⬜ **Planning for Diwali, Festivals & Wedding Expenses** (`/festival-wedding-budget-planner-india/`) — targets "Diwali budget planner", "how to save for Indian wedding expenses", "festival expense planning".
5. ⬜ **How Much to Save for a Child's Education in India** (`/child-education-savings-planner-india/`) — targets "how to plan for child school and college fees in India", "education inflation India planner".
6. ⬜ **Monthly Household Budget Template (India)** (`/indian-household-budget-template/`) — targets "monthly household budget template India Excel", "family budget format in rupees".

**Global**
7. ✅ **Private Alternatives to YNAB, Mint & Monarch** (`/private-ynab-mint-alternative/`) — targets "private alternative to YNAB", "budget app without Plaid or bank sync", "free encrypted alternative to Mint".
8. ⬜ **Budgeting with Irregular or Freelance Income** (`/freelance-irregular-income-budget/`) — targets "how to budget with irregular income", "freelancer cash flow planner", "variable income budget".
9. ✅ **FIRE Number & Early Retirement Runway Planner** (`/fire-retirement-runway-planner/`) — targets "how long will my savings last in retirement", "FIRE runway calculator with real spending", "coast FIRE / barista FIRE cash flow".
10. ⬜ **Sinking Funds Explained (with Examples)** (`/sinking-funds-guide/`) — targets "what is a sinking fund", "sinking fund categories list", "how many sinking funds should I have".

*(Note: 50/30/20 budget calculator, Emergency fund calculator, and Sinking fund calculator are already live under `/calculators/`.)*

---

## What you can do now

1. 🟡 **Request indexing** (in progress)
   - ✅ Google Search Console: use URL Inspection → "Request indexing" on the homepage, About, Contact and the 5 guide pages.
   - 🟡 Bing Webmaster Tools: use "Submit URLs" for the same pages. Partly done; submit the remaining pages.
2. ⬜ **Set `SITE_URL` on Render** if the live domain isn't exactly `https://plannedout.in`.
3. ⬜ **Create free listings:**
   - Product Hunt (plan a launch day)
   - AlternativeTo: list it as an alternative to Walnut, Money Manager, YNAB, Mint, Goodbudget and Excel templates
   - Indie Hackers, SaaSHub, BetaList
4. ⬜ **Set up social profiles** on X, LinkedIn and Instagram, all linking to the site. Search engines and AI tools use these to confirm the brand is real.
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
