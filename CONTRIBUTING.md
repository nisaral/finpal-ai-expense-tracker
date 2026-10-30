# Contributing

Thanks for taking a look. Small, focused contributions are very welcome: bug fixes, tests, docs, and
anything labelled [good first issue](https://github.com/nisaral/finpal-ai-expense-tracker/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
or [help wanted](https://github.com/nisaral/finpal-ai-expense-tracker/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).

## Getting set up
Node 20+. `npm install`, copy your own Turso and Mistral credentials into `.env.local` (`TURSO_CONNECTION_URL`, `TURSO_AUTH_TOKEN`, `MISTRAL_API_KEY`, `NEXT_PUBLIC_SITE_URL=http://localhost:3000`), then `npm run dev`.

## Making a change
1. Fork the repo and create a branch.
2. Keep the change small and explain *why* in the PR description.
3. Before opening the PR: `npm run lint` and `npm run build` pass.
4. Never commit API keys, `.env` files, or large data/model files.

## Reporting bugs and ideas
Open an issue using the templates. For bugs, include the exact command, the full error and your environment.
If you are unsure whether something is in scope, open an issue first and ask.

