<script setup lang="ts">
import { DOMAINS } from '~~/shared/exam'

interface Row { id: string, domain: number, taskStatement: string, shown: number, right: number, wrong: number }

const { data: rows, refresh } = await useFetch<Row[]>('/api/stats/questions', { default: () => [] })

const totals = computed(() => ({
  shown: rows.value.reduce((s, r) => s + r.shown, 0),
  right: rows.value.reduce((s, r) => s + r.right, 0),
  wrong: rows.value.reduce((s, r) => s + r.wrong, 0),
}))

function domainName(id: number) {
  return DOMAINS.find(d => d.id === id)?.name ?? `Domain ${id}`
}
</script>

<template>
  <div>
    <h1>Question counters</h1>
    <p class="muted">
      <strong>Shown</strong> counts coaching sessions that presented the question.
      <strong>Right</strong> counts correct answers in a row; a wrong answer resets it, and reaching 3 clears Wrong.
      <strong>Wrong</strong> counts wrong answers since the last clearing. Coaching picks the highest Wrong first, then the least Shown.
    </p>

    <section class="card">
      <p class="totals">
        Shown {{ totals.shown }} · Right {{ totals.right }} · Wrong {{ totals.wrong }}
      </p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Question</th>
              <th scope="col">Domain</th>
              <th scope="col" class="num">Shown</th>
              <th scope="col" class="num">Right</th>
              <th scope="col" class="num">Wrong</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id" data-testid="stat-row">
              <td><code>{{ r.id }}</code> <span class="muted">Task {{ r.taskStatement }}</span></td>
              <td>{{ domainName(r.domain) }}</td>
              <td class="num">{{ r.shown }}</td>
              <td class="num">{{ r.right }}</td>
              <td class="num" :class="{ bad: r.wrong > 0 }">{{ r.wrong }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <button class="btn btn--ghost refresh" @click="refresh()">Refresh</button>
    </section>
  </div>
</template>

<style scoped>
.totals { font-weight: 600; margin: 0 0 0.75rem; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid var(--border); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.bad { color: var(--bad); font-weight: 600; }
.refresh { margin-top: 0.75rem; }
</style>
