# Plan Box

## Stack technique
- Next.js 16 + React 19 + TypeScript
- Supabase (auth + base de données)
- Tailwind CSS v4
- Anthropic SDK (claude-sonnet-4-20250514 / claude-opus-4-20250514)

## Lancer le projet
```bash
cd /Users/sylvainrenaut/plan-box
npm run dev
```

## Agents disponibles

### Joseph — Agent de test Ma P'tite Règle
Joseph est un élève virtuel qui vérifie et corrige automatiquement les exercices de Ma P'tite Règle.

Quand l'utilisateur dit **"fais passer Joseph"**, exécuter :
```bash
export $(grep -v '^#' .env.local | xargs) && npm run joseph
```

Variantes :
- **"fais passer Joseph sur er"** → `npm run joseph "er"`
- **"fais passer Joseph avec correction"** ou **"Joseph --fix"** → `npm run joseph -- --fix`
- **"fais passer Joseph sur er avec correction"** → `npm run joseph -- --fix "er"`

Les variables d'env doivent être chargées avant (`export $(grep -v '^#' .env.local | xargs)`).
