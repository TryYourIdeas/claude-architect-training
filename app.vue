<template>
  <div class="app">
    <header class="app__header">
      <NuxtLink to="/" class="app__brand">Claude Architect Training</NuxtLink>
      <span class="app__exam">CCAR-F · Foundations</span>
    </header>
    <main class="app__main">
      <NuxtPage />
    </main>
  </div>
</template>

<style>
:root {
  --bg: #fbf8f4;
  --surface: #ffffff;
  --text: #1f1d1a;
  --muted: #6b655d;
  --border: #e4ddd3;
  --accent: #c15f3c;
  --accent-soft: #fbeee8;
  --ok: #2e7d4f;
  --bad: #b03a2e;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #1c1a17;
    --surface: #252320;
    --text: #efeae3;
    --muted: #a39b90;
    --border: #3a3631;
    --accent: #e0906f;
    --accent-soft: #3a2a22;
    --ok: #6fbf8a;
    --bad: #e07a6e;
  }
}
:root[data-theme="dark"] {
  --bg: #1c1a17;
  --surface: #252320;
  --text: #efeae3;
  --muted: #a39b90;
  --border: #3a3631;
  --accent: #e0906f;
  --accent-soft: #3a2a22;
  --ok: #6fbf8a;
  --bad: #e07a6e;
}
body { margin: 0; background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
a { color: var(--accent); }
.app__header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 16px; border-bottom: 1px solid var(--border); flex-wrap: wrap; gap: 0.5rem; }
.app__brand { font-weight: 700; color: var(--text); text-decoration: none; }
.app__exam { color: var(--muted); font-size: 0.85rem; }
.app__main { max-width: 860px; margin: 0 auto; padding: 1.5rem 16px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; }
.btn { font: inherit; padding: 0.6rem 1.1rem; border-radius: 8px; border: 1px solid var(--accent); background: var(--accent); color: #fff; cursor: pointer; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn--ghost { background: transparent; color: var(--accent); }
.muted { color: var(--muted); }
.alert { border: 1px solid var(--bad); color: var(--bad); padding: 0.75rem 1rem; border-radius: 8px; }
@media (max-width: 600px) { .app__main { padding: 1rem 16px; } }
</style>
