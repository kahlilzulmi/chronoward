<script setup lang="ts">
import { ref } from "vue";
import { useTasks } from "../composables/useTasks";

const { tasks, openTasks, activeTaskId, addTask, toggleComplete, removeTask, setActiveTask } =
  useTasks();

const draft = ref("");

function onAdd() {
  const task = addTask(draft.value);
  if (task) {
    draft.value = "";
  }
}
</script>

<template>
  <section class="mx-auto w-full max-w-2xl space-y-6 py-6 lg:py-8">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight text-stone-900 dark:text-slate-100">Tasks</h1>
      <p class="text-sm text-stone-500 dark:text-slate-400">
        {{ openTasks.length }} open · pick an active task on the dashboard timer
      </p>
    </header>

    <form class="flex gap-2" @submit.prevent="onAdd">
      <input
        v-model="draft"
        type="text"
        maxlength="120"
        placeholder="Add a focus task…"
        class="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
      />
      <button
        type="submit"
        class="rounded-xl bg-teal-500/15 px-4 py-2.5 text-sm font-semibold text-teal-400"
      >
        Add
      </button>
    </form>

    <ul v-if="tasks.length > 0" class="space-y-2">
      <li
        v-for="task in tasks"
        :key="task.id"
        class="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60"
        :class="task.completed ? 'opacity-60' : ''"
      >
        <input
          type="checkbox"
          class="h-4 w-4 rounded border-slate-600 bg-slate-950 text-teal-500 focus:ring-teal-500"
          :checked="task.completed"
          @change="toggleComplete(task.id)"
        />
        <span
          class="min-w-0 flex-1 truncate text-sm"
          :class="task.completed ? 'text-stone-500 line-through dark:text-slate-500' : 'text-stone-900 dark:text-slate-100'"
        >
          {{ task.title }}
        </span>
        <button
          v-if="!task.completed"
          type="button"
          class="text-xs font-medium"
          :class="activeTaskId === task.id ? 'text-teal-700 dark:text-teal-400' : 'text-stone-500 hover:text-teal-700 dark:text-slate-500 dark:hover:text-teal-400'"
          @click="setActiveTask(task.id)"
        >
          {{ activeTaskId === task.id ? "Active" : "Set active" }}
        </button>
        <button
          type="button"
          class="text-xs text-slate-500 hover:text-rose-400"
          @click="removeTask(task.id)"
        >
          Remove
        </button>
      </li>
    </ul>

    <article
      v-else
      class="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-10 text-center dark:border-slate-700 dark:bg-slate-900/40"
    >
      <p class="text-sm text-stone-500 dark:text-slate-400">No tasks yet. Add one above.</p>
    </article>
  </section>
</template>
