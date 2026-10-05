<script setup lang="ts">
import { computed } from 'vue'

interface Option { key: string, text: string }

const props = defineProps<{
  position: number
  total: number
  stem: string
  options: Option[]
  selectCount: number
  selected: string[]
  taskStatement?: string
  disabled?: boolean
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

    <p class="question__stem">{{ stem }}</p>
    <p class="question__instruction">{{ instruction }}</p>

    <ul class="question__options">
      <li v-for="option in options" :key="option.key">
        <label class="question__option">
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
        </label>
      </li>
    </ul>
  </fieldset>
</template>

<style scoped>
.question { border: 0; padding: 0; margin: 0; }
.question__legend { display: flex; gap: 1rem; flex-wrap: wrap; font-size: 0.9rem; color: var(--muted); padding: 0; margin-bottom: 0.75rem; }
.question__task { font-weight: 600; }
.question__stem { font-size: 1.1rem; line-height: 1.5; margin: 0 0 0.5rem; }
.question__instruction { font-size: 0.85rem; color: var(--muted); margin: 0 0 1rem; font-style: italic; }
.question__options { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
.question__option {
  display: grid; grid-template-columns: auto auto 1fr; gap: 0.5rem; align-items: start;
  padding: 0.75rem 1rem; border: 1px solid var(--border); border-radius: 8px; cursor: pointer;
}
.question__option:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); }
.question__key { font-weight: 600; }
</style>
