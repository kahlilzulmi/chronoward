import { computed, ref, watch } from "vue";

export interface TaskItem {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
}

const STORAGE_KEY = "chronoward.tasks";
const ACTIVE_KEY = "chronoward.tasks.activeId";

function loadTasks(): TaskItem[] {
  if (typeof localStorage === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as TaskItem[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (task) =>
        task &&
        typeof task.id === "string" &&
        typeof task.title === "string" &&
        typeof task.completed === "boolean",
    );
  } catch {
    return [];
  }
}

function loadActiveId(): string | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  return localStorage.getItem(ACTIVE_KEY);
}

const tasks = ref<TaskItem[]>(loadTasks());
const activeTaskId = ref<string | null>(loadActiveId());

function persistTasks() {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks.value));
}

function persistActiveId() {
  if (typeof localStorage === "undefined") {
    return;
  }
  if (activeTaskId.value) {
    localStorage.setItem(ACTIVE_KEY, activeTaskId.value);
  } else {
    localStorage.removeItem(ACTIVE_KEY);
  }
}

watch(tasks, persistTasks, { deep: true });
watch(activeTaskId, persistActiveId);

const activeTask = computed(
  () => tasks.value.find((task) => task.id === activeTaskId.value) ?? null,
);

const openTasks = computed(() => tasks.value.filter((task) => !task.completed));

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useTasks() {
  function addTask(title: string) {
    const trimmed = title.trim();
    if (!trimmed) {
      return null;
    }
    const task: TaskItem = {
      id: createId(),
      title: trimmed,
      completed: false,
      createdAt: Date.now(),
    };
    tasks.value.unshift(task);
    if (!activeTaskId.value) {
      activeTaskId.value = task.id;
    }
    return task;
  }

  function toggleComplete(id: string) {
    const task = tasks.value.find((row) => row.id === id);
    if (!task) {
      return;
    }
    task.completed = !task.completed;
    if (task.completed && activeTaskId.value === id) {
      activeTaskId.value = openTasks.value[0]?.id ?? null;
    }
  }

  function removeTask(id: string) {
    tasks.value = tasks.value.filter((task) => task.id !== id);
    if (activeTaskId.value === id) {
      activeTaskId.value = openTasks.value[0]?.id ?? null;
    }
  }

  function setActiveTask(id: string | null) {
    if (!id) {
      activeTaskId.value = null;
      return;
    }
    const task = tasks.value.find((row) => row.id === id && !row.completed);
    activeTaskId.value = task ? task.id : null;
  }

  function renameTask(id: string, title: string) {
    const task = tasks.value.find((row) => row.id === id);
    if (!task) {
      return;
    }
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }
    task.title = trimmed;
  }

  return {
    tasks,
    openTasks,
    activeTask,
    activeTaskId,
    addTask,
    toggleComplete,
    removeTask,
    setActiveTask,
    renameTask,
  };
}
