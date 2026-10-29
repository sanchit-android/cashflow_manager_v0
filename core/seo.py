"""Public, indexable content: guide pages, FAQ, and structured data (JSON-LD) for search and AI engines.

Each guide targets what people actually type into Google or ask ChatGPT / Gemini / Claude.
Keep every claim true to what the app does today.
"""
import json
from pathlib import Path

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
     "15 themes (Excel, dark, Liquid Glass, Metro and more), plus a custom theme builder for your own "
     "colours, font and corner style."),
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
        "table": {
            "heading": "Worked example: monthly budget for a ₹1,20,000 in-hand salary household",
            "intro": "Here is how a salaried family in a metro city splits ₹1,20,000 of monthly take-home pay across fixed commitments, everyday living, a sinking fund for yearly bills, and investments:",
            "headers": ["Bucket", "Monthly (₹)", "Share", "What goes inside"],
            "rows": [
                ["In-hand salary", "₹1,20,000", "100%", "Net bank credit after EPF, professional tax and TDS"],
                ["Fixed monthly commitments", "₹42,000", "35%", "Rent or home EMI (₹28,000), society maintenance (₹3,500), househelp & cook (₹5,500), broadband & mobile (₹2,000), parents' support (₹3,000)"],
                ["Day-to-day expenses", "₹28,000", "23%", "Groceries & milk (₹12,000), electricity & gas (₹3,500), fuel & metro (₹4,500), dining out & shopping (₹5,000), medical & pharmacy (₹3,000)"],
                ["Annual bills set-aside (1/12th)", "₹14,000", "12%", "Health & term insurance (₹36,000/yr), school annual fees (₹60,000/yr), Diwali & travel (₹72,000/yr) = ₹1,68,000/yr"],
                ["Investments (SIPs & PPF)", "₹25,000", "21%", "Equity mutual fund SIPs (₹18,000), PPF / Sukanya Samriddhi (₹7,000)"],
            ],
            "foot": ["Net monthly cash surplus", "+₹11,000", "9% (+21% invested = 30% total savings rate)", "Stays in bank / emergency buffer; full wealth added = ₹36,000/mo"],
        },
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
        "templates": True,
        "table": {
            "heading": "Excel / Google Sheets vs PlannedOut",
            "intro": "Keep the speed of keyboard cells and formulas while dropping the monthly copy-paste maintenance:",
            "headers": ["Task", "Manual Excel / Sheets template", "PlannedOut"],
            "rows": [
                ["Starting a new month", "Duplicate tab, clear old rows, fix broken SUM references", "Automatic — fixed items repeat in one click"],
                ["Formulas & copy-paste", "Full spreadsheet formulas", "Type =1200+340 or =450*3, paste blocks from Excel, fill-down & undo"],
                ["Credit card vs bank cash flow", "Easy to double-count card spend and bill payments", "Separate card tabs with billed/unbilled tracking"],
                ["Annual bills (insurance, fees)", "Distorts one month's chart unless manually amortised", "Dedicated Annual items bucket & yearly calendar"],
                ["Savings runway & projections", "Requires custom multi-year compound formulas", "Built-in year-by-year projection and what-if sliders"],
                ["Privacy", "Plaintext in cloud drive unless self-hosted", "End-to-end encrypted in your browser (AES-256-GCM)"],
            ],
        },
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
        "table": {
            "heading": "What PlannedOut can and cannot see vs typical expense apps",
            "intro": "Because encryption happens in your browser before any network request is made, our server never receives plaintext financial data:",
            "headers": ["Data point", "Typical bank-linked / SMS app", "PlannedOut"],
            "rows": [
                ["Transaction descriptions & merchants", "Readable on server (used for categorization & ads)", "Encrypted in browser (AES-256-GCM) — unreadable to us"],
                ["Income, expense amounts & account balances", "Stored in plaintext database", "Encrypted in browser — unreadable to us"],
                ["Bank credentials or SMS inbox", "Requires Plaid / Account Aggregator or SMS permission", "Never requested"],
                ["Vault passphrase & encryption key", "Server-managed keys", "Derived in browser via PBKDF2 (600,000 iterations) — never sent"],
                ["Account metadata on server", "Full profile, phone number, device ID, credit offers", "Email address, record count, record type/month, and timestamps only"],
            ],
        },
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
        "title": "Career Break & Sabbatical Money Planner: Your Savings Runway From Real Spending",
        "h1": "Plan a career break, sabbatical or layoff with your real savings runway",
        "description": "Planning a career break, sabbatical, layoff or startup year? Track your real monthly burn, "
                       "yearly bills and balances to see your runway and which cut extends it most.",
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
        "table": {
            "heading": "Worked example: how ₹18,00,000 of savings lasts under different what-ifs",
            "intro": "Suppose you have ₹18,00,000 in accessible savings, ₹55,000/month in regular expenses, and ₹72,000/year in annual insurance and school/tax bills (₹6,000/month equivalent) with 6% annual inflation:",
            "headers": ["Scenario", "Monthly burn (incl. annual bills)", "Part-time / side income", "Net monthly drawdown", "Approximate runway"],
            "rows": [
                ["Baseline career break", "₹61,000/mo", "₹0", "₹61,000/mo", "~27 months (2.2 years)"],
                ["Cut discretionary spend by 20%", "₹50,000/mo", "₹0", "₹50,000/mo", "~33 months (2.7 years)"],
                ["Cut spend 20% + drop ₹10,000 fixed commitment", "₹40,000/mo", "₹0", "₹40,000/mo", "~41 months (3.4 years)"],
                ["Add ₹25,000/mo consulting or rental income", "₹50,000/mo", "₹25,000/mo", "₹25,000/mo", "~62 months (5.1 years)"],
            ],
        },
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
        "table": {
            "heading": "Worked example: turning ₹2,40,000 of yearly bills into a ₹20,000/month sinking fund",
            "intro": "Instead of letting April school fees or October festive expenses wreck those months, break every predictable annual bill into a calm monthly set-aside:",
            "headers": ["Annual expense", "Due month", "Yearly bill", "Monthly set-aside (1/12th)"],
            "rows": [
                ["School annual admission, books & uniforms", "April", "₹60,000", "₹5,000/mo"],
                ["Family floater health insurance premium", "June", "₹30,000", "₹2,500/mo"],
                ["Term life insurance premium", "September", "₹18,000", "₹1,500/mo"],
                ["Property tax & annual society sinking charge", "October", "₹18,000", "₹1,500/mo"],
                ["Diwali gifts, bonuses & festive shopping", "October / November", "₹48,000", "₹4,000/mo"],
                ["Car insurance renewal & annual servicing", "December", "₹24,000", "₹2,000/mo"],
                ["Annual family holiday & flights", "May", "₹42,000", "₹3,500/mo"],
            ],
            "foot": ["Total annual bills", "All year", "₹2,40,000/yr", "₹20,000/mo"],
        },
        "faq": [
            ("What is a sinking fund?",
             "Money you set aside every month for a known future expense, like a yearly premium. Dividing the "
             "yearly total by twelve tells you how much to save each month."),
            ("Why separate annual expenses from monthly spending?",
             "Because one month with a large bill makes spending look out of control, while other months look "
             "too good. Separating them shows your true monthly trend."),
        ],
    },
    "budget-app-without-sms-india": {
        "title": "Budget App in India Without SMS Access or Bank Linking (Private & Encrypted)",
        "h1": "A budget app for India that never reads your SMS inbox",
        "description": "Free budget and expense planner for India that works without SMS permissions, bank logins or "
                       "Account Aggregator consent. Enter, paste or import statements with browser-side encryption.",
        "nav": "Budget app without SMS (India)",
        "intro": "Many Indian expense trackers ask for permission to read your SMS inbox or link your bank accounts "
                 "through an Account Aggregator. That exposes OTPs, bank balances and personal messages. PlannedOut "
                 "gives you a full household budget and cash-flow planner without touching your phone permissions or bank login.",
        "sections": [
            ("What we never ask for",
             ["No SMS reading permission — your OTPs and personal messages stay private",
              "No net-banking login, UPI link or Account Aggregator consent",
              "No phone number, contacts or location access",
              "No credit score checks or loan spam"]),
            ("Fast ways to add your spending without SMS scraping",
             ["Type into an Excel-like monthly grid with formulas like =1200+340",
              "Copy and paste rows straight from Excel, Google Sheets or a bank table",
              "Import .xlsx workbooks or CSV bank statement exports right in your browser",
              "Repeat fixed monthly items (rent, EMIs, SIPs, staff salaries) in seconds"]),
            ("Encrypted before it leaves your device",
             ["Every amount, description and balance is encrypted in your browser with AES-256-GCM",
              "Your key comes from your vault passphrase and is never sent to our servers",
              "Built for Indian households: ₹1,00,000 formatting, EMIs, SIPs and annual bills like school fees"]),
        ],
        "table": {
            "heading": "Comparison: SMS-reading trackers vs Account Aggregator apps vs PlannedOut",
            "intro": "See what access you hand over with each type of Indian money app:",
            "headers": ["Feature / Privacy check", "SMS-scraping expense apps", "Account Aggregator (AA) apps", "PlannedOut"],
            "rows": [
                ["Phone SMS inbox permission", "Required (reads bank alerts & messages)", "Often requested alongside AA", "Never requested"],
                ["Bank login / OTP consent", "Sometimes", "Required to link accounts", "Never requested"],
                ["How transactions are added", "Auto-parsed from SMS alerts", "Pulled from linked bank feeds", "Type, copy-paste from Excel, or import CSV / .xlsx in browser"],
                ["Can the company read your spending?", "Yes — stored in plaintext on server", "Yes — decrypted by the FIU app", "No — encrypted in browser (AES-256-GCM)"],
                ["Personal loan & credit card spam", "Common revenue model", "Common cross-selling", "Zero ads, zero cross-selling"],
            ],
        },
        "faq": [
            ("Which budget app in India works without SMS permission?",
             "PlannedOut works in your browser on phone or laptop and never asks for SMS, contacts or bank access. "
             "You enter, paste or import your own CSV or Excel statements, and everything is encrypted on your device."),
            ("Why do many Indian money apps ask to read SMS?",
             "They parse bank alert messages to auto-log transactions, and many use that financial profile to cross-sell "
             "personal loans, credit cards or insurance. If you prefer not to share your inbox, manual or file-import "
             "budgeting keeps you in control."),
            ("How long does it take to update without auto-sync?",
             "Usually 5 to 10 minutes once a week or at the end of the month, especially if you copy-paste or import a "
             "bank CSV and let fixed items repeat."),
        ],
    },
    "emi-budget-planner-india": {
        "title": "EMI Budget Planner India: Manage Home, Car & Personal Loan EMIs",
        "h1": "Plan your EMIs before they plan your month",
        "description": "See what share of your take-home salary goes to EMIs, separate fixed loan commitments from "
                       "day-to-day spending, and test how finishing or prepaying a loan changes your future savings.",
        "nav": "EMI & debt-free planner",
        "intro": "Between a home loan, a car loan and credit card EMIs, fixed repayments can quietly eat half your "
                 "in-hand salary before the 5th of the month. PlannedOut separates fixed commitments from flexible "
                 "spending and lets you see what happens to your savings when an EMI ends or a new one starts.",
        "sections": [
            ("See your real fixed burden every month",
             ["Track home loan, car loan, education loan and personal loan EMIs under fixed commitments",
              "Keep EMIs separate from groceries, dining out and yearly bills like insurance",
              "See immediately whether a month added to your savings or ate into them after all EMIs",
              "Spot creeping credit card or buy-now-pay-later spending before it becomes another EMI"]),
            ("Test what-ifs before taking or closing a loan",
             ["Use what-if controls in Projections to see the effect of dropping a fixed commitment",
              "Check how many months your savings would cover your EMIs and essentials if income paused",
              "Project your savings year by year to plan prepayments or your debt-free year",
              "Keep investments (SIPs, PPF, EPF) distinct from loan repayments"]),
        ],
        "table": {
            "heading": "Worked example: EMI burden on a ₹1,50,000 in-hand salary (before vs after closing a loan)",
            "intro": "Keeping total EMIs below 30–35% of take-home pay leaves breathing room for annual bills and wealth building. Here is how clearing a ₹16,000 car/personal loan transforms monthly cash flow:",
            "headers": ["Monthly cash-flow line", "With home + car + card EMIs", "After closing car & card EMIs"],
            "rows": [
                ["In-hand salary", "₹1,50,000 (100%)", "₹1,50,000 (100%)"],
                ["Home loan EMI", "₹42,000 (28%)", "₹42,000 (28%)"],
                ["Car loan + credit card EMIs", "₹18,000 (12%)", "₹0 (0%)"],
                ["Total EMI burden (% of take-home)", "₹60,000 (40% — stretched)", "₹42,000 (28% — healthy)"],
                ["Rent/maintenance, groceries, utilities & help", "₹48,000 (32%)", "₹48,000 (32%)"],
                ["Annual bills sinking fund (insurance, school, Diwali)", "₹15,000 (10%)", "₹15,000 (10%)"],
                ["Available for SIPs, prepayment & emergency buffer", "₹27,000/mo (18%)", "₹45,000/mo (30%)"],
            ],
        },
        "faq": [
            ("How much of my salary should go towards EMIs?",
             "A safe thumb rule is to keep all EMIs combined under 30–35% of your monthly take-home pay (and below 40% "
             "even with a home loan), so you still have room for essentials, annual bills and at least 20% savings."),
            ("Should I prepay my loan or invest in a SIP?",
             "Compare the loan's interest rate with the after-tax return you can safely earn, and check your emergency "
             "fund first. High-interest personal or credit card loans should almost always be cleared first. PlannedOut "
             "lets you see how dropping an EMI changes your monthly surplus and multi-year savings."),
            ("How do I stop taking new EMIs for annual expenses?",
             "List predictable yearly costs — insurance premiums, school fees, festivals, travel — as annual items and "
             "set aside a twelfth each month in a sinking fund instead of putting them on no-cost EMIs."),
        ],
    },
    "private-ynab-mint-alternative": {
        "title": "Private Alternative to YNAB, Mint & Monarch: No Plaid, Encrypted, Free",
        "h1": "A private alternative to YNAB and Mint — no bank linking, no subscription",
        "description": "Looking for a budget planner that doesn't use Plaid or charge $100+ a year? PlannedOut gives "
                       "you spreadsheet-speed entry, cash-flow analytics, future projections and end-to-end encryption.",
        "nav": "Private YNAB & Mint alternative",
        "intro": "Most popular budget apps require connecting your bank through Plaid or Finicity, store your "
                 "transactions in plaintext on their servers, and charge $90–$120 a year. PlannedOut is a free, "
                 "end-to-end encrypted cash-flow planner for people who want spreadsheet control without giving up analytics.",
        "sections": [
            ("How PlannedOut compares to YNAB, Mint and Monarch",
             ["Zero-knowledge encryption: entries are encrypted in your browser (AES-256-GCM) with your passphrase",
              "No Plaid, Finicity or open-banking credentials required — import CSV or .xlsx files locally in your browser",
              "Spreadsheet-fast entry with formulas, copy-paste, fill-down and undo",
              "20 currencies supported ($ USD, £ GBP, € EUR, ₹ INR, C$ CAD, A$ AUD, AED, SGD and more)",
              "Free to use, with no ads and no upsells"]),
            ("Cash-flow clarity without rigid envelope micromanagement",
             ["Clear monthly verdict: did this month add to your savings or draw them down?",
              "Separates fixed commitments, day-to-day spending, annual bills (sinking funds) and one-offs",
              "Category trends against your 6-month average and top merchants",
              "Year-by-year savings projections and a savings runway calculator built right in"]),
            ("Bring your existing history",
             ["Import CSV exports from your bank or previous budget app",
              "Import multi-tab Excel (.xlsx) budget workbooks",
              "Files are parsed inside your browser; raw files are never uploaded to our server"]),
        ],
        "table": {
            "heading": "Side-by-side comparison: YNAB vs Monarch Money vs Spreadsheets vs PlannedOut",
            "intro": "How PlannedOut compares to popular subscription budget apps and manual spreadsheets:",
            "headers": ["Feature", "YNAB", "Monarch Money", "Excel / Sheets", "PlannedOut"],
            "rows": [
                ["Annual price", "~$109/year", "~$99/year", "Free – $99/year", "Free"],
                ["Bank linking / Plaid required?", "Encouraged (or manual entry)", "Built around Plaid / Finicity", "No", "Never — zero bank credentials"],
                ["End-to-end encryption (zero-knowledge)", "No — server can read plaintext", "No — server can read plaintext", "No (cloud plaintext)", "Yes — AES-256-GCM in browser"],
                ["Spreadsheet grid with formulas & paste", "No (form-based entry)", "No (feed-based)", "Yes", "Yes (=1200+340, paste, fill-down)"],
                ["Annual bills & sinking funds built in", "Manual category targets", "Rollover budgets", "Manual formulas", "Dedicated Annual bucket & calendar"],
                ["Multi-year projections & runway", "No", "Basic net-worth chart", "Manual formulas", "Built-in projections + what-if sliders"],
                ["Currencies supported", "Single per budget", "Primarily USD / CAD", "Manual formatting", "20 currencies ($, £, €, ₹, C$, A$, etc.)"],
            ],
        },
        "faq": [
            ("Is there a budget app that doesn't require Plaid or bank linking?",
             "Yes. PlannedOut never connects to your bank. You type, paste from a spreadsheet, or import CSV / Excel "
             "files directly in your browser."),
            ("Can PlannedOut read my financial data?",
             "No. Your records are encrypted in your browser before they are sent to our server, using a key derived "
             "from your vault passphrase. We never receive your passphrase or key."),
            ("Does it support multiple currencies?",
             "Yes. You can pick from 20 currencies including USD, EUR, GBP, CAD, AUD, SGD, AED and INR during setup "
             "or in Settings."),
        ],
    },
    "fire-retirement-runway-planner": {
        "title": "FIRE & Retirement Runway Planner: FIRE Number vs Real Cash Flow",
        "h1": "Plan your FIRE number, retirement cash flow and savings runway",
        "description": "Go beyond the generic 4% rule. Model your early retirement (FIRE), Coast FIRE or retirement "
                       "runway using your actual monthly burn, lumpy annual bills, inflation and what-if scenarios.",
        "nav": "FIRE & retirement planner",
        "intro": "Rules of thumb like '25× annual expenses' hide the details that actually make or break early "
                 "retirement: inflation, big yearly bills like health insurance and property tax, and part-time or "
                 "pension income. PlannedOut models your future year by year from your real spending.",
        "sections": [
            ("Why real cash flow beats a static 4% rule",
             ["Separates baseline monthly living costs from fixed commitments that may end (like a mortgage or EMI)",
              "Includes annual and irregular costs — insurance premiums, property taxes, travel, car replacement",
              "Applies annual inflation to your spending and holiday budgets",
              "Factors in ongoing income such as rent, dividends, pensions or Barista / Coast FIRE work"]),
            ("Test every retirement what-if in seconds",
             ["Project your nest egg to any horizon year (e.g. age 60, 75 or 90)",
              "See your exact runway in months and years if you stopped working today",
              "Use interactive sliders to cut discretionary spending by 10–30%, drop a fixed cost or add side income",
              "Compare which single change adds the most years to your runway"]),
            ("Private by design for high-net-worth & FIRE savers",
             ["Your net worth, balances and spending are encrypted in your browser with AES-256-GCM",
              "No bank account linking or wealth-management sales calls",
              "Works in 20 currencies for domestic or expat / geographic-arbitrage planning"]),
        ],
        "table": {
            "heading": "Worked example: static 4% rule vs real cash-flow runway across FIRE styles",
            "intro": "Why modelling monthly living costs, lumpy annual bills, and side/rental income separately gives a much clearer retirement picture:",
            "headers": ["FIRE Scenario", "Monthly living burn", "Annual bills (insurance, tax, travel)", "Ongoing / Barista income", "Net annual drawdown", "25× (4% rule) vs 30× (3.3% safe) target"],
            "rows": [
                ["Lean FIRE (India)", "₹45,000/mo", "₹1,20,000/yr", "₹0", "₹6,60,000/yr", "₹1.65 Cr (25×) · ₹1.98 Cr (30×)"],
                ["Standard Family FIRE (India)", "₹85,000/mo", "₹2,40,000/yr", "₹0", "₹12,60,000/yr", "₹3.15 Cr (25×) · ₹3.78 Cr (30×)"],
                ["Barista / Coast FIRE (India)", "₹85,000/mo", "₹2,40,000/yr", "₹40,000/mo (consulting/rent)", "₹7,80,000/yr", "₹1.95 Cr (25×) · ₹2.34 Cr (30×)"],
                ["Global / US Household FIRE", "$4,500/mo", "$12,000/yr", "$1,500/mo (part-time/rental)", "$48,000/yr", "$1.20M (25×) · $1.44M (30×)"],
            ],
        },
        "faq": [
            ("How do I calculate my FIRE number from my real spending?",
             "Start with your true annual burn: 12 × monthly spending plus all yearly bills (insurance, taxes, travel). "
             "A 4% withdrawal rate corresponds to 25× that annual burn, while a more conservative 3–3.5% rate (often "
             "used for longer early retirements or high-inflation countries) is 28–33×. PlannedOut projects your actual "
             "balances year by year with inflation so you don't have to rely on a single multiplier."),
            ("Can I model Coast FIRE, Barista FIRE or a mini-retirement?",
             "Yes. Add your expected part-time, freelance or rental income alongside your spending and see whether "
             "your savings grow or how slowly they draw down over your chosen time horizon."),
            ("How do I account for health insurance and big yearly bills in retirement?",
             "Mark them as annual items in PlannedOut. They are tracked separately from monthly spending and included "
             "automatically in your annual burn and multi-year runway projections."),
        ],
    },
    "first-salary-budget-planner-india": {
        "title": "First Salary Budget Planner for India: How to Split Your In-Hand Pay (Free)",
        "h1": "Just started earning? Plan your first salary before lifestyle creep sets in",
        "description": "Free first-salary budget planner for freshers and young earners in India. Split in-hand pay "
                       "across rent or PG, family support, SIPs and fun, and see how much you actually save each month.",
        "nav": "First-salary planner (India)",
        "intro": "Your offer letter shows CTC, but your bank account sees in-hand pay after PF, tax and deductions. "
                 "Add PG or flat rent, food delivery, sending money home, a first credit card and a starter SIP, and it "
                 "is easy to reach the 25th wondering where the salary went. PlannedOut gives you a clean monthly sheet "
                 "to split your paycheck and see whether each month builds your savings.",
        "sections": [
            ("Budget from in-hand salary, not CTC",
             ["Start with the exact salary credited to your bank after EPF, professional tax and TDS",
              "Keep fixed monthly costs clear: PG or flat rent, Wi-Fi, commute, education loan EMI and money sent home",
              "Track UPI, dining out, shopping and credit card spending without handing over SMS permissions",
              "Separate investments (first mutual fund SIP, PPF, RD or emergency fund transfer) from expenses"]),
            ("Set up your starter buckets in ten minutes",
             ["Build a 3–6 month emergency fund before locking money into long-term products",
              "Set aside a small monthly sinking fund for annual costs: health or term insurance, travel home for Diwali, a new phone or laptop",
              "Spot creeping subscriptions and weekend spending against your 6-month average",
              "Use an Excel-like grid with formulas like =1200+340 and copy-paste from your bank statement"]),
            ("See your first year of wealth build up",
             ["Every month gets a clear verdict in ₹: how much you added to savings",
              "Project how your savings and SIPs grow over the next 3, 5 or 10 years",
              "Test what-ifs: see how a rent hike, switching jobs or saving 10% more changes your future corpus",
              "Encrypted in your browser (AES-256-GCM) so your salary and savings stay completely private"]),
        ],
        "table": {
            "heading": "Worked example: how to split a ₹50,000 or ₹80,000 in-hand first salary in India",
            "intro": "Always budget from the actual in-hand salary credited to your bank account after EPF and tax:",
            "headers": ["Monthly bucket", "₹50,000 in-hand pay", "₹80,000 in-hand pay", "What it covers"],
            "rows": [
                ["Fixed needs (rent/PG, bills, commute)", "₹20,000 (40%)", "₹28,000 (35%)", "Shared flat or PG rent, electricity, Wi-Fi, metro/fuel, mobile"],
                ["Food, groceries & essentials", "₹6,000 (12%)", "₹9,000 (11%)", "Groceries, cook/tiffin, toiletries, basic medical"],
                ["Family support / education loan EMI", "₹5,000 (10%)", "₹10,000 (13%)", "Sending money home or paying student loan EMI"],
                ["Annual sinking fund (1/12th)", "₹3,000 (6%)", "₹5,000 (6%)", "Health/term insurance, Diwali travel home, phone/laptop upgrade"],
                ["Wants (dining out, shopping, trips)", "₹6,000 (12%)", "₹10,000 (12%)", "Weekend outings, OTT subscriptions, clothes, hobbies"],
                ["Savings & investments (Emergency + SIP)", "₹10,000 (20%)", "₹18,000 (23%)", "Build 3–6 mo liquid emergency fund first, then Nifty 50 / Flexi-cap SIP"],
            ],
            "foot": ["First-year wealth built (12 months)", "₹1,20,000 + interest", "₹2,16,000 + returns", "Plus ₹36,000–₹60,000 ready for annual bills without credit card debt"],
        },
        "faq": [
            ("How should I split my first salary in India?",
             "A practical starting split is the 50/30/20 rule on your in-hand pay: up to 50% on needs (rent/PG, food, "
             "utilities, commute, education loan EMI, family support), 20–30% into savings (emergency fund first, then "
             "SIPs), and the rest on wants. In high-rent cities like Mumbai or Bengaluru, aim to keep savings at 20%+ "
             "even if rent pushes needs higher."),
            ("Why is my in-hand salary lower than my CTC?",
             "CTC (Cost to Company) includes employer PF contributions, gratuity, insurance premiums and variable "
             "bonuses that don't land in your monthly bank credit. Always build your monthly budget from the actual "
             "in-hand amount credited each month."),
            ("How much emergency fund should a fresher build before investing?",
             "Start by parking 3 to 6 months of basic living expenses (rent, food, EMI and family support) in a safe "
             "savings account or liquid fund before committing heavily to equity SIPs."),
        ],
    },
    "festival-wedding-budget-planner-india": {
        "title": "Diwali, Festival & Wedding Budget Planner for India (Sinking Funds in ₹)",
        "h1": "Enjoy Diwali, weddings and family functions without breaking your monthly budget",
        "description": "Plan ahead for Diwali gifts, gold, travel, Rakhi, Eid, Onam and Indian wedding expenses in "
                       "rupees. Keep festival and wedding spending separate from regular monthly bills.",
        "nav": "Festival & wedding planner (India)",
        "intro": "In Indian households, October to February can wipe out six months of careful saving: Diwali gifts and "
                 "staff bonuses, home decor, gold or electronics, travel home, and two or three family weddings. When "
                 "all of that lands inside your regular monthly budget, your numbers look broken and credit card bills "
                 "spike. PlannedOut keeps annual festivals and one-off wedding costs separate so you can plan for them calmly.",
        "sections": [
            ("Every festive and wedding expense, planned in advance",
             ["Diwali shopping, sweets, clothes, home renovation, gold and househelp bonuses",
              "Durga Puja, Eid, Onam, Pongal, Ganesh Chaturthi, Christmas and Rakhi travel and gifting",
              "Attending family weddings: flights, hotels, outfits and cash/shagun gifts",
              "Saving for your own or a child's wedding across jewellery, venue, catering and photography"]),
            ("Turn a big October or wedding bill into a calm monthly amount",
             ["Mark predictable festive budgets as annual items so they sit on your yearly calendar",
              "See the total yearly festive & annual cost and the 1/12th monthly sinking fund to set aside",
              "Log big one-off wedding milestones separately so they don't distort your everyday grocery and utility averages",
              "Track HDFC, ICICI, SBI, Axis or other credit card bills so festive offers never turn into revolving debt"]),
            ("Keep your regular monthly trend honest",
             ["Your month view clearly separates regular expenses, annual items and one-off spending",
              "See whether your year as a whole added to savings even when the Diwali month ran a shortfall",
              "Include yearly festive and travel budgets in your multi-year savings projections"]),
        ],
        "table": {
            "heading": "Worked example: annual festival & family wedding sinking fund in ₹",
            "intro": "Instead of swiping a credit card in October and paying EMIs till March, turn your predictable festive calendar into a monthly sinking fund:",
            "headers": ["Festive / Wedding item", "Typical season", "Planned yearly budget", "Monthly set-aside (1/12th)"],
            "rows": [
                ["Diwali gifts, sweets, clothes & home decor", "October / November", "₹30,000", "₹2,500/mo"],
                ["Househelp, cook, driver & society Diwali bonus", "October / November", "₹12,000", "₹1,000/mo"],
                ["Dhanteras gold coin or Festive electronics upgrade", "October / November", "₹36,000", "₹3,000/mo"],
                ["Rakhi, Eid, Onam, Pongal or Durga Puja travel & gifts", "Aug – Jan", "₹24,000", "₹2,000/mo"],
                ["Attending 2 family weddings (travel, outfits & shagun)", "Nov – Feb", "₹42,000", "₹3,500/mo"],
            ],
            "foot": ["Total festive & wedding sinking fund", "Full year", "₹1,44,000/yr", "₹12,000/mo"],
        },
        "faq": [
            ("How do I budget for Diwali and annual festivals without using credit card EMIs?",
             "Add up what you spent last year on gifts, clothes, bonuses, travel and big purchases, then divide by 12. "
             "Transfer that monthly amount into a separate savings pot (a sinking fund) from April onwards so the cash "
             "is waiting before the festive sales begin."),
            ("How should I track a wedding budget alongside my household expenses?",
             "Mark wedding payments as one-off or annual items in PlannedOut. That way you see every rupee leaving "
             "your bank or card balances, while your regular monthly burn and category averages stay clean."),
            ("Why keep festival and wedding spending separate from monthly expenses?",
             "Because lumping a ₹1,50,000 festive or wedding month into regular spending makes your 6-month average "
             "useless. Separating them shows both your true everyday living cost and your true annual commitments."),
        ],
    },
    "child-education-savings-planner-india": {
        "title": "Child Education Expense & Savings Planner for India: School & College Fees",
        "h1": "Plan for yearly school fees today and college costs tomorrow",
        "description": "Plan child education costs in India: separate annual school admission and tuition fees from "
                       "monthly spending, and project your family savings to your child's college year with inflation.",
        "nav": "Child education planner (India)",
        "intro": "Education is often the fastest-growing cost for an Indian family: monthly tuition and bus fees, big "
                 "April admission and annual charges, coaching classes, and a college corpus waiting ten or fifteen "
                 "years ahead. PlannedOut handles both halves — keeping this year's school bills organised and "
                 "projecting your total savings to the exact year your child starts college.",
        "sections": [
            ("Handle this year's school and coaching costs without April stress",
             ["Track monthly tuition, school bus, hobby classes and tutors under fixed monthly commitments",
              "Mark annual school charges, admission fees, books, uniforms and laptops as annual items",
              "See the full yearly education bill and how much to set aside each month before April arrives",
              "Keep education costs clearly visible in ₹ alongside rent, EMIs and household spending"]),
            ("Project your savings to the year college begins",
             ["Pick your target horizon year (for example 2032 or 2038) in Projections",
              "Model annual inflation on your household and education spending",
              "Test what-ifs: see how increasing your monthly savings rate or finishing a loan EMI builds your college buffer",
              "Track education investments — mutual fund SIPs, PPF, Sukanya Samriddhi or fixed deposits — in dedicated investment tabs"]),
            ("Private family planning in your browser",
             ["All family balances, school fees and investment totals are encrypted in your browser with AES-256-GCM",
              "No bank login, no SMS scraping and no distributor sales calls",
              "Import existing Excel fee trackers or bank CSVs in seconds"]),
        ],
        "table": {
            "heading": "Worked example: planning this year's school fees and a 10-year college corpus",
            "intro": "Separate what is due every month, what lands once a year in April, and what needs compounding for college at 9% education inflation:",
            "headers": ["Education goal", "Timeline", "Cost today", "Projected future cost", "Monthly action in PlannedOut"],
            "rows": [
                ["Monthly school tuition, bus & activity classes", "Every month", "₹10,000/mo", "Grows ~8–9%/yr", "Track under Monthly fixed commitments"],
                ["Annual April school re-admission, books & uniforms", "Due every April", "₹60,000/yr", "₹65,400 next April", "Mark as Annual item → set aside ₹5,000/mo sinking fund"],
                ["Class 11–12 coaching / test prep", "5 years away", "₹2,50,000 total", "~₹3,85,000 in 5 yrs", "Save ₹5,000/mo in conservative hybrid / RD"],
                ["4-year undergraduate degree (India)", "10 years away", "₹15,00,000 today", "~₹35,50,000 in 10 yrs (at 9% inflation)", "Invest ₹15,500/mo via equity MF SIP + PPF/SSY"],
            ],
        },
        "faq": [
            ("What education inflation rate should I plan for in India?",
             "School and college fees in India have historically grown at 8–10% a year, often higher than headline CPI "
             "inflation. When projecting future costs, testing an 8–10% annual growth rate gives a safer buffer."),
            ("How do I stop annual school fees from wrecking April's budget?",
             "Record the annual fee, books and uniform bill as an annual item. Divide that total by 12 and set it aside "
             "every month in a sinking fund so the April payment comes from earmarked savings, not that month's salary."),
            ("Can I track Sukanya Samriddhi, PPF or mutual fund SIPs for my child's education?",
             "Yes. PlannedOut lets you keep investment accounts (ETF/MF, Fixed Savings, PPF/SSY) separate from spending "
             "so transfers into your child's education corpus are counted as savings, not expenses."),
        ],
    },
    "indian-household-budget-template": {
        "title": "Monthly Household Budget Template for India (Excel-Style, in ₹ Rupees)",
        "h1": "An Indian household budget template that updates its own charts",
        "description": "Free Excel-style monthly household budget template for Indian families. Track salary, rent, "
                       "EMIs, groceries, househelp, SIPs and annual bills in ₹1,00,000 format, or import your .xlsx sheet.",
        "nav": "Household budget template (India)",
        "intro": "If you searched for a monthly household budget Excel template in rupees, you probably want a clean "
                 "table for salary, rent, groceries, househelp, EMIs and SIPs — without spending every Sunday fixing "
                 "broken formulas or copying tabs for the new month. PlannedOut gives you that exact spreadsheet grid "
                 "in ₹1,00,000 format, and builds the monthly summary, yearly table and future projections automatically.",
        "sections": [
            ("A ready-made Indian family budget format",
             ["Pre-built structure for Regular income, Monthly fixed commitments, Regular expenses, Annual items and Investments",
              "Indian rupee formatting with lakhs and crores (₹1,00,000) across every table and chart",
              "Dedicated tabs for your main bank account, Indian credit cards (HDFC, ICICI, SBI, Axis) and investments (ETF/MF, FDs)",
              "Fits Indian household categories: rent, society maintenance, househelp & cook salaries, tuitions, groceries, fuel, parents' medical and insurance"]),
            ("Spreadsheet speed, zero formula maintenance",
             ["Type formulas directly in amount cells like =1200+340 or =450*3",
              "Navigate with arrow keys, Tab and Enter; copy-paste rows from Excel or Google Sheets; fill-down and undo",
              "Automatic monthly verdict showing whether the month added to your family savings or drew them down",
              "Automatic 12-month year view, 6-month category trends and multi-year savings projections"]),
            ("Import your existing Excel family budget",
             ["Already have a multi-tab .xlsx household budget or bank CSV? Import it directly in your browser",
              "Raw files never leave your device; every row is encrypted with AES-256-GCM before saving",
              "Switch to the Excel green theme anytime if you love the classic spreadsheet look"]),
        ],
        "templates": True,
        "table": {
            "heading": "Sample Indian household budget template (₹1,50,000 monthly family income)",
            "intro": "Download this exact structure as an .xlsx or .csv file above, or open it directly in the live demo:",
            "headers": ["Kind (PlannedOut column)", "Category", "Sample rows", "Monthly amount (₹)"],
            "rows": [
                ["Regular income", "Salary", "Primary salary (₹1,15,000) + Spouse / secondary income (₹35,000)", "₹1,50,000"],
                ["Monthly fixed", "Rent / Home EMI & Maintenance", "Apartment rent / EMI (₹32,000) + Society maintenance (₹4,000)", "₹36,000"],
                ["Monthly fixed", "Househelps & Utilities", "Cook & maid salary (₹6,000) + Electricity, gas & broadband (₹4,500)", "₹10,500"],
                ["Monthly fixed", "Tuitions & Family", "Child tuition & bus (₹7,500) + Parents' medical/support (₹5,000)", "₹12,500"],
                ["Regular expense", "Groceries, Fuel & Living", "Groceries & milk (₹14,000), Fuel & metro (₹5,000), Dining & pharmacy (₹7,000)", "₹26,000"],
                ["Annual item (1/12th set-aside)", "Insurance, School & Diwali", "Health/Term insurance, April school fees & Diwali (₹1,80,000/yr ÷ 12)", "₹15,000"],
                ["Investment", "SIPs, PPF & Emergency Fund", "Nifty 50 / Flexi-cap SIPs (₹25,000) + PPF (₹10,000)", "₹35,000"],
            ],
            "foot": ["Net monthly cash surplus", "Added to bank buffer", "Total savings + investments = ₹50,000/mo (33% savings rate)", "+₹15,000"],
        },
        "faq": [
            ("What categories should an Indian household budget template have?",
             "A practical Indian household sheet separates: (1) In-hand income, (2) Fixed monthly commitments (rent, "
             "EMIs, society maintenance, househelp salaries, school tuition), (3) Day-to-day living (groceries, "
             "utilities, fuel, medical, dining out), (4) Annual bills (insurance premiums, annual school fees, Diwali, "
             "travel), and (5) Investments (SIPs, PPF, EPF, RD). PlannedOut is structured around these exact buckets."),
            ("Can I import my existing Excel household budget sheet?",
             "Yes. You can import .xlsx workbooks (including one sheet per month) or CSV files right in your browser."),
            ("Does it format numbers in lakhs and crores (₹1,00,000)?",
             "Yes. When your currency is set to INR (₹), all amounts, summaries and projections use Indian digit grouping."),
        ],
    },
    "freelance-irregular-income-budget": {
        "title": "How to Budget with Irregular or Freelance Income: Cash-Flow & Runway Planner",
        "h1": "A cash-flow planner for freelancers, consultants and uneven paychecks",
        "description": "Budgeting with variable, freelance, commission or business income? Track good and lean months, "
                       "separate fixed baseline costs, and always know how many months your cash buffer lasts.",
        "nav": "Freelance & irregular income",
        "intro": "Standard budget apps assume the same paycheck lands on the 1st of every month. When you freelance, "
                 "consult, run a small studio or earn commissions, one month brings three client invoices at once and "
                 "the next brings none. PlannedOut focuses on cash flow and runway: what your baseline month actually "
                 "costs, whether the year as a whole is adding to your reserves, and how many months your buffer lasts "
                 "if client work slows down.",
        "sections": [
            ("Know your true baseline burn",
             ["Separate non-negotiable fixed costs (rent, mortgage, utilities, software, insurance) from flexible spending",
              "See your 3-month and 6-month average monthly burn so one lean or bumper month doesn't mislead you",
              "Keep annual bills — advance/quarterly taxes, professional insurance, domain & software renewals — in their own bucket",
              "Log client payouts quickly in a spreadsheet-style grid or paste from invoices and bank CSVs"]),
            ("Judge your finances across the year, not one lumpy month",
             ["Each month shows clearly how much it added to your cash buffer or drew from it",
              "The Year view shows all 12 months side by side so you can see your real annual surplus and savings rate",
              "Track credit cards and tax / reserve accounts alongside your main checking account"]),
            ("See your runway and test lean-month scenarios",
             ["Live savings runway in months based on your actual bank balances and real average spending",
              "Use what-if sliders to test a 30% dip in income, cutting discretionary spend, or taking a two-month break",
              "Supports 20 currencies (USD, EUR, GBP, INR, CAD, AUD, SGD, AED and more) and encrypts everything in your browser"]),
        ],
        "table": {
            "heading": "Worked example: 6-month freelance cash-flow & runway across bumper and lean months",
            "intro": "Suppose your baseline living + fixed cost is ₹65,000/month and you set aside ₹15,000/month for advance tax and annual renewals (₹80,000/month total baseline), starting with a ₹4,00,000 buffer:",
            "headers": ["Month", "Client payouts received", "Baseline + tax reserve", "Monthly verdict (surplus / drawdown)", "Closing cash buffer (Runway)"],
            "rows": [
                ["April (Bumper)", "₹1,60,000", "₹80,000", "+₹80,000 added to buffer", "₹4,80,000 (6.0 months)"],
                ["May (Normal)", "₹95,000", "₹80,000", "+₹15,000 added to buffer", "₹4,95,000 (6.2 months)"],
                ["June (Lean — no invoice paid)", "₹15,000", "₹80,000", "−₹65,000 drawn from buffer", "₹4,30,000 (5.4 months)"],
                ["July (Milestone payout)", "₹1,85,000", "₹80,000", "+₹1,05,000 added to buffer", "₹5,35,000 (6.7 months)"],
                ["August (Quiet)", "₹45,000", "₹80,000", "−₹35,000 drawn from buffer", "₹5,00,000 (6.3 months)"],
                ["September (Normal)", "₹1,10,000", "₹80,000", "+₹30,000 added to buffer", "₹5,30,000 (6.6 months)"],
            ],
            "foot": ["6-month total", "₹6,10,000 earned (₹1,01,667/mo avg)", "₹4,80,000 total burn", "+₹1,30,000 net surplus across half-year", "Buffer grew by +32.5%"],
        },
        "faq": [
            ("How do you budget when your income changes every month?",
             "Start from your expenses, not your peak month's income. Calculate your baseline monthly cost (fixed "
             "commitments + essential living + 1/12th of annual bills and taxes). In high-earning months, park the "
             "surplus in a cash buffer; in lean months, draw from that buffer to cover your baseline. PlannedOut shows "
             "that exact monthly surplus or drawdown automatically."),
            ("How many months of emergency buffer should a freelancer keep?",
             "Most freelancers and self-employed earners aim for 6 to 12 months of essential expenses plus upcoming "
             "tax bills, since client pipelines and payment cycles take longer to replace than a salaried job."),
            ("How do I plan for quarterly or advance taxes?",
             "Record expected tax payments as annual or irregular items in PlannedOut so they are factored into your "
             "yearly cash-flow commitments and never mistaken for spendable profit."),
        ],
    },
    "sinking-funds-guide": {
        "title": "Sinking Funds Explained: Examples, Categories List & How to Track Them",
        "h1": "Sinking funds explained: turn big predictable bills into calm monthly savings",
        "description": "What is a sinking fund, which categories should you set up, and how is it different from an "
                       "emergency fund? Practical examples plus a free planner to track annual and irregular bills.",
        "nav": "Sinking funds guide",
        "intro": "An annual insurance renewal, property tax bill, holiday flight or car service isn't an emergency — "
                 "you knew it was coming, just not which month it would hurt. A sinking fund is the simple habit of "
                 "turning those predictable future bills into small monthly set-asides, and PlannedOut has them built "
                 "right into how your monthly budget works.",
        "sections": [
            ("Sinking fund vs emergency fund: the simple difference",
             ["A sinking fund is for known, planned future expenses (insurance premiums, school fees, holidays, car servicing)",
              "An emergency fund is for true surprises you cannot schedule (job loss, urgent medical bills, sudden repairs)",
              "Keeping them separate stops predictable yearly bills from draining your emergency safety net",
              "Monthly set-aside = total upcoming bill ÷ months left until it is due"]),
            ("Common sinking fund categories (with examples)",
             ["Insurance & taxes: health, term life, car/home insurance premiums, property tax, annual accounting fees",
              "Family & education: annual school or college fees, uniforms, books, summer camps",
              "Celebrations & travel: holidays, festivals (Diwali, Christmas, Eid), birthdays, weddings and gifts",
              "Home, car & tech: car servicing and tyres, appliance or roof repairs, phone/laptop replacement, annual software subscriptions"]),
            ("How PlannedOut tracks annual bills without 15 separate bank accounts",
             ["Mark any yearly or irregular bill as an Annual item inside your sheet",
              "See all of them on an annual calendar with the full yearly total and monthly equivalent",
              "Your monthly balance bridge keeps Annual items separate from Regular monthly expenses so your spending average stays accurate",
              "Annual items are automatically included in your multi-year savings and runway projections"]),
        ],
        "table": {
            "heading": "Sample sinking fund schedule: 6 predictable bills turned into monthly savings",
            "intro": "Formula: Monthly set-aside = Upcoming bill ÷ Months until due. Here is a complete household sinking fund table in both USD ($) and INR (₹):",
            "headers": ["Sinking fund category", "Frequency", "Example bill ($ USD)", "Monthly ($)", "Example bill (₹ INR)", "Monthly (₹)"],
            "rows": [
                ["Health & term life insurance", "Annual", "$1,800", "$150/mo", "₹48,000", "₹4,000/mo"],
                ["Auto insurance & annual service", "Annual", "$1,200", "$100/mo", "₹24,000", "₹2,000/mo"],
                ["Property tax / annual home maintenance", "Annual", "$2,400", "$200/mo", "₹24,000", "₹2,000/mo"],
                ["School / education annual fees", "Annual", "$1,200", "$100/mo", "₹60,000", "₹5,000/mo"],
                ["Holidays, festivals & gifts (Diwali / Christmas)", "Annual", "$1,800", "$150/mo", "₹48,000", "₹4,000/mo"],
                ["Laptop / phone replacement cycle", "Every 24 months", "$1,440", "$60/mo", "₹72,000", "₹3,000/mo"],
            ],
            "foot": ["Total monthly sinking fund transfer", "All 6 buckets", "$9,840/2yr", "$760/mo", "₹2,76,000", "₹20,000/mo"],
        },
        "faq": [
            ("What is a sinking fund with an example?",
             "If your car insurance and annual servicing cost $1,200 (or ₹36,000) once a year, a sinking fund means "
             "setting aside $100 (or ₹3,000) every month for 12 months. When the bill arrives, the cash is ready and "
             "your monthly budget doesn't feel a shock."),
            ("How many sinking funds should I have?",
             "Most households do best with 4 to 8 broad categories — such as Insurance & Taxes, Education, Holidays & "
             "Festivals, Vehicle & Home Maintenance, and Gifts — or one combined 'Annual Bills' savings bucket tracked "
             "item by item in a planner like PlannedOut."),
            ("Where should I keep my sinking fund money?",
             "In a high-yield savings account, sweep-in deposit or liquid fund where it earns interest safely and can "
             "be withdrawn without penalty the month the bill falls due."),
        ],
    },
}


# Product screenshots shown on each guide page (alt text and caption tailored to the topic).
GUIDE_SHOTS = {
    "budget-planner-india": [
        {
            "tpl": "illus/shot_month.html",
            "alt": "PlannedOut monthly budget overview in Indian rupees showing ₹1,54,743 drawn from savings, 3-month average burn and runway, opening to closing balance movement across regular income, regular expenses and annual items, and card bills paid",
            "caption": "Monthly verdict & balance bridge in ₹: see whether the month added to savings, how your balance moved across regular income, regular expenses and annual items, plus custom tiles like card bills paid.",
        },
        {
            "tpl": "illus/shot_sheet.html",
            "alt": "PlannedOut Indian household transactions sheet showing Main account, HDFC, ICICI, SBI and Axis credit cards, Investments, Fixed Savings, ETF/MF, and monthly fixed rows for Rent, Househelps, Tuitions and Family in rupees",
            "caption": "Transactions sheet below the summary: filter by bank account, Indian credit cards (HDFC, ICICI, SBI, Axis) or investments (ETF, MF, Fixed Savings), and log rent, househelp salaries, tuitions and card bills in an Excel-like grid.",
        },
    ],
    "excel-budget-alternative": [
        {
            "tpl": "illus/shot_sheet.html",
            "alt": "PlannedOut Excel-style transactions grid with cell reference A1, fx formula bar, column letters A to G, filter dropdowns, and rows for Card total, Regular income and Monthly fixed expenses",
            "caption": "Familiar Excel-like grid: cell references (A1), formula bar (fx), column filters on Date, Description, Type, Category, Kind and Amount, plus account and card tabs above.",
        },
        {
            "tpl": "illus/shot_month.html",
            "alt": "PlannedOut automatic monthly summary showing savings verdict, balance movement from opening to closing, 2026 averages and custom formula tiles",
            "caption": "Built automatically from your sheet: monthly savings verdict, opening-to-closing balance movement, yearly averages and custom metric tiles — no manual chart or formula upkeep.",
        },
    ],
    "private-expense-tracker": [
        {
            "tpl": "illus/shot_sheet.html",
            "alt": "PlannedOut encrypted transactions sheet in the browser showing bank accounts, credit cards, investments and an Excel-style expense grid",
            "caption": "Inside PlannedOut: every description, category, card total and balance you enter in the sheet is encrypted in your browser (AES-256-GCM) before it is saved.",
        },
    ],
    "savings-runway-calculator": [
        {
            "tpl": "illus/shot_month.html",
            "alt": "PlannedOut month view showing ₹1,54,743 from savings and a 3-month average burn of ₹2,64,141 with savings runway in months",
            "caption": "Inside PlannedOut: when a month spends more than comes in, the top card immediately shows your 3-month average burn and how many months your bank and savings balances will last.",
        },
    ],
    "annual-expenses-planner": [
        {
            "tpl": "illus/shot_month.html",
            "alt": "PlannedOut balance movement card separating annual items from regular monthly expenses between opening and closing balance",
            "caption": "Inside PlannedOut: 'How your balance moved' keeps Annual items (−₹34,635) separate from Regular expense (−₹1,67,358), so yearly bills never distort your monthly spending average.",
        },
    ],
    "budget-app-without-sms-india": [
        {
            "tpl": "illus/shot_sheet.html",
            "alt": "PlannedOut manual and spreadsheet-style entry for Indian bank accounts and HDFC, ICICI, SBI and Axis credit cards without SMS reading",
            "caption": "No SMS scraping needed: track your bank account, HDFC / ICICI / SBI / Axis credit card totals, and recurring monthly items (rent, househelps, tuitions) in a fast Excel-style grid.",
        },
    ],
    "emi-budget-planner-india": [
        {
            "tpl": "illus/shot_month.html",
            "alt": "PlannedOut month summary showing regular income minus regular expense, card bills paid with 2026 average, and opening to closing balance movement",
            "caption": "Monthly verdict & card bills: see regular income minus regular expense, card bills paid against your yearly average, and how opening balance moved to closing.",
        },
        {
            "tpl": "illus/shot_sheet.html",
            "alt": "PlannedOut transactions grid showing HDFC, ICICI, SBI and Axis credit card bills rolled into the main bank account alongside monthly fixed commitments",
            "caption": "Credit cards & fixed commitments in one place: see each card's bill (HDFC, ICICI, SBI, Axis) alongside monthly fixed expenses so fixed outflows never sneak up on you.",
        },
    ],
    "private-ynab-mint-alternative": [
        {
            "tpl": "illus/shot_month.html",
            "alt": "PlannedOut cash-flow dashboard showing monthly savings verdict, opening-to-closing balance movement, and customizable metric tiles",
            "caption": "Cash-flow verdict & balance bridge: see whether the month added to savings or drew them down, plus custom tiles — all computed in your browser from encrypted data.",
        },
        {
            "tpl": "illus/shot_sheet.html",
            "alt": "PlannedOut spreadsheet-speed transactions grid with bank accounts, credit cards, investments and formula bar",
            "caption": "Spreadsheet-speed entry without Plaid: manage bank accounts, credit cards and investment accounts in an Excel-like grid with formulas, copy-paste and CSV / .xlsx import.",
        },
    ],
    "fire-retirement-runway-planner": [
        {
            "tpl": "illus/shot_month.html",
            "alt": "PlannedOut monthly drawdown and runway view showing 3-month average burn, bank and savings balance, and months of runway remaining",
            "caption": "Inside PlannedOut: live drawdown tracking with your 3-month average burn, separate annual bills, and exact runway based on your real bank and savings balances.",
        },
    ],
    "first-salary-budget-planner-india": [
        {
            "tpl": "illus/shot_month.html",
            "alt": "PlannedOut monthly summary in rupees showing in-hand salary vs monthly fixed costs, regular expenses, investments and net savings",
            "caption": "Know where your paycheck went: see your in-hand salary, fixed commitments, everyday spending and how much you added to savings in ₹.",
        },
        {
            "tpl": "illus/shot_sheet.html",
            "alt": "PlannedOut transactions sheet for Indian earners with bank account, credit cards, ETF/MF investment tabs and monthly fixed expenses",
            "caption": "Split your paycheck in an Excel-like sheet: track bank accounts, credit cards and starter SIPs (ETF/MF, Fixed Savings) without giving any app SMS access.",
        },
    ],
    "festival-wedding-budget-planner-india": [
        {
            "tpl": "illus/shot_month.html",
            "alt": "PlannedOut balance movement card separating annual festival and wedding items from regular monthly household expenses in rupees",
            "caption": "Keep Diwali and wedding costs separate: 'How your balance moved' isolates Annual items (−₹34,635) from Regular expense (−₹1,67,358) so one festive month doesn't skew your average.",
        },
        {
            "tpl": "illus/shot_sheet.html",
            "alt": "PlannedOut sheet showing HDFC, ICICI, SBI and Axis credit card bills alongside main account and fixed household commitments",
            "caption": "Watch festive card spend in one place: see HDFC, ICICI, SBI and Axis credit card totals alongside your bank balance before the statement date arrives.",
        },
    ],
    "child-education-savings-planner-india": [
        {
            "tpl": "illus/shot_sheet.html",
            "alt": "PlannedOut Indian family sheet showing monthly fixed Tuitions, ETF/MF and Fixed Savings investment tabs, and bank account rows in rupees",
            "caption": "School fees & education investments together: track monthly tuitions in your sheet and monitor ETF/MF and Fixed Savings tabs for your child's future corpus.",
        },
        {
            "tpl": "illus/shot_month.html",
            "alt": "PlannedOut monthly overview showing regular expenses, separate annual school fee items and savings balance in rupees",
            "caption": "Separate April school fees from monthly living costs: annual items sit in their own bucket and feed straight into your multi-year projections.",
        },
    ],
    "indian-household-budget-template": [
        {
            "tpl": "illus/shot_sheet.html",
            "alt": "PlannedOut Indian household budget spreadsheet template showing Rent, Househelps, Tuitions, Family and credit card totals in rupees",
            "caption": "Ready-made Indian household sheet: cell reference (A1), formula bar (fx), tabs for Main account, HDFC/ICICI/SBI/Axis cards and Investments, plus rows for Rent, Househelps and Tuitions.",
        },
        {
            "tpl": "illus/shot_month.html",
            "alt": "PlannedOut automatic monthly summary generated from the household budget sheet in Indian rupees",
            "caption": "No manual chart upkeep: your monthly savings verdict, opening-to-closing balance bridge and yearly averages update automatically as you type.",
        },
    ],
    "freelance-irregular-income-budget": [
        {
            "tpl": "illus/shot_month.html",
            "alt": "PlannedOut monthly cash-flow view showing 3-month average burn, savings drawdown or surplus, and months of runway remaining",
            "caption": "Built for uneven months: see your 3-month average burn and exact months of runway across your bank and savings balances when client payouts fluctuate.",
        },
        {
            "tpl": "illus/shot_sheet.html",
            "alt": "PlannedOut spreadsheet-style cash-flow grid for logging client income, fixed baseline expenses and tax reserves",
            "caption": "Log client invoices and baseline costs fast: use formulas, paste from bank CSVs, and keep tax or reserve accounts in separate tabs.",
        },
    ],
    "sinking-funds-guide": [
        {
            "tpl": "illus/shot_month.html",
            "alt": "PlannedOut monthly balance bridge showing annual sinking fund items kept separate from regular monthly spending",
            "caption": "Sinking funds built in: Annual items are tracked separately from Regular monthly expenses so predictable yearly bills never look like a surprise.",
        },
    ],
}
GUIDE_ILLUS = {
    "budget-planner-india": ["india_month", "annual_cal", "verdict"],
    "excel-budget-alternative": ["grid", "year_bars", "import"],
    "private-expense-tracker": ["flow", "never_ask", "control"],
    "savings-runway-calculator": ["burn", "runway", "personas"],
    "annual-expenses-planner": ["annual_cal", "sinking"],
    "budget-app-without-sms-india": ["never_ask", "grid", "flow"],
    "emi-budget-planner-india": ["india_month", "runway"],
    "private-ynab-mint-alternative": ["flow", "verdict", "import"],
    "fire-retirement-runway-planner": ["burn", "runway", "control"],
    "first-salary-budget-planner-india": ["india_month", "sinking", "verdict"],
    "festival-wedding-budget-planner-india": ["annual_cal", "sinking", "verdict"],
    "child-education-savings-planner-india": ["annual_cal", "runway", "control"],
    "indian-household-budget-template": ["grid", "year_bars", "import"],
    "freelance-irregular-income-budget": ["burn", "year_bars", "runway"],
    "sinking-funds-guide": ["sinking", "annual_cal", "verdict"],
}

# India-specific guides use en-IN; global guides use generic English (en) so global searchers match cleanly.
INDIA_GUIDES = {
    "budget-planner-india",
    "budget-app-without-sms-india",
    "emi-budget-planner-india",
    "first-salary-budget-planner-india",
    "festival-wedding-budget-planner-india",
    "child-education-savings-planner-india",
    "indian-household-budget-template",
}

# Bidirectional cross-links between guides and interactive calculators.
GUIDE_CALCS = {
    "budget-planner-india": ("50-30-20-budget", "Want to check your income split right now?", "Try the free 50/30/20 budget calculator →"),
    "savings-runway-calculator": ("savings-runway", "Just want a quick number?", "Try the free savings runway calculator →"),
    "annual-expenses-planner": ("sinking-fund", "Want a quick monthly number for your yearly bills?", "Try the free sinking fund calculator →"),
    "emi-budget-planner-india": ("50-30-20-budget", "Want to check your income split right now?", "Try the free 50/30/20 budget calculator →"),
    "fire-retirement-runway-planner": ("savings-runway", "Just want a quick number?", "Try the free savings runway calculator →"),
    "private-ynab-mint-alternative": ("sinking-fund", "Planning yearly bills & sinking funds?", "Try the free sinking fund calculator →"),
    "excel-budget-alternative": ("50-30-20-budget", "Want a quick check on your needs, wants and savings?", "Try the free 50/30/20 budget calculator →"),
    "private-expense-tracker": ("emergency-fund", "Building your safety net privately?", "Try the free emergency fund calculator →"),
    "budget-app-without-sms-india": ("emergency-fund", "Checking how many months of safety net you need?", "Try the free emergency fund calculator →"),
    "first-salary-budget-planner-india": ("50-30-20-budget", "Want to split your in-hand salary right now?", "Try the free 50/30/20 budget calculator →"),
    "festival-wedding-budget-planner-india": ("sinking-fund", "Want to see how much to set aside each month for Diwali or a wedding?", "Try the free sinking fund calculator →"),
    "child-education-savings-planner-india": ("sinking-fund", "Planning next April's school fees or annual charges?", "Try the free sinking fund calculator →"),
    "indian-household-budget-template": ("50-30-20-budget", "Want a quick benchmark for your family's needs, wants and savings?", "Try the free 50/30/20 budget calculator →"),
    "freelance-irregular-income-budget": ("emergency-fund", "Working out how many months of buffer you need for variable income?", "Try the free emergency fund calculator →"),
    "sinking-funds-guide": ("sinking-fund", "Ready to add up your own yearly bills right now?", "Try the free sinking fund calculator →"),
}

CALC_GUIDES = {
    "savings-runway": ["savings-runway-calculator", "fire-retirement-runway-planner", "freelance-irregular-income-budget", "private-ynab-mint-alternative"],
    "emergency-fund": ["freelance-irregular-income-budget", "savings-runway-calculator", "budget-planner-india", "private-expense-tracker"],
    "sinking-fund": ["sinking-funds-guide", "annual-expenses-planner", "festival-wedding-budget-planner-india", "child-education-savings-planner-india"],
    "50-30-20-budget": ["first-salary-budget-planner-india", "indian-household-budget-template", "budget-planner-india", "emi-budget-planner-india"],
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
        "examples": {
            "heading": "Worked examples: how long savings last",
            "intro": "Each row uses 4% return on savings. Inflation is 6% for the rupee rows and 3% for the dollar rows. "
                     "Tap a row to load it into the calculator.",
            "headers": ["Savings", "Monthly spending", "Regular income", "Simple division", "With inflation & returns"],
            "rows": [
                ["₹12,00,000", "₹60,000", "None", "20 months", "1 year 7 months"],
                ["₹25,00,000", "₹80,000", "None", "31 months", "2 years 6 months"],
                ["₹50,00,000 (6% return)", "₹1,00,000", "₹30,000 rent", "71 months", "5 years 7 months"],
                ["$30,000", "$3,000", "None", "10 months", "10 months"],
                ["$150,000", "$4,000", "None", "37 months", "3 years 2 months"],
            ],
            "params": [
                "savings=1200000&spend=60000&income=0&inflation=6&ret=4&currency=INR",
                "savings=2500000&spend=80000&income=0&inflation=6&ret=4&currency=INR",
                "savings=5000000&spend=100000&income=30000&inflation=6&ret=6&currency=INR",
                "savings=30000&spend=3000&income=0&inflation=3&ret=4&currency=USD",
                "savings=150000&spend=4000&income=0&inflation=3&ret=4&currency=USD",
            ],
        },
        "mistakes": [
            "Leaving out yearly bills. Insurance, school fees and property tax add up, so divide the yearly total by 12 and add it to monthly spending.",
            "Counting money you can't touch. Leave out PF/EPF, retirement accounts with penalties, and your emergency fund if you want to keep it.",
            "Assuming stock-market returns on money you will spend in 1–3 years. Use savings-account or FD rates for that money.",
            "Ignoring inflation. At 6% a year, ₹60,000 of spending today costs about ₹80,000 in five years.",
        ],
        "sources": [
            ("RBI: Consumer Price Index (inflation) data", "https://www.rbi.org.in/"),
            ("US Bureau of Labor Statistics: CPI", "https://www.bls.gov/cpi/"),
        ],
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
        "examples": {
            "heading": "Worked examples: emergency fund targets",
            "intro": "Target = essential monthly expenses × months of cover. Tap a row to load it into the calculator.",
            "headers": ["Situation", "Essentials / month", "Months", "Target", "Saved", "Adding / month", "Time to reach"],
            "rows": [
                ["Salaried, second earner at home", "₹40,000", "3", "₹1,20,000", "₹50,000", "₹10,000", "7 months"],
                ["Salaried, only earner", "₹50,000", "6", "₹3,00,000", "₹1,00,000", "₹15,000", "1 year 2 months"],
                ["Freelance income", "₹60,000", "9", "₹5,40,000", "₹2,00,000", "₹20,000", "1 year 5 months"],
                ["Salaried, only earner (US)", "$3,500", "6", "$21,000", "$5,000", "$800", "1 year 8 months"],
            ],
            "params": [
                "essentials=40000&situation=3&months=3&saved=50000&monthly=10000&currency=INR",
                "essentials=50000&situation=6&months=6&saved=100000&monthly=15000&currency=INR",
                "essentials=60000&situation=9&months=9&saved=200000&monthly=20000&currency=INR",
                "essentials=3500&situation=6&months=6&saved=5000&monthly=800&currency=USD",
            ],
        },
        "mistakes": [
            "Using total spending instead of essentials. In an emergency you cut eating out and shopping, so size the fund on rent/EMI, food, utilities, insurance, school fees and transport.",
            "Investing it in equity. Keep it in a savings account, sweep-in FD or liquid fund you can reach in a day or two.",
            "Mixing it with sinking funds. Planned bills like insurance premiums should come from their own pot.",
            "Forgetting to top it up when expenses rise, after a new EMI, a move or a child.",
        ],
        "sources": [
            ("Consumer Financial Protection Bureau: building an emergency fund", "https://www.consumerfinance.gov/"),
        ],
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
        "examples": {
            "heading": "Worked example: one household's sinking funds",
            "intro": "Each bill needs (amount − already saved) ÷ months until due. Add the rows up to get one monthly transfer.",
            "headers": ["Bill", "Amount", "Already saved", "Due in", "Set aside each month"],
            "rows": [
                ["Health + term insurance", "₹36,000", "₹0", "12 months", "₹3,000"],
                ["School fees (April)", "₹1,20,000", "₹20,000", "8 months", "₹12,500"],
                ["Diwali & gifts", "₹40,000", "₹0", "5 months", "₹8,000"],
                ["Car service & insurance", "₹12,000", "₹0", "6 months", "₹2,000"],
                ["Total", "₹2,08,000", "₹20,000", "", "₹25,500 a month"],
            ],
        },
        "mistakes": [
            "Using one pot for everything without tracking each bill, so you can't tell which bill is short.",
            "Starting too late. A bill due in 2 months needs six times the monthly amount of one due in 12.",
            "Forgetting irregular but certain costs: gadget replacement, home repairs, annual subscriptions and renewals.",
        ],
        "sources": [],
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
        "examples": {
            "heading": "Worked examples: 50/30/20 split by take-home pay",
            "intro": "Tap a row to load it into the calculator, then add what you spend today to compare.",
            "headers": ["Monthly take-home pay", "Needs (50%)", "Wants (30%)", "Savings (20%)"],
            "rows": [
                ["₹50,000", "₹25,000", "₹15,000", "₹10,000"],
                ["₹1,00,000", "₹50,000", "₹30,000", "₹20,000"],
                ["₹2,00,000", "₹1,00,000", "₹60,000", "₹40,000"],
                ["$5,000", "$2,500", "$1,500", "$1,000"],
            ],
            "params": [
                "income=50000&currency=INR", "income=100000&currency=INR",
                "income=200000&currency=INR", "income=5000&currency=USD",
            ],
        },
        "mistakes": [
            "Using CTC or gross salary instead of what lands in your account.",
            "Counting EMIs on gadgets or holidays as needs. They are wants paid later.",
            "Forgetting yearly bills. Insurance premiums and school fees belong in needs, as a monthly share.",
            "Treating 20% as a ceiling. If needs are low, push savings higher.",
        ],
        "sources": [
            ("Elizabeth Warren & Amelia Warren Tyagi, All Your Worth (2005)", "https://en.wikipedia.org/wiki/Elizabeth_Warren"),
        ],
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
CALC_UPDATED = "2026-10-28"  # bump when calculator content changes; shown on the page

CALC_HUB = {
    "title": "Free Money Calculators: Savings Runway, Emergency Fund, Sinking Fund, 50/30/20",
    "h1": "Free money calculators",
    "description": "Free personal finance calculators that run in your browser: savings runway, emergency fund, "
                   "sinking funds and the 50/30/20 budget rule. No sign-in, nothing you type is sent anywhere.",
}

# ---------- Features, themes and changelog pages ----------
# Keep in step with the app: THEMES mirrors THEMES in static/js/app.js (name, background, accent, note).
THEMES = [
    ("excel", "Excel", "#ffffff", "#217346", "Classic green spreadsheet look, the default"),
    ("planned", "PlannedOut", "#1c1e24", "#34d399", "Charcoal and teal brand theme, dark"),
    ("paper", "Paper", "#f7f6f2", "#2457c5", "Warm off-white with blue ink"),
    ("sky", "Sky", "#f3f7fc", "#1f6feb", "Cool light blue"),
    ("lavender", "Lavender", "#f7f5fc", "#6b4fbb", "Soft purple"),
    ("sand", "Sand", "#faf6ee", "#a0612a", "Earthy beige and brown"),
    ("rose", "Rose", "#fdf6f7", "#b4325b", "Pale pink with deep rose"),
    ("mint", "Mint", "#eef6f3", "#0f7a5c", "Fresh green"),
    ("chai", "Chai", "#f6efe4", "#9a4a12", "Warm tea tones with a serif font"),
    ("ink", "Ink", "#ffffff", "#000000", "High-contrast black and white"),
    ("night", "Night", "#121417", "#7aa7ff", "Dark mode with blue accents"),
    ("metro-light", "Metro Light", "#ffffff", "#1ba1e2", "Bold tiles in four colours, light"),
    ("metro-dark", "Metro Dark", "#000000", "#d80073", "Bold tiles in four colours, dark"),
    ("glass", "Liquid Glass", "linear-gradient(135deg,#93c5fd,#e9d5ff,#fbcfe8)", "#007aff", "Frosted translucent panels over a pastel gradient"),
    ("glass-dark", "Glass Dark", "linear-gradient(135deg,#0f172a,#3b0764,#042f2e)", "#38bdf8", "Frosted panels over a deep gradient, dark"),
]
# Themes that have a real screenshot in static/img/screenshots/themes/ (made by scripts/make_theme_shots.py).
# The rest fall back to a colour preview.
THEME_SHOT_DIR = Path(__file__).resolve().parent.parent / "static" / "img" / "screenshots" / "themes"
THEME_SHOTS = {t[0] for t in THEMES if (THEME_SHOT_DIR / f"{t[0]}.webp").exists()}
THEME_FONTS = ["System", "Office", "Serif", "Rounded"]
THEME_TOKENS = ["Page background", "Cards and cells", "Panels", "Text", "Secondary text", "Borders", "Accent",
                "Positive numbers", "Negative numbers", "Sheet headers", "Gridlines", "Selected cells"]

THEMES_PAGE = {
    "title": "Budget App Themes: 15 Looks, Dark Mode & a Custom Theme Builder",
    "h1": "Make your budget look the way you like",
    "description": "PlannedOut has 15 themes, including an Excel look, dark mode, Liquid Glass and Metro, plus a "
                   "custom theme builder for your own colours, font and corner style. Free, and you can try them in the demo.",
    "faq": [
        ("Does PlannedOut have a dark mode?",
         "Yes. PlannedOut, Night, Metro Dark and Glass Dark are dark themes. Pick one in Settings → Theme."),
        ("Can I make my budget look like Excel?",
         "Yes. The Excel theme is the default: white cells, green headers and gridlines, like a spreadsheet."),
        ("Can I create my own theme?",
         "Yes. Settings → My theme lets you start from any theme, then set 12 colours, pick a font "
         "(System, Office, Serif or Rounded) and choose how rounded the corners are. It previews live as you change it."),
        ("Can I turn off animations?",
         "Yes. Settings → Screen motion offers fade, slide or none. If your device asks for reduced motion, "
         "animations are off unless you turn them on."),
        ("Can I try the themes without signing up?",
         "Yes. Open the live demo, go to Settings and switch themes. Nothing is saved."),
    ],
}

# Each feature: (anchor, heading, summary, bullet points)
FEATURES = [
    ("sheet", "A spreadsheet you don't have to build",
     "Type income and spending into an Excel-like grid instead of filling forms.",
     ["Formulas in any amount cell, like =1200+340 or =4500*2",
      "Copy and paste from Excel or Google Sheets, fill-down and undo",
      "Import .xlsx or CSV files and bank statement exports; the file is read in your browser",
      "Free downloadable Excel and CSV budget templates"]),
    ("insights", "Answers, not just records",
     "Every month gets a clear verdict, and the numbers that explain it.",
     ["Did this month add to your savings or eat into them?",
      "Fixed commitments vs day-to-day spending vs yearly bills",
      "Categories trending up, top merchants and savings rate",
      "Custom metrics: build your own tiles with formulas and drag them into the order you want",
      "Net monthly burn chart and a full year at a glance"]),
    ("projections", "Projections and runway",
     "See where your savings are heading, not just where they've been.",
     ["Year-by-year savings projection to any year you choose",
      "Months of runway if income stopped, from your real 3-month average burn",
      "What-ifs: cut spending, drop a commitment, add income"]),
    ("accounts", "Accounts, cards and month close",
     "Track bank accounts, credit cards and loans the way they really work.",
     ["Credit card bills tracked separately from the spending on them",
      "Close a month to lock it, and bill cards as entered",
      "Big yearly bills (insurance, school fees, property tax) kept out of day-to-day trends"]),
    ("themes", "15 themes and a custom theme builder",
     "Make it look like a spreadsheet, a dark-mode app or something of your own.",
     ["Excel, PlannedOut, Paper, Sky, Lavender, Sand, Rose, Mint, Chai, Ink, Night, Metro Light, Metro Dark, Liquid Glass and Glass Dark",
      "Custom theme builder: 12 colours, 4 fonts and corner roundness, with a live preview",
      "Screen motion: fade, slide or none, and it respects reduced-motion settings"]),
    ("security", "Encrypted in your browser",
     "Your amounts, names and categories are encrypted before they leave your device.",
     ["AES-256-GCM encryption with a key made from your vault passphrase (PBKDF2-SHA256, 600,000 rounds)",
      "We never have your key, so we can't read your amounts",
      "Recovery keys if you forget your passphrase, and lock/unlock on shared devices",
      "No bank login, no SMS reading, no account aggregator, no ads",
      "Delete your account and every record in one click"]),
    ("anywhere", "Works anywhere, in 20 currencies",
     "No install needed, on laptop or phone.",
     ["Runs in any modern browser; add it to your home screen like an app",
      "20 currencies including INR (with ₹1,00,000 grouping), USD, GBP, EUR, AED and SGD",
      "Sync across devices with Google sign-in or an email code",
      "Try everything in the live demo first, without signing up"]),
]
FEATURES_PAGE = {
    "title": "PlannedOut Features: Private Budget Planner With Projections, Themes & Encryption",
    "h1": "Everything PlannedOut does",
    "description": "Spreadsheet-style entry with formulas, monthly insights, savings projections and runway, card "
                   "tracking, 15 themes with a custom theme builder, 20 currencies and browser-side encryption. Free.",
}

# Newest first. (date, title, points). Add an entry when you ship something visitors would notice.
CHANGELOG = [
    ("2026-10-28", "Shareable and embeddable calculators", [
        "Every calculator result has a link you can share, and calculators can be embedded on other sites",
        "Worked examples and common mistakes on every calculator page",
        "New Features, Themes and Changelog pages"]),
    ("2026-10-28", "Live demo and Excel templates", [
        "Try the full app with 9 months of sample data, no sign-in",
        "Free Indian household budget Excel (.xlsx) and CSV templates"]),
    ("2026-10-27", "More themes and product screenshots", [
        "New themes: Metro Light, Metro Dark, Liquid Glass and Glass Dark, on top of the custom theme builder",
        "10 new guides for India and global budgeting questions"]),
    ("2026-10-25", "Calculators, motion and onboarding", [
        "Free savings runway, emergency fund, sinking fund and 50/30/20 calculators",
        "Screen motion settings: fade, slide or none",
        "Step-by-step setup wizard and net monthly burn chart",
        "Drag-and-drop to reorder metric tiles"]),
    ("2026-10-24", "Custom metrics and month close", [
        "Build your own metric tiles with formulas",
        "Close a month to lock it, with credit card billing"]),
]
CHANGELOG_PAGE = {
    "title": "What's New in PlannedOut: Changelog",
    "h1": "What's new",
    "description": "New features and improvements in PlannedOut, the free private cash-flow planner, newest first.",
}

COMPANY = "Pravaha.AI"
CONTACT_EMAIL = "pravaha.ai@gmail.com"
# Official social profiles (name, url). Used in footers, About/Contact, llms.txt and JSON-LD sameAs.
SOCIALS = [
    ("X", "https://x.com/pravaha_AI"),
    ("LinkedIn", "https://www.linkedin.com/in/pravah-ai-6a2a10447/"),
    ("Instagram", "https://www.instagram.com/pravaha.ai/"),
]
X_HANDLE = "@pravaha_AI"
# Launch announcement posts (name, url), shown on the About page.
LAUNCH_POSTS = [
    ("X", "https://x.com/pravaha_AI/status/2115730410462404767"),
    ("LinkedIn", "https://lnkd.in/p/eev7x83G"),
    ("Instagram", "https://www.instagram.com/p/DfEtrKVBdR1/"),
]

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
    return ["/", "/features/", "/themes/", "/changelog/", "/about/", "/contact/", "/privacy/"] + [f"/{slug}/" for slug in GUIDES] + \
        ["/calculators/"] + [f"/calculators/{slug}/" for slug in CALCULATORS]


def _ld(*items):
    """JSON-LD script body. Escapes '<' so content can never close the script tag."""
    data = items[0] if len(items) == 1 else {"@context": "https://schema.org", "@graph": list(items)}
    return mark_safe(json.dumps(data, ensure_ascii=False).replace("<", "\\u003c"))


def _faq(pairs):
    return {"@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in pairs]}


def _org_ld(site):
    return {"@type": "Organization", "@id": site + "/#org", "name": NAME,
            "url": site + "/", "logo": site + "/static/img/icon-512.png", "email": CONTACT_EMAIL,
            "sameAs": [u for _, u in SOCIALS],
            "parentOrganization": {"@type": "Organization", "name": COMPANY, "email": CONTACT_EMAIL,
                                   "sameAs": [u for _, u in SOCIALS],
                                   "address": {"@type": "PostalAddress", "addressCountry": "IN"}}}


def _free_offers():
    return [
        {"@type": "Offer", "price": "0", "priceCurrency": "INR"},
        {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
    ]


def home_jsonld(site):
    return _ld(
        {"@context": "https://schema.org", **_org_ld(site)},
        {"@type": "WebSite", "@id": site + "/#website", "name": NAME, "url": site + "/", "publisher": {"@id": site + "/#org"},
         "inLanguage": ["en-IN", "en"]},
        {"@type": "WebApplication", "name": NAME, "url": site + "/", "applicationCategory": "FinanceApplication",
         "operatingSystem": "Any (web browser)", "browserRequirements": "Requires a modern browser with JavaScript",
         "isAccessibleForFree": True,
         "description": TAGLINE, "featureList": [b[0] + ": " + b[1] for b in BENEFITS],
         "screenshot": [
             site + "/static/img/screenshots/month-overview.png",
             site + "/static/img/screenshots/transactions-sheet.png",
         ],
         "offers": _free_offers(), "publisher": {"@id": site + "/#org"}},
        _faq(HOME_FAQ),
    )


def guide_jsonld(site, slug, g):
    url = f"{site}/{slug}/"
    lang = "en-IN" if slug in INDIA_GUIDES else "en"
    shots = GUIDE_SHOTS.get(slug, [])
    images = [
        site + ("/static/img/screenshots/month-overview.png" if "month" in s["tpl"] else "/static/img/screenshots/transactions-sheet.png")
        for s in shots
    ] or [site + "/static/img/og-image.png"]
    return _ld(
        {"@context": "https://schema.org", "@type": "WebPage", "@id": url + "#webpage", "name": g["title"], "url": url,
         "description": g["description"], "inLanguage": lang, "isPartOf": {"@id": site + "/#website"}},
        {"@type": "Article", "headline": g["h1"], "name": g["title"], "description": g["description"],
         "url": url, "inLanguage": lang, "image": images,
         "mainEntityOfPage": {"@id": url + "#webpage"},
         "author": {"@id": site + "/#org"}, "publisher": _org_ld(site)},
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
         "operatingSystem": "Any (web browser)", "isAccessibleForFree": True, "inLanguage": "en",
         "offers": _free_offers(), "dateModified": CALC_UPDATED,
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
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": NAME, "item": site + "/"},
            {"@type": "ListItem", "position": 2, "name": "Calculators", "item": site + "/calculators/"}]},
        {"@type": "ItemList", "itemListElement": [
            {"@type": "ListItem", "position": i, "name": c["h1"], "url": f"{site}/calculators/{slug}/"}
            for i, (slug, c) in enumerate(CALCULATORS.items(), 1)]},
    )


def about_jsonld(site):
    url = site + "/about/"
    return _ld(
        {"@context": "https://schema.org", "@type": "AboutPage", "name": f"About {NAME} | A private cash-flow planner by {COMPANY}",
         "url": url, "description": f"{NAME} is a free, private cash-flow planner made in India by {COMPANY}.",
         "isPartOf": {"@id": site + "/#website"}, "mainEntity": _org_ld(site)},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": NAME, "item": site + "/"},
            {"@type": "ListItem", "position": 2, "name": "About us", "item": url}]},
    )


def contact_jsonld(site):
    url = site + "/contact/"
    org = _org_ld(site)
    org["contactPoint"] = {"@type": "ContactPoint", "email": CONTACT_EMAIL, "contactType": "customer support",
                           "availableLanguage": ["en", "hi"]}
    return _ld(
        {"@context": "https://schema.org", "@type": "ContactPage", "name": f"Contact {NAME}",
         "url": url, "description": f"Get in touch with the {NAME} team at {COMPANY} for support, feedback or privacy requests.",
         "isPartOf": {"@id": site + "/#website"}, "mainEntity": org},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": NAME, "item": site + "/"},
            {"@type": "ListItem", "position": 2, "name": "Contact", "item": url}]},
    )


PRIVACY_FAQ = [
    ("Can PlannedOut read my financial transactions or balances?",
     "No. Every amount, description, category and balance is encrypted in your browser using AES-256-GCM before it is sent to our servers. Your key is derived from your vault passphrase using PBKDF2-SHA256 (600,000 iterations) and never leaves your device."),
    ("What metadata can PlannedOut see?",
     "Only what is needed to run the service and sync across devices: your email address, sign-in timestamps, record counts, record type (e.g. transaction), month period, and update timestamps."),
    ("How do I delete my account and all encrypted records?",
     "Open Settings and click Delete account. Your user account, vault keys and all encrypted records are permanently deleted immediately."),
]


def privacy_jsonld(site):
    url = site + "/privacy/"
    return _ld(
        {"@context": "https://schema.org", "@type": "WebPage", "name": "Privacy: what PlannedOut can and can't see about your money",
         "url": url, "description": "PlannedOut encrypts your budget and expense data in your browser with AES-256-GCM. See exactly what we can and cannot see.",
         "isPartOf": {"@id": site + "/#website"}, "publisher": {"@id": site + "/#org"}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": NAME, "item": site + "/"},
            {"@type": "ListItem", "position": 2, "name": "Privacy", "item": url}]},
        _faq(PRIVACY_FAQ),
    )


def _crumbs(site, name, path):
    return {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": NAME, "item": site + "/"},
        {"@type": "ListItem", "position": 2, "name": name, "item": site + path}]}


def features_jsonld(site):
    url = site + "/features/"
    return _ld(
        {"@context": "https://schema.org", "@type": "WebPage", "name": FEATURES_PAGE["title"], "url": url,
         "description": FEATURES_PAGE["description"], "isPartOf": {"@id": site + "/#website"}},
        {"@type": "WebApplication", "name": NAME, "url": site + "/", "applicationCategory": "FinanceApplication",
         "operatingSystem": "Any (web browser)", "isAccessibleForFree": True, "offers": _free_offers(),
         "featureList": [p for f in FEATURES for p in f[3]], "publisher": {"@id": site + "/#org"}},
        _crumbs(site, "Features", "/features/"),
    )


def themes_jsonld(site):
    url = site + "/themes/"
    return _ld(
        {"@context": "https://schema.org", "@type": "CollectionPage", "name": THEMES_PAGE["title"], "url": url,
         "description": THEMES_PAGE["description"], "isPartOf": {"@id": site + "/#website"}},
        {"@type": "ItemList", "itemListElement": [
            {"@type": "ListItem", "position": i, "name": f"{n} theme", "description": note,
             **({"image": {"@type": "ImageObject", "contentUrl": f"{site}/static/img/screenshots/themes/{k}.png",
                           "name": f"PlannedOut budget app in the {n} theme", "width": 1024, "height": 640}}
                if k in THEME_SHOTS else {})}
            for i, (k, n, _bg, _ac, note) in enumerate(THEMES, 1)]},
        _crumbs(site, "Themes", "/themes/"),
        _faq(THEMES_PAGE["faq"]),
    )


def changelog_jsonld(site):
    url = site + "/changelog/"
    return _ld(
        {"@context": "https://schema.org", "@type": "WebPage", "name": CHANGELOG_PAGE["title"], "url": url,
         "description": CHANGELOG_PAGE["description"], "dateModified": CHANGELOG[0][0],
         "isPartOf": {"@id": site + "/#website"}},
        _crumbs(site, "What's new", "/changelog/"),
    )
