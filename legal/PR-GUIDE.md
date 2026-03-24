# How to Submit the Legal Documents PR

```bash
git checkout -b feat/legal-documents
# Copy legal/ folder into repo root
git add legal/
git commit -m "feat: add legal documents for Datapizza Inc.

12 public policies (legal/published/) + 3 internal templates (legal/internal/).
See legal/README.md for engineering integration instructions.
See legal/OVERVIEW.md for full team context."

git push origin feat/legal-documents
```

Open PR. Title: `feat: Legal documents for Datapizza Inc.`

After merge, the engineer reads `legal/README.md` for everything they need.
