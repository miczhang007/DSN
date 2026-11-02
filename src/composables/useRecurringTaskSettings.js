// 周期任务规则：列表、表单、详情与作废删除。
//
// 规则更新只影响未来生成，不追溯已生成的任务实例；
// 真正的按日生成由 Rust 端 refresh_recurring_tasks 负责。

import { computed, reactive, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { localDateInputValue } from "../lib/datetime.js";

/**
 * @param {object} deps
 * @param {import("vue").Ref<string>}  deps.currentUser
 * @param {import("vue").Ref<string>}  deps.view
 * @param {import("vue").Ref<boolean>} deps.menuOpen
 * @param {Function} deps.notify                错误提示
 * @param {import("vue").Ref<string>}  deps.expandedHistoryTaskId
 * @param {Function} deps.openConfirmation      打开应用内确认弹窗
 * @param {Function} deps.refreshActiveTasks
 * @param {object}   deps.draft                 新增任务草稿（新建周期规则时作为初值来源）
 * @param {Function} deps.openUserManager
 */
export function useRecurringTaskSettings({
  currentUser,
  view,
  menuOpen,
  notify,
  expandedHistoryTaskId,
  openConfirmation,
  refreshActiveTasks,
  draft,
  openUserManager,
}) {
  const recurringSettings = ref([]);
  const recurringSettingTasks = ref([]);
  const recurringSettingEvents = ref([]);
  const recurringDetail = ref(null);
  const recurringCompletedCount = computed(
    () => recurringSettingTasks.value.filter((task) => Boolean(task.completed_at)).length,
  );
  const selectedRecurringSettingId = ref("");
  const recurringReturnView = ref("home");
  const recurringDraft = reactive({
    title: "",
    isUrgent: false,
    dateRangeType: "long",
    startDate: localDateInputValue(),
    endDate: "",
    frequencyType: "daily",
    weekdays: [],
    repeatCount: 1,
    generateTime: "06:00",
  });

  async function loadRecurringSettings() {
    recurringSettings.value = await invoke("list_recurring_task_settings", { owner: currentUser.value });
  }

  async function openRecurringSettings() {
    if (!currentUser.value) return openUserManager();
    menuOpen.value = false;
    expandedHistoryTaskId.value = "";
    await loadRecurringSettings();
    view.value = "recurring-settings";
  }

  function voidRecurringSetting(setting) {
    openConfirmation(
      "作废周期任务设置",
      "作废后不可恢复，且不会再生成新的任务。确定继续吗？",
      async () => {
        await invoke("void_recurring_task_setting", { owner: currentUser.value, settingId: setting.id });
        expandedHistoryTaskId.value = "";
        await loadRecurringSettings();
      },
      "确认作废",
    );
  }

  function deleteRecurringSetting(setting) {
    openConfirmation("删除周期任务规则", `确定删除“${setting.title}”吗？删除后不可恢复。`, async () => {
      try {
        await invoke("delete_recurring_task_setting", { owner: currentUser.value, settingId: setting.id });
        expandedHistoryTaskId.value = "";
        await loadRecurringSettings();
      } catch (err) {
        if (notify) notify(err, "删除周期任务规则失败");
      }
    });
  }

  async function openRecurringSetting(setting = null) {
    expandedHistoryTaskId.value = "";
    const source =
      setting || {
        id: "",
        title: draft.title,
        is_urgent: draft.isUrgent,
        date_range_type: draft.dateRangeType,
        start_date: draft.startDate,
        end_date: draft.endDate,
        frequency_type: draft.frequencyType,
        weekdays: draft.weekdays.join(","),
        repeat_count: draft.repeatCount,
        generate_time: draft.generateTime,
      };
    selectedRecurringSettingId.value = source.id;
    recurringReturnView.value = view.value;
    recurringDraft.title = source.title;
    recurringDraft.isUrgent = false;
    recurringDraft.dateRangeType = source.date_range_type;
    recurringDraft.startDate = source.start_date;
    recurringDraft.endDate = source.end_date || "";
    recurringDraft.frequencyType = source.frequency_type;
    recurringDraft.weekdays = String(source.weekdays || "")
      .split(",")
      .filter(Boolean)
      .map(Number);
    recurringDraft.repeatCount = source.repeat_count || 1;
    recurringDraft.generateTime = source.generate_time || "06:00";
    recurringSettingTasks.value = source.id
      ? await invoke("list_recurring_setting_tasks", { owner: currentUser.value, settingId: source.id })
      : [];
    view.value = "recurring-setting";
  }

  async function openRecurringSettingDetail(setting) {
    expandedHistoryTaskId.value = "";
    recurringDetail.value = setting;
    recurringSettingTasks.value = await invoke("list_recurring_setting_tasks", {
      owner: currentUser.value,
      settingId: setting.id,
    });
    recurringSettingEvents.value = await invoke("list_recurring_setting_events", {
      owner: currentUser.value,
      settingId: setting.id,
    });
    view.value = "recurring-setting-detail";
  }

  async function openRecurringSettingById(id) {
    const latestSettings = await invoke("list_recurring_task_settings", { owner: currentUser.value });
    recurringSettings.value = latestSettings;
    const setting = latestSettings.find((item) => item.id === id);
    if (setting) await openRecurringSetting(setting);
  }

  async function saveRecurringSetting() {
    const payload = {
      owner: currentUser.value,
      title: recurringDraft.title,
      isUrgent: false,
      dateRangeType: recurringDraft.dateRangeType,
      startDate: recurringDraft.startDate,
      endDate: recurringDraft.dateRangeType === "range" ? recurringDraft.endDate || null : null,
      frequencyType: recurringDraft.frequencyType,
      weekdays: recurringDraft.weekdays,
      repeatCount: recurringDraft.repeatCount,
      generateTime: recurringDraft.generateTime,
    };
    if (selectedRecurringSettingId.value) {
      if (recurringDraft.status === "已作废") return;
      const updated = await invoke("update_recurring_task_setting", {
        ...payload,
        settingId: selectedRecurringSettingId.value,
      });
      recurringSettings.value = recurringSettings.value.map((setting) =>
        setting.id === updated.id ? updated : setting,
      );
      if (recurringDetail.value?.id === updated.id) recurringDetail.value = updated;
    } else {
      await invoke("create_recurring_task_setting", payload);
    }
    if (recurringReturnView.value === "recurring-settings") await openRecurringSettings();
    else {
      view.value = recurringReturnView.value || "home";
      await refreshActiveTasks();
    }
  }

  function recurringEventText(type) {
    return { created: "创建规则", updated: "编辑规则", voided: "作废规则" }[type] || type;
  }

  function recurringFrequencyText(setting) {
    if (!setting) return "";
    const label = { daily: "按日", weekly: "按周", monthly: "按月" }[setting.frequency_type] || "";
    return `${label}${setting.repeat_count > 1 ? `（${setting.repeat_count} 次）` : ""}`;
  }

  function recurringTaskStatusText(task) {
    if (task.archived_at) return task.completed_at ? "已完成" : "未完成";
    return "待完成";
  }

  function recurringTaskStatusClass(task) {
    if (task.archived_at) return task.completed_at ? "status-completed" : "status-uncompleted";
    return "status-pending";
  }

  function recurringSummary(setting) {
    const frequency = { daily: "按日", weekly: "按周", monthly: "按月" }[setting.frequency_type] || "";
    return `${frequency}${setting.repeat_count > 1 ? ` · ${setting.repeat_count} 次` : ""} · ${setting.generate_time} 生成`;
  }

  return {
    recurringSettings,
    recurringSettingTasks,
    recurringSettingEvents,
    recurringDetail,
    recurringCompletedCount,
    selectedRecurringSettingId,
    recurringReturnView,
    recurringDraft,
    openRecurringSettings,
    voidRecurringSetting,
    deleteRecurringSetting,
    openRecurringSetting,
    openRecurringSettingDetail,
    openRecurringSettingById,
    saveRecurringSetting,
    recurringEventText,
    recurringFrequencyText,
    recurringTaskStatusText,
    recurringTaskStatusClass,
    recurringSummary,
  };
}
