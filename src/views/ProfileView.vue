<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import AppCard from "../components/AppCard.vue";
import { useProfile } from "../composables/useProfile";
import { useGoogleAuth } from "../composables/useGoogleAuth";
import { useSupabaseAuth } from "../composables/useSupabaseAuth";
import { useTheme } from "../composables/useTheme";
import {
  bodyClass,
  btnPrimaryClass,
  btnSecondaryClass,
  hintClass,
  inputClass,
} from "../ui/themeClasses";

const { displayName, authEmail, resolvedName, initials, isAuthenticated } = useProfile();
const { theme, setTheme } = useTheme();
const {
  isConfigured,
  configIssue,
  busy: supabaseBusy,
  statusMessage,
  errorMessage: supabaseError,
  signInWithGoogleIdToken,
  signOut: unbindAccount,
} = useSupabaseAuth();
const {
  status: googleStatus,
  busy: googleBusy,
  errorMessage: googleError,
  cancelled: googleCancelled,
  signIn: googleSignIn,
  cancelSignIn: cancelGoogleSignIn,
} = useGoogleAuth();

const authBusy = computed(() => supabaseBusy.value || googleBusy.value);

async function onBindAccount() {
  const idToken = await googleSignIn();
  if (!idToken) {
    return;
  }
  await signInWithGoogleIdToken(idToken);
}
</script>

<template>
  <section class="mx-auto w-full max-w-lg space-y-6 py-6 lg:max-w-2xl lg:py-8">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight text-stone-900 dark:text-slate-100">Profile</h1>
      <p class="text-sm text-stone-500 dark:text-slate-400">Account, appearance, and app links.</p>
    </header>

    <AppCard>
      <div class="flex items-center gap-4">
        <span
          class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-teal-500/15 text-lg font-semibold text-teal-400"
        >
          {{ initials }}
        </span>
        <div class="min-w-0 flex-1 space-y-1">
          <p class="truncate text-lg font-medium text-stone-900 dark:text-slate-100">{{ resolvedName }}</p>
          <p v-if="isAuthenticated" class="truncate text-sm text-stone-500 dark:text-slate-400">{{ authEmail }}</p>
          <p v-else class="text-sm text-stone-400 dark:text-slate-500">No account bound</p>
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
          :class="inputClass"
        />
        <span :class="hintClass">
          Shown in the sidebar. A bound Google name is preferred when available.
        </span>
      </label>
    </AppCard>

    <AppCard>
      <h2 class="text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-slate-500">
        Account binding
      </h2>

      <template v-if="!isConfigured">
        <p class="mt-3" :class="bodyClass">
          Cloud account binding isn’t available on this install yet.
        </p>
        <p v-if="configIssue" class="mt-2 text-sm text-amber-800 dark:text-amber-300">{{ configIssue }}</p>
        <p class="mt-3" :class="hintClass">
          Developers: configure project env and Google provider — see
          <span class="font-mono text-xs">supabase/README.md</span>.
        </p>
      </template>

      <template v-else-if="isAuthenticated">
        <p class="mt-3" :class="bodyClass">
          Your Google account is bound. Multi-device sync will use this identity when it ships.
          Drive sync in Settings can use the same Google login separately.
        </p>
        <button
          type="button"
          class="mt-4"
          :class="btnSecondaryClass"
          :disabled="authBusy"
          @click="unbindAccount"
        >
          Unbind account
        </button>
      </template>

      <template v-else>
        <p class="mt-3" :class="bodyClass">
          Bind your Google account so ChronoWard can recognize you across devices.
          This uses the same Google sign-in as Drive.
        </p>
        <p v-if="googleStatus && !googleStatus.configured" class="mt-2 text-sm text-amber-800 dark:text-amber-300">
          {{ googleStatus.nextStep }}
        </p>
        <div class="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            :class="btnPrimaryClass"
            :disabled="authBusy || (googleStatus !== null && !googleStatus.configured)"
            @click="onBindAccount"
          >
            {{ googleBusy ? "Waiting for Google…" : "Bind with Google" }}
          </button>
          <button
            v-if="googleBusy"
            type="button"
            :class="btnSecondaryClass"
            @click="cancelGoogleSignIn"
          >
            Cancel
          </button>
        </div>
      </template>

      <p v-if="statusMessage" class="mt-3 text-sm text-teal-700 dark:text-teal-400">{{ statusMessage }}</p>
      <p v-if="supabaseError" class="mt-3 text-sm text-amber-800 dark:text-amber-300">{{ supabaseError }}</p>
      <p v-else-if="googleCancelled" class="mt-3 text-sm text-stone-500 dark:text-slate-400">Binding cancelled.</p>
      <p v-else-if="googleError" class="mt-3 text-sm text-amber-800 dark:text-amber-300">{{ googleError }}</p>
    </AppCard>

    <AppCard>
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
    </AppCard>

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
