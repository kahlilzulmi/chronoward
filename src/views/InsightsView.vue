<script setup lang="ts">
import UsagePieChart from "../components/UsagePieChart.vue";
</script>

<template>
  <section class="mx-auto w-full max-w-3xl space-y-6 py-6 lg:py-8">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight text-slate-100">Insights</h1>
      <p class="text-sm text-slate-400">Screen time breakdown by app and device.</p>
    </header>

    <UsagePieChart />
  </section>
</template>
