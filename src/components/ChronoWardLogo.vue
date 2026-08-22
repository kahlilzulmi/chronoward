<script setup lang="ts">
import logoUrl from "../assets/logo.svg";

defineProps<{
  size?: number;
}>();
</script>

<template>
  <img
    :src="logoUrl"
    :width="size ?? 32"
    :height="size ?? 32"
    alt="ChronoWard"
    class="shrink-0"
  />
</template>
