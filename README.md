# qcmobile

Borrower mobile app — Expo SDK 51 + React Native + TypeScript + expo-router.

## Local dev
```bash
pnpm install
cp .env.example .env       # set EXPO_PUBLIC_API_URL etc.
pnpm start                 # then press i for iOS or a for Android
```

The backend (qcbackend) must be running for data to render.

## Structure
- `app/` — expo-router screens (file-based)
  - `(tabs)/` — bottom-tab pages: Home, Calendar, Simulate, Vault, Profile
  - `loan/[id]` — Loan File (Activity / Chat / Docs)
  - `_layout.tsx` — root stack
- `src/design-system/` — tokens + ThemeProvider + primitives (RN port)
- `src/lib/` — api.ts, ws.ts, enums.generated.ts (autogen from backend)
- `src/store/` — zustand for theme/credit-unlock
