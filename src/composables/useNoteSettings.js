// 便签外观与窗口设置：尺寸、主题、位置、极简模式、开机自启动。
//
// 这些设置都保存在 localStorage 并作用到 Tauri 窗口，和任务数据无关，
// 因此可以整块从 App.vue 抽出。

import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

const KEY_SIZE = "note-size";
const KEY_THEME = "note-theme";
const KEY_POSITION = "note-position";
const KEY_MINIMAL = "minimal-mode";

const DEFAULT_SIZE = "medium";
const DEFAULT_THEME = "yellow";
const DEFAULT_POSITION = "top-right";

export function useNoteSettings({ closeMenu, notify } = {}) {
  const noteSize = ref(DEFAULT_SIZE);
  const noteTheme = ref(DEFAULT_THEME);
  const notePosition = ref(DEFAULT_POSITION);
  const autoStartEnabled = ref(false);
  const minimalModeEnabled = ref(false);

  /** 从 localStorage 恢复外观设置（启动时调用）。 */
  function loadSettings() {
    noteSize.value = localStorage.getItem(KEY_SIZE) || DEFAULT_SIZE;
    noteTheme.value = localStorage.getItem(KEY_THEME) || DEFAULT_THEME;
    notePosition.value = localStorage.getItem(KEY_POSITION) || DEFAULT_POSITION;
    minimalModeEnabled.value = localStorage.getItem(KEY_MINIMAL) === "true";
  }

  /** 首屏渲染后再应用到窗口，避免阻塞任务列表加载。 */
  function applyInitialLayout() {
    requestAnimationFrame(() => {
      Promise.allSettled([
        invoke("set_note_size", { size: noteSize.value }),
        invoke("set_note_position", { position: notePosition.value }),
        refreshAutoStartState(),
        invoke("set_minimal_mode", { enabled: minimalModeEnabled.value }),
      ]);
    });
  }

  async function changeNoteSize(size) {
    noteSize.value = size;
    localStorage.setItem(KEY_SIZE, size);
    await invoke("set_note_size", { size });
    await invoke("set_note_position", { position: notePosition.value });
  }

  function changeNoteTheme(theme) {
    noteTheme.value = theme;
    localStorage.setItem(KEY_THEME, theme);
  }

  async function changeNotePosition(position) {
    notePosition.value = position;
    localStorage.setItem(KEY_POSITION, position);
    if (closeMenu) closeMenu();
    await invoke("set_note_position", { position });
  }

  async function changeAutoStart(enabled) {
    const previous = autoStartEnabled.value;
    autoStartEnabled.value = enabled;
    try {
      autoStartEnabled.value = await invoke("set_auto_start_enabled", { enabled });
    } catch (err) {
      autoStartEnabled.value = previous;
      if (notify) notify(err, "设置开机自启动失败");
    }
  }

  async function changeMinimalMode(enabled) {
    const previous = minimalModeEnabled.value;
    minimalModeEnabled.value = enabled;
    try {
      minimalModeEnabled.value = await invoke("set_minimal_mode", { enabled });
      localStorage.setItem(KEY_MINIMAL, String(minimalModeEnabled.value));
    } catch (err) {
      minimalModeEnabled.value = previous;
      if (notify) notify(err, "设置极简模式失败");
    }
  }

  async function refreshAutoStartState() {
    try {
      autoStartEnabled.value = await invoke("is_auto_start_enabled");
    } catch {
      autoStartEnabled.value = false;
    }
  }

  return {
    noteSize,
    noteTheme,
    notePosition,
    autoStartEnabled,
    minimalModeEnabled,
    loadSettings,
    applyInitialLayout,
    changeNoteSize,
    changeNoteTheme,
    changeNotePosition,
    changeAutoStart,
    changeMinimalMode,
    refreshAutoStartState,
  };
}
