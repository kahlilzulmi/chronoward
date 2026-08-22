import { ref, watch } from "vue";

export type ThemeMode = "dark" | "light";

const STORAGE_KEY = "chronoward.theme";

function loadTheme(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark") {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return "dark";
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.classList.toggle("dark", mode === "dark");
}

const theme = ref<ThemeMode>(loadTheme());
applyTheme(theme.value);

watch(theme, (mode) => {
  applyTheme(mode);
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
});

export function useTheme() {
  function setTheme(mode: ThemeMode) {
    theme.value = mode;
  }

  function toggleTheme() {
    theme.value = theme.value === "dark" ? "light" : "dark";
  }

  return { theme, setTheme, toggleTheme };
}
