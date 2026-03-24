# MOODIO (Datapizza Inc.) — Legal Document Overview

> **For all team members.** This explains what each legal document does and why.

---

## Company Structure

| Entity | Jurisdiction | Role |
|--------|-------------|------|
| **Datapizza Inc.** | Delaware C-Corp | US/global operations, owns all core IP |
| **⚠️ China entity TBD** | China domestic company | China operations (Alipay users), licensed IP from Datapizza |

> **Note on China entity:** The current docs use "北京未名商道文化有限公司" (Beijing Weiming Shangdao Culture Co., Ltd.) as a **temporary placeholder**. When the actual China entity is registered, do a find-and-replace in the following files:
>
> | File | What to replace |
> |------|----------------|
> | `legal/published/china-terms-of-service.md` | Company name (appears ~5 times), address, phone |
> | `legal/published/china-privacy-policy.md` | Company name (appears ~3 times), privacy officer name, address, phone |
> | `legal/published/china-ai-labeling-policy.md` | Company name (appears ~3 times) |
> | `legal/published/china-real-name-policy.md` | Address, phone |
> | `legal/internal/technology-licensing-agreement.md` | Licensee name (appears ~15 times), address, short name |
> | This file (`OVERVIEW.md`) | Company structure table above |
>
> Search for `北京未名商道文化有限公司` and `Beijing Weiming Shangdao Culture Co., Ltd.` and `北京市海淀区中关村大街11号9层908` and `15910731432` to find all instances. Also update the CAC filing numbers from "待申请" to actual numbers once received.

The two entities will be linked by a Technology Licensing Agreement (template in `legal/internal/`). The US entity licenses IP to the China entity — same model as ByteDance/TikTok-Douyin.

---

## What Each Document Does

### Public-Facing Documents (12) — Need web pages

| # | Document | URL | Purpose |
|---|----------|-----|---------|
| 1 | **Terms of Service** | `/legal/terms` | Master agreement. Content licensing (Section 5): users keep ownership but grant us a broad license for hosting, AI generation, moderation, and model training — one-time consent at signup, no re-signing per upload. Search library (Section 6): we don't own the reference videos, users can only use them for reference. AI transparency (Section 7): we're upfront that AI outputs may not be copyrightable. |
| 2 | **Privacy Policy** | `/legal/privacy` | CCPA + GDPR compliant. Covers what data we collect (account info, uploads, AI prompts, usage data), how we use it (including AI model training — explicitly disclosed per FTC guidance), and user rights. |
| 3 | **Acceptable Use Policy** | `/legal/acceptable-use` | Prohibited content and behavior. **This is the union of ALL upstream AI provider restrictions** — if Google says 18+, Runway says no photos without permission, and Luma says disclose AI for human likenesses, we require all of them. |
| 4 | **DMCA & Copyright Policy** | `/legal/dmca` | Required for safe harbor protection. Takedown/counter-notice process, 3-strike repeat infringer system. DMCA agent: Yili Han (yiliesmehan@gmail.com), registered at copyright.gov on our behalf. |
| 5 | **Cookie Policy** | `/legal/cookies` | Required for EU users. Lists cookie types and purposes. |
| 6 | **Community Guidelines** | `/legal/community-guidelines` | User-friendly version of the AUP with AI disclosure requirements. |
| 7 | **Subscription & Credit Terms** | `/legal/subscription-terms` | How credits and subscriptions work. All specific plan names, prices, and credit amounts live on the pricing page (moodio.art/credits) — this doc just covers the legal framework (auto-renewal, cancellation rights, price change notice, taxes). No need to update this doc when pricing changes. |
| 8 | **Refund Policy** | `/legal/refunds` | Generally non-refundable with discretionary exceptions (duplicate charges, system errors, unauthorized charges). Deliberately minimal so we handle edge cases case-by-case without being locked into specific windows. |
| 9 | **China ToS** | `/legal/cn/terms` | Bilingual. PRC law governs. Adds PRC-specific prohibited content (national security, socialist values). CAC filing numbers pending. |
| 10 | **China Privacy** | `/legal/cn/privacy` | PIPL compliant. All data stays on China servers. Cross-border transfer requires security assessment. |
| 11 | **China AI Labeling** | `/legal/cn/ai-labeling` | Sept 2025 rules: visible "AI生成" watermarks + invisible metadata per GB 45438-2025. |
| 12 | **China Real-Name** | `/legal/cn/real-name` | Required by Cybersecurity Law. Phone + ID verification before AI features. |

### Internal Documents (3) — NOT on website

| # | Document | Purpose |
|---|----------|---------|
| 13 | **PIIA** | Proprietary Information & Inventions Assignment. Assigns work-related IP to the company. Template in `legal/internal/piia-template.md`. **Not urgent now, but get everyone to sign before fundraising** — investors will check. When ready: print, fill in name/role, sign, store signed PDF in private Google Drive. |
| 14 | **NDA** | Mutual NDA for conversations with potential partners, investors, or hires before they join. Template in `legal/internal/nda-template.md`. |
| 15 | **Technology Licensing Agreement** | IP license from Datapizza Inc. → China entity. Sets royalty rate (8% of net revenue), IP ownership (all stays with US entity), and regulatory compliance split. Use when China entity is established. |

### Not Yet Needed (Future)

| Document | When to create |
|----------|---------------|
| Enterprise MSA | First enterprise/B2B customer |
| Data Processing Agreement (GDPR) | First EU enterprise customer |
| API Terms of Service | When we launch a public API |
| Equity docs (RSPA, stock options) | When adding cofounders or employees with equity — use [Clerky](https://www.clerky.com) or [Stripe Atlas](https://stripe.com/atlas), don't self-draft |

---

## Details That Are Currently Generic (Fill In When Confirmed)

These items are written generically in the legal docs because the specifics aren't finalized or may change. Update the docs when you have confirmed details.

| What | Currently says | Where | When to update |
|------|---------------|-------|---------------|
| **AI model providers** | "Third-Party AI Services" (generic) | Privacy Policy §4, AUP §5 | When you want to name specific providers publicly. Currently using fal.ai and kie.ai as intermediaries for Kling, Veo, Seedance, Sora, Hailuo, Wan models — legal docs don't name these since they change. |
| **Payment processors** | "Stripe" and "Alipay" | Privacy Policy §4, Subscription Terms §3.6, China ToS §4.2 | Verify these are correct when payment is implemented. Stripe is mentioned but not yet in the codebase. |
| **China entity name** | 北京未名商道文化有限公司 | China ToS, China Privacy, China AI Labeling, China Real-Name, Tech Licensing | Replace when actual China entity is registered. Search for `北京未名商道文化有限公司` and `Beijing Weiming Shangdao Culture Co., Ltd.` across all docs. |
| **CAC filing numbers** | "待申请 (Pending)" | China ToS §2.3, China AI Labeling §5 | Fill in after completing CAC generative AI service filing and algorithm filing. |
| **Company name** | Datapizza Inc. | All docs | Update everywhere if company name changes. |
| **Company address** | 651 N Broad St, Suite 201, Middletown, DE 19709 | ToS, DMCA, Privacy, NDA, Tech Licensing | Update if registered agent address changes. |
| **DMCA agent** | Yili Han (yiliesmehan@gmail.com) | ToS §9.1, DMCA Policy §2 and §12 | Update if DMCA agent changes. Must also update at copyright.gov ($6). |
| **Model-specific AUP restrictions** | Generic ("restrictions from specific model providers are incorporated by reference") | AUP §5 | Can add model-specific restrictions later if needed. Currently generic to avoid updating every time models change. |

---

## Legally Required Parameters (Cannot Remove From Docs)

These are in the legal docs because laws require them — not because we chose them.

| Requirement | Value | Law / Source | Where in Docs |
|---|---|---|---|
| **Age minimum** | 18+ | Google Vertex AI API terms; standard for AI platforms | ToS §1, China ToS §3 |
| **Auto-renewal disclosure** | Must clearly state subscriptions auto-renew and how to cancel | California ARL (effective July 2025), FTC Negative Option Rule | Subscription Terms §3.4 |
| **Price change notice** | At least 30 days before new price takes effect | California ARL requires 7-30 days; 30 is safest | Subscription Terms §3.5 |
| **DMCA counter-notice timeline** | 10-14 business days to restore content | 17 USC §512(g)(2)(C) — this is in the statute, cannot change | DMCA Policy §5 |
| **DMCA repeat infringer policy** | Must have one (we chose 3 strikes) | 17 USC §512(i) — required for safe harbor | DMCA Policy §6 |
| **Liability cap** | Greater of 12-month payments or $100 (US) / RMB 100 (China) | Not legally required but removing exposes you to unlimited liability | ToS §12.2, China ToS §10 |
| **EU withdrawal right waiver** | Users consent to immediate performance, acknowledging loss of 14-day withdrawal right | EU Consumer Rights Directive 2011/83/EU, Art. 16(m) | Refund Policy §3.3 |
| **Payment tax responsibility** | User pays applicable taxes | Tax law; standard in all SaaS | Subscription Terms §6 |
| **Consent logging** | Store timestamp, version, IP for 3+ years | California ARL (3 years or 1 year after termination, whichever longer) | Engineering: README |
| **Same-medium cancellation** | Users who sign up online must be able to cancel online | California ARL (effective July 2025) | Subscription Terms §4.3 |
| **Payment record retention** | 7 years | IRS requirement | Privacy Policy §5 |

**Everything else** (plan names, credit amounts, feature lists, refund windows, appeal timelines) can live on the pricing page or be changed without updating legal docs.

---

## When to Update Legal Docs vs. Just the Pricing Page

**Only update legal docs (+ 30-day user notice) when:**
- Adding/removing a payment processor (Stripe, Alipay)
- Changing auto-renewal or cancellation mechanics
- Changing the refund policy (e.g., adding a guarantee)
- Changing the liability cap
- Changing dispute resolution (arbitration vs. courts)
- Changing content licensing terms (what rights we take on uploads)
- Adding/removing a Third-Party AI Service (update AUP)
- Changing data handling practices

**Only update pricing page (no legal doc change needed) when:**
- Changing plan names, prices, or credit amounts
- Changing credit costs per generation type
- Changing feature lists per tier
- Changing credit expiration or rollover rules
- Changing free trial length
- Adding/removing plan tiers
- Changing enterprise pricing

---

## Key Design Decisions

**Content licensing:** Users keep ownership. We take a broad operational license (like YouTube/Runway) covering hosting, AI processing, team sharing, moderation, and model training. One-time consent at signup — no re-signing per upload.

**AI training disclosure:** Explicitly stated in ToS Section 5.3(e). The FTC has penalized companies for undisclosed AI training on user data — we're transparent from day one.

**Search library:** We don't own the content. Protected by DMCA safe harbor (registered agent + takedown process + repeat infringer policy). Users limited to non-commercial reference.

**No IP indemnification:** Same as Runway and Midjourney. Only well-capitalized companies (Google, Adobe) offer this. May add for Enterprise tier later.

**Third-party API compliance:** Our AUP is the most restrictive set across all upstream providers. Runway explicitly requires us to pass their restrictions to our users.

**Cannot legally integrate right now:** Midjourney (no public API), Seedance (API not launched), Kling (needs separate enterprise agreement).

---

## Reference Documents From Comparable Platforms

### Video Search / Reference
| Platform | Terms | IP Policy |
|----------|-------|-----------|
| ShotDeck | [Terms](https://shotdeck.com/welcome/terms) | [Image Usage](https://help.shotdeck.com/content/how-can-i-use-the-images-on-shotdeck/) |
| Frameset | [Terms](https://site.frameset.app/legal/terms-of-use) | [Copyright](https://site.frameset.app/legal/copyright-dispute-policy) |
| YouTube | [Terms](https://www.youtube.com/t/terms) | [Copyright](https://support.google.com/youtube/answer/2797466) |
| Vimeo | [Terms](https://vimeo.com/terms) | [AI Addendum](https://vimeo.com/legal/service-terms/ai) |

### AI Generation
| Platform | Terms | Usage Policy | API |
|----------|-------|-------------|-----|
| Runway | [Terms](https://runwayml.com/terms-of-use) | [Usage](https://help.runwayml.com/hc/en-us/articles/17944787368595) | — |
| Luma AI | [Terms](https://lumalabs.ai/legal/tos) | [Moderation](https://lumalabs.ai/legal/content-moderation) | [API Terms](https://lumalabs.ai/dream-machine/api/terms) |
| Midjourney | [Terms](https://docs.midjourney.com/hc/en-us/articles/32083055291277-Terms-of-Service) | [Guidelines](https://docs.midjourney.com/hc/en-us/articles/32013696484109-Community-Guidelines) | No API |
| Kling AI | [Terms](https://klingai.com/global/docs/user-policy) | [Community](https://app.klingai.com/global/docs/community-policy) | — |
| Dreamina/Seedance | [Terms](https://dreamina.capcut.com/clause/dreamina-terms-of-service) | — | No API |
| Google Veo | [Terms](https://policies.google.com/terms) | [Prohibited Use](https://policies.google.com/terms/generative-ai/use-policy) | [Gemini API](https://ai.google.dev/gemini-api/terms) |

### Stock Content
| Platform | License | AI Policy |
|----------|---------|-----------|
| Adobe Stock | [License](https://stock.adobe.com/license-terms) | [AI Guidelines](https://helpx.adobe.com/stock/contributor/help/generative-ai-content.html) |
| Shutterstock | [License](https://www.shutterstock.com/license) | [AI Policy](https://submit.shutterstock.com/help/en/articles/10594622-content-policy-updates-ai-generated-content) |

### China Regulatory
| Resource | URL |
|----------|-----|
| ICP Filing Guide | [AppInChina](https://appinchina.co/how-can-i-get-an-icp-license-for-china/) |
| China AI Governance | [IAPP](https://iapp.org/resources/article/global-ai-governance-china) |
| China Tech Licensing | [Harris Sliwoski](https://harris-sliwoski.com/chinalawblog/2025-china-technology-licensing-guide/) |
| VIE Structures | [Norton Rose Fulbright](https://www.nortonrosefulbright.com/en/knowledge/publications/60b9aba5/chinas-regulations-on-variable-interest-entity-structure-and-recent-developments) |

---

## What Everyone Needs to Do

### All team members
- **Sign the PIIA before fundraising.** Template is in `legal/internal/piia-template.md`. Print → fill in your name and role → sign → store signed PDF in team's private Google Drive. Not urgent for day-to-day work, but investors will require it during due diligence.

### Founders
- DMCA agent registered ✅ (Yili Han, yiliesmehan@gmail.com)
- When adding cofounders or issuing equity: use [Clerky](https://www.clerky.com) — don't self-draft stock documents

---

*Last updated March 24, 2026. Questions: support@moodio.art*
