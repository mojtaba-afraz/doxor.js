<script setup lang="ts">
import { ref } from 'vue'

const command = 'npm i doxor.js'
const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  await navigator.clipboard.writeText(command)
  copied.value = true
  clearTimeout(timer)
  timer = setTimeout(() => {
    copied.value = false
  }, 2000)
}
</script>

<template>
  <div class="install">
    <code><span class="prompt" aria-hidden="true">$</span> {{ command }}</code>
    <button type="button" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button>
    <span class="visually-hidden" aria-live="polite">{{ copied ? 'Install command copied' : '' }}</span>
  </div>
</template>

<style scoped>
.install {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin-top: 28px;
  padding: 6px 6px 6px 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
  max-width: 100%;
}

code {
  font-family: var(--vp-font-family-mono);
  font-size: 15px;
  color: var(--vp-c-text-1);
  white-space: nowrap;
}

.prompt {
  color: var(--vp-c-text-3);
  user-select: none;
}

button {
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  min-width: 72px;
}

button:hover {
  color: var(--vp-c-brand-2);
}

button:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>
