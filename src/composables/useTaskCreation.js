// 新增任务表单：一次性任务与周期任务的新建、草稿节点维护。
//
// 周期任务在这里只负责「创建规则」，按日生成任务实例由 Rust 端负责。

import { reactive } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { dateTimeToIso, defaultStartTime, localDateInputValue } from "../lib/datetime.js";

/**
 * @param {object} deps
 * @param {import("vue").Ref<string>} deps.currentUser
 * @param {import("vue").Ref<string>} deps.view
 * @param {Function} deps.refreshActiveTasks
 */
export function useTaskCreation({ currentUser, view, refreshActiveTasks }) {
  const draft = reactive({
    title: "",
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

  async function createTask() {
    if (!draft.title) return;
    if (draft.isRecurring) {
      await invoke("create_recurring_task_setting", {
        owner: currentUser.value,
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
      view.value = "home";
      await refreshActiveTasks();
      return;
    }
    const milestones = draft.milestones.map((ms) => ({
      title: ms.title,
      plannedAt: dateTimeToIso(ms.plannedAt, ms.plannedAtTime),
    }));
    await invoke("create_task", {
      owner: currentUser.value,
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

  return { draft, createTask, addDraftMilestone, removeDraftMilestone, toggleFutureTask };
}
