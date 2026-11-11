# Cash Flow App — Chat Entry (addendum to Spec v4)

Adds a chat-style box for logging entries in plain English. **No AI**: a deterministic, rule-based parser written in JavaScript that runs in the browser. Zero running cost, and it fits the end-to-end encryption model (§10 of v4) because the text never leaves the browser unencrypted.

---

## 1. What it does

The user types a sentence, the app shows a **preview card** of what it understood, the user taps Save (or fixes a chip first). The saved result is an ordinary record — transaction, transfer, statement, commitment tick — exactly as if entered in the month grid.

```
> spent 450 on swiggy with infinia yesterday
┌────────────────────────────────────────────┐
│ − ₹450   Swiggy                            │
│ [HDFC Infinia] [6 Nov] [Food] [Variable]   │
│                     [Edit]   [Save ⏎]      │
└────────────────────────────────────────────┘
```

Every chip is tappable to correct. Corrections teach the parser (§5).

---

## 2. Sentences it understands

| User types | Result |
|---|---|
| `spent 450 on swiggy with infinia yesterday` | Out, ₹450, HDFC Infinia, 6 Nov, Swiggy → Food (from rules) |
| `450 swiggy` | Out, ₹450, default spending account, today, Food |
| `paid 1.6L school fee from hdfc` | Out, ₹1,60,000, HDFC; **matched to annual obligation** "School fee – child 1" → `nature: annual`, linked |
| `paid maid` | Matches recurring commitment "Household help – maid"; amount pre-filled from expected; links `recurring_id` |
| `rent received 47,250` | In, ₹47,250, default spending account, matched to income stream "Rent" |
| `salary 1.8 lakh on 31 oct` | In, salary income stream; becomes cycle anchor if pay-cycle mode is on |
| `invested 50k in mutual fund` | Transfer: spending → Mutual fund account, `nature: investment` (excluded from expense) |
| `moved 2L from savings to hdfc` | Transfer savings → spending, shown as "drawn from savings" |
| `refund 300 amazon on amazon pay card` | Out with amount −300 on ICICI Amazon Pay |
| `cashback 120 atlas` | −₹120 on Axis Atlas, category Cashback |
| `swiggy 6352 infinia for october` | Grouped line, `approx_date`, period Oct |
| `swiggy 6352 infinia 60 food 40 grocery` | One line with `splits` 60/40 |
| `infinia statement 84,230` | Sets `card_statements.statement_amount` for the current period |
| `lent 25k to ravi` | Transfer to receivable account "Ravi" (created on confirm if new) |
| `450 swiggy, 1200 petrol atlas, 300 auto` | Three preview cards, saved together |

Not in MVP: questions ("how much on food this month") — see §8.

---

## 3. Parser pipeline

One pure JS module, `parseEntry(text, context) → [Draft]`. `context` is the decrypted household data: accounts, aliases, category rules, commitments, annual obligations, income streams, today's date, period mode.

1. **Normalize** — lowercase, collapse spaces, strip `₹`/`rs`/`inr`, unify `,` inside numbers.
2. **Split** multiple entries on newline, `;`, or `,` / `and` when each side has its own amount.
3. **Amount** — first number-like token, Indian formats:
   - `450`, `1,20,000`, `1.2L`, `1.2 lakh`, `50k`, `2 cr`, `1.5 crore`
   - arithmetic allowed like the sheet: `347+273+103` → sum, marked grouped
   - percentages (`60 food`) are only read as splits when they follow a category name and sum to 100
4. **Date** — `chrono-node` (free, runs in browser, vendored) for `today`, `yesterday`, `last friday`, `3 nov`, `3/11`, `on 3rd`. Indian order: `3/11` = 3 Nov. A bare month (`for october`) → `approx_date`, grouped. Missing → today.
5. **Intent** from verb keywords (table, editable as data, not code):

   | Intent | Keywords |
   |---|---|
   | out | spent, paid, bought, gave, bill, pay |
   | in | received, got, credited, salary, rent came, income, interest |
   | transfer | moved, transferred, invested, sip, withdrew, deposited, lent, got back (from a receivable) |
   | refund | refund, cashback, reversed, returned (with a merchant) |
   | statement | statement, bill is, `<card> due <amount>` |

   No verb → **out** (most entries are spends).

   Collisions to avoid:
   - `for` is not an intent word: it marks a period (`for october`) or a purpose (`for school`).
   - `returned` means refund only when a merchant is present; money coming back from a person uses `got back`.
   - Words that are both an income stream and a likely expense (`rent`) resolve by the verb (`received` → in, `paid` → out); with no verb, ask.
   - `due` only counts as a statement when a card and an amount sit next to it, so later questions like "what's due this week" stay free.
6. **Account** — match against account names and their aliases (`infinia`, `atlas`, `amazon card`, `hdfc swiggy`). Prepositions help: `with/on/via/using X` = paying account; `from X to Y` = transfer pair. Fuzzy match (Levenshtein ≤ 2, or Fuse.js) for typos. Missing → default spending account. Two equally good matches → ask (§4).
7. **Link to planned items** — match remaining words against recurring commitments, annual obligations and income streams by label/alias. A match sets the link, the `nature`, and pre-fills a missing amount with the expected one.
8. **Merchant / description** — the words left after removing amount, date, account, intent and filler (`on, at, for, the, to, with`).
9. **Category** — `category_rules` (merchant → category, already in the v1/v4 model), then a built-in seed list (swiggy/zomato → Food, blinkit/zepto/bigbasket → Grocery, uber/ola/petrol → Vehicle or Travel, …). An explicit category word in the sentence wins. Swiggy's default split can be a rule too.
10. **Nature** — from the link (annual, recurring, investment) else `variable`; `emergency`/`one-off` if those words appear.
11. **Confidence** — each slot is `explicit`, `inferred`, or `missing`. The preview highlights inferred/missing chips.

The parser never writes anything. It only returns drafts; Save creates records through the same code path as the grid.

---

## 4. When it's unsure

Ask one short follow-up as tap chips instead of guessing. The question appears inside the chat thread as a reply bubble, never as a blocking pop-up, so the user can ignore it and keep typing:

```
> 1200 petrol hdfc
Which HDFC?  [Infinia]  [Swiggy card]  [HDFC savings]
```

Rules:
- No amount found → "How much?" (unless a commitment pre-fills it)
- Two accounts tie → chips
- Unknown merchant, no category → chips of the top 5 categories + "Other"
- New name after `lent to` / `to <account>` that doesn't exist → "Create account 'Ravi' (receivable)?"
- Date in the future → saved as **planned**, shown in Upcoming, unless the user says otherwise

---

## 5. Learning from corrections (still no AI)

When the user changes a chip before saving:
- Account changed → add the typed word as an **alias** of the chosen account (`"hdfc" + petrol → Infinia` only if they choose "always").
- Category changed → write a `category_rules` entry for that merchant (exists in the model already).
- Commitment/obligation linked manually → add the typed phrase as an alias of that item.

All of this is encrypted with the rest of the user's data. Settings page lists learned aliases and rules so wrong ones can be deleted.

---

## 6. UI

No bar fixed to the bottom of every page. On phones the bottom tab bar already lives there, and a second bar plus a history pane would take about 120px of a small screen (more once the keyboard opens). On desktop the month grid needs the full height. So each screen size gets its own entry point.

### 6.1 Phone (≤ 640px): ＋ in the tab bar → chat sheet

The bottom tab bar becomes **Month · Year · ＋ · Insights · More** (Savings moves into More). ＋ opens a full-height chat sheet built on the existing bottom-sheet style (grab handle, swipe down to close).

```
 Month view                       Chat sheet (keyboard up)
┌───────────────────────┐        ┌───────────────────────┐
│ ← November 2026 ▾  →  │        │ ━━  Add entries     ✕ │
│ [summary tiles]       │        │ ── Today ───────────  │
│ Transactions          │        │            450 swiggy │
│ [Infinia][HDFC][Cash] │        │ ✓ −₹450 Swiggy · Food │
│  ...grid rows...      │        │   Infinia · 11 Nov  ↶ │
│                       │        │                       │
│                       │        │      1200 petrol hdfc │
│                       │        │ Which HDFC?           │
│                       │        │ [Infinia][Swiggy][Sav]│
├───────────────────────┤        ├───────────────────────┤
│Month Year (＋) Ins More│        │[paid maid][rent][450] │ ← suggestions
└───────────────────────┘        │ ┌──────────────────┐ ➤│
                                 │ │ spent 450 on…    │  │
                                 │ └──────────────────┘  │
                                 │      [ keyboard ]     │
                                 └───────────────────────┘
```

- The text box stays just above the keyboard (track `visualViewport`), with suggestion chips above it.
- First ➤ (or Enter) shows the preview card as a bubble; a second ➤ saves it. Inferred chips get a dotted outline, missing ones a red outline.
- Follow-up questions (§4) are reply bubbles with tap chips.
- When the sheet is closed, the page underneath shows a toast: "Saved ₹450 Swiggy · Undo".
- Opened from an account view, the sheet starts with a removable "on Infinia ✕" pill above the text box, setting the default account.

### 6.2 Desktop: text box in the Transactions card, `/` from anywhere

A one-line text box sits at the top of the Transactions card, under the account bar. Unsaved entries appear as highlighted draft rows above the grid, with tappable chips, so the user sees exactly where each entry will land.

```
┌ PlannedOut   Month Year Insights Plan Accounts Savings …        Sign out ┐
│ ← November 2026 ▾ →                                                       │
│ [ summary tiles ................................................. ]      │
│ ┌ Transactions ─────────────────────────────────────────────────────────┐ │
│ │ [Infinia] [HDFC Savings] [Atlas] [Cash]                               │ │
│ │ ┌───────────────────────────────────────────────────────┐ [History ⌄] │ │
│ │ │ ✎ Type an entry… e.g. "450 swiggy, 1200 petrol atlas" │   press /   │ │
│ │ └───────────────────────────────────────────────────────┘             │ │
│ │ ┌ 2 drafts ───────────────────────────────────────── [Save all ⏎] ┐  │ │
│ │ │ −₹450  Swiggy  [Infinia] [11 Nov] [Food] [Variable]        ✕    │  │ │
│ │ │ −₹1200 Petrol  [Atlas]   [11 Nov] [Vehicle?]               ✕    │  │ │
│ │ └──────────────────────────────────────────────────────────────────┘  │ │
│ │ Date   Description   Category   Amount   …   (new rows flash briefly) │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

- `/` or Ctrl/⌘+K focuses the text box from anywhere. On tabs without a grid (Plan, Accounts, Savings) it opens as a centred dialog instead.
- Keys: Tab moves between chips, Enter saves all drafts when nothing is missing (otherwise it focuses the first missing chip), Esc clears the drafts.
- **History** is a collapsible drawer on the right (about 320px), not a pane above the text box. The grid already shows what was saved; the drawer shows what was typed, with Undo.
- Saved rows flash briefly in the grid and carry a small 💬 marker (`source: chat`). Clicking it shows the original sentence.

### 6.3 Both

- Typing shows suggestion chips for account names, commitments and recent merchants (prefix match, no network).
- `undo`, or the Undo button on the last card or toast, removes the last saved batch.
- Tapping a past result in the history opens the record for editing.
- Phone is the main reason the chat exists, since the grid is awkward on mobile.

---

## 7. Data model changes (small)

- `accounts.aliases: [string]`
- `recurring_commitments.aliases`, `annual_obligations.aliases`, `income_streams.aliases`
- `transactions.source` gains `chat`; add `raw_text` (the sentence, encrypted with the record) so the history pane can rebuild
- `transactions.status`: `actual` | `planned` (future-dated entries)
- New encrypted record type `parser_settings`: user edits to the keyword table and seed merchant list (optional)

Server schema (§10.3 of v4) doesn't change — these are just more encrypted records.

---

## 8. Build and test

- `parser/` module: `normalize.js`, `amount.js`, `date.js` (wraps chrono-node), `intent.js`, `match.js` (accounts/links, fuzzy), `category.js`, `index.js`. Vocabulary tables in JSON so they're easy to extend.
- **Golden test file**: a few hundred `sentence → expected draft` cases, run on every change. Seed it from the real descriptions in `Finances_2026.xlsx` (Swiggy, Amazon, school fee, maid, rent…) plus typos and Indian number formats.
- Target: ≥ 90% of real entries need zero chip edits after the first two weeks of learned aliases.
- Phase: **Phase 1** alongside the month grid — it's the fastest way to enter data, especially on mobile.

**Later**
- Read-only questions with a fixed set of patterns: `how much on food this month`, `balance infinia`, `what's due this week`, `runway`.
- Hinglish keywords (`kharcha`, `diya`, `mila`) added to the vocabulary tables.
- Voice input — note: the browser's built-in speech recognition (Web Speech API) on Chrome sends audio to Google's servers, which breaks the "we can't see your data" promise. Only offer it with a clear warning, or wait for on-device speech recognition.

---

## 9. Open questions

1. **Confirm every entry, or auto-save when fully confident** (with a 5-second Undo)? Auto-save is faster; confirm-always is safer for a finance app. *Suggested:* confirm always at launch; add auto-save with a 5-second Undo toast as a Settings toggle once the golden test set shows the parser is accurate.
2. **Future-dated entries** — save as planned items in Upcoming, or reject?
3. **Should learned aliases ask first** ("Always use Infinia for 'hdfc'?") or apply silently?
