# Sthara School OS

The school platform behind www.sthara.in: student, teacher, parent and school-office portals, the
AI tutor and grading, and the operator console (Platform Manager). Next.js on Vercel, Supabase
(Postgres, Auth, Storage) in ap-south-1, Gemini for AI.

## Develop

```bash
npm install
npm run dev          # builds the marketing site into public/site, then starts Next.js
```

Local dev has no Supabase service key, so server routes that write to the database fail locally;
UI work runs against the dev role cookie. Environment variables live in Vercel.

## Layout

| Path | What |
|---|---|
| `src/app/{student,teacher,parent,admin}` | The portals |
| `src/app/ops` | Platform Manager (operators only; 404 for everyone else) |
| `src/app/api` | Server routes |
| `src/lib` | Domain logic (settings and tiers, TML, curriculum, grading, ops) |
| `site/` | Marketing site source, built into `public/site` |
| `supabase/migrations` | Database migrations, applied in order |

## Checks

```bash
npx tsc --noEmit
npm run lint
npx tsx --test src/lib/**/*.test.ts     # unit tests (settings, ops, AI usage)
npx tsx src/lib/tml/run-test.ts         # TML engine checks
npx tsx src/lib/curriculum/validate.ts  # curriculum integrity
npm run test:site                       # marketing site
```

## Database

```bash
npm run db:login && npm run db:link
npm run db:status      # which migrations are applied
npm run db:push:dry    # preview, then npm run db:push
```

Never commit keys: server secrets come from Vercel environment variables only.
