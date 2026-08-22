<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import CircularTimer from "./CircularTimer.vue";
import {
  usePomodoro,
  type PomodoroTab,
} from "../composables/usePomodoro";
import { useTasks } from "../composables/useTasks";
import { LONG_BREAK_INTERVAL } from "../composables/useSettings";

const {
  phase,
  isRunning,
  remainingSeconds,
  sessionTotalSeconds,
  sessionInCycle,
  canSkip,
  canAddFiveMinutes,
  activeTab,
  toggle,
  skip,
  addFiveMinutes,
  selectPhase,
} = usePomodoro();

const { activeTask, openTasks, setActiveTask, addTask } = useTasks();

const taskPickerOpen = ref(false);
const newTaskTitle = ref("");

const tabs: { id: PomodoroTab; label: string }[] = [
  { id: "work", label: "Pomodoro" },
  { id: "shortBreak", label: "Short Break" },
  { id: "longBreak", label: "Long Break" },
];

const sessionSlots = Array.from({ length: LONG_BREAK_INTERVAL }, (_, i) => i + 1);

const taskLabel = computed(
  () => activeTask.value?.title ?? "Select a focus task",
);

const primaryActionLabel = computed(() => {
  if (isRunning.value) {
    return "Pause timer";
  }
  if (phase.value === "idle") {
    return "Start timer";
  }
  return "Resume timer";
});

function onSelectTab(tab: PomodoroTab) {
  selectPhase(tab);
}

function onPickTask(id: string) {
  setActiveTask(id);
  taskPickerOpen.value = false;
}

function onCreateTask() {
  const task = addTask(newTaskTitle.value);
  if (task) {
    newTaskTitle.value = "";
    taskPickerOpen.value = false;
  }
}
</script>

<template>
  <article
    class="flex flex-col gap-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 lg:p-8"
  >
    <div class="flex gap-6 border-b border-slate-800 pb-1">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="border-b-2 pb-3 text-sm font-medium transition"
        :class="
          activeTab === tab.id
            ? 'border-teal-400 text-teal-400'
            : 'border-transparent text-slate-500 hover:text-slate-300'
        "
        @click="onSelectTab(tab.id)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="flex flex-col items-center gap-5 py-2">
      <CircularTimer
        :remaining-seconds="remainingSeconds"
        :total-seconds="sessionTotalSeconds"
        :phase="phase"
        :is-running="isRunning"
      />

      <div class="flex items-center gap-2" aria-hidden="true">
        <span
          v-for="slot in sessionSlots"
          :key="slot"
          class="h-2 w-2 rounded-full"
          :class="slot <= sessionInCycle ? 'bg-teal-400' : 'bg-slate-700'"
        />
      </div>
      <p class="text-sm text-slate-400">
        Session {{ sessionInCycle }}/{{ LONG_BREAK_INTERVAL }}
      </p>
    </div>

    <div class="relative">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-3 rounded-full border border-slate-700 bg-slate-950/60 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-slate-600"
        @click="taskPickerOpen = !taskPickerOpen"
      >
        <span class="flex min-w-0 items-center gap-2">
          <svg class="h-4 w-4 shrink-0 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
            <rect x="4" y="5" width="16" height="15" rx="2" />
            <path d="M8 3v4M16 3v4" stroke-linecap="round" />
          </svg>
          <span class="truncate">{{ taskLabel }}</span>
        </span>
        <svg class="h-4 w-4 shrink-0 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
          <path d="M4 20h4l9.5-9.5a2.1 2.1 0 0 0-3-3L5 17v3z" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>

      <div
        v-if="taskPickerOpen"
        class="absolute inset-x-0 top-full z-10 mt-2 overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-xl"
      >
        <div class="max-h-48 overflow-y-auto p-2">
          <button
            v-for="task in openTasks"
            :key="task.id"
            type="button"
            class="block w-full truncate rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
            @click="onPickTask(task.id)"
          >
            {{ task.title }}
          </button>
          <p v-if="openTasks.length === 0" class="px-3 py-2 text-sm text-slate-500">
            No open tasks.
            <RouterLink to="/tasks" class="text-teal-400 hover:underline">Add one</RouterLink>
          </p>
        </div>
        <div class="flex gap-2 border-t border-slate-800 p-2">
          <input
            v-model="newTaskTitle"
            type="text"
            placeholder="New task…"
            class="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-teal-500 focus:outline-none"
            @keydown.enter.prevent="onCreateTask"
          />
          <button
            type="button"
            class="rounded-lg bg-teal-500/15 px-3 py-2 text-sm font-semibold text-teal-400"
            @click="onCreateTask"
          >
            Add
          </button>
        </div>
      </div>
    </div>

    <div class="flex items-center justify-center gap-4">
      <button
        type="button"
        class="flex h-12 w-12 items-center justify-center rounded-full border border-slate-700 text-sm font-semibold text-slate-300 transition hover:border-teal-500/50 hover:text-teal-400 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="!canAddFiveMinutes"
        title="Add 5 minutes"
        @click="addFiveMinutes"
      >
        +5
      </button>

      <button
        type="button"
        class="flex h-16 w-16 items-center justify-center rounded-full bg-teal-400 text-slate-950 shadow-lg shadow-teal-500/20 transition hover:bg-teal-300"
        :title="primaryActionLabel"
        @click="toggle"
      >
        <svg
          v-if="isRunning"
          class="h-7 w-7"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
        <svg
          v-else
          class="h-7 w-7 translate-x-0.5"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M8 5v14l11-7z" />
        </svg>
      </button>

      <button
        type="button"
        class="flex h-12 w-12 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition hover:border-teal-500/50 hover:text-teal-400 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="!canSkip"
        title="Skip phase"
        @click="skip"
      >
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M5 5l10 7-10 7V5z" stroke-linejoin="round" />
          <path d="M19 5v14" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  </article>
</template>
