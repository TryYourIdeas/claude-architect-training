<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

interface ChatMessage { role: 'user' | 'assistant', content: string }

const props = defineProps<{
  sessionId: string
  questionId: string
  answered: boolean
}>()

const messages = ref<ChatMessage[]>([])
const draft = ref('')
const sending = ref(false)
const error = ref<string | null>(null)
const log = ref<HTMLElement | null>(null)
const MAX_CHARS = 2000

// Each question gets its own conversation; moving on starts a fresh one.
watch(() => props.questionId, () => {
  messages.value = []
  draft.value = ''
  error.value = null
})

async function scrollToEnd() {
  await nextTick()
  if (log.value) log.value.scrollTop = log.value.scrollHeight
}

/** Prefers the server's own message (e.g. "not configured") over the transport error text. */
function errorMessage(err: unknown): string {
  const data = (err as { data?: { statusMessage?: string, message?: string } } | null)?.data
  return data?.statusMessage || data?.message || 'The assistant could not answer. Please try again.'
}

async function send() {
  const text = draft.value.trim()
  if (!text || sending.value) return
  if (text.length > MAX_CHARS) {
    error.value = `Please keep messages under ${MAX_CHARS} characters.`
    return
  }

  messages.value.push({ role: 'user', content: text })
  draft.value = ''
  sending.value = true
  error.value = null
  scrollToEnd()

  try {
    const { reply } = await $fetch<{ reply: string }>(`/api/coach/sessions/${props.sessionId}/chat`, {
      method: 'POST',
      // Send a snapshot: the live list changes again when the reply arrives.
      body: { questionId: props.questionId, messages: messages.value.map(m => ({ ...m })) },
    })
    messages.value.push({ role: 'assistant', content: reply })
  }
  catch (err) {
    // The last user message stays in the log so the learner can retry.
    error.value = errorMessage(err)
  }
  finally {
    sending.value = false
    scrollToEnd()
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    send()
  }
}
</script>

<template>
  <section class="chat" aria-labelledby="chat-title">
    <h2 id="chat-title" class="chat__title">Ask about this question</h2>
    <p class="chat__hint muted">
      {{ answered
        ? 'Ask why an option is right or wrong, or about the concepts behind it.'
        : 'Ask for clarification on the concepts. The assistant will not reveal the answer before you check it.' }}
    </p>

    <div ref="log" class="chat__log" role="log" aria-live="polite" aria-label="Conversation">
      <p v-if="!messages.length" class="muted">No messages yet.</p>
      <div
        v-for="(m, i) in messages"
        :key="i"
        class="chat__msg"
        :class="m.role === 'user' ? 'chat__msg--user' : 'chat__msg--assistant'"
      >
        <span class="chat__who">{{ m.role === 'user' ? 'You' : 'Tutor' }}</span>
        <p>{{ m.content }}</p>
      </div>
      <p v-if="sending" class="muted" data-testid="chat-typing">Tutor is typing…</p>
    </div>

    <form class="chat__form" @submit.prevent="send">
      <label for="chat-input" class="visually-hidden">Your question</label>
      <textarea
        id="chat-input"
        v-model="draft"
        rows="2"
        :maxlength="MAX_CHARS + 200"
        placeholder="Ask a question about this topic…"
        :disabled="sending"
        @keydown="onKeydown"
      />
      <button class="btn" type="submit" :disabled="sending || !draft.trim()">Send</button>
    </form>

    <p v-if="error" class="alert" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.chat { margin-top: 1.25rem; border: 1px solid var(--border); border-radius: 12px; padding: 1rem; background: var(--surface); }
.chat__title { margin: 0; font-size: 1.05rem; }
.chat__hint { margin: 0.25rem 0 0.75rem; font-size: 0.85rem; }
.chat__log { max-height: 280px; overflow-y: auto; display: grid; gap: 0.6rem; padding-right: 0.25rem; }
.chat__msg { border-radius: 10px; padding: 0.5rem 0.75rem; }
.chat__msg p { margin: 0.2rem 0 0; line-height: 1.5; white-space: pre-wrap; }
.chat__msg--user { background: var(--accent-soft); justify-self: end; max-width: 90%; }
.chat__msg--assistant { background: var(--bg); border: 1px solid var(--border); justify-self: start; max-width: 90%; }
.chat__who { font-size: 0.75rem; font-weight: 600; color: var(--muted); }
.chat__form { display: flex; gap: 0.5rem; margin-top: 0.75rem; align-items: flex-end; }
.chat__form textarea { flex: 1; font: inherit; padding: 0.5rem; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); resize: vertical; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
