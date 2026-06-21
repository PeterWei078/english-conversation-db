import { loadSettings, saveSettings } from './services/storage';
import { renderLookupPage }     from './pages/lookup';
import { renderAnalyzePage }    from './pages/analyze';
import { renderSituationPage }  from './pages/situation';
import { renderCollectionPage } from './pages/collection';
import { renderQuizPage }       from './pages/quiz';
import { renderSettingsPage }   from './pages/settings';
import type { Theme } from './types/index';

// ── Theme ─────────────────────────────────────────────────
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'auto') {
    root.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } else {
    root.dataset.theme = theme;
  }
  updateThemeIcon();
}

function updateThemeIcon(): void {
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.textContent = document.documentElement.dataset.theme === 'dark' ? '☀️' : '🌙';
  }
}

function initTheme(): void {
  applyTheme(loadSettings().theme);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (loadSettings().theme === 'auto') applyTheme('auto');
  });
}

// ── Router ────────────────────────────────────────────────
type PageId = 'lookup' | 'analyze' | 'situation' | 'collection' | 'quiz' | 'settings';

const RENDERERS: Record<PageId, (c: HTMLElement) => void> = {
  lookup:     (c) => renderLookupPage(c),
  analyze:    renderAnalyzePage,
  situation:  renderSituationPage,
  collection: renderCollectionPage,
  quiz:       renderQuizPage,
  settings:   renderSettingsPage,
};

function getPageId(hash: string): PageId {
  const id = hash.replace('#', '') as PageId;
  return id in RENDERERS ? id : 'lookup';
}

function navigate(hash: string): void {
  const pageId = getPageId(hash);
  const container = document.getElementById('page-container')!;
  RENDERERS[pageId](container);
  updateNavTabs(pageId);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function updateNavTabs(active: PageId): void {
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.classList.toggle('active', (tab as HTMLElement).dataset.page === active);
  });
}

// ── Theme Toggle ──────────────────────────────────────────
function initThemeToggle(): void {
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme;
    const next: Theme = current === 'dark' ? 'light' : 'dark';
    const settings = loadSettings();
    settings.theme = next;
    saveSettings(settings);
    applyTheme(next);
  });
}

// ── Init ──────────────────────────────────────────────────
function init(): void {
  initTheme();
  initThemeToggle();
  window.addEventListener('hashchange', () => navigate(location.hash));
  navigate(location.hash || '#lookup');
}

init();
