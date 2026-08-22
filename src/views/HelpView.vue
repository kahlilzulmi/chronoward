<script setup lang="ts">
import { useAndroidTrackingPermissions } from "../composables/useAndroidTrackingPermissions";
import AppCard from "../components/AppCard.vue";
import {
  bodyClass,
  headingClass,
  pageSubtitleClass,
  pageTitleClass,
} from "../ui/themeClasses";

const { isAndroid } = useAndroidTrackingPermissions();
</script>

<template>
  <section class="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 py-6 sm:gap-8 sm:py-10">
    <header class="space-y-1">
      <h1 :class="pageTitleClass">Help</h1>
      <p :class="pageSubtitleClass">Troubleshooting and setup guide.</p>
    </header>

    <AppCard>
      <h2 :class="headingClass">Setup checklist</h2>
      <ol class="list-decimal space-y-1.5 pl-5 text-sm text-stone-600 dark:text-slate-400">
        <li v-if="isAndroid">
          Run <span class="font-mono text-xs">npm run android:dev</span> until
          <span class="font-mono text-xs">ADB ready: … (device)</span>.
        </li>
        <li v-if="isAndroid">
          Debug UI loads from <span class="font-mono text-xs">http://localhost:1420</span> via
          <span class="font-mono text-xs">adb reverse</span>. Do not use a frozen emulator window.
        </li>
        <li v-if="isAndroid">Grant Usage Access. Accessibility is optional for URL tracking.</li>
        <li v-if="!isAndroid">
          Run <span class="font-mono text-xs">npm run desktop:dev</span> (or
          <span class="font-mono text-xs">npm run tauri dev</span>) so the Windows tracker can emit live context.
        </li>
        <li>
          PC and emulator share one Vite on port 1420. Start
          <span class="font-mono text-xs">npm run android:dev</span>, then in a second terminal
          <span class="font-mono text-xs">npm run desktop:dev</span>. Do not start a second
          <span class="font-mono text-xs">npm run dev</span>.
        </li>
        <li>If the dashboard shows but the main pane is empty, force-stop Chronoward and reopen after Vite is up.</li>
      </ol>
    </AppCard>

    <AppCard>
      <h2 :class="headingClass">Keyboard shortcuts (desktop)</h2>
      <dl class="space-y-2 text-sm text-stone-600 dark:text-slate-400">
        <div class="flex gap-3">
          <dt>
            <kbd class="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900">
              Space
            </kbd>
          </dt>
          <dd>Start / Pause</dd>
        </div>
        <div class="flex gap-3">
          <dt>
            <kbd class="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900">
              S
            </kbd>
          </dt>
          <dd>Skip current session</dd>
        </div>
      </dl>
      <p class="mt-3" :class="bodyClass">
        Settings, pairing, Google sync, and notifications are under Profile → Settings.
      </p>
    </AppCard>
  </section>
</template>
