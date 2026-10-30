# FinPal: AI expense tracker

[![Stars](https://img.shields.io/github/stars/nisaral/finpal-ai-expense-tracker?style=flat)](https://github.com/nisaral/finpal-ai-expense-tracker/stargazers) ![Next.js](https://img.shields.io/badge/Next.js-15-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6) ![Drizzle](https://img.shields.io/badge/ORM-Drizzle%20%2B%20Turso-C5F74F)

FinPal lets you log spending by typing a short message such as "200 sabji" or "uber 350". A rule and keyword
parser handles most messages, and a Mistral (`mistral-small-latest`) fallback extracts amount, vendor and
category when the rules fail; it understands English, Hindi and mixed messages. It also has categories, vendor
rules, budgets (overall and per category), recurring expenses, splits, summaries and a dashboard, with
email/password auth via better-auth.

**Stack:** Next.js 15 (App Router), React 19, Tailwind/shadcn UI, Drizzle ORM on Turso (libSQL), better-auth, Mistral API.

## 30-second quickstart

```bash
git clone https://github.com/nisaral/finpal-ai-expense-tracker.git && cd finpal-ai-expense-tracker
npm install
# .env.local: TURSO_CONNECTION_URL, TURSO_AUTH_TOKEN, MISTRAL_API_KEY, NEXT_PUBLIC_SITE_URL=http://localhost:3000
npx drizzle-kit push   # create the tables in your Turso database
npm run dev            # http://localhost:3000
```

Without `MISTRAL_API_KEY` the app still works with the rule-based parser only.

## Contributing / Help wanted

Contributions are welcome. Good first areas: tests for the message parser (`src/app/api/parse/route.ts`),
CSV export of transactions, and a seeded demo account. See
[good first issue](https://github.com/nisaral/finpal-ai-expense-tracker/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) /
[help wanted](https://github.com/nisaral/finpal-ai-expense-tracker/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)
and [CONTRIBUTING.md](CONTRIBUTING.md).

No LICENSE file yet. TODO(Keyush): add one so others can reuse the code.

---

## Next.js notes (from create-next-app)

This was bootstrapped as a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
