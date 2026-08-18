<script setup lang="ts">
import { useIntervention } from "../composables/useIntervention";

const { matchedEntry, returnToWork } = useIntervention();
</script>

<template>
  <div
    class="fixed inset-0 z-[200] flex items-center justify-center bg-stone-950/95 p-6 text-stone-100"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="blocker-title"
  >
    <div
      class="w-full max-w-lg border border-red-900/80 bg-stone-900 p-8 text-center shadow-2xl md:p-12"
    >
      <p
        class="text-xs font-semibold uppercase tracking-[0.28em] text-red-500"
      >
        Intervention
      </p>
      <h2
        id="blocker-title"
        class="mt-4 text-2xl font-semibold tracking-tight text-red-100 md:text-4xl"
      >
        Session Paused: Distraction Detected
      </h2>
      <p class="mt-4 font-mono text-sm text-stone-400">
        {{ matchedEntry || "Blocked context" }}
      </p>
      <button
        type="button"
        class="mt-8 min-h-12 w-full rounded-full bg-red-800 px-6 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-red-50 transition hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 md:text-base"
        @click="returnToWork"
      >
        Return to Work
      </button>
    </div>
  </div>
</template>
