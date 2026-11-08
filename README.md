# VariLink

Variation and change management for cost teams, from the first DCR to the approved VO.
Built for the AAA Cost Code AI Challenge 2026.

**Live tool:** https://mahmoudahmedibrahim-debug.github.io/varilink/

## Try it in two minutes
1. Open the link. A fictional project, Palm Grove Residences, is loaded.
2. Open package PK-01, then change CE-PK01-003 (boundary wall relocated).
3. Check the omissions, additions, abortive work and risk allowance. Choose **Analyse** to link BOQ items, spec extracts and contract clauses.
4. Choose **Export CR form** to get the company CR format with live formulas.
5. In **Variation orders**, group CRs into a VO and export the VO summary.

No login. Everything stays in the browser. Use sample data only.

## How it works
| Part | File | Role |
|---|---|---|
| Calculation engine | `src/engine.js` | Quantity rules by contract type, rates, OH&P, risk allowance, abortive work, VO values, logs |
| Smart reader | `src/reader.js` | Reads BOQs, CR forms, take-offs, cost reports, PDFs and Outlook emails; quality checks |
| App | `src/app.js` | Projects, packages, changes, analysis, AI routes, Excel exports |
| Tests | `test/` | Unit tests for the engine and reader, browser test of the full flow |

### Rules in code, AI as assistant
All amounts come from tested code, so results repeat and can be audited.
AI drafts the change BOQ, proposes take-off from drawings, reviews changes against contract clauses and reads scanned files.
Every AI line stays unverified until the user accepts it.

AI routes:
- **Free:** the tool prepares the request; paste it into any AI chat and paste the reply back.
- **API key:** one click inside the tool, a few cents per use.

### Quantity rules
- Lump sum and design and build: full replacement keeps BOQ quantities; partial changes use actual take-off.
- Re-measured: actual take-off.
- Omissions negative, additions positive, net is the sum.

## Build and test
```
npm install
npm test
npm run build
```
