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
        "title": "FIRE & Retirement Runway Planner: How Long Will My Savings Last?",
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
}

# India-specific guides use en-IN; global guides use generic English (en) so global searchers match cleanly.
INDIA_GUIDES = {"budget-planner-india", "budget-app-without-sms-india", "emi-budget-planner-india"}

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
}

CALC_GUIDES = {
    "savings-runway": ["savings-runway-calculator", "fire-retirement-runway-planner", "private-ynab-mint-alternative"],
    "emergency-fund": ["savings-runway-calculator", "budget-planner-india", "private-expense-tracker"],
    "sinking-fund": ["annual-expenses-planner", "budget-planner-india", "emi-budget-planner-india"],
    "50-30-20-budget": ["budget-planner-india", "emi-budget-planner-india", "excel-budget-alternative"],
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


def _org_ld(site):
    return {"@type": "Organization", "@id": site + "/#org", "name": NAME,
            "url": site + "/", "logo": site + "/static/img/icon-512.png", "email": CONTACT_EMAIL,
            "parentOrganization": {"@type": "Organization", "name": COMPANY, "email": CONTACT_EMAIL,
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
         "offers": _free_offers(),
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
