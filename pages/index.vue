<script setup lang="ts">
import { EXAM, DIAGNOSTIC } from '~~/shared/exam'

interface TestSummary { id: string, mode: 'diagnostic' | 'practice', createdAt: number, finished: boolean, scaledScore: number | null, passed: boolean | null }

const { data: tests, refresh } = await useFetch<TestSummary[]>('/api/tests', { default: () => [] })
const starting = ref<string | null>(null)
const error = ref<string | null>(null)

async function start(mode: 'diagnostic' | 'practice') {
  starting.value = mode
  error.value = null
  try {
    const { id } = await $fetch<{ id: string }>('/api/tests', { method: 'POST', body: { mode } })
    await navigateTo(`/tests/${id}`)
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not start the test'
  }
  finally {
    starting.value = null
  }
}

function formatDate(ms: number) {
  return new Date(ms).toLocaleString()
}
</script>

<template>
  <div>
    <h1>Prepare for the Claude Certified Architect exam</h1>
    <p class="muted">
      Start with the diagnostic to see where you stand across the five domains, then take a full practice test
      built to the same rules as the exam.
    </p>

    <div class="grid">
      <section class="card">
        <h2>1. Diagnostic</h2>
        <p>{{ DIAGNOSTIC.items }} questions drawn across all five domains in blueprint proportion. Untimed. Use it to find your weak areas.</p>
        <button class="btn" :disabled="starting !== null" @click="start('diagnostic')">
          {{ starting === 'diagnostic' ? 'Starting…' : 'Start diagnostic' }}
        </button>
      </section>

      <section class="card">
        <h2>2. Practice exam</h2>
        <ul class="rules">
          <li>{{ EXAM.items }} items, multiple choice and multiple response</li>
          <li>{{ EXAM.timeLimitMinutes }} minutes, enforced by the server</li>
          <li>{{ EXAM.scenariosDrawn }} of {{ EXAM.scenarioBankSize }} scenarios drawn at random</li>
          <li>Pass at a scaled score of {{ EXAM.passScaled }} (scale {{ EXAM.scaleMin }}–{{ EXAM.scaleMax }})</li>
        </ul>
        <button class="btn" :disabled="starting !== null" @click="start('practice')">
          {{ starting === 'practice' ? 'Starting…' : 'Start practice exam' }}
        </button>
      </section>
    </div>

    <p v-if="error" class="alert" role="alert">{{ error }}</p>

    <section class="card history">
      <div class="history__head">
        <h2>Recent attempts</h2>
        <button class="btn btn--ghost" @click="refresh()">Refresh</button>
      </div>
      <p v-if="!tests?.length" class="muted">No attempts yet.</p>
      <ul v-else class="history__list">
        <li v-for="t in tests" :key="t.id">
          <span>{{ t.mode === 'practice' ? 'Practice exam' : 'Diagnostic' }} · {{ formatDate(t.createdAt) }}</span>
          <NuxtLink v-if="t.finished" :to="`/reports/${t.id}`">
            {{ t.scaledScore }}{{ t.mode === 'practice' ? (t.passed ? ' · Pass' : ' · Not yet') : '' }}
          </NuxtLink>
          <NuxtLink v-else :to="`/tests/${t.id}`">Resume</NuxtLink>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); margin: 1.5rem 0; }
.grid .card { display: flex; flex-direction: column; gap: 0.75rem; align-items: flex-start; }
.grid h2, .history h2 { margin: 0; font-size: 1.15rem; }
.rules { margin: 0; padding-left: 1.1rem; color: var(--muted); }
.history { margin-top: 1.5rem; }
.history__head { display: flex; justify-content: space-between; align-items: center; }
.history__list { list-style: none; padding: 0; margin: 0.75rem 0 0; display: grid; gap: 0.5rem; }
.history__list li { display: flex; justify-content: space-between; gap: 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.4rem; }
</style>
