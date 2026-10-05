<script setup lang="ts">
import type { CoachView } from '~/server/services/coach'

interface Feedback {
  questionId: string
  position: number
  isCorrect: boolean
  selected: string[]
  correct: string[]
  explanation: string
  taskStatement: string
  domain: number
  domainName: string
}

const route = useRoute()
const id = route.params.id as string

const { data: view, error: loadError, refresh } = await useFetch<CoachView>(`/api/coach/sessions/${id}`)
if (view.value?.finished) {
  await navigateTo(`/reports/${id}`, { replace: true })
}

const selected = ref<string[]>([])
const feedback = ref<Feedback | null>(null)
const submitting = ref(false)
const actionError = ref<string | null>(null)

const current = computed(() => view.value?.current ?? null)
const isLast = computed(() => !!view.value && view.value.answered + 1 >= view.value.total)
const canCheck = computed(() => !!current.value && selected.value.length === current.value.selectCount)
const progress = computed(() => (view.value ? Math.round((view.value.answered / view.value.total) * 100) : 0))

async function check() {
  if (!current.value || !canCheck.value) return
  submitting.value = true
  actionError.value = null
  try {
    feedback.value = await $fetch<Feedback>(`/api/coach/sessions/${id}/answer`, {
      method: 'POST',
      body: { questionId: current.value.id, selected: selected.value },
    })
  }
  catch (err) {
    actionError.value = err instanceof Error ? err.message : 'Could not check your answer'
  }
  finally {
    submitting.value = false
  }
}

async function next() {
  if (isLast.value) {
    await navigateTo(`/reports/${id}`)
    return
  }
  selected.value = []
  feedback.value = null
  await refresh()
}

function selectionLabel(keys: string[]) {
  return keys.length ? keys.join(', ') : 'none'
}
</script>

<template>
  <div>
    <p v-if="loadError" class="alert" role="alert">This coaching session could not be loaded.</p>

    <template v-else-if="view">
      <div class="progress" aria-hidden="true"><div class="progress__fill" :style="{ width: `${progress}%` }" /></div>
      <div class="bar">
        <span class="muted">
          {{ view.domainName ? `Domain: ${view.domainName}` : 'All domains' }} · {{ view.answered }} of {{ view.total }} answered
        </span>
      </div>

      <section v-if="current && !feedback" class="card">
        <QuestionCard
          :position="current.position"
          :total="view.total"
          :stem="current.stem"
          :scenario="current.scenario"
          :options="current.options"
          :select-count="current.selectCount"
          :task-statement="current.taskStatement"
          :selected="selected"
          :disabled="submitting"
          @update:selected="selected = $event"
        />
        <div class="actions">
          <button class="btn" :disabled="!canCheck || submitting" @click="check">
            {{ submitting ? 'Checking…' : 'Check answer' }}
          </button>
          <span v-if="current.selectCount > 1" class="muted hint">Select {{ current.selectCount }} answers</span>
        </div>
      </section>

      <section v-if="feedback" class="card feedback" :class="feedback.isCorrect ? 'feedback--ok' : 'feedback--bad'" aria-live="polite" data-testid="feedback">
        <h2 class="feedback__verdict">{{ feedback.isCorrect ? 'Correct' : 'Not quite' }}</h2>
        <p class="muted">Task {{ feedback.taskStatement }} · {{ feedback.domainName }}</p>

        <QuestionCard
          v-if="current"
          :position="feedback.position"
          :total="view.total"
          :stem="current.stem"
          :scenario="current.scenario"
          :options="current.options"
          :select-count="current.selectCount"
          :selected="feedback.selected"
          :correct="feedback.correct"
          reveal
          disabled
          @update:selected="() => {}"
        />

        <p class="summary-line">
          Your answer: <strong>{{ selectionLabel(feedback.selected) }}</strong>
          · Correct answer: <strong>{{ selectionLabel(feedback.correct) }}</strong>
        </p>
        <div class="explanation">
          <h3>Why</h3>
          <p>{{ feedback.explanation }}</p>
        </div>

        <div class="actions">
          <button class="btn" data-testid="next" @click="next">
            {{ isLast ? 'See results' : 'Next question' }}
          </button>
        </div>
      </section>

      <CoachChat
        v-if="current"
        :session-id="id"
        :question-id="current.id"
        :answered="!!feedback"
      />

      <p v-if="actionError" class="alert" role="alert">{{ actionError }}</p>
    </template>
  </div>
</template>

<style scoped>
.progress { height: 6px; background: var(--border); border-radius: 999px; overflow: hidden; margin-bottom: 0.75rem; }
.progress__fill { height: 100%; background: var(--accent); transition: width 0.3s; }
.bar { display: flex; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem; }
.actions { display: flex; align-items: center; gap: 0.75rem; margin-top: 1.25rem; }
.hint { font-size: 0.85rem; }
.feedback { border-left: 4px solid var(--border); }
.feedback--ok { border-left-color: var(--ok); }
.feedback--bad { border-left-color: var(--bad); }
.feedback__verdict { margin: 0 0 0.25rem; font-size: 1.4rem; }
.feedback--ok .feedback__verdict { color: var(--ok); }
.feedback--bad .feedback__verdict { color: var(--bad); }
.feedback .question { margin-top: 1rem; }
.summary-line { margin: 1rem 0 0.5rem; }
.explanation { background: var(--accent-soft); border-radius: 8px; padding: 0.75rem 1rem; }
.explanation h3 { margin: 0 0 0.25rem; font-size: 1rem; }
.explanation p { margin: 0; line-height: 1.5; }
</style>
