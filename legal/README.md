# Legal Documents

This folder contains all of Moodio's (Datapizza Inc.) legal documents.

## Structure

```
legal/
├── published/              ← Website-facing docs. Render these as pages.
│   ├── terms-of-service.md
│   ├── privacy-policy.md
│   ├── acceptable-use-policy.md
│   ├── dmca-copyright-policy.md
│   ├── cookie-policy.md
│   ├── community-guidelines.md
│   ├── subscription-credit-terms.md
│   ├── refund-policy.md
│   ├── china-terms-of-service.md        ← Bilingual (中/EN)
│   ├── china-privacy-policy.md          ← Bilingual (中/EN)
│   ├── china-ai-labeling-policy.md      ← Bilingual (中/EN)
│   └── china-real-name-policy.md        ← Bilingual (中/EN)
├── archive/                ← Old versions. Never delete from here.
├── internal/               ← Corporate templates. NOT for the website.
│   ├── piia-template.md               ← Sign before fundraising
│   ├── nda-template.md
│   └── technology-licensing-agreement.md
├── CHANGELOG.md
├── OVERVIEW.md             ← Share with all team members
├── PR-GUIDE.md
└── README.md               ← You are here
```

### Equity (RSPA, Stock Options, 83(b))

We do NOT self-draft equity documents. When the time comes:

- **Forming a new company:** Use [Stripe Atlas](https://stripe.com/atlas) ($500) — generates RSPAs and auto-files 83(b) elections.
- **Adding cofounders or issuing new shares:** Use [Clerky](https://www.clerky.com) (~$800) or [Carta Launch](https://carta.com/launch/) — handle share issuance, vesting, and 83(b) forms.
- **Cap table management and 409A valuations:** Use [Carta](https://carta.com) (free for early stage) or [Pulley](https://pulley.com).
- **When we have revenue or funding:** Consult a startup lawyer for option pool setup and investor-ready governance.

The 83(b) election has an **absolute 30-day filing deadline** with no extensions. Clerky and Stripe Atlas handle this automatically.

---

## For the engineer building the pages

### What already exists in the repo

- **`react-markdown`** — already in `package.json`
- **`components/ui/markdown-renderer.tsx`** — working `ReactMarkdown` wrapper
- **HeroUI** — `@heroui/checkbox`, `@heroui/button`, `@heroui/card`, etc.
- **`next-intl`** — for i18n (China docs are bilingual inline in the `.md`)
- Pages outside `(dashboard)/` render without sidebar/navbar (see `app/auth/`, `app/maintenance/`)

### URL mapping

| File | Route |
|------|-------|
| `terms-of-service.md` | `/legal/terms` |
| `privacy-policy.md` | `/legal/privacy` |
| `acceptable-use-policy.md` | `/legal/acceptable-use` |
| `dmca-copyright-policy.md` | `/legal/dmca` |
| `cookie-policy.md` | `/legal/cookies` |
| `community-guidelines.md` | `/legal/community-guidelines` |
| `subscription-credit-terms.md` | `/legal/subscription-terms` |
| `refund-policy.md` | `/legal/refunds` |
| `china-terms-of-service.md` | `/legal/cn/terms` |
| `china-privacy-policy.md` | `/legal/cn/privacy` |
| `china-ai-labeling-policy.md` | `/legal/cn/ai-labeling` |
| `china-real-name-policy.md` | `/legal/cn/real-name` |

**Rendering approach is your choice.** Read `.md` with `fs` in a server component → pass to `MarkdownRenderer`, use `next-mdx-remote`, convert to static HTML, etc. Only requirement: stable URLs that never change.

### Rendering tip

```tsx
<div className="prose prose-neutral dark:prose-invert max-w-3xl mx-auto px-6 py-12">
  <MarkdownRenderer>{content}</MarkdownRenderer>
</div>
```

Needs `@tailwindcss/typography` (`npm install @tailwindcss/typography`, add to `tailwind.config.mjs` plugins). Optional — docs work without it.

Legal pages should live **outside** `(dashboard)` — no sidebar, no navbar. Same as `app/auth/` and `app/maintenance/`.

---

## Required integrations

### 1. Clickwrap on signup — LAUNCH BLOCKER

In `app/auth/login/page.tsx`, add an **unchecked** checkbox:

```tsx
import { Checkbox } from "@heroui/checkbox";

const [agreedToTerms, setAgreedToTerms] = useState(false);

<Checkbox
  isSelected={agreedToTerms}
  onValueChange={setAgreedToTerms}
  size="sm"
>
  <span className="text-sm">
    I agree to the{" "}
    <a href="/legal/terms" target="_blank" className="text-primary underline">Terms of Service</a>,{" "}
    <a href="/legal/privacy" target="_blank" className="text-primary underline">Privacy Policy</a>, and{" "}
    <a href="/legal/acceptable-use" target="_blank" className="text-primary underline">Acceptable Use Policy</a>.
  </span>
</Checkbox>

<Button isDisabled={!agreedToTerms || loading} type="submit">
  Create Account
</Button>
```

Without this, the Terms may not be enforceable. Checkbox **must be unchecked by default**.

### 2. Consent logging — LAUNCH BLOCKER

When creating a user, save:

```ts
{
  terms_accepted_at: new Date().toISOString(),
  terms_version: "2026-03-24",
  terms_accepted_from_ip: request.headers.get("x-forwarded-for") || "unknown",
}
```

### 3. Footer links — LAUNCH BLOCKER

```tsx
<div className="flex gap-3 text-xs text-default-400">
  <a href="/legal/terms">Terms</a>
  <a href="/legal/privacy">Privacy</a>
  <a href="/legal/cookies">Cookies</a>
  <a href="/legal/dmca">DMCA</a>
</div>
```

### 4. Payment flow text — BEFORE CHARGING

Near the purchase button in `app/(dashboard)/credits/page.tsx`:

```tsx
<p className="text-xs text-default-500 mt-2">
  By purchasing, you agree to our{" "}
  <a href="/legal/subscription-terms" className="underline">Subscription Terms</a>
  {" "}and{" "}
  <a href="/legal/refunds" className="underline">Refund Policy</a>.
  I consent to immediate access and acknowledge that I lose my right 
  of withdrawal once the service begins.
</p>
```

The last sentence is required by EU law — it waives the 14-day withdrawal right for digital content. Without it, EU users could use credits and then demand a full refund.

### 5. Cookie consent banner — BEFORE EU USERS

Show on first visit if cookie `moodio_cc` isn't set. Link to `/legal/cookies`.

---

## Contact email

All docs use **support@moodio.art** except for DMCA takedown notices, which go to our designated DMCA agent **Yili Han** at **yiliesmehan@gmail.com**.

---

## DO NOT

- Expose `legal/internal/` on the website
- Change a legal URL after publishing (use redirects)
- Delete from `legal/archive/`
- Pre-check the terms checkbox

---

## Checklist

- [ ] Add consent columns to user/auth table
- [ ] Clickwrap checkbox on signup
- [ ] Footer links
- [ ] Payment flow legal text
- [ ] Cookie consent banner
