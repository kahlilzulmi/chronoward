<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { RouterLink } from "vue-router";
import CircularTimer from "./CircularTimer.vue";
import {
  usePomodoro,
  type PomodoroTab,
} from "../composables/usePomodoro";
import { useTasks } from "../composables/useTasks";
import { LONG_BREAK_INTERVAL } from "../composables/useSettings";
import { btnSecondaryClass, inputClass } from "../ui/themeClasses";

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
  reset,
} = usePomodoro();

const { activeTask, openTasks, setActiveTask, addTask, renameTask } = useTasks();

const taskPickerOpen = ref(false);
const taskEditOpen = ref(false);
const resetConfirmOpen = ref(false);
const newTaskTitle = ref("");
const editTaskTitle = ref("");
const taskPickerRoot = ref<HTMLElement | null>(null);

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

/** Paused mid-session: show Reset instead of Skip. */
const showReset = computed(
  () => phase.value !== "idle" && !isRunning.value,
);

function onSelectTab(tab: PomodoroTab) {
  selectPhase(tab);
}

function onPickTask(id: string) {
  setActiveTask(id);
  taskPickerOpen.value = false;
  taskEditOpen.value = false;
}

function onCreateTask() {
  const task = addTask(newTaskTitle.value);
  if (task) {
    newTaskTitle.value = "";
    taskPickerOpen.value = false;
  }
}

function openTaskEdit() {
  if (!activeTask.value) {
    taskPickerOpen.value = true;
    return;
  }
  editTaskTitle.value = activeTask.value.title;
  taskEditOpen.value = true;
  taskPickerOpen.value = false;
}

function saveTaskEdit() {
  if (!activeTask.value) {
    return;
  }
  renameTask(activeTask.value.id, editTaskTitle.value);
  taskEditOpen.value = false;
}

function openResetConfirm() {
  resetConfirmOpen.value = true;
}

function cancelReset() {
  resetConfirmOpen.value = false;
}

function confirmReset() {
  reset();
  resetConfirmOpen.value = false;
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!taskPickerOpen.value) {
    return;
  }
  const root = taskPickerRoot.value;
  if (root && event.target instanceof Node && !root.contains(event.target)) {
    taskPickerOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
});

onUnmounted(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
});
</script>

<template>
  <article
    class="flex flex-col gap-5 rounded-2xl border border-stone-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/80 sm:gap-6 sm:p-6 lg:p-8"
  >
    <div class="flex gap-6 border-b border-stone-200 pb-1 dark:border-slate-800">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="border-b-2 pb-3 text-sm font-medium transition"
        :class="
          activeTab === tab.id
            ? 'border-teal-500 text-teal-600 dark:border-teal-400 dark:text-teal-400'
            : 'border-transparent text-stone-500 hover:text-stone-700 dark:text-slate-500 dark:hover:text-slate-300'
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
          :class="slot <= sessionInCycle ? 'bg-teal-500 dark:bg-teal-400' : 'bg-stone-200 dark:bg-slate-700'"
        />
      </div>
      <p class="text-sm text-stone-500 dark:text-slate-400">
        Session {{ sessionInCycle }}/{{ LONG_BREAK_INTERVAL }}
      </p>
    </div>

    <div ref="taskPickerRoot" class="relative">
      <div class="flex gap-2">
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-full border border-stone-300 bg-stone-50 px-4 py-3 text-left text-sm text-stone-800 transition hover:border-stone-400 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:border-slate-600"
          @click="taskPickerOpen = !taskPickerOpen"
        >
          <span class="flex min-w-0 items-center gap-2">
            <svg class="h-4 w-4 shrink-0 text-stone-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <path d="M8 12l2.5 2.5L16 9" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span class="truncate">{{ taskLabel }}</span>
          </span>
        </button>
        <button
          type="button"
          class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-stone-300 text-stone-500 transition hover:border-teal-500/50 hover:text-teal-600 dark:border-slate-700 dark:text-slate-400 dark:hover:text-teal-400"
          title="Edit active task"
          @click="openTaskEdit"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
            <path d="M4 20h4l9.5-9.5a2.1 2.1 0 0 0-3-3L5 17v3z" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>

      <div
        v-if="taskEditOpen && activeTask"
        class="mt-2 flex gap-2"
      >
        <input
          v-model="editTaskTitle"
          type="text"
          maxlength="120"
          :class="inputClass"
          @keydown.enter.prevent="saveTaskEdit"
        />
        <button
          type="button"
          class="rounded-xl bg-teal-500/15 px-3 py-2 text-sm font-semibold text-teal-600 dark:text-teal-400"
          @click="saveTaskEdit"
        >
          Save
        </button>
      </div>

      <div
        v-if="taskPickerOpen"
        class="absolute inset-x-0 top-full z-10 mt-2 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-950"
      >
        <div class="max-h-48 overflow-y-auto p-2">
          <button
            v-for="task in openTasks"
            :key="task.id"
            type="button"
            class="block w-full truncate rounded-lg px-3 py-2 text-left text-sm text-stone-800 hover:bg-stone-100 dark:text-slate-200 dark:hover:bg-slate-800"
            @click="onPickTask(task.id)"
          >
            {{ task.title }}
          </button>
          <p v-if="openTasks.length === 0" class="px-3 py-2 text-sm text-stone-500 dark:text-slate-500">
            No open tasks.
            <RouterLink to="/tasks" class="text-teal-400 hover:underline">Add one</RouterLink>
          </p>
        </div>
        <div class="flex gap-2 border-t border-stone-200 p-2 dark:border-slate-800">
          <input
            v-model="newTaskTitle"
            type="text"
            placeholder="New task…"
            class="min-w-0 flex-1 rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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

    <div class="flex items-center justify-center gap-3 sm:gap-4">
      <button
        type="button"
        class="flex h-12 w-12 items-center justify-center rounded-full border border-stone-300 text-sm font-semibold text-stone-600 transition hover:border-teal-500/50 hover:text-teal-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:border-teal-500/50 dark:hover:text-teal-400"
        :disabled="!canAddFiveMinutes"
        title="Add 5 minutes"
        @click="addFiveMinutes"
      >
        +5
      </button>

      <button
        type="button"
        class="flex h-16 w-16 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg shadow-teal-500/20 transition hover:bg-teal-500 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
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
        v-if="showReset"
        type="button"
        class="flex h-12 w-12 items-center justify-center rounded-full border border-stone-300 text-stone-600 transition hover:border-rose-500/50 hover:text-rose-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-rose-500/50 dark:hover:text-rose-400"
        title="Reset timer"
        @click="openResetConfirm"
      >
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M4 4v6h6" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M20 20v-6h-6" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M20.49 9A9 9 0 0 0 6.7 5.3L4 8M3.51 15A9 9 0 0 0 17.3 18.7L20 16" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <button
        v-else
        type="button"
        class="flex h-12 w-12 items-center justify-center rounded-full border border-stone-300 text-stone-600 transition hover:border-teal-500/50 hover:text-teal-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:border-teal-500/50 dark:hover:text-teal-400"
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

    <Teleport to="body">
      <div
        v-if="resetConfirmOpen"
        class="fixed inset-0 z-[180] flex items-center justify-center bg-stone-950/70 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-timer-title"
        @click.self="cancelReset"
      >
        <div
          class="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <h2
            id="reset-timer-title"
            class="text-lg font-semibold text-stone-900 dark:text-slate-100"
          >
            Reset timer and session?
          </h2>
          <p class="mt-2 text-sm text-stone-600 dark:text-slate-400">
            This clears the current phase, returns to idle, and resets session progress
            (Session 1 / {{ LONG_BREAK_INTERVAL }}). Focus progress in this cycle will be lost and
            cannot be undone.
          </p>
          <div class="mt-6 flex flex-wrap justify-end gap-2">
            <button type="button" :class="btnSecondaryClass" @click="cancelReset">
              Cancel
            </button>
            <button
              type="button"
              class="min-h-11 rounded-xl border border-rose-700 bg-rose-700 px-4 text-sm font-semibold text-white transition hover:bg-rose-600 dark:border-rose-500 dark:bg-rose-600 dark:hover:bg-rose-500"
              @click="confirmReset"
            >
              Reset timer &amp; session
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </article>
</template>
