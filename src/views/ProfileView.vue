<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useProfile } from "../composables/useProfile";
import { useTheme } from "../composables/useTheme";

const { displayName, authEmail, resolvedName, initials, isAuthenticated } = useProfile();
const { theme, setTheme } = useTheme();
</script>

<template>
  <section class="mx-auto w-full max-w-lg space-y-6 py-6 lg:max-w-2xl lg:py-8">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight text-stone-900 dark:text-slate-100">Profile</h1>
      <p class="text-sm text-stone-500 dark:text-slate-400">Account, appearance, and app links.</p>
    </header>

    <article class="rounded-2xl border border-stone-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/60">
      <div class="flex items-center gap-4">
        <span
          class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-teal-500/15 text-lg font-semibold text-teal-400"
        >
          {{ initials }}
        </span>
        <div class="min-w-0 flex-1 space-y-1">
          <p class="truncate text-lg font-medium text-stone-900 dark:text-slate-100">{{ resolvedName }}</p>
          <p v-if="isAuthenticated" class="truncate text-sm text-stone-500 dark:text-slate-400">{{ authEmail }}</p>
          <p v-else class="text-sm text-stone-400 dark:text-slate-500">Not signed in</p>
        </div>
      </div>

      <label class="mt-5 block space-y-2">
        <span class="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-slate-500">
          Display name
        </span>
        <input
          v-model="displayName"
          type="text"
          maxlength="64"
          placeholder="How you appear in the sidebar"
          class="w-full rounded-xl border border-stone-300 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600"
        />
        <span class="block text-xs text-stone-400 dark:text-slate-500">
          Used when no signed-in name is available. Supabase auth name takes priority when present.
        </span>
      </label>
    </article>

    <article class="rounded-2xl border border-stone-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/60">
      <h2 class="text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-slate-500">Appearance</h2>
      <div class="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          class="rounded-xl border px-4 py-3 text-sm font-medium transition"
          :class="
            theme === 'dark'
              ? 'border-teal-500/50 bg-teal-500/10 text-teal-400'
              : 'border-stone-300 text-stone-500 hover:border-stone-400 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600'
          "
          @click="setTheme('dark')"
        >
          Dark
        </button>
        <button
          type="button"
          class="rounded-xl border px-4 py-3 text-sm font-medium transition"
          :class="
            theme === 'light'
              ? 'border-teal-500/50 bg-teal-500/10 text-teal-400'
              : 'border-stone-300 text-stone-500 hover:border-stone-400 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600'
          "
          @click="setTheme('light')"
        >
          Light
        </button>
      </div>
    </article>

    <nav class="overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900/60" aria-label="Profile links">
      <RouterLink
        to="/settings"
        class="flex items-center justify-between border-b border-stone-200 px-5 py-4 text-sm font-medium text-stone-900 transition hover:bg-stone-50 dark:border-slate-800 dark:text-slate-100 dark:hover:bg-slate-800/50"
      >
        Settings
        <span class="text-stone-400 dark:text-slate-500" aria-hidden="true">→</span>
      </RouterLink>
      <RouterLink
        to="/help"
        class="flex items-center justify-between px-5 py-4 text-sm font-medium text-stone-900 transition hover:bg-stone-50 dark:text-slate-100 dark:hover:bg-slate-800/50"
      >
        Help
        <span class="text-stone-400 dark:text-slate-500" aria-hidden="true">→</span>
      </RouterLink>
    </nav>
  </section>
</template>
