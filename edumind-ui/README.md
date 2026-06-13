# EduMind UI

This is the current learner-facing Flutter app for OpenMind Game Studio.

It contains the polished bilingual UI layer: onboarding, profile/session setup,
language sync, settings, mascots, home path, bundled demo games, AI game
generation, player launch, and local save/replay.

## Run

Start the backend from the repo root first:

```bash
npm install
npm run build
npm run dev:backend
```

Then run the app:

```bash
cd edumind-ui
flutter pub get
flutter run -d chrome
```

For a static release web build:

```bash
flutter build web
$env:PORT="53211"; node tool/serve.mjs   # Windows PowerShell
# or: PORT=53211 node tool/serve.mjs     # macOS/Linux
```

## Notes

- Demo Games works from bundled JSON specs and does not require API keys.
- Generate uses the backend at `http://127.0.0.1:8080` by default.
- Without `ANTHROPIC_API_KEY`, the backend uses mock LLM mode so the flow can
  still be tested end to end.
- Web saves use IndexedDB. Native saves use Drift/SQLite.
- `flutter_module/` is still kept in the repo for engine/reference parity, but
  this folder is the current product UI.
