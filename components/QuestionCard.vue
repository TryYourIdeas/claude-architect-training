<script setup lang="ts">
import { computed } from 'vue'
import { SCENARIO_DESCRIPTIONS, SCENARIOS } from '~~/shared/exam'

interface Option { key: string, text: string }

const props = defineProps<{
  position: number
  total: number
  stem: string
  options: Option[]
  selectCount: number
  selected: string[]
  taskStatement?: string
  /** Scenario the question is based on (1–6); its context is shown above the stem. */
  scenario?: number
  disabled?: boolean
  /** When true, options are marked against `correct` (used after an answer is locked in). */
  reveal?: boolean
  correct?: string[]
}>()

const emit = defineEmits<{
  'update:selected': [keys: string[]]
}>()

const isMulti = computed(() => props.selectCount > 1)
const groupName = computed(() => `question-${props.position}`)
const instruction = computed(() => (isMulti.value ? `Select ${props.selectCount} answers` : 'Select one answer'))

function isChecked(key: string): boolean {
  return props.selected.includes(key)
}

function isBlocked(key: string): boolean {
  return !!props.disabled || (isMulti.value && !isChecked(key) && props.selected.length >= props.selectCount)
}

function optionState(key: string): 'correct' | 'wrong' | 'missed' | '' {
  if (!props.reveal || !props.correct) return ''
  const isRight = props.correct.includes(key)
  if (isRight && isChecked(key)) return 'correct'
  if (isRight) return 'missed'
  if (isChecked(key)) return 'wrong'
  return ''
}

function onToggle(key: string, checked: boolean) {
  if (!isMulti.value) {
    emit('update:selected', checked ? [key] : [])
    return
  }
  const next = checked
    ? [...props.selected.filter(k => k !== key), key]
    : props.selected.filter(k => k !== key)
  emit('update:selected', next)
}
</script>

<template>
  <fieldset class="question" :disabled="disabled">
    <legend class="question__legend">
      <span class="question__count">Question {{ position }} of {{ total }}</span>
      <span v-if="taskStatement" class="question__task">Task {{ taskStatement }}</span>
    </legend>

    <aside v-if="scenario && SCENARIOS[scenario]" class="question__scenario" data-testid="scenario">
      <p class="question__scenario-title">Scenario {{ scenario }}: {{ SCENARIOS[scenario] }}</p>
      <p class="question__scenario-body">{{ SCENARIO_DESCRIPTIONS[scenario] }}</p>
    </aside>

    <p class="question__stem">{{ stem }}</p>
    <p class="question__instruction">{{ instruction }}</p>

    <ul class="question__options">
      <li v-for="option in options" :key="option.key">
        <label class="question__option" :class="optionState(option.key) ? `question__option--${optionState(option.key)}` : ''" :data-state="optionState(option.key) || undefined">
          <input
            :type="isMulti ? 'checkbox' : 'radio'"
            :name="groupName"
            :value="option.key"
            :checked="isChecked(option.key)"
            :disabled="isBlocked(option.key)"
            @change="onToggle(option.key, ($event.target as HTMLInputElement).checked)"
          >
          <span class="question__key">{{ option.key }}.</span>
          <span>{{ option.text }}</span>
          <span v-if="optionState(option.key) === 'correct'" class="question__badge">Correct</span>
          <span v-else-if="optionState(option.key) === 'wrong'" class="question__badge question__badge--wrong">Your answer</span>
          <span v-else-if="optionState(option.key) === 'missed'" class="question__badge">Correct answer</span>
        </label>
      </li>
    </ul>
  </fieldset>
</template>

<style scoped>
.question { border: 0; padding: 0; margin: 0; }
.question__legend { display: flex; gap: 1rem; flex-wrap: wrap; font-size: 0.9rem; color: var(--muted); padding: 0; margin-bottom: 0.75rem; }
.question__task { font-weight: 600; }
.question__scenario { background: var(--accent-soft); border-left: 3px solid var(--accent); border-radius: 8px; padding: 0.75rem 1rem; margin: 0 0 1rem; }
.question__scenario-title { margin: 0 0 0.35rem; font-weight: 600; font-size: 0.9rem; }
.question__scenario-body { margin: 0; font-size: 0.9rem; line-height: 1.5; color: var(--text); }
.question__stem { font-size: 1.1rem; line-height: 1.5; margin: 0 0 0.5rem; }
.question__instruction { font-size: 0.85rem; color: var(--muted); margin: 0 0 1rem; font-style: italic; }
.question__options { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
.question__option {
  display: grid; grid-template-columns: auto auto 1fr; gap: 0.5rem; align-items: start;
  padding: 0.75rem 1rem; border: 1px solid var(--border); border-radius: 8px; cursor: pointer;
}
.question__option:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); }
.question__key { font-weight: 600; }
.question__option { grid-template-columns: auto auto 1fr auto; }
.question__option--correct { border-color: var(--ok); background: color-mix(in srgb, var(--ok) 12%, transparent); }
.question__option--wrong { border-color: var(--bad); background: color-mix(in srgb, var(--bad) 10%, transparent); }
.question__option--missed { border-style: dashed; border-color: var(--ok); }
.question__badge { font-size: 0.75rem; font-weight: 600; color: var(--ok); white-space: nowrap; }
.question__badge--wrong { color: var(--bad); }
</style>
