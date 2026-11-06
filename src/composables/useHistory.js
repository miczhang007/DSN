// 历史任务：跨分类归档列表、分类/类型筛选、名称检索、撤销完成/归档、单条与批量删除。
//
// 「仅撤销完成 / 撤销完成并撤销归档」通过确认弹窗的多选项提供。

import { computed, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { localDateInputValue } from "../lib/datetime.js";

/**
 * @param {object} deps
 * @param {import("vue").Ref<string>}  deps.currentCategory
 * @param {import("vue").Ref<string>}  deps.view
 * @param {import("vue").Ref<boolean>} deps.menuOpen
 * @param {Function} deps.notify                错误提示
 * @param {import("vue").Ref<object>}  deps.confirmation
 * @param {import("vue").Ref<string>}  deps.expandedHistoryTaskId
 * @param {Function} deps.openConfirmation
 * @param {Function} deps.refreshActiveTasks
 * @param {import("vue").Ref<string[]>} deps.categories  分类列表（用于分类筛选选项）
 */
export function useHistory({
  currentCategory,
  view,
  menuOpen,
  notify,
  confirmation,
  expandedHistoryTaskId,
  openConfirmation,
  refreshActiveTasks,
  categories,
}) {
  const archivedTasks = ref([]);
  // 筛选与选择状态：分类 / 类型 / 搜索词可组合生效。
  const historyCategory = ref("all");
  const historyFilter = ref("all");
  const historySearch = ref("");
  // 多选模式默认关闭：进入后才显示行前勾选框与批量删除栏。
  const historySelectionMode = ref(false);
  const selectedHistoryIds = ref([]);

  const historyCategoryOptions = computed(() => {
    const names = [...(categories.value || [])];
    for (const task of archivedTasks.value) {
      if (task.owner && !names.includes(task.owner)) names.push(task.owner);
    }
    return names.filter(Boolean);
  });

  const filteredArchivedTasks = computed(() => {
    const keyword = historySearch.value.trim().toLowerCase();
    return archivedTasks.value.filter((task) => {
      if (historyCategory.value !== "all" && task.owner !== historyCategory.value) return false;
      if (historyFilter.value === "normal" && task.is_recurring) return false;
      if (historyFilter.value === "recurring" && !task.is_recurring) return false;
      if (keyword && !String(task.title || "").toLowerCase().includes(keyword)) return false;
      return true;
    });
  });

  const allFilteredHistorySelected = computed(
    () =>
      filteredArchivedTasks.value.length > 0 &&
      filteredArchivedTasks.value.every((task) => selectedHistoryIds.value.includes(task.id)),
  );

  // 筛选条件变化后丢弃已不可见的勾选项，批量删除始终只作用于当前筛选结果。
  watch(filteredArchivedTasks, (tasks) => {
    const visibleIds = new Set(tasks.map((task) => task.id));
    const keptIds = selectedHistoryIds.value.filter((id) => visibleIds.has(id));
    if (keptIds.length !== selectedHistoryIds.value.length) {
      selectedHistoryIds.value = keptIds;
    }
  });

  async function loadArchivedTasks() {
    archivedTasks.value = (await invoke("list_all_archived_tasks")) || [];
  }

  async function openHistory() {
    menuOpen.value = false;
    expandedHistoryTaskId.value = "";
    historySelectionMode.value = false;
    view.value = "history";
    clearHistoryFilters();
    await loadArchivedTasks();
  }

  function clearHistoryFilters() {
    historyCategory.value = "all";
    historyFilter.value = "all";
    historySearch.value = "";
    selectedHistoryIds.value = [];
  }

  function enterHistorySelection() {
    historySelectionMode.value = true;
    selectedHistoryIds.value = [];
  }

  function exitHistorySelection() {
    historySelectionMode.value = false;
    selectedHistoryIds.value = [];
  }

  function toggleHistorySelectionMode() {
    if (historySelectionMode.value) {
      exitHistorySelection();
    } else {
      enterHistorySelection();
    }
  }

  function toggleHistoryActions(taskId) {
    expandedHistoryTaskId.value = expandedHistoryTaskId.value === taskId ? "" : taskId;
  }

  function resetHistoryState() {
    archivedTasks.value = [];
    historySelectionMode.value = false;
    clearHistoryFilters();
  }

  function isHistorySelected(taskId) {
    return selectedHistoryIds.value.includes(taskId);
  }

  function toggleHistorySelection(task) {
    const index = selectedHistoryIds.value.indexOf(task.id);
    if (index >= 0) {
      selectedHistoryIds.value.splice(index, 1);
    } else {
      selectedHistoryIds.value.push(task.id);
    }
  }

  function toggleSelectAllHistory() {
    selectedHistoryIds.value = allFilteredHistorySelected.value
      ? []
      : filteredArchivedTasks.value.map((task) => task.id);
  }

  async function historyAction(task, action) {
    if (action === "undo_completion") {
      openUndoCompletionConfirmation(task);
      return;
    }
    await runHistoryAction(task, action);
  }

  async function runHistoryAction(task, action) {
    try {
      await invoke("restore_archived_task", {
        owner: task.owner || currentCategory.value,
        taskId: task.id,
        action,
      });
      await loadArchivedTasks();
      await refreshActiveTasks();
      expandedHistoryTaskId.value = "";
    } catch (err) {
      if (notify) notify(err, "历史任务操作失败");
    }
  }

  function openUndoCompletionConfirmation(task) {
    expandedHistoryTaskId.value = "";
    confirmation.value = {
      title: "撤销完成",
      message: "是否同时撤销归档状态，将该任务重新加入当前任务列表？",
      titleId: "confirm-dialog-title",
      kind: "delete",
      choices: [
        { label: "仅撤销完成", action: () => runHistoryAction(task, "undo_completion_only") },
        { label: "撤销完成并撤销归档", danger: true, action: () => runHistoryAction(task, "undo_completion") },
      ],
    };
  }

  function canUndoTask(task) {
    return !task.is_recurring || String(task.occurrence_date || "").startsWith(localDateInputValue());
  }

  function deleteArchivedTask(task) {
    openConfirmation("删除任务", `确定删除“${task.title}”吗？删除后将从历史和任务列表中隐藏。`, async () => {
      await invoke("delete_task", { owner: task.owner || currentCategory.value, taskId: task.id });
      await loadArchivedTasks();
    });
  }

  function batchDeleteHistoryTasks() {
    const taskIds = [...selectedHistoryIds.value];
    if (!taskIds.length) return;
    openConfirmation(
      "批量删除历史任务",
      `确定删除选中的 ${taskIds.length} 个历史任务吗？删除后将从历史与任务列表中隐藏，不能恢复。`,
      async () => {
        await invoke("delete_archived_tasks", { taskIds });
        selectedHistoryIds.value = [];
        historySelectionMode.value = false;
        await loadArchivedTasks();
      },
      "确认删除",
    );
  }

  return {
    archivedTasks,
    filteredArchivedTasks,
    historyCategory,
    historyCategoryOptions,
    historyFilter,
    historySearch,
    historySelectionMode,
    selectedHistoryIds,
    allFilteredHistorySelected,
    clearHistoryFilters,
    openHistory,
    enterHistorySelection,
    exitHistorySelection,
    toggleHistorySelectionMode,
    toggleHistoryActions,
    toggleHistorySelection,
    toggleSelectAllHistory,
    isHistorySelected,
    resetHistoryState,
    historyAction,
    canUndoTask,
    deleteArchivedTask,
    batchDeleteHistoryTasks,
    loadArchivedTasks,
  };
}
