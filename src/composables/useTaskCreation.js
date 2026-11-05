// 新增任务表单：一次性任务与周期任务的新建、草稿节点维护。
//
// 周期任务在这里只负责「创建规则」，按日生成任务实例由 Rust 端负责。

import { reactive } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { dateTimeToIso, defaultStartTime, localDateInputValue } from "../lib/datetime.js";

/**
 * @param {object} deps
 * @param {import("vue").Ref<string>} deps.currentCategory
 * @param {import("vue").Ref<string>} deps.view
 * @param {Function} deps.refreshActiveTasks
 * @param {Function} deps.switchCategory     新建到其他分类后切过去
 */
export function useTaskCreation({ currentCategory, view, refreshActiveTasks, switchCategory }) {
  const draft = reactive({
    title: "",
    // 所属分类：默认当前分类，可在新建表单里改到别的分类。
    category: "",
    isUrgent: false,
    isRecurring: false,
    isFuture: false,
    startAt: "",
    startAtTime: "",
    dateRangeType: "long",
    startDate: localDateInputValue(),
    endDate: "",
    frequencyType: "daily",
    weekdays: [],
    repeatCount: 1,
    generateTime: "06:00",
    milestones: [],
    milestoneDraftTitle: "",
    milestoneDraftPlannedAt: "",
    milestoneDraftPlannedAtTime: "",
    milestoneFormOpen: false,
  });

  /** 打开新建页时把所属分类重置为当前分类。 */
  function syncDraftCategory() {
    draft.category = currentCategory.value;
  }

  async function createTask() {
    if (!draft.title) return;
    const owner = draft.category || currentCategory.value;
    if (draft.isRecurring) {
      await invoke("create_recurring_task_setting", {
        owner,
        title: draft.title,
        isUrgent: false,
        dateRangeType: draft.dateRangeType,
        startDate: draft.startDate,
        endDate: draft.dateRangeType === "range" ? draft.endDate || null : null,
        frequencyType: draft.frequencyType,
        weekdays: draft.weekdays,
        repeatCount: draft.repeatCount,
        generateTime: draft.generateTime,
      });
      draft.title = "";
      draft.isUrgent = false;
      draft.isRecurring = false;
      draft.isFuture = false;
      draft.startAt = "";
      draft.startAtTime = "";
      draft.dateRangeType = "long";
      draft.startDate = localDateInputValue();
      draft.endDate = "";
      draft.frequencyType = "daily";
      draft.weekdays = [];
      draft.generateTime = "06:00";
      draft.category = currentCategory.value;
      if (owner && owner !== currentCategory.value && switchCategory) {
        await switchCategory(owner);
        return;
      }
      view.value = "home";
      await refreshActiveTasks();
      return;
    }
    const milestones = draft.milestones.map((ms) => ({
      title: ms.title,
      plannedAt: dateTimeToIso(ms.plannedAt, ms.plannedAtTime),
    }));
    await invoke("create_task", {
      owner,
      title: draft.title,
      deadlineAt: null,
      isUrgent: draft.isUrgent,
      startAt: draft.isFuture ? dateTimeToIso(draft.startAt, draft.startAtTime) : null,
      milestones: milestones.length ? milestones : null,
    });
    draft.title = "";
    draft.isUrgent = false;
    draft.isRecurring = false;
    draft.isFuture = false;
    draft.startAt = "";
    draft.startAtTime = "";
    draft.milestones = [];
    draft.milestoneDraftTitle = "";
    draft.milestoneDraftPlannedAt = "";
    draft.milestoneDraftPlannedAtTime = "";
    draft.category = currentCategory.value;
    // 建到别的分类时直接切过去，避免“创建成功但当前列表里看不到”。
    if (owner && owner !== currentCategory.value && switchCategory) {
      await switchCategory(owner);
      return;
    }
    view.value = "home";
    await refreshActiveTasks();
  }

  function addDraftMilestone() {
    if (!draft.milestoneDraftTitle) return;
    draft.milestones.push({
      title: draft.milestoneDraftTitle,
      plannedAt: draft.milestoneDraftPlannedAt,
      plannedAtTime: draft.milestoneDraftPlannedAtTime,
    });
    draft.milestoneDraftTitle = "";
    draft.milestoneDraftPlannedAt = "";
    draft.milestoneDraftPlannedAtTime = "";
  }

  function removeDraftMilestone(index) {
    draft.milestones.splice(index, 1);
  }

  function toggleFutureTask() {
    if (draft.isFuture && !draft.startAt) {
      draft.startAt = defaultStartTime();
    }
  }

  return { draft, createTask, syncDraftCategory, addDraftMilestone, removeDraftMilestone, toggleFutureTask };
}
