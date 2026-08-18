<script setup lang="ts">
import { computed, ref } from "vue";
import { usePomodoro } from "../composables/usePomodoro";
import {
  clampMinutes,
  DEFAULT_SETTINGS,
  parseListInput,
  settings,
} from "../composables/useSettings";

const { phase, isRunning } = usePomodoro();

function commitMinutes(
  field: "workMinutes" | "shortBreakMinutes" | "longBreakMinutes",
) {
  settings[field] = clampMinutes(settings[field], DEFAULT_SETTINGS[field]);
}

const liveSessionHint = computed(() =>
  phase.value !== "idle" || isRunning.value
    ? "Duration changes apply to the next session."
    : "Idle countdown follows the work duration.",
);

const blocklistText = ref(settings.blocklist.join("\n"));
const ignoredAppsText = ref(settings.ignoredApps.join("\n"));

function commitBlocklist() {
  settings.blocklist = parseListInput(
    blocklistText.value,
    DEFAULT_SETTINGS.blocklist,
  );
  blocklistText.value = settings.blocklist.join("\n");
}

function commitIgnoredApps() {
  settings.ignoredApps = parseListInput(
    ignoredAppsText.value,
    DEFAULT_SETTINGS.ignoredApps,
  );
  ignoredAppsText.value = settings.ignoredApps.join("\n");
}

</script>

<template>
  <section class="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 py-6 sm:gap-8 sm:py-10">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
        Settings
      </h1>
      <p class="text-sm text-stone-500 sm:text-base">{{ liveSessionHint }}</p>
    </header>

    <div class="space-y-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
      <label class="block space-y-2">
        <span class="text-sm font-medium text-stone-700">Work duration (minutes)</span>
        <input
          v-model.number="settings.workMinutes"
          type="number"
          inputmode="numeric"
          min="1"
          max="180"
          class="min-h-12 w-full rounded-xl border border-stone-300 bg-stone-50 px-4 text-base text-stone-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
          @blur="commitMinutes('workMinutes')"
        />
      </label>

      <label class="block space-y-2">
        <span class="text-sm font-medium text-stone-700">Short break (minutes)</span>
        <input
          v-model.number="settings.shortBreakMinutes"
          type="number"
          inputmode="numeric"
          min="1"
          max="180"
          class="min-h-12 w-full rounded-xl border border-stone-300 bg-stone-50 px-4 text-base text-stone-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
          @blur="commitMinutes('shortBreakMinutes')"
        />
      </label>

      <label class="block space-y-2">
        <span class="text-sm font-medium text-stone-700">Long break (minutes)</span>
        <input
          v-model.number="settings.longBreakMinutes"
          type="number"
          inputmode="numeric"
          min="1"
          max="180"
          class="min-h-12 w-full rounded-xl border border-stone-300 bg-stone-50 px-4 text-base text-stone-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
          @blur="commitMinutes('longBreakMinutes')"
        />
      </label>
    </div>

    <div class="space-y-1 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
      <div class="flex items-center justify-between gap-4 py-2">
        <div>
          <p class="text-sm font-medium text-stone-800 sm:text-base">Auto-start work</p>
          <p class="text-sm text-stone-500">Start the next work session when a break ends.</p>
        </div>
        <button
          type="button"
          role="switch"
          class="relative h-7 w-12 shrink-0 rounded-full transition"
          :class="settings.autoStartWork ? 'bg-teal-800' : 'bg-stone-300'"
          :aria-checked="settings.autoStartWork"
          @click="settings.autoStartWork = !settings.autoStartWork"
        >
          <span
            class="absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition"
            :class="settings.autoStartWork ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>

      <div class="flex items-center justify-between gap-4 border-t border-stone-100 py-2 pt-4">
        <div>
          <p class="text-sm font-medium text-stone-800 sm:text-base">Auto-start breaks</p>
          <p class="text-sm text-stone-500">Start the next break when a work session ends.</p>
        </div>
        <button
          type="button"
          role="switch"
          class="relative h-7 w-12 shrink-0 rounded-full transition"
          :class="settings.autoStartBreaks ? 'bg-teal-800' : 'bg-stone-300'"
          :aria-checked="settings.autoStartBreaks"
          @click="settings.autoStartBreaks = !settings.autoStartBreaks"
        >
          <span
            class="absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition"
            :class="settings.autoStartBreaks ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>
    </div>

    <div class="space-y-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
      <div>
        <p class="text-sm font-medium text-stone-800 sm:text-base">Intervention mode</p>
        <p class="text-sm text-stone-500">
          Warning sends a system notification. Block pauses work and takes over the screen.
        </p>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button
          type="button"
          class="min-h-11 rounded-xl border px-4 text-sm font-semibold"
          :class="
            settings.interventionMode === 'warning'
              ? 'border-teal-800 bg-teal-800 text-white'
              : 'border-stone-300 bg-stone-50 text-stone-700'
          "
          @click="settings.interventionMode = 'warning'"
        >
          Warning
        </button>
        <button
          type="button"
          class="min-h-11 rounded-xl border px-4 text-sm font-semibold"
          :class="
            settings.interventionMode === 'block'
              ? 'border-teal-800 bg-teal-800 text-white'
              : 'border-stone-300 bg-stone-50 text-stone-700'
          "
          @click="settings.interventionMode = 'block'"
        >
          Block
        </button>
      </div>

      <label class="block space-y-2">
        <span class="text-sm font-medium text-stone-700">Blocklist</span>
        <textarea
          v-model="blocklistText"
          rows="4"
          class="w-full rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 font-mono text-sm text-stone-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
          @blur="commitBlocklist"
        />
        <span class="text-xs text-stone-500">One domain or app fragment per line.</span>
      </label>

      <label class="block space-y-2">
        <span class="text-sm font-medium text-stone-700">Ignored apps</span>
        <textarea
          v-model="ignoredAppsText"
          rows="3"
          class="w-full rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 font-mono text-sm text-stone-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
          @blur="commitIgnoredApps"
        />
        <span class="text-xs text-stone-500">
          If the active app name contains any of these, skip intervention (IDEs).
        </span>
      </label>
    </div>
  </section>
</template>
