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
  suspended_at: null,
  start_at: null,
  started_at: null,
  reactivated_at: null,
  status: "pending",
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

async function openTaskRow(wrapper, text) {
  const row = wrapper.findAll(".task-main").find((main) => main.text().includes(text));
  await row.trigger("click");
  await wrapper.vm.$nextTick();
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

  it("已作废规则的删除操作会打开应用内确认弹窗", async () => {
    localStorage.setItem("current-user", "测试用户");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".menu-button").trigger("click");
    const rulesButton = wrapper.findAll("button").find((button) => button.text() === "周期任务规则");
    await rulesButton.trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.find(".history-action-toggle").trigger("click");
    await wrapper.find(".history-actions button").trigger("click");
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("删除周期任务规则");
  });

  it("作废周期规则的确认按钮显示确认作废", async () => {
    localStorage.setItem("current-user", "测试用户");
    const activeSetting = { ...recurringSettingFixture, status: "生效中" };
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return [];
      if (command === "list_recurring_task_settings") return [activeSetting];
      if (command === "set_minimal_mode" || command === "is_auto_start_enabled") return false;
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".menu-button").trigger("click");
    const rulesButton = wrapper.findAll("button").find((button) => button.text() === "周期任务规则");
    await rulesButton.trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.find(".history-action-toggle").trigger("click");
    const voidButton = wrapper.findAll(".history-actions button").find((button) => button.text() === "作废");
    await voidButton.trigger("click");
    expect(document.querySelector(".confirm-button").textContent).toContain("确认作废");
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
    expect(wrapper.find(".milestone-editor h2").exists()).toBe(false);
    await wrapper.find('input[maxlength="80"]').setValue("整理资料");
    const addMilestone = wrapper.findAll("button").find((button) => button.text() === "添加节点");
    await addMilestone.trigger("click");
    await wrapper.find('input[placeholder="节点名称"]').setValue("完成初稿");
    await wrapper.find("form.milestone-form").trigger("submit");
    await wrapper.findAll("button").find((button) => button.text() === "添加任务").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("create_task", expect.objectContaining({ owner: "测试用户", title: "整理资料" }));
  });

  it("勾选未来任务后创建任务提交开始执行时间（未指定时间仅存日期）", async () => {
    localStorage.setItem("current-user", "测试用户");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await openAddForUser(wrapper);
    await wrapper.find('input[maxlength="80"]').setValue("下周启动项目");
    const futureCheckbox = wrapper
      .findAll('input[type="checkbox"]')
      .find((input) => input.element.closest("label").textContent.includes("未来任务"));
    await futureCheckbox.setValue(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('input[type="date"]').exists()).toBe(true);
    // 默认不指定时间：时间输入不展示
    expect(wrapper.find('input[type="time"]').exists()).toBe(false);
    await wrapper.find('input[type="date"]').setValue("2026-09-05");
    await wrapper.findAll("button").find((button) => button.text() === "添加任务").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("create_task", expect.objectContaining({
      title: "下周启动项目",
      startAt: "2026-09-05",
    }));
  });

  it("未来任务指定具体时间时提交完整时间，取消指定后退回仅日期", async () => {
    localStorage.setItem("current-user", "测试用户");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await openAddForUser(wrapper);
    await wrapper.find('input[maxlength="80"]').setValue("下周启动项目");
    const futureCheckbox = wrapper
      .findAll('input[type="checkbox"]')
      .find((input) => input.element.closest("label").textContent.includes("未来任务"));
    await futureCheckbox.setValue(true);
    await wrapper.vm.$nextTick();
    await wrapper.find('input[type="date"]').setValue("2026-09-05");
    // 勾选“指定时间”后出现时间输入
    const specifyCheckbox = wrapper
      .findAll('input[type="checkbox"]')
      .find((input) => input.element.closest("label").textContent.includes("指定时间"));
    await specifyCheckbox.setValue(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('input[type="time"]').exists()).toBe(true);
    await wrapper.find('input[type="time"]').setValue("09:30");
    await wrapper.findAll("button").find((button) => button.text() === "添加任务").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("create_task", expect.objectContaining({
      startAt: new Date("2026-09-05T09:30").toISOString(),
    }));

    // 再次进入添加页：取消“指定时间”勾选 → 退回仅日期提交
    await openAddForUser(wrapper);
    await wrapper.find('input[maxlength="80"]').setValue("下周启动项目");
    const futureCheckbox2 = wrapper
      .findAll('input[type="checkbox"]')
      .find((input) => input.element.closest("label").textContent.includes("未来任务"));
    await futureCheckbox2.setValue(true);
    await wrapper.vm.$nextTick();
    await wrapper.find('input[type="date"]').setValue("2026-09-06");
    const specifyCheckbox2 = wrapper
      .findAll('input[type="checkbox"]')
      .find((input) => input.element.closest("label").textContent.includes("指定时间"));
    await specifyCheckbox2.setValue(true);
    await wrapper.vm.$nextTick();
    await wrapper.find('input[type="time"]').setValue("10:00");
    await specifyCheckbox2.setValue(false);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('input[type="time"]').exists()).toBe(false);
    await wrapper.findAll("button").find((button) => button.text() === "添加任务").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("create_task", expect.objectContaining({
      startAt: "2026-09-06",
    }));
  });

  it("任务列表展示细分状态标签（周期任务同时展示周期任务标签）", async () => {
    localStorage.setItem("current-user", "测试用户");
    invokeMock.activeTasks = [
      { ...taskFixture, id: "t1", title: "任务A", status: "pending" },
      { ...taskFixture, id: "t2", title: "未来任务", status: "not_started", start_at: "2999-01-01T00:00:00Z" },
      { ...taskFixture, id: "t3", title: "挂起任务", status: "suspended", suspended_at: "2026-08-24T08:00:00Z" },
      { ...taskFixture, id: "t4", title: "周期任务", status: "pending", is_recurring: true, recurring_setting_id: "setting-1" },
      { ...taskFixture, id: "t5", title: "进行中任务", status: "in_progress", started_at: "2026-08-24T08:00:00Z" },
    ];
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    const chips = wrapper.findAll(".status-chip").map((chip) => chip.text());
    expect(chips).toContain("待完成");
    expect(chips).toContain("未开始");
    expect(chips).toContain("已挂起");
    expect(chips).toContain("进行中");
    expect(chips).toContain("周期任务");
  });

  it("详情页支持待完成开始执行、挂起与激活", async () => {
    localStorage.setItem("current-user", "测试用户");
    const pendingTask = { ...taskFixture, id: "t1", title: "写周报", status: "pending" };
    const inProgressTask = { ...taskFixture, id: "t1", title: "写周报", status: "in_progress", started_at: "2026-08-31T08:00:00Z" };
    const suspendedTask = { ...taskFixture, id: "t1", title: "写周报", status: "suspended", suspended_at: "2026-08-31T09:00:00Z" };
    invokeMock.activeTasks = [pendingTask];
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return invokeMock.activeTasks;
      if (command === "get_task") return invokeMock.activeTasks[0];
      if (command === "start_task") {
        invokeMock.activeTasks = [inProgressTask];
        return null;
      }
      if (command === "suspend_task") {
        invokeMock.activeTasks = [suspendedTask];
        return null;
      }
      if (command === "activate_task") {
        invokeMock.activeTasks = [pendingTask];
        return null;
      }
      if (command === "get_task_events" || command === "list_milestones") return [];
      if (command === "is_auto_start_enabled" || command === "set_minimal_mode") return false;
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();
    // 待完成 → 进行中
    await wrapper.findAll("button").find((button) => button.text() === "进行中").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("start_task", { owner: "测试用户", taskId: "t1" });
    await flushApp();
    // 进行中 → 挂起
    await wrapper.findAll("button").find((button) => button.text() === "挂起").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("suspend_task", { owner: "测试用户", taskId: "t1" });
    await flushApp();
    // 已挂起 → 激活（变更为待完成）
    await wrapper.findAll("button").find((button) => button.text() === "激活").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("activate_task", { owner: "测试用户", taskId: "t1" });
    await flushApp();
    // 激活后回到待完成，重新出现“进行中”入口
    expect(wrapper.findAll("button").some((button) => button.text() === "进行中")).toBe(true);
  });

  it("未来任务到达执行时间自动进行中，挂起激活后变更为待完成", async () => {
    localStorage.setItem("current-user", "测试用户");
    const futureTask = { ...taskFixture, id: "t1", title: "未来任务", status: "in_progress", start_at: "2026-08-30T02:00:00Z" };
    const suspendedTask = { ...futureTask, status: "suspended", suspended_at: "2026-09-01T02:00:00Z" };
    const pendingTask = { ...futureTask, status: "pending", reactivated_at: "2026-09-01T03:00:00Z", suspended_at: null };
    invokeMock.activeTasks = [futureTask];
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return invokeMock.activeTasks;
      if (command === "get_task") return invokeMock.activeTasks[0];
      if (command === "suspend_task") {
        invokeMock.activeTasks = [suspendedTask];
        return null;
      }
      if (command === "activate_task") {
        invokeMock.activeTasks = [pendingTask];
        return null;
      }
      if (command === "get_task_events" || command === "list_milestones") return [];
      if (command === "is_auto_start_enabled" || command === "set_minimal_mode") return false;
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();
    // 到达执行时间后已自动变为进行中
    expect(wrapper.find(".detail-meta-row .status-chip").text()).toContain("进行中");
    await wrapper.findAll("button").find((button) => button.text() === "挂起").trigger("click");
    await flushApp();
    await wrapper.findAll("button").find((button) => button.text() === "激活").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("activate_task", { owner: "测试用户", taskId: "t1" });
    await flushApp();
    // 激活后与其他任务一致：待完成，出现“进行中”入口
    expect(wrapper.find(".detail-meta-row .status-chip").text()).toContain("待完成");
    expect(wrapper.findAll("button").some((button) => button.text() === "进行中")).toBe(true);
  });

  it("完成任务后保留在当前列表并以划线展示", async () => {
    localStorage.setItem("current-user", "测试用户");
    invokeMock.activeTasks = [{ ...taskFixture, id: "t1", title: "写周报", status: "in_progress" }];
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    // 画圈完成主操作；操作成功后后端将返回已完成状态，先更新 mock 返回数据
    invokeMock.activeTasks = [{ ...taskFixture, id: "t1", title: "写周报", status: "completed", completed_at: "2026-08-31T08:00:00Z" }];
    await wrapper.find(".complete-button").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("complete_task", { owner: "测试用户", taskId: "t1" });
    await flushApp();
    expect(wrapper.find(".task-title.done").exists()).toBe(true);
    expect(wrapper.find(".task-list").text()).toContain("已完成");
  });

  it("详情页已完成任务支持撤销完成与直接归档", async () => {
    localStorage.setItem("current-user", "测试用户");
    const completedTask = { ...taskFixture, id: "t1", title: "写周报", status: "completed", completed_at: "2026-08-31T08:00:00Z" };
    invokeMock.activeTasks = [completedTask];
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return invokeMock.activeTasks;
      if (command === "get_task") return invokeMock.activeTasks[0];
      if (command === "get_task_events" || command === "list_milestones") return [];
      if (command === "is_auto_start_enabled" || command === "set_minimal_mode") return false;
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button").find((button) => button.text() === "撤销完成").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("undo_complete_task", { owner: "测试用户", taskId: "t1" });

    // 已完成任务归档：直接调用接口，无确认弹窗
    await wrapper.findAll("button").find((button) => button.text() === "归档").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("archive_task", { owner: "测试用户", taskId: "t1", isCompleted: true });
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("历史任务撤销完成时询问是否同时撤销归档", async () => {
    localStorage.setItem("current-user", "测试用户");
    const archivedTask = { ...taskFixture, id: "t1", title: "旧任务", status: "completed", completed_at: "2026-08-29T08:00:00Z", archived_at: "2026-08-30T08:00:00Z" };
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return [];
      if (command === "list_archived_tasks") return [archivedTask];
      if (command === "get_task_events" || command === "list_milestones") return [];
      if (command === "is_auto_start_enabled" || command === "set_minimal_mode") return false;
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".menu-button").trigger("click");
    const historyButton = wrapper.findAll("button").find((button) => button.text() === "历史任务");
    await historyButton.trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.find(".history-action-toggle").trigger("click");
    await wrapper.findAll(".history-actions button").find((button) => button.text() === "撤销完成").trigger("click");
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("是否同时撤销归档");
    // 选择“撤销完成并撤销归档”（确认弹窗 Teleport 到 body，需从 document 查询）
    const choices = [...document.querySelectorAll(".confirm-actions .confirm-button")];
    choices.find((button) => button.textContent === "撤销完成并撤销归档").click();
    await flushApp();
    expect(invokeMock).toHaveBeenCalledWith("restore_archived_task", { owner: "测试用户", taskId: "t1", action: "undo_completion" });
    // 再次询问并选择“仅撤销完成”
    await wrapper.find(".history-action-toggle").trigger("click");
    await wrapper.findAll(".history-actions button").find((button) => button.text() === "撤销完成").trigger("click");
    const choices2 = [...document.querySelectorAll(".confirm-actions .confirm-button")];
    choices2.find((button) => button.textContent === "仅撤销完成").click();
    await flushApp();
    expect(invokeMock).toHaveBeenCalledWith("restore_archived_task", { owner: "测试用户", taskId: "t1", action: "undo_completion_only" });
  });

  it("任务详情默认收起编辑与进度，点击操作按钮后展开", async () => {
    localStorage.setItem("current-user", "测试用户");
    invokeMock.activeTasks = [{ ...taskFixture, id: "t1", title: "写周报" }];
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.detail-actions input[maxlength="80"]').exists()).toBe(false);
    expect(wrapper.find('textarea[placeholder*="记录当前进展"]').exists()).toBe(false);
    await wrapper.findAll("button").find((button) => button.text() === "任务编辑").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.detail-actions input[maxlength="80"]').exists()).toBe(true);
    await wrapper.findAll("button").find((button) => button.text() === "添加进度").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.find('textarea[placeholder*="记录当前进展"]').exists()).toBe(true);
  });

  it("任务详情默认展示已添加节点，节点维护可直接进行", async () => {
    localStorage.setItem("current-user", "测试用户");
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return [{ ...taskFixture, id: "t1", title: "写周报" }];
      if (command === "get_task_events") return [];
      if (command === "list_milestones") return [{ id: 1, task_id: "t1", title: "完成初稿", planned_at: null, completed_at: null, created_at: "2026-08-24T08:00:00Z", updated_at: "2026-08-24T08:00:00Z" }];
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();
    // 节点行默认展示；无需展开任务编辑即可维护节点
    expect(wrapper.find(".milestone-section").exists()).toBe(true);
    expect(wrapper.find(".milestone-section").text()).toContain("完成初稿");
    expect(wrapper.findAll("button").some((button) => button.text() === "添加节点")).toBe(true);
    expect(wrapper.findAll("button").some((button) => button.text() === "删除")).toBe(true);
    expect(wrapper.find(".milestone-form").exists()).toBe(false);
    // 直接在详情页添加节点
    await wrapper.findAll("button").find((button) => button.text() === "添加节点").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.find("form.milestone-form").exists()).toBe(true);
  });

  it("任务详情支持编辑、节点维护与进度（带记录时间）", async () => {
    invokeMock.activeTasks = [taskFixture];
    localStorage.setItem("current-user", "测试用户");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button").find((button) => button.text() === "任务编辑").trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.find('.detail-actions input[maxlength="80"]').setValue("整理资料（已更新）");
    await wrapper.findAll("button").find((button) => button.text() === "保存变更").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("update_task", expect.objectContaining({ title: "整理资料（已更新）" }));
    // 节点维护无需展开任务编辑：直接在详情页添加节点
    await wrapper.findAll("button").find((button) => button.text() === "添加节点").trigger("click");
    await wrapper.find('input[placeholder="节点名称"]').setValue("完成初稿");
    await wrapper.find("form.milestone-form").trigger("submit");
    expect(invokeMock).toHaveBeenCalledWith("add_milestone", expect.objectContaining({ title: "完成初稿" }));
    // 点击添加进度展开后记录进度（默认带当前时间）
    await wrapper.findAll("button").find((button) => button.text() === "添加进度").trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.find('textarea[placeholder*="记录当前进展"]').setValue("已完成资料分类");
    await wrapper.find(".progress-submit").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("add_task_progress", expect.objectContaining({ progress: "已完成资料分类", recordedAt: expect.any(String) }));
  });

  it("详情页完成任务可选择完成时间", async () => {
    localStorage.setItem("current-user", "测试用户");
    const task = { ...taskFixture, id: "t1", title: "写周报", status: "pending" };
    invokeMock.activeTasks = [task];
    invokeMock.mockImplementation(async (command, args) => {
      if (command === "list_active_tasks") return invokeMock.activeTasks;
      if (command === "get_task") return invokeMock.activeTasks[0];
      if (command === "complete_task") {
        invokeMock.activeTasks = [{ ...task, status: "completed", completed_at: args.completedAt }];
        return null;
      }
      if (command === "get_task_events" || command === "list_milestones") return [];
      if (command === "is_auto_start_enabled" || command === "set_minimal_mode") return false;
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button").find((button) => button.text() === "已完成").trigger("click");
    await wrapper.vm.$nextTick();
    // 完成弹窗包含完成时间输入
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    const dialogInputs = [...document.querySelectorAll(".confirm-dialog input[type='date'], .confirm-dialog input[type='time']")];
    expect(dialogInputs.length).toBeGreaterThan(0);
    // 修改完成时间为过去时间并确认
    const dateInput = document.querySelector(".confirm-dialog input[type='date']");
    dateInput.value = "2026-08-30";
    dateInput.dispatchEvent(new Event("input", { bubbles: true }));
    const timeInput = document.querySelector(".confirm-dialog input[type='time']");
    timeInput.value = "18:30";
    timeInput.dispatchEvent(new Event("input", { bubbles: true }));
    await wrapper.vm.$nextTick();
    const confirmBtn = [...document.querySelectorAll(".confirm-actions button")].find((b) => b.textContent === "确认完成");
    confirmBtn.click();
    await flushApp();
    expect(invokeMock).toHaveBeenCalledWith("complete_task", expect.objectContaining({ taskId: "t1", completedAt: new Date("2026-08-30T18:30").toISOString() }));
  });

  it("节点支持上移/下移排序并持久化", async () => {
    localStorage.setItem("current-user", "测试用户");
    const milestones = [
      { id: 1, task_id: "t1", title: "节点A", planned_at: null, completed_at: null, created_at: "2026-08-24T08:00:00Z", updated_at: "2026-08-24T08:00:00Z" },
      { id: 2, task_id: "t1", title: "节点B", planned_at: null, completed_at: null, created_at: "2026-08-24T08:00:00Z", updated_at: "2026-08-24T08:00:00Z" },
    ];
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return [{ ...taskFixture, id: "t1", title: "写周报" }];
      if (command === "get_task_events") return [];
      if (command === "list_milestones") return milestones;
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();
    // 第二行节点“下移”不可用，第一行“上移”不可用
    const firstRow = wrapper.findAll(".milestone-row")[0];
    const secondRow = wrapper.findAll(".milestone-row")[1];
    expect(firstRow.find('button[aria-label^="上移"]').exists()).toBe(false);
    expect(firstRow.find('button[aria-label^="下移"]').exists()).toBe(true);
    expect(secondRow.find('button[aria-label^="下移"]').exists()).toBe(false);
    // 点击第二行上移 → 顺序交换并持久化
    await secondRow.find('button[aria-label^="上移"]').trigger("click");
    await flushApp();
    expect(invokeMock).toHaveBeenCalledWith("reorder_milestones", expect.objectContaining({ taskId: "t1", orderedIds: [2, 1] }));
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

  it("从周期任务详情进入规则编辑时读取最新规则", async () => {
    const latestSetting = { ...recurringSettingFixture, title: "每日运动（已修改）", status: "生效中" };
    const recurringTask = { ...taskFixture, is_recurring: true, recurring_setting_id: recurringSettingFixture.id };
    invokeMock.activeTasks = [recurringTask];
    localStorage.setItem("current-user", "测试用户");
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return [recurringTask];
      if (command === "get_task") return recurringTask;
      if (command === "get_task_events" || command === "list_milestones" || command === "list_recurring_setting_tasks" || command === "list_recurring_setting_events") return [];
      if (command === "list_recurring_task_settings") return [latestSetting];
      if (command === "set_minimal_mode" || command === "is_auto_start_enabled") return false;
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button").find((button) => button.text() === "周期规则").trigger("click");
    await flushApp();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.form-view input[maxlength="80"]').element.value).toBe("每日运动（已修改）");
    expect(invokeMock).toHaveBeenCalledWith("list_recurring_task_settings", { owner: "测试用户" });
  });

  it("接口错误显示应用内提示，不调用原生 alert", async () => {
    localStorage.setItem("current-user", "测试用户");
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return [];
      if (command === "set_minimal_mode" || command === "is_auto_start_enabled") return false;
      if (command === "set_auto_start_enabled") throw new Error("自启动写入失败");
      return null;
    });
    const alertSpy = vi.spyOn(window, "alert");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".menu-button").trigger("click");
    await wrapper.find('input[role="switch"]').setValue(true);
    await flushApp();
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    expect(document.body.textContent).toContain("自启动写入失败");
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
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

  it("生命周期日志展示挂起、激活与系统自动归档事件", async () => {
    localStorage.setItem("current-user", "测试用户");
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return [{ ...taskFixture, id: "t1", title: "写周报" }];
      if (command === "get_task_events") return [
        { id: 1, event_type: "created", created_at: "2026-08-24T08:00:00Z" },
        { id: 2, event_type: "started", after_value: "2026-08-25T01:00:00Z", created_at: "2026-08-25T01:00:00Z" },
        { id: 3, event_type: "suspended", created_at: "2026-08-26T02:00:00Z" },
        { id: 4, event_type: "activated", created_at: "2026-08-27T03:00:00Z" },
        { id: 5, event_type: "archived", after_value: "auto", created_at: "2026-08-28T04:00:00Z" },
      ];
      if (command === "list_milestones") return [];
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();
    const text = wrapper.find(".event-list").text();
    expect(text).toContain("任务开始执行");
    expect(text).toContain("挂起任务");
    expect(text).toContain("激活任务");
    expect(text).toContain("系统自动归档（隔天）");
  });
});
