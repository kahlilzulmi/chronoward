<script setup lang="ts">
import { RouterLink } from "vue-router";
import ChronoWardLogo from "./ChronoWardLogo.vue";
import { useProfile } from "../composables/useProfile";

const { resolvedName, initials } = useProfile();

const navItems = [
  { to: "/", label: "Dashboard", exact: true, icon: "dashboard" },
  { to: "/sessions", label: "Sessions", exact: false, icon: "sessions" },
  { to: "/tasks", label: "Tasks", exact: false, icon: "tasks" },
  { to: "/insights", label: "Insights", exact: false, icon: "insights" },
] as const;
</script>

<template>
  <aside
    class="flex w-60 shrink-0 flex-col border-r border-stone-200 bg-stone-50 text-stone-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
    style="padding-top: env(safe-area-inset-top)"
  >
    <div class="flex items-center gap-3 px-5 py-6">
      <span class="text-teal-400">
        <ChronoWardLogo :size="28" />
      </span>
      <span class="text-lg font-semibold tracking-tight">ChronoWard</span>
    </div>

    <nav class="flex flex-1 flex-col gap-1 px-3" aria-label="Primary">
      <RouterLink
        v-for="item in navItems"
        :key="item.to"
        v-slot="{ href, navigate, isActive, isExactActive }"
        :to="item.to"
        custom
      >
        <a
          :href="href"
          class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition"
          :class="
            (item.exact ? isExactActive : isActive)
              ? 'bg-stone-200/80 text-teal-700 dark:bg-slate-800/80 dark:text-teal-400'
              : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100'
          "
          @click="navigate"
        >
          <svg
            v-if="item.icon === 'dashboard'"
            class="h-5 w-5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
          <svg
            v-else-if="item.icon === 'sessions'"
            class="h-5 w-5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7v5l3 2" stroke-linecap="round" />
          </svg>
          <svg
            v-else-if="item.icon === 'tasks'"
            class="h-5 w-5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            aria-hidden="true"
          >
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <path d="M8 12l2.5 2.5L16 9" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <svg
            v-else
            class="h-5 w-5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            aria-hidden="true"
          >
            <path d="M4 19V5M4 19h16M8 15v-4M12 15V9M16 15v-2" stroke-linecap="round" />
          </svg>
          {{ item.label }}
        </a>
      </RouterLink>
    </nav>

    <RouterLink v-slot="{ href, navigate, isActive }" to="/profile" custom>
      <a
        :href="href"
        class="mx-3 mb-4 flex items-center gap-3 rounded-xl border border-stone-200 px-3 py-3 transition hover:bg-stone-100 dark:border-slate-800 dark:hover:bg-slate-900"
        :class="isActive ? 'bg-stone-100 ring-1 ring-teal-500/30 dark:bg-slate-900' : ''"
        style="margin-bottom: calc(1rem + env(safe-area-inset-bottom))"
        @click="navigate"
      >
        <span
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-500/15 text-xs font-semibold text-teal-400"
        >
          {{ initials }}
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium text-stone-900 dark:text-slate-100">{{ resolvedName }}</span>
          <span class="block text-xs text-stone-500 dark:text-slate-500">Profile</span>
        </span>
      </a>
    </RouterLink>
  </aside>
</template>
