# BenefitsIQ hosted prototype

BenefitsIQ supports synthetic specialty-pharmacy benefits investigation with a proposed coverage summary, evidence, human review and nine human-graded LLM evals. It is not a live payer integration or a production patient-care system.

## What changed for hosting

The browser calls `/api/analyze` with a built-in case ID. The server reconstructs the corrected synthetic evidence and prompt, calls Claude using a server-only key, validates the response and citations, and returns a proposed summary. The client cannot choose the model, token limit, prompt or upstream destination. The held-back ground truth is never included in the Claude request.

Reviewers enter a shared demo access code, not an API key. Signed, expiring HttpOnly cookies protect the paid endpoint. Existing sample mode remains explicitly labeled. A failed live request does not silently become a sample result.

## Deploy through GitHub and Vercel

1. Use the existing GitHub repository `Kruti23-PMBuilder/benefitsiq` and place this project at the repository root. The repository is currently public; this project contains no credentials. Do not upload `.env` files or keys.
2. In Vercel, import that repository. Use framework preset **Other**, build command `npm run build`, and output directory `public`. The root `api` functions are deployed separately by Vercel. Use Node.js 24.
3. Add the following environment variables in Vercel Project Settings. Mark secrets **Sensitive** and scope them to Production (and Preview only if you want live AI in previews):
   - `ANTHROPIC_API_KEY`: your Claude API key, entered directly in Vercel.
   - `ANTHROPIC_MODEL`: exact model ID available to your Anthropic account. The chosen model must support forced custom tool use. Validate availability with a live request; no default model is assumed.
   - `DEMO_ACCESS_CODE`: a private access code of at least 12 characters, shared only with reviewers.
   - `SESSION_SECRET`: a random secret of at least 32 characters, generated in a password manager. Do not share it with reviewers.
4. Deploy or redeploy after adding variables. The application fails closed for live requests until all four values are configured; prepared samples remain usable.
5. Test wrong and correct access codes, a fresh happy-path Claude response, the missing-MRI unhappy path, all nine evals, and the human handoff. Record actual results; offline tests do not count as live eval passes.

Before sharing beyond invited reviewers, configure provider spending controls and Vercel firewall rate limits on `/api/session` and `/api/analyze`. The built-in limits are **per running function instance** (12 analyses per session/minute and 60 total analyses/minute per instance). They reset across cold starts and do not impose a global spending cap. The shared access code is an invited-demo gate, not individual user authentication. Rotate it and SESSION_SECRET to revoke existing sessions. Rotating just the code does not invalidate existing cookies.

## Local verification

No third-party runtime packages are required. With Node.js 24 installed:

```sh
npm run build
npm test
npm start
```

Open `http://127.0.0.1:3000`. Without environment variables it runs labeled samples. For live local testing, set variables in your process or use Node's `--env-file` support with a local ignored `.env` file: `node --env-file=.env scripts/dev.cjs`. Do not commit that file. Tests use a fake key and mocked provider responses and do not spend API credits.

Edit `source.html` for domain/UI changes and run `npm run build`; this regenerates `lib/domain.cjs` and `public/index.html` together. The original Product Faculty helper is retained in source.html for provenance but is removed from the hosted output. Only `public` is served statically. No secrets belong in source.html, public, or any tracked file.

## Known scope

- All patient, payer and integration records are synthetic. There is no upload endpoint for real patient data.
- Human review actions and eval verdicts remain in memory for the browser visit, as in the original prototype; reload clears them. This version does not add a database, feedback survey or durable audit storage.
- A live response is structurally checked, including citation IDs; this does not guarantee domain accuracy. Review before acting.
- Deployment credentials, API credits and selected model access must be verified in the owner's accounts. No live results are claimed by the repository.

## Reference documentation

- [Vercel sensitive environment variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables)
- [Vercel Node.js functions](https://vercel.com/docs/functions/runtimes/node-js)
- [Claude custom tool definitions](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)

The domain refinements from the capstone revision remain in the embedded data, prompts, samples and nine eval expectations.
