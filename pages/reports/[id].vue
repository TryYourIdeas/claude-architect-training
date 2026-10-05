<script setup lang="ts">
import type { Report } from '~/server/services/exam'

const route = useRoute()
const id = route.params.id as string

const { data: report, error } = await useFetch<Report>(`/api/tests/${id}/report`)

const missed = computed(() => report.value?.items.filter(i => !i.isCorrect) ?? [])
const isPractice = computed(() => report.value?.mode === 'practice')
const isCoaching = computed(() => report.value?.mode === 'coaching')
const title = computed(() => ({ practice: 'Practice exam report', diagnostic: 'Diagnostic report', coaching: 'Coaching session results' })[report.value?.mode ?? 'diagnostic'])
</script>

<template>
  <div>
    <p v-if="error" class="alert" role="alert">
      This report is not available yet. <NuxtLink to="/">Back to start</NuxtLink>
    </p>

    <template v-else-if="report">
      <h1>{{ title }}</h1>

      <section class="card summary">
        <div v-if="!isCoaching">
          <p class="muted">Scaled score</p>
          <p class="score" data-testid="scaled-score">{{ report.scaledScore }}</p>
          <p class="muted">{{ report.correctCount }} of {{ report.totalItems }} correct</p>
        </div>
        <div v-else>
          <p class="muted">Correct</p>
          <p class="score" data-testid="coach-score">{{ report.correctCount }} / {{ report.totalItems }}</p>
          <p class="muted">Coaching is not scored on the exam scale.</p>
        </div>
        <div v-if="isPractice">
          <p class="verdict" :class="report.passed ? 'verdict--pass' : 'verdict--fail'" data-testid="verdict">
            {{ report.passed ? 'Pass' : 'Not yet passing' }}
          </p>
          <p class="muted">Pass mark {{ report.passScaled }} on the 100–1,000 scale</p>
        </div>
        <div v-if="report.scenarioNames.length" class="scenarios">
          <p class="muted">Scenarios in this exam</p>
          <ul><li v-for="name in report.scenarioNames" :key="name">{{ name }}</li></ul>
        </div>
      </section>
      <p v-if="!isCoaching" class="muted note">{{ report.scaleNote }}</p>

      <section class="card">
        <h2>Results by domain</h2>
        <ul class="domains">
          <li v-for="d in report.domains" :key="d.domain">
            <div class="domains__head">
              <span>{{ d.domain }}. {{ d.name }}</span>
              <span>{{ d.correct }}/{{ d.total }} · {{ d.percent }}%</span>
            </div>
            <div class="bar" role="img" :aria-label="`${d.name}: ${d.percent} percent`">
              <div class="bar__fill" :style="{ width: `${d.percent}%` }" />
            </div>
          </li>
        </ul>
      </section>

      <section class="card">
        <h2>Review ({{ missed.length }} missed)</h2>
        <p v-if="!missed.length" class="muted">Every answer was correct.</p>
        <details v-for="item in missed" :key="item.id" class="review">
          <summary>{{ item.position }}. Task {{ item.taskStatement }} · {{ item.stem.slice(0, 90) }}{{ item.stem.length > 90 ? '…' : '' }}</summary>
          <p>{{ item.stem }}</p>
          <p>Your answer: <strong>{{ item.selected.join(', ') || 'none' }}</strong> · Correct: <strong>{{ item.correct.join(', ') }}</strong></p>
          <p>{{ item.explanation }}</p>
        </details>
      </section>

      <nav class="actions">
        <NuxtLink class="btn" to="/">Back to start</NuxtLink>
        <NuxtLink v-if="isCoaching" class="btn btn--ghost" to="/">Start another session</NuxtLink>
      </nav>
    </template>
  </div>
</template>

<style scoped>
.summary { display: flex; gap: 2rem; flex-wrap: wrap; justify-content: space-between; }
.score { font-size: 2.5rem; font-weight: 700; margin: 0; }
.verdict { font-size: 1.4rem; font-weight: 700; margin: 0; }
.verdict--pass { color: var(--ok); }
.verdict--fail { color: var(--bad); }
.scenarios ul { margin: 0; padding-left: 1.1rem; }
.note { font-size: 0.85rem; margin: 0.5rem 0 1.25rem; }
.card + .card { margin-top: 1rem; }
.domains { list-style: none; padding: 0; margin: 0.75rem 0 0; display: grid; gap: 0.75rem; }
.domains__head { display: flex; justify-content: space-between; gap: 1rem; font-size: 0.95rem; margin-bottom: 0.25rem; }
.bar { height: 10px; background: var(--border); border-radius: 999px; overflow: hidden; }
.bar__fill { height: 100%; background: var(--accent); }
.review { border-top: 1px solid var(--border); padding: 0.75rem 0; }
.review summary { cursor: pointer; font-weight: 600; }
.actions { margin-top: 1.5rem; }
.btn { display: inline-block; padding: 0.6rem 1.1rem; border-radius: 8px; background: var(--accent); color: #fff; text-decoration: none; }
</style>
