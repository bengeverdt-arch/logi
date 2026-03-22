# LOGI — Land Operations & Groundfire Intelligence

Prescribed burn planning tool. Draw a burn unit boundary. LOGI does the rest.

**Status:** v0.1.0 — scaffolded, not yet functional

## Stack
- **Frontend:** Static HTML/CSS/JS — Cloudflare Pages
- **Backend:** Cloudflare Worker — API proxy, holds all secrets
- **Deploy:** GitHub → Cloudflare Pages via GitHub Actions

## Setup

### Secrets required
Set the following in GitHub Actions secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Set the following as Cloudflare Worker secrets:
```
wrangler secret put SYNOPTIC_TOKEN
```

### Deploy
Push to `master` — GitHub Actions handles the rest.

## Version Roadmap
| Version | Milestone |
|---------|-----------|
| v0.1.0 | Scaffold — architecture in place, deploys to Cloudflare |
| v0.2.0 | Map renders, user can draw a burn unit boundary |
| v0.3.0 | Nearest RAWS station, live fuel moisture |
| v0.4.0 | NWS spot forecast |
| v0.5.0 | Sensitive receptors |
| v0.6.0 | Adjacent land ownership |
| v0.7.0 | Water sources |
| v0.8.0 | Prescription go/no-go logic |
| v0.9.0 | UI polish, field-ready |
| v1.0.0 | Complete |
