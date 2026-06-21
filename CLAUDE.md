# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (Vite, hot reload) — typically runs on :5173 or next available port
npm run build     # TypeScript check (tsc --noEmit) then Vite production build → dist/
npm run preview   # Serve dist/ locally for production testing
```

No test runner is configured. Verify features manually via the dev server.

## Architecture

**Stack:** Vanilla TypeScript + Vite. No UI framework. All rendering is imperative DOM manipulation.

**Routing:** Hash-based SPA in [`src/main.ts`](src/main.ts). `RENDERERS` maps `PageId` strings (`lookup`, `analyze`, `situation`, `collection`, `quiz`, `settings`) to `render*Page(container: HTMLElement)` functions. Every navigation replaces `#page-container`'s innerHTML. `applyTheme()` is exported from `main.ts` because `settings.ts` needs to call it.

**Persistence:** Everything in `localStorage` — no backend. [`src/services/storage.ts`](src/services/storage.ts) owns all reads/writes via typed key constants:
- `phrase_collection` → `ConversationItem[]`
- `situation_collection` → `SituationPack[]`
- `settings` → `AppSettings`
- `lookup_history` → `LookupHistoryItem[]` (capped at 20)

**AI:** [`src/services/ai.ts`](src/services/ai.ts) calls Gemini 2.5 Flash directly from the browser. API key stored in localStorage settings. 3-second client-side throttle between calls (`THROTTLE_MS`). All three AI functions (`lookupPhrase`, `analyzeDialogue`, `searchSituation`) share a single `callGemini()` helper with `responseMimeType: 'application/json'`. Prompts embed `TAG_CONSTRAINT` from `src/constants/tags.ts` to restrict AI-generated tags to the predefined list.

**Tag system:** [`src/constants/tags.ts`](src/constants/tags.ts) is the single source of truth for the 24 allowed tags (grouped into 功能/場合/情境). `MAX_TAGS = 4`. Tags are enforced at three points: AI prompts, the tag editor UI (chip popover, not free text), and the cleanup function in settings. `mapLegacyTag()` maps old free-text tags to the predefined list during cleanup.

**Duplicate detection:** `findSimilarPhrases()` in `storage.ts` uses two-tier matching before any save: (1) normalized string match after stripping punctuation, (2) Jaccard word similarity ≥ 0.6 for phrases with 2+ words. When a match is found, `showSimilarPhraseDialog()` from `src/components/confirmDialog.ts` shows a promise-based modal.

## Page responsibilities

| Page | File | Key behavior |
|------|------|-------------|
| 查詢 | `pages/lookup.ts` | Single phrase lookup; async save handler checks similarity before `addPhraseItem` |
| 分析 | `pages/analyze.ts` | Paste dialogue → batch extract; similar items get ⚠️ badge; batch save triggers single dialog if any similar |
| 情境 | `pages/situation.ts` | 18 `CATEGORIES` are **filters** on saved `SituationPack`s (not search triggers). Generate section at bottom creates new packs. Category picker popover is mounted to `document.body` with `position:fixed` to escape parent `overflow:hidden` |
| 收藏 | `pages/collection.ts` | Two tabs: phrase cards (`phrase_collection`) and situation packs (`situation_collection`). Tag filters grouped by `TAG_GROUPS` from constants |
| 測驗 | `pages/quiz.ts` | Flashcard-only format. Setup screen filters by mastery/tag. Each card shows front (phrase), reveal shows translation + alternatives + dialogue. Three mastery buttons (不熟/尚可/熟悉) write directly to `updatePhraseItem`. Result screen shows % familiar as score |
| 設定 | `pages/settings.ts` | API key, theme, export/import JSON, storage usage, tag cleanup (migrates `situationTags` → predefined `tags` via `mapLegacyTag`) |

## Component conventions

- Pages render by setting `container.innerHTML` with a template string, then binding events. Always query elements relative to `container`, not `document`.
- HTML injected via template strings must escape user data through a local `esc()` function (defined in each file that needs it — not shared).
- `phraseCard.ts` uses a closure-local `rebuild(current)` pattern to re-render a card in place after mutations without re-querying storage.
- `tagEditor.ts` renders a chip popover (not free-text input). Popover is appended to `container` (the tag-editor wrap), not body — the tag editor is not inside overflow:hidden.
- Any popover that appears inside a card with `overflow:hidden` (e.g., the situation category picker) must be appended to `document.body` and positioned with `position:fixed` + `getBoundingClientRect()`.
- `dialogueDisplay.ts` renders dialogue lazily inside `<details>` elements to avoid re-querying on toggle.

## Key design decisions

- `situationTags` on `ConversationItem` is a legacy field — it's kept in the type for backward-compat but is always saved as `[]`. Only `tags` (from the predefined list) is used for filtering and display.
- `SituationPack.category` must be one of the 18 `CATEGORIES[].label` values. Packs with `category = '自訂'` (old data) show as ⚠️ 未分類 and can be re-categorized via the inline picker.
- Situation page phrases are **read-only** — they can only be saved as a complete pack, not as individual `ConversationItem`s. The phrase/analyze pages are the entry points for individual phrase saving.
- CSS class names follow BEM-like flat pattern (`phrase-card`, `phrase-card-header`). Theme switching via `data-theme="dark"` on `<html>`. CSS custom properties in `src/styles/variables.css`.
