<script setup lang="ts">
import { useAndroidTrackingPermissions } from "../composables/useAndroidTrackingPermissions";

const { isAndroid } = useAndroidTrackingPermissions();
</script>

<template>
  <section class="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 py-6 sm:gap-8 sm:py-10">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">Help</h1>
      <p class="text-sm text-stone-500 sm:text-base">Troubleshooting and setup guide.</p>
    </header>

    <section class="space-y-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 class="text-sm font-medium text-stone-800 sm:text-base">Setup checklist</h2>
      <ol class="list-decimal space-y-1.5 pl-5 text-sm text-stone-600">
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
    </section>

    <section class="space-y-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 class="text-sm font-medium text-stone-800 sm:text-base">Keyboard shortcuts (desktop)</h2>
      <dl class="space-y-2 text-sm text-stone-600">
        <div class="flex gap-3">
          <dt><kbd class="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-mono text-xs">Space</kbd></dt>
          <dd>Start / Pause</dd>
        </div>
        <div class="flex gap-3">
          <dt><kbd class="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-mono text-xs">S</kbd></dt>
          <dd>Skip current session</dd>
        </div>
      </dl>
    </section>
  </section>
</template>
