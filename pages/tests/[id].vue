<script setup lang="ts">
import type { TestView } from '~/server/services/exam'

const route = useRoute()
const id = route.params.id as string

const { data: test, error: loadError } = await useFetch<TestView>(`/api/tests/${id}`)

if (test.value?.finished) {
  await navigateTo(`/reports/${id}`, { replace: true })
}

const index = ref(0)
const answers = ref<Record<string, string[]>>({ ...(test.value?.answers ?? {}) })
const saveError = ref<string | null>(null)
const submitting = ref(false)
const secondsLeft = ref<number | null>(test.value?.remainingSeconds ?? null)
let timer: ReturnType<typeof setInterval> | undefined

const items = computed(() => test.value?.items ?? [])
const current = computed(() => items.value[index.value])
const answeredCount = computed(() => items.value.filter(i => (answers.value[i.id] ?? []).length > 0).length)
const isTimed = computed(() => test.value?.deadlineAt !== null && test.value?.deadlineAt !== undefined)

const clock = computed(() => {
  if (secondsLeft.value === null) return ''
  const s = secondsLeft.value
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
})

async function select(keys: string[]) {
  if (!current.value) return
  const questionId = current.value.id
  answers.value = { ...answers.value, [questionId]: keys }
  saveError.value = null
  try {
    await $fetch(`/api/tests/${id}/answers`, { method: 'PUT', body: { questionId, selected: keys } })
  }
  catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Could not save your answer'
  }
}

async function finish(reason: 'submitted' | 'expired') {
  if (submitting.value) return
  submitting.value = true
  try {
    await $fetch(`/api/tests/${id}/submit`, { method: 'POST' })
    await navigateTo(`/reports/${id}`)
  }
  catch (err) {
    submitting.value = false
    saveError.value = reason === 'expired'
      ? 'Time expired and the test could not be scored. Refresh to retry.'
      : (err instanceof Error ? err.message : 'Could not submit the test')
  }
}

function confirmSubmit() {
  const unanswered = items.value.length - answeredCount.value
  const message = unanswered > 0
    ? `You have ${unanswered} unanswered question(s). Submit anyway?`
    : 'Submit your test now? You cannot change answers afterwards.'
  if (window.confirm(message)) finish('submitted')
}

onMounted(() => {
  if (!isTimed.value || secondsLeft.value === null) return
  timer = setInterval(() => {
    if (secondsLeft.value === null) return
    secondsLeft.value = Math.max(0, secondsLeft.value - 1)
    if (secondsLeft.value === 0) {
      clearInterval(timer)
      finish('expired')
    }
  }, 1000)
})

onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div>
    <p v-if="loadError" class="alert" role="alert">This test could not be loaded.</p>

    <template v-else-if="test && current">
      <div class="bar">
        <span class="muted">
          {{ test.mode === 'practice' ? 'Practice exam' : 'Diagnostic' }} · {{ answeredCount }} of {{ items.length }} answered
        </span>
        <span v-if="isTimed" class="clock" :class="{ 'clock--low': (secondsLeft ?? 0) <= 300 }" aria-live="off">
          Time left {{ clock }}
        </span>
      </div>

      <section class="card">
        <QuestionCard
          :position="current.position"
          :total="items.length"
          :stem="current.stem"
          :scenario="current.scenario"
          :options="current.options"
          :select-count="current.selectCount"
          :task-statement="current.taskStatement"
          :selected="answers[current.id] ?? []"
          :disabled="submitting"
          @update:selected="select"
        />
      </section>

      <p v-if="saveError" class="alert" role="alert">{{ saveError }}</p>

      <nav class="nav" aria-label="Question navigation">
        <button class="btn btn--ghost" :disabled="index === 0" @click="index--">Previous</button>
        <button
          v-if="index < items.length - 1"
          class="btn"
          @click="index++"
        >
          Next
        </button>
        <button v-else class="btn" :disabled="submitting" @click="confirmSubmit">
          {{ submitting ? 'Submitting…' : 'Submit test' }}
        </button>
      </nav>

      <ol class="map" aria-label="Jump to question">
        <li v-for="(item, i) in items" :key="item.id">
          <button
            class="map__btn"
            :class="{
              'map__btn--current': i === index,
              'map__btn--answered': (answers[item.id] ?? []).length > 0,
            }"
            :aria-label="`Go to question ${item.position}${(answers[item.id] ?? []).length ? ', answered' : ', not answered'}`"
            @click="index = i"
          >
            {{ item.position }}
          </button>
        </li>
      </ol>
    </template>
  </div>
</template>

<style scoped>
.bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem; }
.clock { font-variant-numeric: tabular-nums; font-weight: 600; }
.clock--low { color: var(--bad); }
.nav { display: flex; justify-content: space-between; gap: 0.75rem; margin-top: 1rem; }
.map { list-style: none; padding: 0; margin: 1.5rem 0 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(42px, 1fr)); gap: 0.4rem; }
.map__btn {
  width: 100%; padding: 0.4rem 0; border-radius: 6px; border: 1px solid var(--border);
  background: var(--surface); color: var(--text); font: inherit; cursor: pointer;
}
.map__btn--answered { background: var(--accent-soft); border-color: var(--accent); }
.map__btn--current { outline: 2px solid var(--accent); outline-offset: 1px; }
</style>
