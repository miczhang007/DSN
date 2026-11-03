// 便签外观与窗口设置：尺寸、主题、位置、开机自启动。
//
// 窗口统一为无边框形态（见 tauri.conf.json），不再区分普通/极简模式。
//
// 这些设置都保存在 localStorage 并作用到 Tauri 窗口，和任务数据无关，
// 因此可以整块从 App.vue 抽出。

import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

const KEY_SIZE = "note-size";
const KEY_THEME = "note-theme";
const KEY_FONT = "note-font";
const KEY_SIGNATURE = "note-signature";
const KEY_POSITION = "note-position";
const DEFAULT_SIZE = "medium";
const DEFAULT_THEME = "yellow";
const DEFAULT_FONT = "xikai";
const DEFAULT_SIGNATURE = "桌面便签";
const FONT_CLASSES = ["font-maobi", "font-xingshu", "font-yingbi", "font-xikai", "font-kaishu"];

// 弹窗与提示条 teleport 到 body，拿不到便签上的字体类，
// 因此把选中的字体同时挂到 <html>，让 body 级元素也能继承主字体。
function applyFontClass(font) {
  const root = document.documentElement;
  FONT_CLASSES.forEach((name) => root.classList.toggle(name, name === `font-${font}`));
}
const DEFAULT_POSITION = "top-right";

export function useNoteSettings({ closeMenu, notify } = {}) {
  const noteSize = ref(DEFAULT_SIZE);
  const noteTheme = ref(DEFAULT_THEME);
  const noteFont = ref(DEFAULT_FONT);
  const noteSignature = ref(DEFAULT_SIGNATURE);
  const notePosition = ref(DEFAULT_POSITION);
  const autoStartEnabled = ref(false);

  /** 从 localStorage 恢复外观设置（启动时调用）。 */
  function loadSettings() {
    noteSize.value = localStorage.getItem(KEY_SIZE) || DEFAULT_SIZE;
    noteTheme.value = localStorage.getItem(KEY_THEME) || DEFAULT_THEME;
    noteFont.value = localStorage.getItem(KEY_FONT) || DEFAULT_FONT;
    noteSignature.value = localStorage.getItem(KEY_SIGNATURE) ?? DEFAULT_SIGNATURE;
    applyFontClass(noteFont.value);
    notePosition.value = localStorage.getItem(KEY_POSITION) || DEFAULT_POSITION;
    localStorage.removeItem("minimal-mode");
  }

  /** 首屏渲染后再应用到窗口，避免阻塞任务列表加载。 */
  function applyInitialLayout() {
    requestAnimationFrame(() => {
      Promise.allSettled([
        invoke("set_note_size", { size: noteSize.value }),
        invoke("set_note_position", { position: notePosition.value }),
        refreshAutoStartState(),
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

  function changeSignature(text) {
    noteSignature.value = String(text || "").slice(0, 20);
    localStorage.setItem(KEY_SIGNATURE, noteSignature.value);
  }

  /** 签名留空时回落到默认签名。 */
  function displaySignature() {
    return noteSignature.value || DEFAULT_SIGNATURE;
  }

  function changeNoteFont(font) {
    noteFont.value = font;
    localStorage.setItem(KEY_FONT, font);
    applyFontClass(font);
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
    noteFont,
    noteSignature,
    notePosition,
    autoStartEnabled,
    loadSettings,
    applyInitialLayout,
    changeNoteSize,
    changeNoteTheme,
    changeNoteFont,
    changeSignature,
    displaySignature,
    DEFAULT_SIGNATURE,
    changeNotePosition,
    changeAutoStart,
    refreshAutoStartState,
  };
}
