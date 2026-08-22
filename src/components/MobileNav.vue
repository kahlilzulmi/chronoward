<script setup lang="ts">
import { RouterLink } from "vue-router";

const navItems = [
  { to: "/", label: "Dashboard", exact: true, icon: "dashboard" },
  { to: "/sessions", label: "Sessions", exact: false, icon: "sessions" },
  { to: "/tasks", label: "Tasks", exact: false, icon: "tasks" },
  { to: "/insights", label: "Insights", exact: false, icon: "insights" },
  { to: "/profile", label: "Profile", exact: false, icon: "profile" },
] as const;
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95"
    style="padding-bottom: env(safe-area-inset-bottom)"
    aria-label="Primary"
  >
    <div class="mx-auto grid max-w-lg grid-cols-5 px-1 py-1">
      <RouterLink
        v-for="item in navItems"
        :key="item.to"
        v-slot="{ href, navigate, isActive, isExactActive }"
        :to="item.to"
        custom
      >
        <a
          :href="href"
          class="flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[10px] font-medium"
          :class="
            (item.exact ? isExactActive : isActive)
              ? 'text-teal-700 dark:text-teal-400'
              : 'text-stone-400 dark:text-slate-500'
          "
          @click="navigate"
        >
          <svg
            v-if="item.icon === 'dashboard'"
            class="h-5 w-5"
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
            class="h-5 w-5"
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
            class="h-5 w-5"
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
            v-else-if="item.icon === 'insights'"
            class="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            aria-hidden="true"
          >
            <path d="M4 19V5M4 19h16M8 15v-4M12 15V9M16 15v-2" stroke-linecap="round" />
          </svg>
          <svg
            v-else
            class="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            aria-hidden="true"
          >
            <circle cx="12" cy="9" r="3.5" />
            <path d="M5.5 19c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" stroke-linecap="round" />
          </svg>
          <span>{{ item.label }}</span>
        </a>
      </RouterLink>
    </div>
  </nav>
</template>
