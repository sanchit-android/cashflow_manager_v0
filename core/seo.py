"""Public, indexable content: guide pages, FAQ, and structured data (JSON-LD) for search and AI engines.

Each guide targets what people actually type into Google or ask ChatGPT / Gemini / Claude.
Keep every claim true to what the app does today.
"""
import json

from django.utils.safestring import mark_safe

NAME = "PlannedOut"
TAGLINE = "Private cash-flow planner: spreadsheet-style entry, real analytics, future projections, encrypted data"

# The core benefits, reused on the landing page and in llms.txt.
BENEFITS = [
    ("Easy as a spreadsheet",
     "Type into an Excel-like grid: formulas like =1200+340, copy-paste from Excel or Google Sheets, "
     "fill-down, undo. Bring your old sheet with you: import .xlsx or CSV files and bank statements."),
    ("Analytics that answer real questions",
     "Each month gets a clear verdict: did it add to your savings or eat into them? See fixed vs day-to-day "
     "spending, categories trending up, top merchants, savings rate and a full year at a glance."),
    ("See your future, not just your past",
     "Project your savings year by year until any year you choose. See how many months your money lasts, "
     "and try what-ifs: cut spending 20%, drop a commitment, add income."),
    ("Your data stays yours",
     "Everything is encrypted in your browser (AES-256) before it is saved. We never have your key, so we "
     "can't read your amounts. No bank login, no SMS reading, no ads. Delete everything in one click."),
    ("Built for big yearly bills",
     "School fees, insurance premiums, property tax and subscriptions are kept apart from day-to-day "
     "spending, so one expensive month doesn't hide your real trend."),
    ("Free, no install",
     "Works in any modern browser on laptop or phone. Sign in with Google or an email code. "
     "Five themes, including one that looks like Excel."),
]

HOME_FAQ = [
    ("What is PlannedOut?",
     "PlannedOut is a free, private cash-flow and budget planner that works like a spreadsheet. You enter "
     "income and spending month by month, and it tells you whether each month added to your savings or ate "
     "into them, shows spending analytics, and projects how your savings will grow or how long they will last."),
    ("Is PlannedOut free?", "Yes. It is free to use, with no ads."),
    ("Can PlannedOut see my financial data?",
     "No. Your entries are encrypted in your browser with a key made from your vault passphrase, which is "
     "never sent to us. The server only stores scrambled data. We can see your email address and how many "
     "records you have, but not amounts, names, categories or balances."),
    ("Do I need to link my bank account or allow SMS access?",
     "No. PlannedOut never asks for bank logins, account aggregator consent or SMS permissions. You type "
     "entries, paste them, or import a CSV / Excel file that you downloaded yourself."),
    ("Can I import my existing Excel budget?",
     "Yes. You can import .xlsx and CSV files, including a workbook with one sheet per month and bank "
     "statement exports. The file is read inside your browser and never uploaded as-is."),
    ("Is it a good budget app for India?",
     "Yes. It shows amounts in rupees with Indian digit grouping (₹1,00,000) and is built around how Indian "
     "households spend: salary credit, EMIs, rent, SIPs, school fees, insurance premiums and festival spending."),
    ("How is this different from an expense tracker?",
     "Most expense trackers look backwards. PlannedOut also looks forward: it separates fixed commitments, "
     "day-to-day spending and annual bills, then projects your savings into future years and shows how many "
     "months your money would last if income stopped."),
    ("What happens if I forget my passphrase?",
     "Use one of your recovery keys. If you lose the passphrase and every recovery key, nobody can decrypt "
     "the data, including us. That is the trade-off for real privacy."),
]

GUIDES = {
    "budget-planner-india": {
        "title": "Monthly Budget Planner for Indian Households (Free, Private)",
        "h1": "A monthly budget planner built for how Indian households spend",
        "description": "Free household budget planner for India. Track salary, EMIs, rent, SIPs, school fees and "
                       "insurance premiums in rupees, see if each month adds to your savings, and keep your data encrypted.",
        "nav": "Budget planner for India",
        "intro": "Salary comes in on the 1st, EMIs and SIPs go out on fixed dates, school fees and the LIC or health "
                 "insurance premium arrive once a year, and Diwali or a wedding blows up one month. A generic "
                 "budget app treats all of that the same. PlannedOut doesn't.",
        "sections": [
            ("Everything a typical Indian month includes",
             ["Salary, bonus, rental income, freelance or business income",
              "Home loan, car loan and personal loan EMIs, credit card bills",
              "Rent, maintenance, electricity, gas, broadband, mobile recharges",
              "Household help, driver, cook and other staff salaries",
              "SIPs, PPF, NPS, RD and other investments, kept apart from spending",
              "Groceries, dining out, fuel, shopping, medical and family support"]),
            ("Big yearly bills, planned ahead",
             ["School and college fees, coaching and uniform costs",
              "Term, health, motor and LIC premiums",
              "Property tax, advance tax, vehicle servicing",
              "Diwali, weddings, travel and festival spending",
              "See them in an annual calendar so they never surprise you"]),
            ("Answers you get every month",
             ["Did this month add to savings or eat into them, in ₹",
              "Fixed commitments vs day-to-day vs annual vs one-off",
              "Which categories are creeping up compared to the last six months",
              "Savings rate and a year-at-a-glance view",
              "How your savings grow by the year you plan for, like a child's education or retirement"]),
        ],
        "faq": [
            ("What is a good monthly budget for a family in India?",
             "There is no single number. A useful check is your savings rate: what share of take-home pay is "
             "left after all spending, including the monthly share of yearly bills. PlannedOut calculates this for you."),
            ("How do I plan for school fees and insurance premiums?",
             "Mark them as annual items. PlannedOut keeps them apart from day-to-day spending and shows how "
             "much they add up to in a year, so you can set money aside every month."),
            ("Does it read my SMS or connect to my bank?",
             "No. You stay in control: type, paste or import your own statements. Nothing is pulled from your phone or bank."),
        ],
    },
    "excel-budget-alternative": {
        "title": "Excel Budget Template Alternative: Spreadsheet Feel, Automatic Analytics",
        "h1": "Love your budget spreadsheet? Keep the feel, lose the maintenance.",
        "description": "An alternative to Excel and Google Sheets budget templates. Spreadsheet-style entry with "
                       "formulas and paste, plus automatic monthly verdicts, trends and savings projections. Import your .xlsx.",
        "nav": "Excel budget alternative",
        "intro": "Spreadsheets are fast to type into, but every new month means copying tabs, fixing formulas and "
                 "building charts again. PlannedOut keeps the grid and does the rest for you.",
        "sections": [
            ("What feels the same as Excel",
             ["Arrow keys, Tab and Enter to move between cells",
              "Formulas in any amount cell, like =450*3 or =1200+340",
              "Copy and paste blocks of rows straight from Excel or Google Sheets",
              "Fill down, undo and redo",
              "An optional Excel-style green theme"]),
            ("What you no longer build by hand",
             ["Monthly totals and a clear surplus or shortfall verdict",
              "Year view across all twelve months",
              "Category trends and top merchants",
              "Savings projection to any future year, and a 'how long will my money last' number",
              "What-if sliders for cutting spending or adding income"]),
            ("Bring your existing sheet",
             ["Import .xlsx workbooks, including one tab per month",
              "Import CSV files and bank statement exports",
              "Files are read in your browser; the raw file is never uploaded"]),
        ],
        "faq": [
            ("Can I import my Excel budget template?",
             "Yes. Import .xlsx or CSV. PlannedOut guesses which columns are date, description and amount, and you can adjust before saving."),
            ("Why not just use Google Sheets?",
             "You can, but a shared cloud sheet is readable by the provider and needs manual upkeep. PlannedOut "
             "encrypts your data before saving and builds the analytics and projections automatically."),
            ("Do formulas work?", "Yes. Amount cells accept simple formulas such as =1200+340 or =450*3."),
        ],
    },
    "private-expense-tracker": {
        "title": "Private Expense Tracker: No Bank Linking, No SMS Reading, Encrypted",
        "h1": "An expense tracker that can't read your expenses",
        "description": "A private, end-to-end encrypted expense and budget tracker. No bank login, no SMS access, "
                       "no ads, no data selling. Your numbers are encrypted in your browser before they are saved.",
        "nav": "Private expense tracker",
        "intro": "Many money apps ask to read your SMS inbox, link your bank accounts or share data with partners. "
                 "PlannedOut is built the other way round: we designed it so that we can't see your finances.",
        "sections": [
            ("How the privacy works",
             ["Your entries are encrypted in your browser with AES-256-GCM",
              "The key comes from your vault passphrase, which never leaves your device",
              "The server stores only scrambled records, plus your email and record counts",
              "Recovery keys let you get back in if you forget your passphrase",
              "A strict content security policy stops third-party scripts from running on the page"]),
            ("What we never ask for",
             ["Bank or net-banking credentials",
              "Account aggregator consent",
              "SMS, contacts or location permissions",
              "Your phone number"]),
            ("You stay in control",
             ["Type, paste or import only what you choose",
              "Delete your account and every record instantly from Settings",
              "No ads and no selling of data"]),
        ],
        "faq": [
            ("Is there a budget app that doesn't read SMS?",
             "Yes. PlannedOut never asks for SMS access. You enter or import transactions yourself."),
            ("Can the company see my transactions?",
             "No. Amounts, descriptions, categories and balances are encrypted before they leave your browser, and we never hold the key."),
            ("What can you see?",
             "Your email address, when you sign in, how many records you have, each record's type and month, and when it changed."),
        ],
    },
    "savings-runway-calculator": {
        "title": "How Long Will My Savings Last? Savings Runway Planner for Career Breaks, FIRE & Retirement",
        "h1": "How long will my savings last?",
        "description": "Plan a career break, sabbatical, job loss, early retirement (FIRE) or retirement. See how "
                       "many months your savings last based on your real spending, with inflation and yearly bills.",
        "nav": "Savings runway planner",
        "intro": "If you are between jobs, on a sabbatical, building a startup, or retired, the question isn't "
                 "'how much can I spend?' but 'how long does my money last?'. PlannedOut answers it from your own "
                 "spending, not a generic rule of thumb.",
        "sections": [
            ("Built from your real numbers",
             ["Monthly burn is calculated from your actual spending minus any regular income",
              "Annual bills like insurance and school fees are added on top",
              "Set how fast spending grows each year (inflation)",
              "Add a yearly holiday budget",
              "Start from your latest balance checkpoint across all accounts"]),
            ("See the outcome",
             ["Months of runway left",
              "Year-by-year savings projection until the year you choose",
              "What-ifs: cut day-to-day spending, drop a fixed cost, add part-time income",
              "Which change extends your runway the most"]),
            ("Who uses this",
             ["People taking a career break or sabbatical",
              "Anyone between jobs after a layoff",
              "Founders and freelancers with uneven income",
              "FIRE and early retirement planners",
              "Retirees living on savings, pension or SWP withdrawals"]),
        ],
        "faq": [
            ("How do I calculate how long my savings will last?",
             "Divide your savings by your monthly burn (spending minus regular income), then adjust for "
             "annual bills and inflation. PlannedOut does this automatically from your own data."),
            ("Can I plan for early retirement or FIRE?",
             "Yes. Set a horizon year, spending growth and annual costs, and see whether your savings last the distance."),
            ("Does it work if I still earn a salary?",
             "Yes. With a salary it shows how much more you can spend each month; living off savings it shows your runway."),
        ],
    },
    "annual-expenses-planner": {
        "title": "Annual Expenses Planner: Plan Yearly Bills, Fees & Premiums (Sinking Funds)",
        "h1": "Stop being surprised by yearly bills",
        "description": "Plan annual and irregular expenses like school fees, insurance premiums, property tax, "
                       "subscriptions and festivals. See the yearly total and the monthly amount to set aside.",
        "nav": "Annual expenses planner",
        "intro": "Most budgets break in the month a big yearly bill lands. PlannedOut keeps annual items apart from "
                 "day-to-day spending so you see them coming and your monthly trend stays honest.",
        "sections": [
            ("Typical annual and irregular expenses",
             ["School and college fees", "Health, term, life and motor insurance premiums",
              "Property tax, advance tax, society charges", "Annual subscriptions and memberships",
              "Festivals, weddings, birthdays and travel", "Car servicing, gadgets and home repairs"]),
            ("How PlannedOut handles them",
             ["Mark any entry as an annual item", "See every one on an annual calendar",
              "Know the yearly total and the monthly share to set aside (a sinking fund)",
              "Grow the annual amount with inflation in your projections"]),
        ],
        "faq": [
            ("What is a sinking fund?",
             "Money you set aside every month for a known future expense, like a yearly premium. Dividing the "
             "yearly total by twelve tells you how much to save each month."),
            ("Why separate annual expenses from monthly spending?",
             "Because one month with a large bill makes spending look out of control, while other months look "
             "too good. Separating them shows your true monthly trend."),
        ],
    },
}


# One illustration per guide section, in section order (templates/illus/<name>.html).
GUIDE_ILLUS = {
    "budget-planner-india": ["india_month", "annual_cal", "verdict"],
    "excel-budget-alternative": ["grid", "year_bars", "import"],
    "private-expense-tracker": ["flow", "never_ask", "control"],
    "savings-runway-calculator": ["burn", "runway", "personas"],
    "annual-expenses-planner": ["annual_cal", "sinking"],
}

# Free calculators on public pages (no sign-in). The math runs in the browser (static/js/calc.js);
# each form lives in templates/calc/<slug>.html.
_PRIVATE = ("Is anything I type saved or sent to you?",
            "No. The calculation runs in your browser and nothing you type leaves your device.")
CALCULATORS = {
    "savings-runway": {
        "title": "Savings Runway Calculator: How Long Will My Savings Last? (Free)",
        "h1": "Savings runway calculator",
        "description": "Free calculator: enter your savings, monthly spending and any income to see how many months "
                       "and years your money lasts, with inflation and returns. No sign-in, nothing leaves your browser.",
        "nav": "Savings runway",
        "intro": "Between jobs, on a sabbatical, building a startup or retired? Enter what you have and what you "
                 "spend, and see the month your savings would run out.",
        "how": ["Each month, spending grows with inflation and is taken from your savings",
                "Any regular income (rent, pension, part-time work) is added back",
                "Whatever is left earns the annual return you entered, spread across the year",
                "Runway is the number of months until savings reach zero (checked up to 100 years)"],
        "faq": [
            ("How do I calculate how long my savings will last?",
             "Divide your savings by your monthly spending minus any regular income. ₹12,00,000 of savings with "
             "₹60,000 a month of spending lasts about 20 months. Inflation shortens that; returns on the money "
             "you have not spent yet lengthen it. This calculator does both, month by month."),
            ("What inflation rate should I use?",
             "Around 5–6% for India and 2–3% for the US, UK or Europe is a reasonable start. Household inflation is "
             "often higher than the official figure if school fees or rent are a big part of your spending."),
            ("What return should I assume on my savings?",
             "Use what the money actually earns: about 3–4% in a savings account, 6–7% in fixed deposits or debt "
             "funds. Be careful assuming stock-market returns on money you will need within a few years."),
            _PRIVATE,
        ],
    },
    "emergency-fund": {
        "title": "Emergency Fund Calculator: How Many Months Do I Need? (Free)",
        "h1": "Emergency fund calculator",
        "description": "Free emergency fund calculator: work out how many months of expenses to keep, your target "
                       "amount, the gap to close and how long it takes to get there. No sign-in needed.",
        "nav": "Emergency fund",
        "intro": "An emergency fund covers your essential costs if income stops or a big bill lands. Enter your "
                 "essential monthly spending and your situation to get a target.",
        "how": ["Target = essential monthly expenses × months of cover",
                "Months of cover is suggested from how steady your income is; you can change it",
                "Gap = target minus what you have already set aside",
                "Time to reach = gap ÷ what you can add each month"],
        "faq": [
            ("How many months of expenses should an emergency fund cover?",
             "A common rule is 3 months with a stable salary and a second earner, 6 months for a single salaried "
             "earner, and 9–12 months if you are self-employed, freelance or in an unstable industry. "
             "Add more if you support dependents or have large EMIs."),
            ("Which expenses count as essential?",
             "Rent or home-loan EMI, other EMIs, groceries, utilities, insurance premiums, school fees, medicines "
             "and transport. Leave out eating out, shopping, holidays and investments like SIPs that can be paused."),
            ("Where should I keep my emergency fund?",
             "Somewhere safe and quick to reach: a savings account, sweep-in fixed deposit or liquid fund. "
             "Not in stocks, and not locked into anything with a long notice period."),
            _PRIVATE,
        ],
    },
    "sinking-fund": {
        "title": "Sinking Fund Calculator: Save Monthly for Big Yearly Bills (Free)",
        "h1": "Sinking fund calculator",
        "description": "Free sinking fund calculator: list upcoming bills like insurance premiums, school fees, "
                       "festivals or a new phone and see how much to set aside each month for each one, and in total.",
        "nav": "Sinking fund",
        "intro": "A sinking fund is money you put aside every month for a bill you know is coming: the insurance "
                 "premium, school fees, Diwali, a wedding, car service or a new laptop. Add your bills below.",
        "how": ["For each bill: (amount − already saved) ÷ months until it is due",
                "A bill due this month needs the full remaining amount now",
                "The total is what to move into savings each month to cover every bill on time"],
        "faq": [
            ("What is a sinking fund?",
             "A pot of money you build in small monthly amounts for a known future expense, so the bill doesn't "
             "wreck one month's budget. A ₹36,000 yearly insurance premium becomes ₹3,000 a month."),
            ("What is the difference between a sinking fund and an emergency fund?",
             "An emergency fund is for surprises, like job loss or a medical bill. A sinking fund is for expenses "
             "you know about in advance. Keep them separate so planned bills don't drain your safety net."),
            ("What should I create sinking funds for?",
             "Insurance premiums, school or college fees, property tax, festivals, weddings, holidays, car or "
             "bike servicing, gadget replacement, annual subscriptions and gifts."),
            _PRIVATE,
        ],
    },
    "50-30-20-budget": {
        "title": "50/30/20 Budget Calculator: Split Income Into Needs, Wants and Savings (Free)",
        "h1": "50/30/20 budget calculator",
        "description": "Free 50/30/20 rule calculator: enter your monthly take-home pay to see how much goes to "
                       "needs, wants and savings, and compare it with what you spend today. No sign-in needed.",
        "nav": "50/30/20 budget",
        "intro": "The 50/30/20 rule splits take-home pay into 50% needs, 30% wants and 20% savings. Enter your "
                 "income to see your split, and optionally what you spend now to see how far off you are.",
        "how": ["Needs (50%): rent or home EMI, groceries, utilities, insurance, school fees, transport, minimum loan payments",
                "Wants (30%): eating out, shopping, entertainment, holidays, subscriptions",
                "Savings (20%): SIPs, PF top-ups, emergency fund, extra loan prepayments",
                "Use take-home pay, after tax and PF deductions, not your CTC"],
        "faq": [
            ("What is the 50/30/20 rule?",
             "A simple budgeting rule: spend 50% of take-home income on needs, 30% on wants and put 20% into "
             "savings or debt repayment. It was popularised by Elizabeth Warren in the book All Your Worth."),
            ("Does the 50/30/20 rule work in India?",
             "It is a useful starting point, but in big cities rent and EMIs often push needs above 50%. Many "
             "households aim for 20–30% savings and squeeze wants instead. Use the calculator to see your real split."),
            ("Should I use gross salary or take-home pay?",
             "Take-home pay: what lands in your bank account after income tax, PF and other deductions."),
            _PRIVATE,
        ],
    },
}
CALC_HUB = {
    "title": "Free Money Calculators: Savings Runway, Emergency Fund, Sinking Fund, 50/30/20",
    "h1": "Free money calculators",
    "description": "Free personal finance calculators that run in your browser: savings runway, emergency fund, "
                   "sinking funds and the 50/30/20 budget rule. No sign-in, nothing you type is sent anywhere.",
}

COMPANY = "Pravaha.AI"
CONTACT_EMAIL = "pravaha.ai@gmail.com"

# Contact form topics: category -> subcategories. "Other" lets people describe anything.
CONTACT_TOPICS = [
    ("Support", ["Can't sign in", "Passphrase or recovery keys", "Importing data", "Something is broken"]),
    ("Feedback", ["Feature request", "Design or usability", "Something I like"]),
    ("Privacy & data", ["Delete my data", "Security report", "Privacy question"]),
    ("Business", ["Partnership", "Press or media"]),
    ("Other", ["Something else"]),
]
CONTACT_TOPIC_VALUES = {f"{c} / {s}" for c, subs in CONTACT_TOPICS for s in subs}


def public_paths():
    """Every page we want search engines to index (used by the sitemap and IndexNow)."""
    return ["/", "/about/", "/contact/", "/privacy/"] + [f"/{slug}/" for slug in GUIDES] + \
        ["/calculators/"] + [f"/calculators/{slug}/" for slug in CALCULATORS]


def _ld(*items):
    """JSON-LD script body. Escapes '<' so content can never close the script tag."""
    data = items[0] if len(items) == 1 else {"@context": "https://schema.org", "@graph": list(items)}
    return mark_safe(json.dumps(data, ensure_ascii=False).replace("<", "\\u003c"))


def _faq(pairs):
    return {"@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in pairs]}


def home_jsonld(site):
    return _ld(
        {"@context": "https://schema.org", "@type": "Organization", "@id": site + "/#org", "name": NAME,
         "url": site + "/", "logo": site + "/static/img/icon-512.png", "email": CONTACT_EMAIL,
         "parentOrganization": {"@type": "Organization", "name": COMPANY, "email": CONTACT_EMAIL,
                                "address": {"@type": "PostalAddress", "addressCountry": "IN"}}},
        {"@type": "WebSite", "@id": site + "/#website", "name": NAME, "url": site + "/", "publisher": {"@id": site + "/#org"},
         "inLanguage": "en-IN"},
        {"@type": "WebApplication", "name": NAME, "url": site + "/", "applicationCategory": "FinanceApplication",
         "operatingSystem": "Any (web browser)", "browserRequirements": "Requires a modern browser with JavaScript",
         "description": TAGLINE, "featureList": [b[0] + ": " + b[1] for b in BENEFITS],
         "offers": {"@type": "Offer", "price": "0", "priceCurrency": "INR"}, "publisher": {"@id": site + "/#org"}},
        _faq(HOME_FAQ),
    )


def guide_jsonld(site, slug, g):
    url = f"{site}/{slug}/"
    return _ld(
        {"@context": "https://schema.org", "@type": "WebPage", "name": g["title"], "url": url,
         "description": g["description"], "isPartOf": {"@id": site + "/#website"}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": NAME, "item": site + "/"},
            {"@type": "ListItem", "position": 2, "name": g["nav"], "item": url}]},
        _faq(g["faq"]),
    )


def calc_jsonld(site, slug, c):
    url = f"{site}/calculators/{slug}/"
    return _ld(
        {"@context": "https://schema.org", "@type": "WebApplication", "name": c["h1"], "url": url,
         "description": c["description"], "applicationCategory": "FinanceApplication",
         "operatingSystem": "Any (web browser)", "isAccessibleForFree": True,
         "offers": {"@type": "Offer", "price": "0", "priceCurrency": "INR"},
         "isPartOf": {"@id": site + "/#website"}, "publisher": {"@id": site + "/#org"}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": NAME, "item": site + "/"},
            {"@type": "ListItem", "position": 2, "name": "Calculators", "item": site + "/calculators/"},
            {"@type": "ListItem", "position": 3, "name": c["h1"], "item": url}]},
        _faq(c["faq"]),
    )


def calc_hub_jsonld(site):
    return _ld(
        {"@context": "https://schema.org", "@type": "CollectionPage", "name": CALC_HUB["title"],
         "url": site + "/calculators/", "description": CALC_HUB["description"], "isPartOf": {"@id": site + "/#website"}},
        {"@type": "ItemList", "itemListElement": [
            {"@type": "ListItem", "position": i, "name": c["h1"], "url": f"{site}/calculators/{slug}/"}
            for i, (slug, c) in enumerate(CALCULATORS.items(), 1)]},
    )
