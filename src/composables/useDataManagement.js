// 数据管理：查看数据版本、导出备份、从备份导入。
//
// 备份由后端生成/解析（JSON 文件），前端只负责：
//   1. 把本地分类列表交给导出命令；
//   2. 展示导入文件的摘要，让用户选择「完全覆盖 / 增量覆盖」；
//   3. 导入后同步 localStorage 里的分类与当前分类，并刷新任务列表。

import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { saveCategories, saveCurrentCategory } from "../lib/category-storage.js";

/**
 * @param {object} deps
 * @param {import("vue").Ref<string>} deps.view                  当前视图
 * @param {import("vue").Ref<boolean>} deps.menuOpen             菜单开关
 * @param {Function} deps.notify                                 统一提示
 * @param {Function} deps.openConfirmation                       应用内确认弹窗
 * @param {import("vue").Ref<string[]>} deps.categories          本地分类列表
 * @param {import("vue").Ref<string>} deps.currentCategory       当前分类
 * @param {Function} deps.refreshActiveTasks                     重新加载当前分类任务
 * @param {Function} deps.resetSessionState                      清空详情/历史页残留状态
 * @param {Function} deps.getPreferences                         读取界面/签名等展示设置
 * @param {Function} deps.applyPreferences                       应用导入的展示设置
 */
export function useDataManagement({
  view,
  menuOpen,
  notify,
  openConfirmation,
  categories,
  currentCategory,
  refreshActiveTasks,
  resetSessionState,
  getPreferences,
  applyPreferences,
}) {
  const dataOverview = ref(null);
  const importPreview = ref(null);
  const dataBusy = ref(false);

  async function openDataManagement() {
    menuOpen.value = false;
    importPreview.value = null;
    view.value = "data-management";
    await refreshOverview();
  }

  async function refreshOverview() {
    try {
      dataOverview.value = await invoke("get_data_overview");
    } catch (err) {
      notify?.(err, "读取数据版本失败");
    }
  }

  async function exportData() {
    if (dataBusy.value) return;
    dataBusy.value = true;
    try {
      const path = await invoke("export_data", {
        categories: [...categories.value],
        preferences: getPreferences?.() || null,
      });
      if (path) notify?.(`数据已导出到：${path}`, "导出数据失败");
    } catch (err) {
      notify?.(err, "导出数据失败");
    } finally {
      dataBusy.value = false;
    }
  }

  async function chooseImportFile() {
    if (dataBusy.value) return;
    dataBusy.value = true;
    try {
      const preview = await invoke("inspect_import_file");
      if (preview) importPreview.value = preview;
    } catch (err) {
      notify?.(err, "读取备份文件失败");
    } finally {
      dataBusy.value = false;
    }
  }

  function cancelImport() {
    importPreview.value = null;
  }

  function startImport(mode) {
    const preview = importPreview.value;
    if (!preview || dataBusy.value) return;
    const overwrite = mode === "overwrite";
    openConfirmation(
      overwrite ? "完全覆盖导入" : "增量覆盖导入",
      overwrite
        ? `将清空本地全部分类与任务数据，并改用备份「${preview.fileName}」中的内容（共 ${preview.taskCount} 条任务）。若备份包含界面设置，也会一并恢复主题、字体、签名等。本地现有数据无法恢复，建议先导出备份。`
        : `不会删除本地任务。备份「${preview.fileName}」中同 ID 的任务、节点与生命周期记录会按备份内容覆盖，备份里的其他任务会新增到本地（共 ${preview.taskCount} 条任务）。本地界面设置保持不变。`,
      () => applyImport(mode),
      overwrite ? "确认完全覆盖" : "确认增量导入",
    );
  }

  async function applyImport(mode) {
    const preview = importPreview.value;
    if (!preview) return;
    dataBusy.value = true;
    try {
      const result = await invoke("import_data", {
        path: preview.path,
        mode,
      });
      applyImportedCategories(result?.categories, mode, result?.preferences);
      if (mode === "overwrite" && result?.preferences) {
        // 完全覆盖时采用备份中的界面/签名设置；增量覆盖保留本地设置。
        try {
          await applyPreferences?.(result.preferences);
        } catch (err) {
          notify?.(err, "应用界面设置失败");
        }
      }
      importPreview.value = null;
      resetSessionState?.();
      view.value = categories.value.length ? "home" : "categories";
      if (view.value === "home") await refreshActiveTasks();
      await refreshOverview();
      notify?.(importSummary(result), "导入完成");
    } catch (err) {
      notify?.(err, "导入数据失败");
    } finally {
      dataBusy.value = false;
    }
  }

  // 完全覆盖：分类与备份保持一致；增量覆盖：保留本地分类并与备份分类取并集。
  function applyImportedCategories(importedCategories, mode, preferences) {
    const incoming = Array.isArray(importedCategories)
      ? importedCategories.map((name) => String(name || "").trim()).filter(Boolean)
      : [];
    const next = mode === "overwrite"
      ? [...new Set(incoming)]
      : [...new Set([...categories.value, ...incoming])];
    categories.value = next;
    saveCategories(next);
    const preferredCategory = mode === "overwrite" ? preferences?.currentCategory : null;
    if (preferredCategory && next.includes(preferredCategory)) {
      currentCategory.value = preferredCategory;
    } else if (!next.includes(currentCategory.value)) {
      currentCategory.value = next[0] || "";
    }
    saveCurrentCategory(currentCategory.value);
  }

  function importSummary(result) {
    const added = result?.addedTasks ?? 0;
    const updated = result?.updatedTasks ?? 0;
    const kept = result?.keptLocalTasks ?? 0;
    const orphan = result?.orphanRecurringTasks ?? 0;
    const orphanSuffix = orphan ? `；${orphan} 条任务的周期规则已不存在，已转为普通任务` : "";
    if (result?.mode === "overwrite") {
      return `完全覆盖完成：已使用备份数据（${added} 条任务）${orphanSuffix}`;
    }
    const parts = [`新增 ${added} 条`];
    if (updated) parts.push(`覆盖 ${updated} 条`);
    if (kept) parts.push(`保留本地 ${kept} 条`);
    if (orphan) parts.push(`${orphan} 条任务转为普通任务`);
    return `增量导入完成：${parts.join("，")}`;
  }

  return {
    dataOverview,
    importPreview,
    dataBusy,
    openDataManagement,
    refreshOverview,
    exportData,
    chooseImportFile,
    cancelImport,
    startImport,
  };
}
