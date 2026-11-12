# Launch posts and listings (draft copy)

Edit the first-person parts so they sound like you. Post from a personal account, say plainly you're the solo developer, and space posts at least a day apart (see `reddit-removal-notes.md`). Link to `https://plannedout.in/?utm_source=<site>&utm_campaign=launch` so Admin → Traffic shows each one under "Campaign links".

## Order for November
1. Week 1: personal messages to 50–100 people you know, then a LinkedIn post. Aim for 20 people actually entering a month.
2. Week 2: Show HN (Tuesday–Thursday, 7–9 pm IST = US morning), AlternativeTo, SaaSHub, then Product Hunt the following week.
3. Weeks 2–4: helpful answers on Reddit/Quora (link a calculator, not the sign-up). Weekly self-promo threads only for the product itself.
4. Mid-December: a "plan your 2027" post that links the savings runway and sinking-fund calculators.

## Personal message (WhatsApp / LinkedIn DM)
> Hi <name>, I've built a small money planner for myself and I'd really value 20 minutes of your time on it. It works like a spreadsheet (you can paste from Excel), tells you whether each month added to your savings or ate into them, and projects how long savings last. Everything is encrypted in your browser, so even I can't see your numbers, and it needs no bank or SMS access. No sign-up needed to try it: https://plannedout.in/?utm_source=dm&utm_campaign=launch
> Would you put in October's numbers and tell me the one thing that annoyed you? Happy to get on a call and help import your existing sheet.

## LinkedIn post
> For years I tracked our household money in a spreadsheet. It answered "where did it go?" but never the two questions I actually had: did this month add to our savings or eat into them, and how long would our savings last if income stopped?
>
> The apps I tried wanted my bank login or my SMS inbox. After 17 years in banking technology, that was a no for me.
>
> So I built PlannedOut: a spreadsheet-style planner that gives every month a plain verdict, keeps yearly bills (school fees, insurance, Diwali) apart from day-to-day spending, and projects savings year by year. Your data is encrypted in your browser before it is saved, with a key only you hold, so I can't read it.
>
> It's free, and you can start without signing up: https://plannedout.in/?utm_source=linkedin&utm_campaign=launch
>
> I'm looking for 20 people to use it for their November month-end and tell me what's missing. Comment or DM me.

## Show HN
**Title:** Show HN: PlannedOut – a spreadsheet-style budget planner that can't read your data

> I built this for my own household. It's a cash-flow planner with an Excel-like grid (formulas like =1200+340, paste from Sheets, .xlsx/CSV import) that tells you whether each month added to savings, separates lumpy yearly bills from day-to-day spending, and projects savings/runway with what-ifs.
>
> Privacy model: records are encrypted in the browser with AES-256-GCM before upload. The data key is wrapped by a PBKDF2-derived key from your passphrase, plus recovery-key slots (HKDF). The server stores ciphertext, record type/month and timestamps. CSP is script-src 'self' so no third-party script can read the decrypted data. You can also use it with no account at all: data then stays in IndexedDB, encrypted with a non-extractable key.
>
> Stack: Django + vanilla JS modules, no framework, no trackers.
>
> Things I'd love feedback on: the encryption design, and whether the monthly "verdict" is the right default view.
>
> https://plannedout.in/?utm_source=hn&utm_campaign=launch (no sign-up; there's also a demo with sample data at /app?demo=1)

## Product Hunt
- **Tagline (60 chars):** A private, spreadsheet-style planner for your monthly money
- **Description:** See whether each month adds to your savings or eats into them, plan big yearly bills, and project how long your savings last. Excel-like entry, encrypted in your browser, no bank or SMS access, free.
- **First comment:** why you built it (use the LinkedIn story), what's different (verdict, yearly bills, runway, zero-knowledge encryption), and a direct ask: "what would make you switch from your spreadsheet?"
- **Gallery:** the month overview and transactions-sheet screenshots, one theme collage, a 20-second clip of paste-from-Excel → verdict.

## AlternativeTo / SaaSHub listing
- **Alternative to:** Excel/Google Sheets budget templates, YNAB, Mint, Monarch Money, Goodbudget, Walnut, Money Manager, Axio
- **Tags:** budget, personal finance, privacy, end-to-end encryption, spreadsheet, India, free
- **Short description:** Free, private cash-flow planner. Spreadsheet-style entry, monthly savings verdict, yearly bills kept separate, savings projections and runway. Encrypted in your browser; no bank login or SMS access. Works without an account.

## Reddit / Quora answer pattern
Answer the question fully first, with the numbers worked out. Then one line at the end, only where it fits:
> I made a free calculator for exactly this (runs in your browser, nothing is sent): https://plannedout.in/calculators/savings-runway/?utm_source=reddit&utm_campaign=answers
