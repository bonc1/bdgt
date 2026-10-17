# bdgt — Private Economy & Shared Household Budgeting App

A mobile-first, bilingual (`SV` / `EN`) Progressive Web App (PWA) built with **Next.js (App Router)**, **TypeScript**, **Tailwind CSS**, and **Supabase**.

## Features
- **Expected vs. Actual Monthly Follow-up**: Add expected bills (e.g., `2 000 SEK` for Electricity) and tap at the end of the month to either **1-tap confirm expected** or enter the actual bill amount.
- **Multi-Month & Quarterly Recurrence**: Configure bills that arrive every `2`, `3` (quarterly), `4`, `6`, or `12` months and specify how many past months they cover (e.g., quarterly water & waste covering the last 3 months).
- **Cashflow vs. Monthly Buffer (Accrual) Toggle**: Switch instantaneously between seeing bills in the month they are paid vs. spreading non-monthly bills evenly across every month to know your exact monthly buffer transfer.
- **Single-Confirm Bills & Multi-Entry Budgets**: Track single monthly bills (like rent, electricity, broadband) alongside running budgets (like groceries, where you can log partial spends or a final monthly sum).
- **Shared Households & Cloud Sync**: Sign up with Email/Password, Magic Link, or Google SSO, and invite a partner or family member using your 8-character household invite code.

---

## 1. Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser or mobile device.

---

## 2. Supabase Database Setup (`ziopeltcopzvyyxsmvap`)

Your `.env.local` is already configured with your Supabase Project URL and Publishable Key.

To create the tables, Row-Level Security (RLS) policies, and household invite functions in Supabase:

### Option A: Supabase Dashboard SQL Editor (Fastest)
1. Open the [Supabase SQL Editor](https://supabase.com/dashboard/project/ziopeltcopzvyyxsmvap/sql/new).
2. Copy and paste the contents of [`supabase/migrations/20261017000000_init_bdgt.sql`](./supabase/migrations/20261017000000_init_bdgt.sql) and click **Run**.

### Option B: Supabase CLI
```bash
npx supabase login
npx supabase link --project-ref ziopeltcopzvyyxsmvap
npx supabase db push
```

---

## 3. Deploying to GitHub & Vercel

1. Push this repository to GitHub:
   ```bash
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git branch -M main
   git push -u origin main
   ```
2. Import the GitHub repository on [vercel.com/new](https://vercel.com/new).
3. Add the two environment variables in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://ziopeltcopzvyyxsmvap.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `sb_publishable_Cj3ZCMUcRPUkCIYDitH1eg_lnlTXMA-`
4. In Supabase Dashboard → **Authentication → URL Configuration**, add your Vercel domain (`https://your-app.vercel.app/auth/callback`) to **Redirect URLs**.
