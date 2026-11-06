// 任务合并：勾选多个未归档的普通任务，编辑合并后的名称并合并为一个待完成任务。
//
// 合并规则由后端保证：节点、进度与生命周期日志迁移到新任务，原任务删除；
// 周期任务由规则自动生成，不参与合并。前端只负责选择、名称预填与确认。

import { computed, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";

const MAX_TITLE_CHARS = 80;

/**
 * @param {object} deps
 * @param {import("vue").Ref<string>} deps.currentCategory
 * @param {import("vue").Ref<string>} deps.view
 * @param {import("vue").Ref<boolean>} deps.menuOpen
 * @param {Function} deps.notify                    统一提示
 * @param {Function} deps.openConfirmation          应用内确认弹窗
 * @param {import("vue").Ref<object[]>} deps.activeTasks  当前分类未归档任务
 * @param {Function} deps.refreshActiveTasks
 * @param {Function} deps.openCategoryManager
 * @param {Function} deps.resetSessionState
 */
export function useTaskMerge({
  currentCategory,
  view,
  menuOpen,
  notify,
  openConfirmation,
  activeTasks,
  refreshActiveTasks,
  openCategoryManager,
  resetSessionState,
}) {
  // 用数组保存勾选顺序：节点合并顺序与用户勾选顺序一致。
  const mergeSelectedIds = ref([]);
  const mergeTitle = ref("");
  // 记录“自动生成”的标题；用户手动改过之后不再覆盖。
  const mergeAutoTitle = ref("");
  const mergeBusy = ref(false);

  const mergeableTasks = computed(() => activeTasks.value.filter((task) => !task.is_recurring));
  const mergeSelectedTaskList = computed(() =>
    mergeSelectedIds.value
      .map((id) => mergeableTasks.value.find((task) => task.id === id))
      .filter(Boolean),
  );
  const allMergeTasksSelected = computed(
    () =>
      mergeableTasks.value.length > 0 &&
      mergeSelectedIds.value.length === mergeableTasks.value.length,
  );
  const canMergeTasks = computed(
    () =>
      mergeSelectedIds.value.length >= 2 &&
      Boolean(mergeTitle.value.trim()) &&
      !mergeBusy.value,
  );

  // 任务列表刷新（例如跨天自动归档）后剔除已不在列表中的勾选项，
  // 避免把已归档/不存在的任务提交给合并接口。
  watch(mergeableTasks, (tasks) => {
    const validIds = new Set(tasks.map((task) => task.id));
    const keptIds = mergeSelectedIds.value.filter((id) => validIds.has(id));
    if (keptIds.length !== mergeSelectedIds.value.length) {
      mergeSelectedIds.value = keptIds;
      syncSuggestedTitle();
    }
  });

  async function openMergeTasks() {
    if (!currentCategory.value) {
      openCategoryManager();
      return;
    }
    menuOpen.value = false;
    view.value = "merge-tasks";
    resetMergeSelection();
    await refreshActiveTasks();
  }

  function resetMergeSelection() {
    mergeSelectedIds.value = [];
    mergeTitle.value = "";
    mergeAutoTitle.value = "";
  }

  function isMergeTaskSelected(taskId) {
    return mergeSelectedIds.value.includes(taskId);
  }

  function toggleMergeTask(task) {
    if (mergeBusy.value) return;
    const index = mergeSelectedIds.value.indexOf(task.id);
    if (index >= 0) {
      mergeSelectedIds.value.splice(index, 1);
    } else {
      mergeSelectedIds.value.push(task.id);
    }
    syncSuggestedTitle();
  }

  function toggleSelectAllMergeTasks() {
    if (mergeBusy.value) return;
    mergeSelectedIds.value = allMergeTasksSelected.value
      ? []
      : mergeableTasks.value.map((task) => task.id);
    syncSuggestedTitle();
  }

  // 默认名称取所选任务标题的拼接；用户改过名称后保持用户输入。
  function syncSuggestedTitle() {
    const suggested = limitTitle(mergeSelectedTaskList.value.map((task) => task.title).join("、"));
    if (!mergeTitle.value.trim() || mergeTitle.value === mergeAutoTitle.value) {
      mergeTitle.value = suggested;
      mergeAutoTitle.value = suggested;
    }
  }

  function limitTitle(value) {
    return Array.from(String(value || ""))
      .slice(0, MAX_TITLE_CHARS)
      .join("");
  }

  function mergeSelectedTasks() {
    if (mergeBusy.value) return;
    if (mergeSelectedIds.value.length < 2) {
      notify?.("请至少选择两个任务进行合并", "请至少选择两个任务进行合并");
      return;
    }
    const title = mergeTitle.value.trim();
    if (!title) {
      notify?.("请填写合并后的任务名称", "请填写合并后的任务名称");
      return;
    }
    openConfirmation(
      "合并任务",
      `将把选中的 ${mergeSelectedIds.value.length} 个任务合并为「${title}」。原任务会被删除，节点、进度和日志会保留并合并到新任务，合并后状态为待完成。`,
      () => applyMerge(title),
      "确认合并",
    );
  }

  async function applyMerge(title) {
    mergeBusy.value = true;
    try {
      const merged = await invoke("merge_tasks", {
        owner: currentCategory.value,
        taskIds: [...mergeSelectedIds.value],
        title,
      });
      resetMergeSelection();
      resetSessionState?.();
      view.value = "home";
      await refreshActiveTasks();
      notify?.(`已合并为「${merged?.title || title}」`, "合并任务失败");
    } catch (err) {
      notify?.(err, "合并任务失败");
    } finally {
      mergeBusy.value = false;
    }
  }

  return {
    mergeSelectedIds,
    mergeTitle,
    mergeBusy,
    mergeableTasks,
    allMergeTasksSelected,
    canMergeTasks,
    openMergeTasks,
    isMergeTaskSelected,
    toggleMergeTask,
    toggleSelectAllMergeTasks,
    mergeSelectedTasks,
  };
}
