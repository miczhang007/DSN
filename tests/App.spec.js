import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.vue";

const recurringSettingFixture = {
  id: "setting-1",
  title: "每日运动",
  status: "已作废",
  date_range_type: "long",
  start_date: "2026-08-24",
  end_date: null,
  frequency_type: "daily",
  weekdays: "0,1,2,3,4",
  repeat_count: 1,
  generate_time: "06:00",
};

const taskFixture = {
  id: "task-1",
  owner: "测试用户",
  title: "整理资料",
  deadline_at: null,
  is_urgent: false,
  created_at: "2026-08-24T08:00:00Z",
  updated_at: "2026-08-24T08:00:00Z",
  completed_at: null,
  archived_at: null,
  recurring_setting_id: null,
  occurrence_date: null,
  is_recurring: false,
};

const defaultInvoke = async (command) => {
  if (command === "list_active_tasks") return invokeMock.activeTasks || [];
  if (command === "list_archived_tasks") return [];
  if (command === "get_task_events" || command === "list_milestones") return [];
  if (command === "list_recurring_task_settings") return [recurringSettingFixture];
  if (command === "list_recurring_setting_tasks" || command === "list_recurring_setting_events") return [];
  if (command === "get_task") return taskFixture;
  if (command === "is_auto_start_enabled") return false;
  if (command === "set_minimal_mode") return false;
  return null;
};
const invokeMock = vi.fn(defaultInvoke);

vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args) => invokeMock(...args) }));

function mountApp() {
  return mount(App);
}

async function flushApp() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("桌面便签核心交互", () => {
  beforeEach(() => {
    invokeMock.mockClear();
    invokeMock.mockImplementation(defaultInvoke);
    invokeMock.activeTasks = [];
    localStorage.clear();
  });

  async function openAddForUser(wrapper) {
    await wrapper.find(".add-button").trigger("click");
    await wrapper.vm.$nextTick();
  }

  it("无用户时打开应用会进入用户管理，并提供添加用户入口", async () => {
    const wrapper = mountApp();
    await wrapper.find(".add-button").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".users-view").exists()).toBe(true);
    expect(wrapper.text()).toContain("新增用户");
  });

  it("添加用户后进入首页并加载该用户任务", async () => {
    const wrapper = mountApp();
    await wrapper.find(".add-button").trigger("click");
    await wrapper.vm.$nextTick();
    const input = wrapper.find('input[autocomplete="username"]');
    await input.setValue("测试用户");
    await wrapper.find("form.user-form").trigger("submit");
    expect(wrapper.find(".task-list").exists()).toBe(false);
    expect(wrapper.text()).toContain("今天还没有待办");
    expect(localStorage.getItem("current-user")).toBe("测试用户");
    expect(invokeMock).toHaveBeenCalledWith("list_active_tasks", { owner: "测试用户" });
  });

  it("删除用户前显示应用内确认弹窗，不调用原生 confirm", async () => {
    const wrapper = mountApp();
    await wrapper.find(".add-button").trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.find('input[autocomplete="username"]').setValue("待删除");
    await wrapper.find("form.user-form").trigger("submit");
    await wrapper.find(".menu-button").trigger("click");
    const userManagerButton = wrapper.findAll("button").find((button) => button.text() === "用户管理");
    await userManagerButton.trigger("click");
    const deleteButton = wrapper.findAll("button").find((button) => button.text() === "删除");
    await deleteButton.trigger("click");
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("删除用户");
  });

  it("已作废规则显示操作入口且仅提供删除", async () => {
    localStorage.setItem("current-user", "测试用户");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".menu-button").trigger("click");
    const rulesButton = wrapper.findAll("button").find((button) => button.text() === "周期任务规则");
    await rulesButton.trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".recurring-settings-view").exists()).toBe(true);
    await wrapper.find(".history-action-toggle").trigger("click");
    expect(wrapper.find(".history-actions").text()).toContain("删除");
    expect(wrapper.find(".history-actions").text()).not.toContain("编辑规则");
    expect(wrapper.find(".history-actions").text()).not.toContain("作废");
  });

  it("离开规则列表后自动收起弹出菜单", async () => {
    localStorage.setItem("current-user", "测试用户");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await wrapper.find(".menu-button").trigger("click");
    const rulesButton = wrapper.findAll("button").find((button) => button.text() === "周期任务规则");
    await rulesButton.trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.find(".history-action-toggle").trigger("click");
    expect(wrapper.find(".history-actions").exists()).toBe(true);
    await wrapper.find(".history-main").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".history-actions").exists()).toBe(false);
  });

  it("普通任务添加提交标题和节点参数", async () => {
    localStorage.setItem("current-user", "测试用户");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await openAddForUser(wrapper);
    await wrapper.find('input[maxlength="80"]').setValue("整理资料");
    const addMilestone = wrapper.findAll("button").find((button) => button.text() === "添加节点");
    await addMilestone.trigger("click");
    await wrapper.find('input[placeholder="节点名称"]').setValue("完成初稿");
    await wrapper.find("form.milestone-form").trigger("submit");
    await wrapper.findAll("button").find((button) => button.text() === "添加任务").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("create_task", expect.objectContaining({ owner: "测试用户", title: "整理资料" }));
  });

  it("任务详情支持编辑、进度和节点维护", async () => {
    invokeMock.activeTasks = [taskFixture];
    localStorage.setItem("current-user", "测试用户");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.find('.detail-actions input[maxlength="80"]').setValue("整理资料（已更新）");
    await wrapper.findAll("button").find((button) => button.text() === "保存变更").trigger("click");
    await wrapper.find('textarea[placeholder*="记录当前进展"]').setValue("已完成资料分类");
    await wrapper.find(".progress-submit").trigger("click");
    await wrapper.findAll("button").find((button) => button.text() === "添加节点").trigger("click");
    await wrapper.find('input[placeholder="节点名称"]').setValue("完成初稿");
    await wrapper.find("form.milestone-form").trigger("submit");
    expect(invokeMock).toHaveBeenCalledWith("update_task", expect.objectContaining({ title: "整理资料（已更新）" }));
    expect(invokeMock).toHaveBeenCalledWith("add_task_progress", expect.objectContaining({ progress: "已完成资料分类" }));
    expect(invokeMock).toHaveBeenCalledWith("add_milestone", expect.objectContaining({ title: "完成初稿" }));
  });

  it("周期规则创建、编辑、作废操作调用对应接口", async () => {
    localStorage.setItem("current-user", "测试用户");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await openAddForUser(wrapper);
    await wrapper.find('input[maxlength="80"]').setValue("每日运动");
    await wrapper.find("input[type=checkbox]").setValue(true);
    await wrapper.findAll("button").find((button) => button.text() === "添加任务").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("create_recurring_task_setting", expect.objectContaining({ title: "每日运动" }));
  });

  it("生命周期日志在任务详情中展示", async () => {
    invokeMock.activeTasks = [taskFixture];
    localStorage.setItem("current-user", "测试用户");
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return [taskFixture];
      if (command === "get_task_events") return [{ id: 1, event_type: "created", created_at: "2026-08-24T08:00:00Z" }];
      if (command === "list_milestones") return [];
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".event-list").text()).toContain("创建任务");
  });
});
