import { computed, ref, watch } from "vue";
import { supabase } from "../database/supabase";

const STORAGE_KEY = "chronoward.profile.displayName";

function loadDisplayName(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

const displayName = ref(loadDisplayName());
const authEmail = ref<string | null>(null);
const authName = ref<string | null>(null);
const authLoaded = ref(false);

async function refreshAuthUser() {
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    authEmail.value = user?.email ?? null;
    const meta = user?.user_metadata;
    authName.value =
      (typeof meta?.full_name === "string" && meta.full_name) ||
      (typeof meta?.name === "string" && meta.name) ||
      null;
  } catch {
    authEmail.value = null;
    authName.value = null;
  } finally {
    authLoaded.value = true;
  }
}

watch(displayName, (value) => {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
});

const resolvedName = computed(() => {
  if (authName.value?.trim()) {
    return authName.value.trim();
  }
  if (displayName.value.trim()) {
    return displayName.value.trim();
  }
  if (authEmail.value) {
    return authEmail.value.split("@")[0] ?? "ChronoWard user";
  }
  return "ChronoWard user";
});

const initials = computed(() => {
  const parts = resolvedName.value.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return resolvedName.value.slice(0, 2).toUpperCase();
});

const isAuthenticated = computed(() => Boolean(authEmail.value));

let authRefreshStarted = false;

export function useProfile() {
  if (!authRefreshStarted) {
    authRefreshStarted = true;
    void refreshAuthUser();
  }

  return {
    displayName,
    authEmail,
    authName,
    authLoaded,
    resolvedName,
    initials,
    isAuthenticated,
    refreshAuthUser,
  };
}
