# PlannedOut — UI Revamp Plan (v1, reconciled with the code)

Companion to `CHAT-ENTRY-PLAN.md` and spec v4. Written 12 Nov 2026 after reading `static/js/app.js`, `chat.js`, `commands.js`, `engine.js`, `insights.js`, `grid.js` and `app.css`.

There are no users yet, so this is **one rebuild, shipped in one go**: no phases, no feature flags, no A/B tests. The order below is the build order, not a rollout plan.

---

## 0. What the code changes about the research recommendations

| Research assumed | What the code actually does | Consequence |
|---|---|---|
| Chat might send plaintext to a cloud LLM (privacy risk) | Chat is a **rule-based local parser** (`parser.js`, `commands.js`). Nothing leaves the browser. | No privacy redesign needed. This is a selling point, so put "runs on your device" in the dock's placeholder text. |
| Chat would need to learn analytics | `commands.js` already answers totals, category totals, trends, top merchants, savings rate, compare-months, runway and "what's left to pay", and returns `{title, text, table, chart, actions, reveal}`. | Analytics-by-chat is **already built**. The problem is placement, not capability. |
| Pinning chat answers is a new system | A Reply is already a structured spec. A pin = `{command text, scope: "rolling" or a fixed period}`; it re-runs `parseCommand` + `runCommand` for the current period. | Pins are roughly 150 lines: store them in `settings.pins[]` and render them as cards. |
| "+ Add a number" needs a metric builder | `custom_metrics`, formula vars, `mx-grid` drag/reorder and hide/show **already exist**. | Reuse them as the Home "pinned tiles". Cap at 4, plus 1 fixed hero. |
| Chat entries should be drafts that need confirmation | Chat **saves immediately**, flashes the row in the grid and offers Undo. | **I'm keeping save + undo** and rejecting the research's draft-confirm step. One fewer tap per entry matters more for retention. Undo plus the flashing row already covers trust. |
| ⌘K command palette should be separate from chat | ⌘K and `/` already open the chat, and chat already handles commands ("add card…", "infinia billed…"). | **Merge them: the dock input *is* the command bar.** Add navigation verbs ("go to plan", "open settings", "import") to `commands.js`. One input everywhere, no second palette. |
| Mobile has no Add entry point | The bottom nav is Month · Year · **Add** · Insights · More, and Add opens a full-height chat sheet. | The structure is close. Change the tabs and the Add sheet itself (see §5). |
| Desktop chat is a side dock | It's a **floating dialog**, centred at the bottom, draggable, minimisable. It adds `body{padding-bottom:300px}` and covers the grid. | This is the root cause of your problem #3. Replace it with a fixed right-hand column (§3). |
| Grid could show all accounts | `mountTxGrid` is **one account at a time**, ascending by date, with 10 blank rows at the bottom. The phone gets the same grid, scrolled sideways. | Add an **All accounts** view with an Account column (default on desktop). On phone, replace the grid with a list (§5). |

### A real number bug: hero copy vs. closing balance

`engine.summarize`: `verdict = regular_inflow − monthly_expense − annual_expense`. Investments are excluded, so the result is ₹90,583. Closing is opening + flows − investments, which gives +₹80,583. The hero copy says you can "spend up to ₹90,583 more without touching savings", but ₹10,000 has already left Main for the Mutual Fund. So if you spend ₹90,583, Main ends below where it opened.

**Decision:** the hero becomes **"Free to spend" = `headroom − investments_planned_but_not_done`**, worded as "₹80,583 left this month after investing ₹10,000". The old ₹90,583 is kept as a secondary tile, "Earned surplus (before investing)", which users can choose to pin. Changes: one new field in `summarize`, and the copy in `monthSummary`.

---

## 1. Where I disagree with you (and where the code backs it up)

1. **"No scrolling on desktop" → "no *page* scrolling."** The shell fits the viewport (`100dvh`). The ledger, the dock thread and the Review cards scroll **inside their own panes**, the way Excel, Gmail and Linear work. Squeezing everything into 900px without that would just make it cramped.
2. **"Too much data" is really duplicated data.** On today's Month screen, ₹90,583 appears 3 times and ₹9,917 appears twice (in `balanceFlow`, in `extraMetrics`, and in the default metric set). The waterfall, the "Other numbers" row and the "Card spending by category" card all describe the same month in three ways. Keep one hero number, give it a "How?" popover, and move everything else into pins or Review.
3. **Chat shouldn't be *co-primary* with the grid. It should be *always present*.** You've already built a strong chat. It feels hidden because it's a modal that floats over the content. Docked permanently on the right, it becomes primary without competing with the grid. The grid remains the source of truth.
4. **Fewer tabs isn't the goal; grouping tabs around jobs is.** Month, Year and Insights are all *Review*. Accounts and Import are *ledger operations*. Savings (the projection) is *Plan*. Settings and Admin are *meta*. Grouping this way gets you to 4 tabs without hiding anything.
5. **Pick a primary user.** F2, Ctrl+D, `=120+340`, a formula bar and 15 themes are signals for a spreadsheet person, so design for that person. Serve casual users through defaults: the formula bar and A1 reference only appear when a cell is being edited, and the shortcuts line becomes a `?` overlay.
6. **The grid doesn't belong on phones.** Today the same `mountGrid` renders on mobile and scrolls sideways. Use a day-grouped list plus a row-form sheet, and offer the grid as an opt-in landscape "Sheet view".
7. **Chat shouldn't be its own mobile tab.** Language input belongs inside **Add** (for entry) and in an **Ask bar** (for analytics). A separate Chat tab is somewhere users forget to go, which is the same failure as today's pill.
8. **Retire the Games cloud (`games.js`, 610 lines, `#gcloud`) from the app header.** It takes the most valuable strip of the screen. Move it to Settings or the landing page.

---

## 2. New information architecture

```
Desktop top bar:  PlannedOut │ Home │ Ledger │ Review │ Plan │  ‹ Nov 2026 › │ [Ask or log… ⌘K] │ ☁ │ (A)▾
Phone bottom bar: Home · Ledger · (＋) · Review · Plan          (A) avatar on Home top-left
Avatar menu:      Accounts & cards · Categories & rules · Import history · Settings & themes · Security & recovery keys · Admin (owner) · Sign out
```

| Before (`BASE_TABS`) | After | Code move |
|---|---|---|
| Month | **Home** (current period) | `viewMonth` is split into `viewHome` (strip + ledger + dock) |
| Month's grid | **Ledger** (full-width grid with filters, all periods) | `mountTxGrid` becomes reusable; Home embeds a compact version |
| Year | **Review**, with Month/Year scope | `viewYear` content becomes Review cards |
| Insights | **Review** | `viewInsights` sections become Review cards (each one pinnable) |
| Plan | **Plan** | `viewPlan` |
| Savings | **Plan → Projection & checkpoints** | `viewSavings`, `drawProjection` and `snapList` move under Plan |
| Accounts | Ledger account filter + avatar → Accounts & cards | `viewAccounts` becomes a settings sheet |
| Import | Ledger `＋ ▾ → Import file`, chat "import", drag a file onto the ledger | `viewImport` becomes a modal flow |
| Settings | Avatar menu | `viewSettings` |
| Admin ▾ | Avatar menu (owner only) | `ADMIN_TABS` |
| Sign out (header) | Avatar menu | `app.html` header form |
| Floating Quick add | **Docked Assistant column** on every desktop page | `chat.js` desktop branch is rewritten (§3) |

That's 9 top-level items plus a floating widget reduced to **4 tabs, 1 input and 1 avatar**.

---

## 3. Desktop

### D1 — Home (1440×900, the page never scrolls)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ ▣ PlannedOut  [Home] Ledger Review Plan     ‹ November 2026 ▾ ›  0/2 cards billed     ☁  (A)▾ │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌ HERO ─────────────────────────────┐┌ pin ────────┐┌ pin ────────┐┌ pin ───────┐┌ TO DO (3) ──┐│
│ │ ₹80,583 free to spend             ││ Spent       ││ Card dues   ││ Invested   ││ ○ Bill HSBC ││
│ │ after investing ₹10,000 · day 12  ││ ₹9,917      ││ ₹9,917      ││ ₹10,000    ││ ○ Bill Citi ││
│ │ ▓▓▓▓░░░░░░░░  In 1,00,500         ││ ▁▂▅ vs Oct  ││ HSBC · Citi ││ 10% of in  ││ ○ 2 uncateg.││
│ │ Out 19,917 · Due ₹0      How? ⓘ   ││         ✕   ││         ✕   ││        ✕   ││   [Do next] ││
│ └───────────────────────────────────┘└─────────────┘└─────────────┘└────────────┘└─────────────┘│
├──────────────────────────────────────────────────────────────┬───────────────────────────────┤
│ LEDGER  [All accounts ▾] [Main] [HSBC] [Citi] [MF]  ⚲  [＋ ▾] │ ASSISTANT            ⇔  ─     │
│ ┌──────┬──────────────────┬────────┬────────┬─────────┬─────┐│ ┌ 📌 Card spend · Nov ───────┐│
│ │ Date │ Description      │ Acct   │ Cat    │ Kind    │   ₹ ││ │ Shopping  ████████  9,667  ││
│ ├──────┼──────────────────┼────────┼────────┼─────────┼─────┤│ │ Entmt.    ▏           250  ││
│ │05 Nov│ Salary           │ Main   │ Other  │ Regular │+1,00,500│ └──────────────────── ⋯ ──┘│
│ │11 Nov│ Amazon           │ HSBC   │ Shop   │ Regular │ 9,667││ ┌ 📌 Food vs last month ─────┐│
│ │10 Nov│ BookMyShow       │ Citi   │ Entmt  │ Regular │   250││ │ ₹450 vs ₹6,210 · 12/30 days││
│ │12 Nov│ Investment → MF  │ Main   │ —      │ Invest  │10,000││ └────────────────────────────┘│
│ │      │ (pane scrolls; newest at the bottom, auto-scrolled)  ││                               │
│ ├──────┼──────────────────┼────────┼────────┼─────────┼─────┤│ Try  [450 swiggy] [food trend]│
│ │12 Nov│ ▌type here…      │ Main   │        │         │     ││      [what's left to pay]     │
│ └──────┴──────────────────┴────────┴────────┴─────────┴─────┘│ ┌───────────────────────────┐│
│ Main · Open 9,00,000 · In 1,00,500 · Out 19,917 · Close 9,80,583 ? │ │ Ask, log or go…  ⌘K     ⏎ ││
│                                                               │ │ runs on your device 🔒     ││
└──────────────────────────────────────────────────────────────┴───┴───────────────────────────┘
```

**What's on the first screen, and why**
- **Hero (fixed and not removable):** one number with one definition, plus a progress bar for the day of the month. "How?" opens the old `balanceFlow` waterfall in a popover, so the arithmetic stays available without occupying a row.
- **Up to 4 pins** (from `mx-grid` and `custom_metrics`). Defaults are Spent, Card dues and Invested. "＋ pin" appears only when there's a free slot.
- **To-do queue.** This brings together "0 of 2 cards billed" (`billBox`), "Still to pay this month" (the commitments in `monthSummary`), uncategorised rows, and `monthCloseBar`. Ticking these off is the daily habit. Today they're spread across four places.
- **Ledger, always visible.** The account chips become a filter strip, and the per-account `accountSummary` strip becomes the footer line. The **entry row is pinned at the bottom of the pane** (Excel order, matching `blankRows`), so you never have to scroll to reach it. The formula bar appears only while a cell is being edited. The `SHORTCUTS` text moves into the `?` overlay.
- **Assistant column (360px; drag ⇔ to resize between 300 and 560px; ─ collapses it to a 48px rail).** When idle, it shows your **pinned cards**, which replace the old "Card spending by category" card at the bottom of the page. Focusing the input turns it into the thread (D2).

**Removed from Home:** the waterfall row, the "Other numbers" row, the runway sentence (now a pin option and a Review card), the category card (now a default pin), the games cloud, the floating chat button and dialog, and the footer inside the app.

**Layout CSS:**
```css
.app      { height:100dvh; display:grid; grid-template-rows:auto auto 1fr; }
.home     { display:grid; grid-template-columns:1fr var(--dock-w,360px); min-height:0; }
.ledger   { display:flex; flex-direction:column; min-height:0; }   /* grid body overflow:auto */
.dock     { display:flex; flex-direction:column; min-height:0; border-left:1px solid var(--line); }
@media (max-height:760px){ .strip{ grid-auto-rows:64px } .hero .sub{ display:none } }   /* small laptops */
@media (max-width:1100px){ .home{ grid-template-columns:1fr } .dock{ position:fixed; right:0; ... } } /* tablet: dock as a slide-over */
```

### D2 — Assistant in use

```
├──────────────────────────────────────────────┬───────────────────────────────────────────────┤
│ LEDGER  [All ▾]                    [＋ ▾]     │ ASSISTANT                         ⟲  📌  ─    │
│ │11 Nov│ Amazon      │ HSBC │ Shop │  9,667  │ │ you  swiggy 450 hdfc yesterday, uber 230     │
│ │11 Nov│ Swiggy  ✦   │ HSBC │ Food │    450 ◀┼─┤ ✓ Spent ₹450 Swiggy · HSBC · Food · 11 Nov    │
│ │12 Nov│ Uber    ✦   │ Main │ Trvl │    230 ◀┼─┤ ✓ Spent ₹230 Uber · Main · Travel · today     │
│ │      │ (✦ rows flash for 2s)              │ │                        [Undo both] [Edit cat ▾]│
│                                              │ │ you  food this month vs october               │
│                                              │ │ ┌ Food · Nov ₹450 vs Oct ₹6,210 ───────────┐ │
│                                              │ │ │ Oct ▇▇▇▇▇▇▇▇▇▇▇                          │ │
│                                              │ │ │ Nov ▏         12 of 30 days in           │ │
│                                              │ │ │ [Show 3 rows] [6 months] [📌 Pin to Home] │ │
│                                              │ │ └──────────────────────────────────────────┘ │
│                                              │ │ ┌──────────────────────────────────────────┐ │
│                                              │ │ │ Ask, log or go…                       ⏎  │ │
└──────────────────────────────────────────────┴─┴──────────────────────────────────────────────┘
```

- The hero strip **collapses to one line** while the thread is active, which frees about 110px. Pressing Esc or clicking the ledger restores it.
- "Show N rows" calls the existing `reveal(txIds)` and filters the ledger on the left. Nothing opens in a modal.
- **📌 Pin** stores `{cmd:"food vs last month", where:"home"|"review", scope:"rolling"}` in `settings.pins`. It re-runs on render, and the card says what time window it covers.
- The thread persists for the session (it already does, via `msgs[]`). ⟲ shows past queries so they can be run again.
- Navigation verbs are added to `commands.js`: `go to plan`, `open settings`, `import`, `show hsbc`, `year view`, `theme night`.

### D3 — Ledger tab (full-width workbench)

The same grid with the whole width (the dock stays collapsed to its rail unless opened), plus: a **period range** selector (month, quarter, year, custom), filter chips (account, category, kind, text), totals for the selection in the footer, bulk edit (select rows → set category or kind), and `＋ ▾` → New row · Paste from Excel · Import file · Mark card billed. This is where power users live. Home is where everyone starts.

### D4 — Review tab (one board in place of Year + Insights)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ ▣ PlannedOut  Home Ledger [Review] Plan   Scope [Month | 3M | 6M | Year] 2026 ▾   [Edit board]│
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ HEADLINES  ▲ Food +38% vs 6-mo avg · ▼ Shopping −12% · Insurance due Mar (₹24,000)   (N.headlines)│
├───────────────────────────────────────────────┬──────────────────────────────────────────────┤
│ IN vs OUT · shared scale (was 2 charts)        │ WHERE IT GOES (natureSplit)                  │
│ ▇▒ ▇▒ ▇▒ ▇▒ ▇▒ ▇▒ ▇▒ ▇▒ ▇▒ ▇▒ ▇▒ ▇▒            │ ████████ Fixed 52% ▒▒▒▒ Flex 31% ░ Annual 17% │
│ J  F  M  A  M  J  J  A  S  O  N  D  (click→Ledger)│ Runway 41 months · Savings rate 18%          │
├────────────────────────┬──────────────────────┼──────────────────────────────────────────────┤
│ CATEGORY TRENDS        │ TOP MERCHANTS        │ 📌 FROM CHAT · "compare oct vs sep"         │
│ Food   ▲ +2,100/mo     │ Swiggy  ████ 14 pays │  …re-runs for the chosen scope               │
│ Travel ▼  −800/mo      │ Amazon  ███   6 pays │                                       ⋯ ✕   │
└────────────────────────┴──────────────────────┴──────────────────────────────────────────────┘
          (cards are S/M/L on a 12-col grid; any overflow scrolls inside the board only)
```

- The Year tab's two charts with **separate scales** become one chart on a **shared scale**, so the gap between in and out is visible at a glance.
- The Year *table* (metrics down, months across) becomes a "Year table" card at size L, off by default. Spreadsheet users will turn it on.
- Every Insights section (`regularSection`, `runwaySection`, `savingsRateSection`, the trends table, merchants, annual calendar, commitments yearly) becomes a **card type**. Defaults: Headlines, In vs Out, Where it goes, Category trends. The rest live in `+ Add card`.
- The Ask input is the same dock input. On Review it's prefilled with suggestions related to the current scope.

### D5 — Plan tab

Plan has three sections, switched with a segmented control rather than sub-tabs: **Commitments & recurring** (from `viewPlan`) · **Annual items** · **Projection & checkpoints** (all of `viewSavings`). The what-if levers (`whatIf`, `biggestLevers`) sit beside the projection chart as sliders, so the chart responds immediately.

### Desktop alternatives that lost
- **Bento dashboard Home with the grid on its own tab** (the Monarch model): Monarch has bank sync, so entry happens elsewhere. You have manual entry, so logging *is* the loop and the hero has to update next to the row you just typed.
- **Chat-first canvas** (Cleo-style): chat-only interfaces make users work out what to type, and this approach sidelines your spreadsheet users. Your parser is good, but it's rule-based, so a GUI next to it is what makes it discoverable.
- **Keep the floating dialog but make it sticky:** it still covers the grid, still needs the 300px body padding, and leaves no room to pin.

---

## 4. Personalization

1. **Hero:** fixed definition, not removable. It's the anchor for everything else.
2. **Pins on Home:** maximum 4. Each comes from the metric list (existing `allMetrics()` + `custom_metrics`) or from a chat answer. Drag to reorder (existing `mxDrag`).
3. **Review board:** a list of card types plus chat pins, with size and order stored in `settings.review_board`. Desktop and phone layouts are stored separately because the screens differ.
4. **Onboarding (in the existing `onboarding()`):** one extra step, *"What do you want to see every time?"*, with chips: Free to spend · Did I save · Card bills · Where money goes · Runway. The answers seed the pins and the default Review board. Don't start with a blank canvas.
5. **Suggest pins:** if the same command is run twice in 7 days, show a "📌 Pin this?" chip on the answer.
6. **Prune:** a pin nobody has viewed for 60 days shows "Remove?" on its ⋯ menu.

Storage: everything goes in the encrypted `settings` record. No new server model.

---

## 5. Mobile (≤640px)

### M0 — Bottom nav
```
┌──────────────────────────────────────────┐
│  ⌂ Home   ≣ Ledger   (＋)   ▤ Review   ◎ Plan │
└──────────────────────────────────────────┘
```
Replaces `PHONE_TABS` (Month · Year · Add · Insights · More). "More" goes away: everything in it is either under Plan or in the avatar menu on Home. Long-press ＋ opens Type mode directly.

### M1 — Home
```
┌──────────────────────────────┐
│ (A)    ‹ November ›       ☁  │
│ ┌──────────────────────────┐ │
│ │ ₹80,583                  │ │
│ │ free to spend · day 12/30│ │
│ │ ▓▓▓▓░░░░░░░░   How? ⓘ    │ │
│ └──────────────────────────┘ │
│ [Spent 9,917][Cards 9,917][›]│ ← pins as a swipeable chip row
│ To do (3)                    │
│ ○ Bill HSBC card       [Do]  │
│ ○ Bill Citi card       [Do]  │
│ ○ 2 uncategorised     [Fix]  │
│ Recent                       │
│ Investment → MF     −10,000  │
│ Salary            +1,00,500  │
│ ┌──────────────────────────┐ │
│ │ Ask about your money…  › │ │ ← opens M6
│ └──────────────────────────┘ │
├──────────────────────────────┤
│ ⌂   ≣   (＋)   ▤   ◎          │
└──────────────────────────────┘
```

### M2 — Add sheet: Type (the default) and Keypad
```
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ Add       [Type] Keypad    ✕ │   │ Add        Type [Keypad]   ✕ │
│ ┌──────────────────────────┐ │   │ [Spent] Received  Transfer   │
│ │ 450 swiggy, 230 uber upi │ │   │          ₹ 120+340           │
│ └──────────────────────────┘ │   │ Swiggy ▾   (from history)    │
│ [Paste bank SMS / UPI alert] │   │ [Food✓] [Grocery] [Travel]   │
│ ✓ ₹450 Swiggy·HSBC·Food   ↶  │   │ [HSBC✓] [Main]   [Cash]      │
│ ✓ ₹230 Uber·Main·Travel   ↶  │   │ Today ▾                      │
│ (saved instantly; tap to edit)│   │  1  2  3                     │
│ Recent: [450 swiggy] [petrol]│   │  4  5  6                     │
│                              │   │  7  8  9                     │
│ ⌨ keyboard                   │   │  +  0  ⌫     [Save] [Save +] │
└──────────────────────────────┘   └──────────────────────────────┘
```
- **Type is the default** because your parser is the differentiator and is already built. Today's sheet closes after each save; **keep it open** so several entries can be added in one go, with each confirmation inline and tap ↶ to undo.
- **Paste SMS / UPI alert:** add bank-alert patterns to `parser.js` ("Rs.450.00 debited from A/c XX1234 … to SWIGGY …"). This gives you Walnut's convenience without asking for SMS permission. It's the strongest India-specific feature you could add, and it needs no new infrastructure.
- **Keypad** is for people who don't want to type. Chips come from `category_rules` and history (`suggest`), and the `+` key reuses `formula.js`.

### M3 — Ledger (a list, not a grid)
```
┌──────────────────────────────┐
│ Ledger · Nov  [All ▾] ⚲   ⋯  │
│ In 1,00,500 · Out 19,917     │
│ ── Wed 12 Nov ──── −10,000 ─ │
│ Investment → MF     −10,000  │
│ Invest · Main                │
│ ── Tue 11 Nov ───── −9,667 ─ │
│ Amazon              −9,667   │
│ Shopping · HSBC  ◂ Category | Kind | Delete │
│ ⋯  Select · Sheet view ⟲ (landscape grid) · Export │
├──────────────────────────────┤
│ ⌂   ≣   (＋)   ▤   ◎          │
└──────────────────────────────┘
```
Tapping a row opens **M4**, a row-form bottom sheet with Date, Type, Account, To, Category, Kind (segmented), Note, plus Split, Make recurring and Delete. **Sheet view** is today's `mountGrid` in landscape, with the Description column frozen. It's kept for spreadsheet users and is not the default.

### M5 — Review (scrolls vertically, which is fine on a phone)
The same card types as desktop, stacked. In vs Out shows months as **rows** of horizontal bars, which suits a portrait screen. The scope segment sits at the top, with the Ask bar under it.

### M6 — Ask (analytics chat)
A full-screen thread: starter chips (*Where did my money go? · Food vs last month · What's left to pay · Runway*), answers as cards with **See rows** (goes to the filtered Ledger) and **📌 Pin**, and follow-up chips under each answer. This is the same `chat.js` engine as Add, opened in "ask" mode, so the examples are questions rather than entries.

### Mobile alternatives that lost
- **Chat as the whole app:** typing a sentence for every entry is slower than tapping a keypad with predicted chips for repeat merchants, so chat stays as one mode inside Add.
- **Responsive grid (today's behaviour):** narrow columns, sideways scrolling and small tap targets. It survives only as the opt-in Sheet view.
- **A Chat tab:** users forget to visit it, the same failure as the hidden pill.

---

## 6. Build order (single release)

1. **Engine:** add `free_to_spend` to `summarize`, fix the hero copy, add a test in `engine.test.mjs`.
2. **Shell:** viewport-fit `.app` grid; top bar with 4 tabs, period switcher and avatar menu; delete the `#gcloud` mount; remove the app footer from app screens.
3. **Dock:** rewrite the desktop branch of `chat.js` as a fixed column (rail / 360 / wide). Remove the drag, minimise and `body.chat-docked` padding. Add a pinned-cards idle state. Point ⌘K and `/` at the dock input.
4. **Pins:** `settings.pins[]`; a 📌 action on every Reply; re-run on render; cap at 4 on Home; reuse `mx-grid` for the tiles.
5. **Home:** split `viewMonth` into strip, compact ledger and dock. Merge `billBox`, the commitments list and `monthCloseBar` into the To-do card. Turn `balanceFlow` into a popover. Move `SHORTCUTS` into a `?` overlay. Show the formula bar only while a cell is being edited.
6. **Ledger:** an All-accounts mode with an Account column in `mountTxGrid`; a period range; filters; bulk edit; `＋ ▾` menu; Import as a modal (reuse the `viewImport` internals).
7. **Review:** turn the `viewYear` and `viewInsights` sections into card renderers; board layout in settings; shared-scale In vs Out chart.
8. **Plan:** merge `viewSavings` into Plan as a section, with what-if sliders next to the projection.
9. **Commands:** navigation verbs, "import", "pin …", and bank SMS/UPI alert parsing (with tests in `parser.test.mjs`).
10. **Mobile:** new `PHONE_TABS`; Add sheet with Type/Keypad that stays open; Ledger list + row-form sheet; Sheet view in landscape; Ask mode; drop the More sheet.
11. **Onboarding:** the "what do you want to see" step seeds the pins and the board. Update `demo.js` so the demo opens on the new Home.
12. **Check:** 1280×720, 1440×900 and 1920×1080 with no page scroll; 390×844 phone; every theme (CSS variables only, so it should hold); keyboard-only pass through ledger → dock → pin.

What to watch after launch, from your own Admin dashboard (no baseline needed): % of sessions with at least one entry; entries made in chat vs. grid; pins created per user; D1/D7/D30 for the first cohorts.

---

## 7. Open questions for you
- **Hero definition:** are you happy with "free to spend after investing", or should investing count as discretionary (in which case keep ₹90,583 but change the wording)?
- **Default ledger view on desktop: All accounts or Main?** I recommend All, because card spends otherwise sit hidden behind chips.
- **Games:** move them to Settings, or remove them from the app entirely?
