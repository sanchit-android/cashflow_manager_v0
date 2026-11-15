# Paid layouts (PlannedOut Pro): plan

## What's built

- **Layouts.** `LAYOUTS` in `static/js/app.js` is a list of `[key, name, description, sku]`. A `null` sku means the layout is free.
  - `classic` is free.
  - `cockpit` needs the `layout_cockpit` sku.
  - The choice is saved in settings as `home_layout`.
  - Phones always get Classic.
- **Entitlement check.** The client calls `entitled(sku)`, which reads `<script id="po-ent">` rendered by `app_page`:
  - The payload is `{preview, skus}`.
  - `skus` comes from the `Entitlement` table, leaving out expired rows.
  - `preview` is true when `PRO_PREVIEW=1` (the default), and always true for demo and browser-only users.
- **Locked state.** When `PRO_PREVIEW=0` and the user doesn't own the sku, the layout shows "🔒 Pro". Picking it opens an upsell box that logs two events:
  - `upgrade:view:<layout>` when the box opens
  - `upgrade:want:<layout>` when the user taps "I want this"
- **Admin.** The "Home layouts & Pro" card shows layout picks, upgrade interest, and unlocks by sku with the amount paid.

The client check is only a UI gate. Layouts are presentation, so a user who bypasses it gets nothing we'd need to protect. Anything paid that does server-side work must check `Entitlement` on the server.

## Going live

1. **Price.** A one-time unlock per layout (for example ₹199), or a "Pro" sku that unlocks every layout (`pro_all`). Prefer `pro_all` once there are 3 or more layouts. Rename the client check so that `pro_all` satisfies any `layout_*` sku.
2. **Payments: Razorpay Standard Checkout.**
   - `POST /api/pay/order {sku}`: the server creates a Razorpay order, with the amount taken from a server-side price table.
   - The client opens Checkout. On success it posts `{order_id, payment_id, signature}` to `POST /api/pay/verify`.
   - The server checks the HMAC signature, then creates `Entitlement(source="razorpay", ref=payment_id, amount_paise=…)`.
   - Also handle the `payment.captured` webhook, so an unlock still happens if the browser closes before verify. Make it idempotent on `ref`.
3. **Turn off preview.** Set `PRO_PREVIEW=0` on Render.
   - Before that, grant `layout_cockpit` to everyone who picked it during preview (from `layout:cockpit` events) so nobody loses it.
   - Or show a short "preview ended" notice instead.
4. **Upsell.** Replace "I want this" with "Unlock for ₹X" to open Checkout. Email everyone who tapped "want" when payments launch.
5. **Refunds and grants.** Add `Entitlement` to Django admin (or a small admin tool) for manual grants, promos and refunds. On refund, delete the row or set `expires_at=now`.
6. **Legal.** Update `/privacy/` and add terms and refund pages, which Razorpay requires. Add GST once revenue gets close to the threshold.

## Adding another paid layout

1. Add a row to `LAYOUTS` with a new sku.
2. Add the render branch in `viewMonth()` and `monthSummary()`.
3. Add a thumbnail style `.lt-<key>`.
