import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.vue";
import AppMenu from "../src/components/AppMenu.vue";
import { formatTime } from "../src/lib/datetime.js";

const recurringSettingFixture = {
  id: "setting-1",
  owner: "测试分类",
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
  owner: "测试分类",
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

const dataOverviewFixture = {
  dataVersion: "2026-11-06T02:30:00+00:00",
  taskCount: 2,
  archivedTaskCount: 1,
  recurringRuleCount: 1,
};

const importPreviewFixture = {
  path: "C:\\Users\\test\\Desktop\\桌面便签数据备份.json",
  fileName: "桌面便签数据备份.json",
  appVersion: "1.5.1",
  exportedAt: "2026-11-06T02:00:00+00:00",
  dataVersion: "2026-11-06T01:50:00+00:00",
  taskCount: 3,
  archivedTaskCount: 1,
  recurringRuleCount: 1,
  categoryCount: 2,
  categories: ["导入分类", "测试分类"],
  preferences: {
    noteSize: "large",
    noteTheme: "blue",
    noteFont: "xingshu",
    noteSignature: "导入签名",
    notePosition: "center",
    currentCategory: "备份分类",
  },
};

const archivedTaskFixture = {
  id: "archived-1",
  owner: "测试分类",
  title: "整理旧资料",
  is_recurring: false,
  completed_at: "2026-08-20T08:00:00Z",
  archived_at: "2026-08-21T08:00:00Z",
  occurrence_date: null,
  recurring_setting_id: null,
  status: "completed",
};

const archivedRecurringFixture = {
  ...archivedTaskFixture,
  id: "archived-recurring",
  title: "周期归档任务",
  is_recurring: true,
  completed_at: null,
  occurrence_date: "2026-08-20",
  recurring_setting_id: "setting-1",
  status: "uncompleted",
};

const defaultInvoke = async (command) => {
  if (command === "list_active_tasks") return invokeMock.activeTasks || [];
  if (command === "list_archived_tasks") return invokeMock.archivedTasks || [];
  if (command === "list_all_archived_tasks") return invokeMock.archivedTasks || [];
  if (command === "get_task_events" || command === "list_milestones") return [];
  if (command === "list_recurring_task_settings") return [recurringSettingFixture];
  if (command === "list_recurring_setting_tasks" || command === "list_recurring_setting_events") return [];
  if (command === "get_task") return taskFixture;
  if (command === "is_auto_start_enabled") return false;
  if (command === "get_data_overview") return invokeMock.dataOverview || dataOverviewFixture;
  if (command === "export_data") {
    return invokeMock.exportPath || "C:\\Users\\test\\Desktop\\桌面便签数据备份.json";
  }
  if (command === "inspect_import_file") return invokeMock.importPreview || null;
  if (command === "import_data") {
    return invokeMock.importResult || {
      mode: "merge",
      dataVersion: "2026-11-06T03:00:00+00:00",
      addedTasks: 1,
      updatedTasks: 0,
      keptLocalTasks: 0,
      categories: [],
    };
  }
  if (command === "merge_tasks") {
    return invokeMock.mergeResult || { ...taskFixture, id: "merged-task", title: "合并后的任务" };
  }
  if (command === "update_archived_task") {
    return invokeMock.updatedArchivedTask || archivedTaskFixture;
  }
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

async function openDataManagement(wrapper) {
  await wrapper.find(".menu-button").trigger("click");
  await wrapper.vm.$nextTick();
  await wrapper.findAll("button").find((button) => button.text() === "数据管理").trigger("click");
  await wrapper.vm.$nextTick();
  await flushApp();
}

describe("桌面便签核心交互", () => {
  beforeEach(() => {
    invokeMock.mockClear();
    invokeMock.mockImplementation(defaultInvoke);
    invokeMock.activeTasks = [];
    delete invokeMock.archivedTasks;
    delete invokeMock.dataOverview;
    delete invokeMock.exportPath;
    delete invokeMock.importPreview;
    delete invokeMock.importResult;
    delete invokeMock.mergeResult;
    delete invokeMock.updatedArchivedTask;
    localStorage.clear();
  });

  async function openAddForCategory(wrapper) {
    await wrapper.find(".add-button").trigger("click");
    await wrapper.vm.$nextTick();
  }

  it("无分类时打开应用会进入分类管理，并提供添加分类入口", async () => {
    const wrapper = mountApp();
    await wrapper.find(".add-button").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".categories-view").exists()).toBe(true);
    expect(wrapper.text()).toContain("新增分类");
  });

  it("添加分类后进入首页并加载该分类任务", async () => {
    const wrapper = mountApp();
    await wrapper.find(".add-button").trigger("click");
    await wrapper.vm.$nextTick();
    const input = wrapper.find('textarea[autocomplete="off"]');
    await input.setValue("测试分类");
    await wrapper.find("form.category-form").trigger("submit");
    expect(wrapper.find(".task-list").exists()).toBe(false);
    expect(wrapper.text()).toContain("今天还没有待办");
    expect(localStorage.getItem("current-category")).toBe("测试分类");
    expect(invokeMock).toHaveBeenCalledWith("list_active_tasks", { owner: "测试分类" });
  });

  it("删除分类前显示应用内确认弹窗，不调用原生 confirm", async () => {
    const wrapper = mountApp();
    await wrapper.find(".add-button").trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.find('textarea[autocomplete="off"]').setValue("待删除");
    await wrapper.find("form.category-form").trigger("submit");
    await wrapper.find(".menu-button").trigger("click");
    const categoryManagerButton = wrapper.findAll("button").find((button) => button.text() === "分类管理");
    await categoryManagerButton.trigger("click");
    const deleteButton = wrapper.findAll("button").find((button) => button.text() === "删除");
    await deleteButton.trigger("click");
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("删除分类");
  });

  it("已作废规则显示操作入口且仅提供删除", async () => {
    localStorage.setItem("current-category", "测试分类");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".menu-button").trigger("click");
    const rulesButton = wrapper.findAll("button").find((button) => button.text() === "周期任务规则");
    await rulesButton.trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".recurring-settings-view").exists()).toBe(true);
    const ruleActions = wrapper.find(".rule-actions").text();
    expect(ruleActions).toContain("删除");
    expect(ruleActions).not.toContain("编辑");
    expect(ruleActions).not.toContain("作废");
  });

  it("已作废规则的删除操作会打开应用内确认弹窗", async () => {
    localStorage.setItem("current-category", "测试分类");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".menu-button").trigger("click");
    const rulesButton = wrapper.findAll("button").find((button) => button.text() === "周期任务规则");
    await rulesButton.trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.find(".rule-action").trigger("click");
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("删除周期任务规则");
  });

  it("作废周期规则的确认按钮显示确认作废", async () => {
    localStorage.setItem("current-category", "测试分类");
    const activeSetting = { ...recurringSettingFixture, status: "生效中" };
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return [];
      if (command === "list_recurring_task_settings") return [activeSetting];
      if (command === "is_auto_start_enabled") return false;
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".menu-button").trigger("click");
    const rulesButton = wrapper.findAll("button").find((button) => button.text() === "周期任务规则");
    await rulesButton.trigger("click");
    await wrapper.vm.$nextTick();
    const voidButton = wrapper.findAll(".rule-action").find((button) => button.text() === "作废");
    await voidButton.trigger("click");
    expect(document.querySelector(".confirm-button").textContent).toContain("确认作废");
  });

  it("点击规则行进入规则详情", async () => {
    localStorage.setItem("current-category", "测试分类");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await wrapper.find(".menu-button").trigger("click");
    const rulesButton = wrapper.findAll("button").find((button) => button.text() === "周期任务规则");
    await rulesButton.trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.find(".rule-main").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".recurring-detail-summary").exists()).toBe(true);
  });

  it("新建任务可以指定所属分类，创建后切到该分类", async () => {
    localStorage.setItem("categories", JSON.stringify(["测试分类", "学习"]));
    localStorage.setItem("current-category", "测试分类");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".add-button").trigger("click");
    await wrapper.vm.$nextTick();
    const categorySelect = wrapper.find(".form-view .task-type-toggles .category-select");
    expect(categorySelect.exists()).toBe(true);
    expect(categorySelect.element.value).toBe("测试分类");
    await wrapper.find('input[maxlength="80"]').setValue("跨分类任务");
    await categorySelect.setValue("学习");
    await wrapper.findAll("button").find((button) => button.text() === "添加任务").trigger("click");
    await flushApp();
    expect(invokeMock).toHaveBeenCalledWith("create_task", expect.objectContaining({ owner: "学习", title: "跨分类任务" }));
    // 建到别的分类后直接切过去，首页展示该分类
    expect(localStorage.getItem("current-category")).toBe("学习");
    expect(wrapper.find(".empty-state").exists()).toBe(true);
  });

  it("任务编辑可以迁移所属分类，保存后回到列表", async () => {
    localStorage.setItem("categories", JSON.stringify(["测试分类", "学习"]));
    localStorage.setItem("current-category", "测试分类");
    const task = { ...taskFixture, id: "t1", owner: "测试分类", title: "写周报" };
    invokeMock.activeTasks = [task];
    invokeMock.mockImplementation(async (command, args) => {
      if (command === "list_active_tasks") return invokeMock.activeTasks;
      if (command === "get_task") return invokeMock.activeTasks[0];
      if (command === "update_task") return { ...task, owner: args.newOwner || task.owner };
      if (command === "get_task_events" || command === "list_milestones") return [];
      if (command === "is_auto_start_enabled") return false;
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button").find((button) => button.text() === "编辑").trigger("click");
    await wrapper.vm.$nextTick();
    const categorySelect = wrapper.find(".detail-edit-panel .category-select");
    expect(categorySelect.exists()).toBe(true);
    expect(categorySelect.element.value).toBe("测试分类");
    await categorySelect.setValue("学习");
    await wrapper.findAll("button").find((button) => button.text() === "保存变更").trigger("click");
    await flushApp();
    expect(invokeMock).toHaveBeenCalledWith(
      "update_task",
      expect.objectContaining({ taskId: "t1", newOwner: "学习" }),
    );
    // 迁移后详情关闭、回到列表
    expect(wrapper.find(".detail-view").exists()).toBe(false);
    expect(wrapper.find(".task-list").exists()).toBe(true);
  });

  it("普通任务添加提交标题和节点参数", async () => {
    localStorage.setItem("current-category", "测试分类");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await openAddForCategory(wrapper);
    expect(wrapper.find(".milestone-editor h2").exists()).toBe(false);
    await wrapper.find('input[maxlength="80"]').setValue("整理资料");
    const addMilestone = wrapper.findAll("button").find((button) => button.text() === "添加节点");
    await addMilestone.trigger("click");
    await wrapper.find('input[placeholder="节点名称"]').setValue("完成初稿");
    await wrapper.find("form.milestone-form").trigger("submit");
    await wrapper.findAll("button").find((button) => button.text() === "添加任务").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("create_task", expect.objectContaining({ owner: "测试分类", title: "整理资料" }));
  });

  it("勾选未来任务后创建任务提交开始执行时间（未指定时间仅存日期）", async () => {
    localStorage.setItem("current-category", "测试分类");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await openAddForCategory(wrapper);
    await wrapper.find('input[maxlength="80"]').setValue("下周启动项目");
    const futureCheckbox = wrapper
      .findAll('input[type="checkbox"]')
      .find((input) => input.element.closest("label").textContent.includes("未来任务"));
    await futureCheckbox.setValue(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('input[type="date"]').exists()).toBe(true);
    // 时间默认不指定（时间输入为空）
    expect(wrapper.find('input[type="time"]').exists()).toBe(true);
    await wrapper.find('input[type="date"]').setValue("2026-09-05");
    await wrapper.findAll("button").find((button) => button.text() === "添加任务").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("create_task", expect.objectContaining({
      title: "下周启动项目",
      startAt: "2026-09-05",
    }));
  });

  it("未来任务指定具体时间时提交完整时间，清空时间后退回仅日期", async () => {
    localStorage.setItem("current-category", "测试分类");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await openAddForCategory(wrapper);
    await wrapper.find('input[maxlength="80"]').setValue("下周启动项目");
    const futureCheckbox = wrapper
      .findAll('input[type="checkbox"]')
      .find((input) => input.element.closest("label").textContent.includes("未来任务"));
    await futureCheckbox.setValue(true);
    await wrapper.vm.$nextTick();
    await wrapper.find('input[type="date"]').setValue("2026-09-05");
    await wrapper.find('input[type="time"]').setValue("09:30");
    await wrapper.findAll("button").find((button) => button.text() === "添加任务").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("create_task", expect.objectContaining({
      startAt: new Date("2026-09-05T09:30").toISOString(),
    }));

    // 再次进入添加页：清空时间 → 退回仅日期提交
    await openAddForCategory(wrapper);
    await wrapper.find('input[maxlength="80"]').setValue("下周启动项目");
    const futureCheckbox2 = wrapper
      .findAll('input[type="checkbox"]')
      .find((input) => input.element.closest("label").textContent.includes("未来任务"));
    await futureCheckbox2.setValue(true);
    await wrapper.vm.$nextTick();
    await wrapper.find('input[type="date"]').setValue("2026-09-06");
    await wrapper.find('input[type="time"]').setValue("10:00");
    await wrapper.find('input[type="time"]').setValue("");
    await wrapper.findAll("button").find((button) => button.text() === "添加任务").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("create_task", expect.objectContaining({
      startAt: "2026-09-06",
    }));
  });

  it("任务列表不展示状态标签，进行中任务标题前展示绿点，周期任务保留标签", async () => {
    localStorage.setItem("current-category", "测试分类");
    invokeMock.activeTasks = [
      { ...taskFixture, id: "t1", title: "任务A", status: "pending" },
      { ...taskFixture, id: "t2", title: "未来任务", status: "not_started", start_at: "2999-01-01T00:00:00Z" },
      { ...taskFixture, id: "t3", title: "挂起任务", status: "suspended", suspended_at: "2026-08-24T08:00:00Z", next_milestone_title: "节点A" },
      { ...taskFixture, id: "t4", title: "周期任务", status: "pending", is_recurring: true, recurring_setting_id: "setting-1" },
      { ...taskFixture, id: "t5", title: "进行中任务", status: "in_progress", started_at: "2026-08-24T08:00:00Z" },
    ];
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    const chips = wrapper.findAll(".status-chip").map((chip) => chip.text());
    expect(chips).toEqual(["周期任务"]);
    const rows = wrapper.findAll(".task-row");
    expect(rows[4].find(".in-progress-dot").exists()).toBe(true);
    // 进行中标记必须与标题文字处于同一行内流（.task-title-text 内）：长标题换行时标记贴着第一行，
    // 不会独占一行，并由 vertical-align: middle 与第一行垂直居中
    expect(rows[4].find(".task-title .in-progress-dot").exists()).toBe(true);
    expect(rows[4].find(".task-title-text .in-progress-dot").exists()).toBe(true);
    expect(rows[4].find(".task-title-text").text()).toBe("进行中任务");
    expect(rows[0].find(".in-progress-dot").exists()).toBe(false);
    expect(rows[1].find(".in-progress-dot").exists()).toBe(false);
    // 挂起任务的节点信息在首页隐藏，其他状态（如未开始的开始时间）照常展示
    expect(rows[2].find(".task-meta").exists()).toBe(false);
    expect(rows[1].find(".task-meta").exists()).toBe(true);
  });

  it("详情页支持待完成开始执行、挂起与激活", async () => {
    localStorage.setItem("current-category", "测试分类");
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
      if (command === "is_auto_start_enabled") return false;
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();
    // 待完成 → 进行中
    await wrapper.findAll("button").find((button) => button.text() === "进行中").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("start_task", { owner: "测试分类", taskId: "t1" });
    await flushApp();
    // 进行中 → 挂起
    await wrapper.findAll("button").find((button) => button.text() === "挂起").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("suspend_task", { owner: "测试分类", taskId: "t1" });
    await flushApp();
    // 已挂起 → 激活（变更为待完成）
    await wrapper.findAll("button").find((button) => button.text() === "激活").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("activate_task", { owner: "测试分类", taskId: "t1" });
    await flushApp();
    // 激活后回到待完成，重新出现“进行中”入口
    expect(wrapper.findAll("button").some((button) => button.text() === "进行中")).toBe(true);
  });

  it("未来任务到达执行时间自动进行中，挂起激活后变更为待完成", async () => {
    localStorage.setItem("current-category", "测试分类");
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
      if (command === "is_auto_start_enabled") return false;
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();
    // 到达执行时间后已自动变为进行中
    expect(wrapper.find(".detail-meta-row .status-chip").text()).toContain("进行中");
    // 详情页进行中标签与首页呼应：胶囊内带蓝色圆点
    expect(wrapper.find(".detail-meta-row .status-chip .in-progress-dot").exists()).toBe(true);
    await wrapper.findAll("button").find((button) => button.text() === "挂起").trigger("click");
    await flushApp();
    await wrapper.findAll("button").find((button) => button.text() === "激活").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("activate_task", { owner: "测试分类", taskId: "t1" });
    await flushApp();
    // 激活后与其他任务一致：待完成，出现“进行中”入口
    expect(wrapper.find(".detail-meta-row .status-chip").text()).toContain("待完成");
    expect(wrapper.find(".detail-meta-row .status-chip .in-progress-dot").exists()).toBe(false);
    expect(wrapper.findAll("button").some((button) => button.text() === "进行中")).toBe(true);
  });

  it("完成任务后保留在当前列表并以划线展示", async () => {
    localStorage.setItem("current-category", "测试分类");
    const inProgressTask = { ...taskFixture, id: "t1", title: "写周报", status: "in_progress" };
    invokeMock.activeTasks = [inProgressTask];
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return invokeMock.activeTasks;
      if (command === "complete_task") {
        invokeMock.activeTasks = [{ ...inProgressTask, status: "completed", completed_at: "2026-08-31T08:00:00Z" }];
        return null;
      }
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    // 画圈完成主操作：弹出完成时间确认（时间默认为不指定 → completedAt 为 null，由后端按当前时刻记录）
    await wrapper.find(".complete-button").trigger("click");
    await wrapper.vm.$nextTick();
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    const confirmBtn = [...document.querySelectorAll(".confirm-actions button")].find((b) => b.textContent === "确认完成");
    confirmBtn.click();
    await flushApp();
    expect(invokeMock).toHaveBeenCalledWith("complete_task", expect.objectContaining({ taskId: "t1", completedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }));
    expect(wrapper.find(".task-title.done").exists()).toBe(true);
    expect(wrapper.find(".complete-button.done").exists()).toBe(true);
  });

  it("周期任务标记完成无需确认完成时间", async () => {
    localStorage.setItem("current-category", "测试分类");
    const recurringTask = { ...taskFixture, id: "t1", title: "每日运动", status: "pending", is_recurring: true, recurring_setting_id: "setting-1" };
    invokeMock.activeTasks = [recurringTask];
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return invokeMock.activeTasks;
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".complete-button").trigger("click");
    await flushApp();
    expect(invokeMock).toHaveBeenCalledWith("complete_task", expect.objectContaining({ taskId: "t1", completedAt: null }));
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("详情页已完成任务支持撤销完成与直接归档", async () => {
    localStorage.setItem("current-category", "测试分类");
    const completedTask = { ...taskFixture, id: "t1", title: "写周报", status: "completed", completed_at: "2026-08-31T08:00:00Z" };
    invokeMock.activeTasks = [completedTask];
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return invokeMock.activeTasks;
      if (command === "get_task") return invokeMock.activeTasks[0];
      if (command === "get_task_events" || command === "list_milestones") return [];
      if (command === "is_auto_start_enabled") return false;
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button").find((button) => button.text() === "撤销完成").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("undo_complete_task", { owner: "测试分类", taskId: "t1" });

    // 已完成任务归档：直接调用接口，无确认弹窗
    await wrapper.findAll("button").find((button) => button.text() === "归档").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("archive_task", { owner: "测试分类", taskId: "t1", isCompleted: true });
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("历史任务撤销完成时询问是否同时撤销归档", async () => {
    localStorage.setItem("current-category", "测试分类");
    const archivedTask = { ...taskFixture, id: "t1", title: "旧任务", status: "completed", completed_at: "2026-08-29T08:00:00Z", archived_at: "2026-08-30T08:00:00Z" };
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return [];
      if (command === "list_all_archived_tasks") return [archivedTask];
      if (command === "get_task_events" || command === "list_milestones") return [];
      if (command === "is_auto_start_enabled") return false;
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
    expect(invokeMock).toHaveBeenCalledWith("restore_archived_task", { owner: "测试分类", taskId: "t1", action: "undo_completion" });
    // 再次询问并选择“仅撤销完成”
    await wrapper.find(".history-action-toggle").trigger("click");
    await wrapper.findAll(".history-actions button").find((button) => button.text() === "撤销完成").trigger("click");
    const choices2 = [...document.querySelectorAll(".confirm-actions .confirm-button")];
    choices2.find((button) => button.textContent === "仅撤销完成").click();
    await flushApp();
    expect(invokeMock).toHaveBeenCalledWith("restore_archived_task", { owner: "测试分类", taskId: "t1", action: "undo_completion_only" });
  });

  it("任务详情默认收起编辑与进度，点击操作按钮后展开", async () => {
    localStorage.setItem("current-category", "测试分类");
    invokeMock.activeTasks = [{ ...taskFixture, id: "t1", title: "写周报" }];
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.detail-actions input[maxlength="80"]').exists()).toBe(false);
    expect(wrapper.find('textarea[placeholder*="记录当前进展"]').exists()).toBe(false);
    await wrapper.findAll("button").find((button) => button.text() === "编辑").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.detail-actions input[maxlength="80"]').exists()).toBe(true);
    // 编辑表单沿用“新建任务”页的内容样式：大号手写输入 + 胶囊开关 + 主按钮
    expect(wrapper.find(".detail-edit-panel .task-input").exists()).toBe(true);
    expect(wrapper.findAll(".detail-edit-panel .toggle-pill").length).toBe(2);
    expect(wrapper.find(".detail-edit-panel .primary-action").text()).toBe("保存变更");
    await wrapper.findAll("button").find((button) => button.text() === "进度").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.find('textarea[placeholder*="记录当前进展"]').exists()).toBe(true);
  });

  it("任务详情默认展示已添加节点，节点维护可直接进行", async () => {
    localStorage.setItem("current-category", "测试分类");
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
    // 节点行默认展示；无“暂无节点”提示；行操作默认收起
    expect(wrapper.find(".milestone-section").exists()).toBe(true);
    expect(wrapper.find(".milestone-section").text()).toContain("完成初稿");
    expect(wrapper.findAll("button").some((button) => button.text() === "添加节点")).toBe(true);
    expect(wrapper.find(".milestone-inline-actions").exists()).toBe(false);
    expect(wrapper.find(".milestone-form").exists()).toBe(false);
    // 点击节点行展开操作
    await wrapper.find(".milestone-main").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll("button").some((button) => button.text() === "删除")).toBe(true);
    // 直接在详情页添加节点
    await wrapper.findAll("button").find((button) => button.text() === "添加节点").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.find("form.milestone-form").exists()).toBe(true);
  });

  it("任务详情支持编辑、节点维护与进度（带记录时间）", async () => {
    invokeMock.activeTasks = [taskFixture];
    localStorage.setItem("current-category", "测试分类");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button").find((button) => button.text() === "编辑").trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.find('.detail-actions input[maxlength="80"]').setValue("整理资料（已更新）");
    await wrapper.findAll("button").find((button) => button.text() === "保存变更").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("update_task", expect.objectContaining({ title: "整理资料（已更新）" }));
    // 节点维护无需展开任务编辑：直接在详情页添加节点
    await wrapper.findAll("button").find((button) => button.text() === "添加节点").trigger("click");
    await wrapper.find('input[placeholder="节点名称"]').setValue("完成初稿");
    await wrapper.find("form.milestone-form").trigger("submit");
    expect(invokeMock).toHaveBeenCalledWith("add_milestone", expect.objectContaining({ title: "完成初稿" }));
    // 点击进度展开后记录进度：完成时间默认当前，可改成实际完成时间
    await wrapper.findAll("button").find((button) => button.text() === "进度").trigger("click");
    await wrapper.vm.$nextTick();
    const progressDateInput = wrapper.find('.progress-inline input[type="date"]');
    const progressTimeInput = wrapper.find('.progress-inline input[type="time"]');
    expect(progressDateInput.element.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(progressTimeInput.element.value).toMatch(/^\d{2}:\d{2}$/);
    await progressDateInput.setValue("2026-08-30");
    await progressTimeInput.setValue("18:30");
    // 进度内容用 textarea，内容溢出时自动换行
    const progressTextarea = wrapper.find("textarea.progress-input");
    expect(progressTextarea.exists()).toBe(true);
    await progressTextarea.setValue("已完成资料分类");
    // 面板底部是“添加 / 收起”两个文字按钮（与添加节点一致）
    const progressActions = wrapper.find(".progress-form-actions");
    expect(progressActions.text()).toContain("添加");
    expect(progressActions.text()).toContain("收起");
    await progressActions.findAll("button").find((button) => button.text() === "添加").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith(
      "add_task_progress",
      expect.objectContaining({
        progress: "已完成资料分类",
        recordedAt: new Date("2026-08-30T18:30").toISOString(),
      }),
    );
  });

  it("时间输入支持一键清除小时和分钟", async () => {
    localStorage.setItem("current-category", "测试分类");
    invokeMock.activeTasks = [taskFixture];
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button").find((button) => button.text() === "进度").trigger("click");
    await wrapper.vm.$nextTick();

    const timeClear = wrapper.find(".progress-inline .time-clear");
    expect(timeClear.exists()).toBe(true);
    // 有值时进入 has-value 状态：原生钟表图标被清除按钮替换
    expect(wrapper.find(".progress-inline .time-input").classes()).toContain("has-value");
    await timeClear.trigger("click");
    await wrapper.vm.$nextTick();
    // 小时与分钟被清空，清除按钮随之隐藏，钟表图标恢复
    expect(wrapper.find('.progress-inline input[type="time"]').element.value).toBe("");
    expect(wrapper.find(".progress-inline .time-clear").exists()).toBe(false);
    expect(wrapper.find(".progress-inline .time-input").classes()).not.toContain("has-value");

    // 只填日期、不留时间时，进度按日期记录
    await wrapper.find('.progress-inline input[type="date"]').setValue("2026-08-31");
    await wrapper.find('textarea[placeholder*="记录当前进展"]').setValue("只记日期");
    await wrapper.find(".progress-form-actions button").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith(
      "add_task_progress",
      expect.objectContaining({ progress: "只记日期", recordedAt: "2026-08-31" }),
    );
  });

  it("详情页完成任务可选择完成时间", async () => {
    localStorage.setItem("current-category", "测试分类");
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
      if (command === "is_auto_start_enabled") return false;
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

  it("节点操作默认收起，点击行展开；已完成节点支持撤销完成", async () => {
    localStorage.setItem("current-category", "测试分类");
    const milestones = [
      { id: 1, task_id: "t1", title: "节点A", planned_at: null, completed_at: null, created_at: "2026-08-24T08:00:00Z", updated_at: "2026-08-24T08:00:00Z" },
      { id: 2, task_id: "t1", title: "节点B", planned_at: null, completed_at: "2026-08-24T08:00:00Z", created_at: "2026-08-24T08:00:00Z", updated_at: "2026-08-24T08:00:00Z" },
    ];
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return [{ ...taskFixture, id: "t1", title: "写周报" }];
      if (command === "get_task") return { ...taskFixture, id: "t1", title: "写周报" };
      if (command === "get_task_events") return [];
      if (command === "list_milestones") return milestones;
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();
    // 节点操作默认收起
    expect(wrapper.find(".milestone-inline-actions").exists()).toBe(false);
    // 点击未完成节点行 → 展开编辑/删除
    await wrapper.findAll(".milestone-main")[0].trigger("click");
    await wrapper.vm.$nextTick();
    let inline = wrapper.find(".milestone-inline-actions");
    expect(inline.exists()).toBe(true);
    expect(inline.text()).toContain("编辑");
    expect(inline.text()).toContain("删除");
    // 点击已完成节点行 → 展开撤销完成/删除
    await wrapper.findAll(".milestone-main")[1].trigger("click");
    await wrapper.vm.$nextTick();
    inline = wrapper.find(".milestone-inline-actions");
    expect(inline.text()).toContain("撤销完成");
    expect(inline.text()).not.toContain("编辑");
    await inline.findAll("button").find((button) => button.text() === "撤销完成").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("undo_complete_milestone", { owner: "测试分类", taskId: "t1", milestoneId: 2 });
  });

  it("详情页添加节点折叠在胶囊里，并与进度面板互斥", async () => {
    localStorage.setItem("current-category", "测试分类");
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return [{ ...taskFixture, id: "t1", title: "写周报" }];
      if (command === "get_task") return { ...taskFixture, id: "t1", title: "写周报" };
      if (command === "get_task_events") return [];
      if (command === "list_milestones") return [];
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".milestone-inline").exists()).toBe(false);
    const pill = (text) => wrapper.findAll(".detail-actions-row button").find((button) => button.text().includes(text));
    await pill("添加节点").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".milestone-inline").exists()).toBe(true);
    expect(wrapper.find("form.milestone-form").exists()).toBe(true);
    // 折叠面板紧跟在功能按钮下方
    expect(wrapper.find(".detail-actions-row").element.nextElementSibling.classList.contains("milestone-inline")).toBe(true);
    // 打开进度面板时节点面板收起，避免两个内联面板同时占用空间
    await pill("进度").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".progress-inline").exists()).toBe(true);
    expect(wrapper.find(".milestone-inline").exists()).toBe(false);
    expect(wrapper.find(".detail-actions-row").element.nextElementSibling.classList.contains("progress-inline")).toBe(true);
  });

  it("节点支持进行中/撤销进行与状态标签", async () => {
    localStorage.setItem("current-category", "测试分类");
    const milestones = [
      {
        id: 1,
        task_id: "t1",
        title: "节点A",
        planned_at: "2026-01-01T00:00:00Z",
        completed_at: null,
        started_at: "2026-01-02T00:00:00Z",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
      },
      {
        id: 2,
        task_id: "t1",
        title: "节点B",
        planned_at: null,
        completed_at: null,
        started_at: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ];
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return [{ ...taskFixture, id: "t1", title: "写周报" }];
      if (command === "get_task") return { ...taskFixture, id: "t1", title: "写周报" };
      if (command === "get_task_events") return [];
      if (command === "list_milestones") return milestones;
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();

    // 操作提示统一放在详情底部，节点标题不再单独挂说明
    expect(wrapper.find(".milestone-section .section-hint").exists()).toBe(false);
    const hint = wrapper.find(".detail-hint").text();
    expect(hint).toContain("点击节点和日志内容可展开操作");
    expect(hint).toContain("按住节点可拖动排序");

    // 进行中节点：标签 + 已延迟标签
    const startedRow = wrapper.findAll(".milestone-row")[0];
    expect(startedRow.find(".milestone-chip").text()).toContain("进行中");
    expect(startedRow.find(".overdue-chip").text()).toContain("已延迟");

    // 进行中节点展开：只有撤销进行，没有进行中入口，也没有上移/下移
    await startedRow.find(".milestone-main").trigger("click");
    let inline = wrapper.find(".milestone-inline-actions");
    expect(inline.text()).toContain("撤销进行");
    expect(inline.text()).not.toContain("上移");
    expect(inline.text()).not.toContain("下移");
    await inline.findAll("button").find((button) => button.text() === "撤销进行").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("undo_start_milestone", { owner: "测试分类", taskId: "t1", milestoneId: 1 });

    // 未开始节点展开：进行中入口可开始
    await wrapper.findAll(".milestone-row")[1].find(".milestone-main").trigger("click");
    inline = wrapper.find(".milestone-inline-actions");
    expect(inline.text()).toContain("进行中");
    await inline.findAll("button").find((button) => button.text() === "进行中").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("start_milestone", { owner: "测试分类", taskId: "t1", milestoneId: 2 });
  });

  it("生命周期默认只展开创建、进度与仍有效的完成日志", async () => {
    localStorage.setItem("current-category", "测试分类");
    const events = [
      { id: 1, event_type: "created", created_at: "2026-08-24T08:00:00Z" },
      { id: 2, event_type: "title_changed", before_value: "旧标题", after_value: "新标题", created_at: "2026-08-24T09:00:00Z" },
      { id: 3, event_type: "milestone_created", after_value: "节点A", created_at: "2026-08-24T10:00:00Z" },
      { id: 4, event_type: "progress_updated", after_value: "写完一半", created_at: "2026-08-24T11:00:00Z" },
      { id: 5, event_type: "suspended", created_at: "2026-08-24T12:00:00Z" },
      { id: 6, event_type: "completed", created_at: "2026-08-24T13:00:00Z" },
    ];
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return [{ ...taskFixture, id: "t1", title: "写周报" }];
      if (command === "get_task") return { ...taskFixture, id: "t1", title: "写周报" };
      if (command === "get_task_events") return events;
      if (command === "list_milestones") return [];
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();

    const listText = () => wrapper.find(".event-list").text();
    // 默认只展开：创建 / 进度 / 最后一次完成
    expect(listText()).toContain("创建任务");
    expect(listText()).toContain("写完一半");
    expect(listText()).toContain("完成任务");
    // 挂起、字段修改、节点日志默认折叠
    expect(listText()).not.toContain("挂起任务");
    expect(listText()).not.toContain("任务内容");
    expect(listText()).not.toContain("新增节点");
    // 图标只渲染默认展开的行（创建=时钟、进度=趋势、完成=对勾）
    const shapes = wrapper.findAll(".event-row .event-icon").map((el) => el.attributes("data-shape"));
    expect(shapes).toEqual(["clock", "trend", "check"]);
    expect(wrapper.find(".event-more").text()).toContain("完整日志（+3）");
    // 展开完整日志后全部可见
    await wrapper.find(".event-more").trigger("click");
    await wrapper.vm.$nextTick();
    expect(listText()).toContain("任务内容");
    expect(listText()).toContain("新增节点");
    expect(listText()).toContain("挂起任务");
    expect(wrapper.find(".event-more").text()).toContain("收起日志");
  });

  it("已撤销的完成日志不默认展开，只保留仍有效的最后一次完成", async () => {
    localStorage.setItem("current-category", "测试分类");
    const events = [
      { id: 21, event_type: "created", created_at: "2026-08-24T08:00:00Z" },
      { id: 22, event_type: "completed", created_at: "2026-08-24T09:00:00Z" },
      { id: 23, event_type: "completion_undone", created_at: "2026-08-24T10:00:00Z" },
      { id: 24, event_type: "progress_updated", after_value: "补充材料", created_at: "2026-08-24T11:00:00Z" },
      { id: 25, event_type: "completed", created_at: "2026-08-24T12:00:00Z" },
    ];
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return [{ ...taskFixture, id: "t1", title: "写周报" }];
      if (command === "get_task") return { ...taskFixture, id: "t1", title: "写周报" };
      if (command === "get_task_events") return events;
      if (command === "list_milestones") return [];
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();

    const listText = () => wrapper.find(".event-list").text();
    // 只有最后一次完成可见，被撤销的那次完成与撤销记录默认折叠
    expect(listText().match(/完成任务/g).length).toBe(1);
    expect(listText()).not.toContain("撤销完成");
    expect(wrapper.find(".event-more").text()).toContain("完整日志（+2）");
    await wrapper.find(".event-more").trigger("click");
    await wrapper.vm.$nextTick();
    expect(listText().match(/完成任务/g).length).toBe(2);
    expect(listText()).toContain("撤销完成");
  });

  it("生命周期里的进度时间显示为进度完成时间", async () => {
    localStorage.setItem("current-category", "测试分类");
    const completedAt = "2026-08-24T11:00:00Z";
    const events = [
      { id: 1, event_type: "created", created_at: "2026-08-24T08:00:00Z" },
      { id: 2, event_type: "progress_updated", after_value: "写完一半", created_at: completedAt },
    ];
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return [{ ...taskFixture, id: "t1", title: "写周报" }];
      if (command === "get_task") return { ...taskFixture, id: "t1", title: "写周报" };
      if (command === "get_task_events") return events;
      if (command === "list_milestones") return [];
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();
    // 进度行右侧时间取自进度完成时间（事件创建时间即记录时写入的完成时间）
    expect(wrapper.find(".event-list").text()).toContain("写完一半");
    expect(wrapper.find(".event-list").text()).toContain(formatTime(completedAt));
  });

  it("生命周期日志点击展开后可删除任意类型记录", async () => {
    localStorage.setItem("current-category", "测试分类");
    const events = [
      { id: 11, event_type: "created", created_at: "2026-08-24T08:00:00Z" },
      { id: 12, event_type: "progress_updated", after_value: "写了一半", created_at: "2026-08-24T09:00:00Z" },
      { id: 13, event_type: "suspended", created_at: "2026-08-24T10:00:00Z" },
    ];
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return [{ ...taskFixture, id: "t1", title: "写周报" }];
      if (command === "get_task") return { ...taskFixture, id: "t1", title: "写周报" };
      if (command === "get_task_events") return events;
      if (command === "list_milestones") return [];
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();

    // 默认收起删除入口
    expect(wrapper.findAll(".event-row .event-delete").length).toBe(0);
    // 点击任意日志行展开删除入口：创建、挂起等状态日志都支持删除
    await wrapper.findAll(".event-row")[0].trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".event-row .event-delete").length).toBe(1);
    await wrapper.find(".event-row .event-delete").trigger("click");
    await wrapper.vm.$nextTick();
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    const confirmButton = [...document.querySelectorAll(".confirm-actions button")].find((b) => b.textContent === "确认删除");
    confirmButton.click();
    await flushApp();
    expect(invokeMock).toHaveBeenCalledWith("delete_task_event", { owner: "测试分类", taskId: "t1", eventId: 11 });

    // 换一行展开：同时只展开一行，删除入口随之移动
    await wrapper.findAll(".event-row")[1].trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".event-row .event-delete").length).toBe(1);
  });

  it("周期规则创建、编辑、作废操作调用对应接口", async () => {
    localStorage.setItem("current-category", "测试分类");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await openAddForCategory(wrapper);
    await wrapper.find('input[maxlength="80"]').setValue("每日运动");
    await wrapper.find("input[type=checkbox]").setValue(true);
    await wrapper.findAll("button").find((button) => button.text() === "添加任务").trigger("click");
    expect(invokeMock).toHaveBeenCalledWith("create_recurring_task_setting", expect.objectContaining({ title: "每日运动" }));
  });

  it("从周期任务详情进入规则编辑时读取最新规则", async () => {
    const latestSetting = { ...recurringSettingFixture, title: "每日运动（已修改）", status: "生效中" };
    const recurringTask = { ...taskFixture, is_recurring: true, recurring_setting_id: recurringSettingFixture.id };
    invokeMock.activeTasks = [recurringTask];
    localStorage.setItem("current-category", "测试分类");
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return [recurringTask];
      if (command === "get_task") return recurringTask;
      if (command === "get_task_events" || command === "list_milestones" || command === "list_recurring_setting_tasks" || command === "list_recurring_setting_events") return [];
      if (command === "list_recurring_task_settings") return [latestSetting];
      if (command === "is_auto_start_enabled") return false;
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
    expect(invokeMock).toHaveBeenCalledWith("list_recurring_task_settings", { owner: "测试分类" });
  });

  it("接口错误显示应用内提示，不调用原生 alert", async () => {
    localStorage.setItem("current-category", "测试分类");
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return [];
      if (command === "is_auto_start_enabled") return false;
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
    localStorage.setItem("current-category", "测试分类");
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
    localStorage.setItem("current-category", "测试分类");
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
    // 这些状态流转默认折叠在完整日志里，展开后可见
    await wrapper.find(".event-more").trigger("click");
    await wrapper.vm.$nextTick();
    const text = wrapper.find(".event-list").text();
    expect(text).toContain("任务开始执行");
    expect(text).toContain("挂起任务");
    expect(text).toContain("激活任务");
    expect(text).toContain("系统自动归档（隔天）");
  });

  it("顶部以标签卡片展示分类，当前分类高亮并显示待办数量", async () => {
    localStorage.setItem("current-category", "工作");
    localStorage.setItem("categories", JSON.stringify(["工作", "生活"]));
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return [taskFixture];
      if (command === "is_auto_start_enabled") return false;
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    const tabs = wrapper.findAll(".category-tab");
    expect(tabs.map((tab) => tab.text())).toEqual(["工作", "生活", "+"]);
    expect(wrapper.find(".category-tab.active").text()).toBe("工作");
    expect(wrapper.find(".category-count").text()).toBe("1 项");
  });

  it("点击顶部分类标签即切换分类并重新加载任务", async () => {
    localStorage.setItem("current-category", "工作");
    localStorage.setItem("categories", JSON.stringify(["工作", "生活"]));
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return [taskFixture];
      if (command === "is_auto_start_enabled") return false;
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    const tabs = wrapper.findAll(".category-tab");
    await tabs[1].trigger("click");
    await wrapper.vm.$nextTick();
    await flushApp();
    expect(localStorage.getItem("current-category")).toBe("生活");
    expect(invokeMock).toHaveBeenCalledWith("list_active_tasks", { owner: "生活" });
    expect(wrapper.find(".category-tab.active").text()).toBe("生活");
  });

  it("点击“+”分类标签进入分类管理", async () => {
    localStorage.setItem("current-category", "工作");
    localStorage.setItem("categories", JSON.stringify(["工作"]));
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".category-tab-add").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".categories-view").exists()).toBe(true);
  });

  it("设置面板可切换内置手写字体并持久化", async () => {
    localStorage.setItem("current-category", "测试分类");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".menu-button").trigger("click");
    await wrapper.vm.$nextTick();
    const fontButton = wrapper.findAll(".segmented button").find((button) => button.text() === "行书");
    await fontButton.trigger("click");
    await wrapper.vm.$nextTick();
    expect(localStorage.getItem("note-font")).toBe("xingshu");
    expect(wrapper.find(".app-shell").classes()).toContain("font-xingshu");
    // 弹窗 teleport 到 body，字体类需同时挂到 <html> 才能生效
    expect(document.documentElement.classList.contains("font-xingshu")).toBe(true);
  });

  it("设置面板可自定义右下角签名", async () => {
    localStorage.setItem("current-category", "测试分类");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".menu-button").trigger("click");
    await wrapper.vm.$nextTick();
    const input = wrapper.find(".signature-input");
    await input.setValue("老张的便签");
    await wrapper.vm.$nextTick();
    expect(localStorage.getItem("note-signature")).toBe("老张的便签");
    expect(wrapper.find(".brand-mark").text()).toBe("老张的便签");
  });

  it("分类页支持一次添加多个分类", async () => {
    localStorage.setItem("current-category", "工作");
    localStorage.setItem("categories", JSON.stringify(["工作"]));
    invokeMock.activeTasks = [];
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".menu-button").trigger("click");
    const managerButton = wrapper.findAll("button").find((button) => button.text() === "分类管理");
    await managerButton.trigger("click");
    await wrapper.vm.$nextTick();
    const input = wrapper.find('.category-add-line textarea[placeholder="每行一个分类"]');
    await input.setValue("生活\n家人\n学习");
    await wrapper.find("form.category-form").trigger("submit");
    await wrapper.vm.$nextTick();
    await flushApp();
    expect(JSON.parse(localStorage.getItem("categories"))).toEqual(["工作", "生活", "家人", "学习"]);
    // 添加完成后切到第一个新增分类
    expect(localStorage.getItem("current-category")).toBe("生活");
  });

  it("菜单左上角的关闭按钮可关闭菜单", async () => {
    const menu = mount(AppMenu, { props: { open: true } });
    expect(menu.find(".menu-close").exists()).toBe(true);
    await menu.find(".menu-close").trigger("click");
    expect(menu.emitted("close")).toHaveLength(1);
  });

  it("产品简介展示版本、更新时间与本版更新概要", async () => {
    localStorage.setItem("current-category", "测试分类");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".menu-button").trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button").find((button) => button.text() === "产品简介").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".about-view").exists()).toBe(true);
    expect(wrapper.find(".about-version").text()).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(wrapper.find(".about-updated").text()).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    expect(wrapper.findAll(".about-release-list li").length).toBe(6);
    // 版本、更新时间与更新内容都位于信息列表中，不再单独成块。
    expect(wrapper.findAll(".about-hero .about-version").length).toBe(0);
    expect(wrapper.findAll(".about-release").length).toBe(0);
    const aboutListText = wrapper.find(".about-list").text();
    expect(aboutListText).toContain("版本");
    expect(aboutListText).toContain("更新时间");
    expect(aboutListText).toContain("更新内容");
    expect(wrapper.find(".about-foot").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("MIT 开源 · 数据仅存本机");
  });

  it("菜单可进入数据管理并展示数据版本与统计", async () => {
    localStorage.setItem("categories", JSON.stringify(["测试分类"]));
    localStorage.setItem("current-category", "测试分类");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await openDataManagement(wrapper);

    expect(wrapper.find(".data-management-view").exists()).toBe(true);
    expect(wrapper.find(".data-version-value").text()).toContain("2026");
    expect(wrapper.find(".data-stats").text()).toContain("2 条任务");
    expect(invokeMock).toHaveBeenCalledWith("get_data_overview");
  });

  it("数据管理可导出当前分类与任务数据", async () => {
    localStorage.setItem("categories", JSON.stringify(["测试分类", "家人"]));
    localStorage.setItem("current-category", "测试分类");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await openDataManagement(wrapper);
    await wrapper.findAll("button").find((button) => button.text() === "导出到文件").trigger("click");
    await flushApp();

    expect(invokeMock).toHaveBeenCalledWith("export_data", {
      categories: ["测试分类", "家人"],
      preferences: {
        noteSize: "medium",
        noteTheme: "yellow",
        noteFont: "xikai",
        noteSignature: "桌面便签",
        notePosition: "top-right",
        currentCategory: "测试分类",
      },
    });
  });

  it("增量导入保留本地分类并合并备份任务", async () => {
    localStorage.setItem("categories", JSON.stringify(["测试分类"]));
    localStorage.setItem("current-category", "测试分类");
    localStorage.setItem("note-theme", "pink");
    invokeMock.importPreview = importPreviewFixture;
    invokeMock.importResult = {
      mode: "merge",
      importedAt: "2026-11-06T03:00:00+00:00",
      dataVersion: "2026-11-06T03:00:00+00:00",
      addedTasks: 1,
      updatedTasks: 1,
      keptLocalTasks: 2,
      categories: ["导入分类", "测试分类"],
      preferences: importPreviewFixture.preferences,
    };
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await openDataManagement(wrapper);
    await wrapper.findAll("button").find((button) => button.text() === "选择备份文件").trigger("click");
    await flushApp();
    expect(wrapper.find(".data-import-file").text()).toContain("桌面便签数据备份.json");

    await wrapper.findAll(".data-import-mode").find((button) => button.text().includes("增量覆盖")).trigger("click");
    await wrapper.vm.$nextTick();
    expect(document.body.textContent).toContain("增量覆盖导入");
    document.querySelector(".confirm-actions .confirm-button").click();
    await flushApp();
    await flushApp();

    expect(invokeMock).toHaveBeenCalledWith("import_data", {
      path: importPreviewFixture.path,
      mode: "merge",
    });
    expect(JSON.parse(localStorage.getItem("categories"))).toEqual(["测试分类", "导入分类"]);
    expect(localStorage.getItem("note-theme")).toBe("pink");
    expect(wrapper.find(".data-management-view").exists()).toBe(false);
  });

  it("完全覆盖导入会用备份分类替换本地分类", async () => {
    localStorage.setItem("categories", JSON.stringify(["本地分类"]));
    localStorage.setItem("current-category", "本地分类");
    invokeMock.importPreview = importPreviewFixture;
    invokeMock.importResult = {
      mode: "overwrite",
      importedAt: "2026-11-06T03:00:00+00:00",
      dataVersion: "2026-11-06T03:00:00+00:00",
      addedTasks: 2,
      updatedTasks: 0,
      keptLocalTasks: 0,
      categories: ["备份分类"],
      preferences: {
        noteSize: "large",
        noteTheme: "blue",
        noteFont: "xingshu",
        noteSignature: "导入签名",
        notePosition: "center",
        currentCategory: "备份分类",
      },
    };
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await openDataManagement(wrapper);
    await wrapper.findAll("button").find((button) => button.text() === "选择备份文件").trigger("click");
    await flushApp();
    await wrapper.findAll(".data-import-mode").find((button) => button.text().includes("完全覆盖")).trigger("click");
    await wrapper.vm.$nextTick();
    expect(document.body.textContent).toContain("完全覆盖导入");
    document.querySelector(".confirm-actions .confirm-button").click();
    await flushApp();
    await flushApp();

    expect(invokeMock).toHaveBeenCalledWith("import_data", {
      path: importPreviewFixture.path,
      mode: "overwrite",
    });
    expect(JSON.parse(localStorage.getItem("categories"))).toEqual(["备份分类"]);
    expect(localStorage.getItem("current-category")).toBe("备份分类");
    expect(localStorage.getItem("note-size")).toBe("large");
    expect(localStorage.getItem("note-theme")).toBe("blue");
    expect(localStorage.getItem("note-font")).toBe("xingshu");
    expect(localStorage.getItem("note-signature")).toBe("导入签名");
    expect(localStorage.getItem("note-position")).toBe("center");
    expect(wrapper.find(".data-management-view").exists()).toBe(false);
  });

  it("历史任务支持按全部/普通/周期筛选与任务名检索", async () => {
    localStorage.setItem("categories", JSON.stringify(["测试分类"]));
    localStorage.setItem("current-category", "测试分类");
    invokeMock.archivedTasks = [
      archivedTaskFixture,
      archivedRecurringFixture,
      { ...archivedTaskFixture, id: "archived-2", title: "普通第二条" },
    ];
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".menu-button").trigger("click");
    await wrapper.findAll("button").find((button) => button.text() === "历史任务").trigger("click");
    await flushApp();

    const titles = () => wrapper.findAll(".history-main span").map((item) => item.text());
    expect(titles()).toEqual(["整理旧资料", "周期归档任务", "普通第二条"]);

    await wrapper.findAll(".history-filter button").find((button) => button.text() === "周期任务").trigger("click");
    await wrapper.vm.$nextTick();
    expect(titles()).toEqual(["周期归档任务"]);

    await wrapper.findAll(".history-filter button").find((button) => button.text() === "普通任务").trigger("click");
    await wrapper.vm.$nextTick();
    expect(titles()).toEqual(["整理旧资料", "普通第二条"]);

    await wrapper.find(".history-search").setValue("整理");
    await wrapper.vm.$nextTick();
    expect(titles()).toEqual(["整理旧资料"]);

    await wrapper.find(".history-search").setValue("不存在");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".empty-state").text()).toContain("没有匹配的历史任务");

    await wrapper.find(".empty-state .text-button").trigger("click");
    await wrapper.vm.$nextTick();
    expect(titles()).toEqual(["整理旧资料", "周期归档任务", "普通第二条"]);
  });

  it("合并任务支持勾选多个未归档任务、编辑名称并调用合并接口", async () => {
    localStorage.setItem("categories", JSON.stringify(["测试分类"]));
    localStorage.setItem("current-category", "测试分类");
    const mergeTaskA = { ...taskFixture, id: "merge-a", title: "任务甲", is_urgent: true };
    const mergeTaskB = {
      ...taskFixture,
      id: "merge-b",
      title: "任务乙",
      completed_at: "2026-08-20T08:00:00Z",
      status: "completed",
    };
    const mergeTaskRecurring = {
      ...taskFixture,
      id: "merge-r",
      title: "不应参与合并的周期任务",
      is_recurring: true,
      recurring_setting_id: "setting-1",
      occurrence_date: "2026-08-24",
    };
    invokeMock.activeTasks = [mergeTaskA, mergeTaskB, mergeTaskRecurring];
    invokeMock.mergeResult = {
      ...taskFixture,
      id: "merged-1",
      title: "合并后的任务",
      is_urgent: true,
      status: "pending",
    };
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".menu-button").trigger("click");
    await wrapper.findAll("button").find((button) => button.text() === "合并任务").trigger("click");
    await flushApp();

    expect(wrapper.find(".merge-tasks-view").exists()).toBe(true);
    const rows = wrapper.findAll(".merge-task-row");
    expect(rows.length).toBe(2);
    expect(rows.map((row) => row.text())).not.toContain("不应参与合并的周期任务");

    const mergeButton = () =>
      wrapper.findAll("button").find((button) => button.text() === "合并任务");
    expect(mergeButton().attributes("disabled")).toBeDefined();

    await wrapper.findAll("button").find((button) => button.text() === "全选").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".merge-selection-meta").text()).toContain("已选 2 个任务");
    const titleInput = wrapper.find(".merge-editor input");
    expect(titleInput.element.value).toBe("任务甲、任务乙");

    await titleInput.setValue("合并后的任务");
    await wrapper.vm.$nextTick();
    await mergeButton().trigger("click");
    await wrapper.vm.$nextTick();
    expect(document.body.textContent).toContain("合并任务");
    document.querySelector(".confirm-actions .confirm-button").click();
    await flushApp();
    await flushApp();

    expect(invokeMock).toHaveBeenCalledWith("merge_tasks", {
      owner: "测试分类",
      taskIds: ["merge-a", "merge-b"],
      title: "合并后的任务",
    });
    expect(wrapper.find(".merge-tasks-view").exists()).toBe(false);
  });

  it("分类管理支持上下移动分类并持久化顺序", async () => {
    localStorage.setItem("categories", JSON.stringify(["甲", "乙", "丙"]));
    localStorage.setItem("current-category", "甲");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".menu-button").trigger("click");
    await wrapper.findAll("button").find((button) => button.text() === "分类管理").trigger("click");
    await wrapper.vm.$nextTick();
    await flushApp();

    const categoryNames = () => wrapper.findAll(".category-main").map((item) => item.text());
    expect(categoryNames()).toEqual(["甲", "乙", "丙"]);
    expect(
      wrapper.findAll(".category-row")[0].find('[aria-label="上移分类"]').attributes("disabled"),
    ).toBeDefined();
    expect(
      wrapper.findAll(".category-row")[2].find('[aria-label="下移分类"]').attributes("disabled"),
    ).toBeDefined();

    await wrapper.findAll(".category-row")[0].find('[aria-label="下移分类"]').trigger("click");
    await wrapper.vm.$nextTick();
    expect(JSON.parse(localStorage.getItem("categories"))).toEqual(["乙", "甲", "丙"]);
    expect(categoryNames()).toEqual(["乙", "甲", "丙"]);
    // 当前分类不随排序改变
    expect(localStorage.getItem("current-category")).toBe("甲");

    await wrapper.findAll(".category-row")[2].find('[aria-label="上移分类"]').trigger("click");
    await wrapper.vm.$nextTick();
    expect(JSON.parse(localStorage.getItem("categories"))).toEqual(["乙", "丙", "甲"]);
    expect(categoryNames()).toEqual(["乙", "丙", "甲"]);
  });

  it("任务详情展示所属分类标签", async () => {
    localStorage.setItem("categories", JSON.stringify(["测试分类"]));
    localStorage.setItem("current-category", "测试分类");
    invokeMock.activeTasks = [taskFixture];
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".task-main").trigger("click");
    await wrapper.vm.$nextTick();
    await flushApp();
    expect(wrapper.find(".detail-category-tag").text()).toBe("分类 · 测试分类");
  });

  it("已归档任务支持改名且保存后状态保持不变", async () => {
    localStorage.setItem("categories", JSON.stringify(["测试分类"]));
    localStorage.setItem("current-category", "测试分类");
    invokeMock.archivedTasks = [archivedTaskFixture];
    invokeMock.updatedArchivedTask = {
      ...archivedTaskFixture,
      title: "改名后的历史任务",
    };
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".menu-button").trigger("click");
    await wrapper.findAll("button").find((button) => button.text() === "历史任务").trigger("click");
    await flushApp();
    await wrapper.find(".history-main").trigger("click");
    await flushApp();
    expect(wrapper.find(".detail-category-tag").text()).toBe("分类 · 测试分类");
    expect(wrapper.find(".detail-summary .status-chip").text()).toContain("已完成");

    await wrapper.find(".detail-actions-row button").trigger("click");
    await wrapper.vm.$nextTick();
    const titleInput = wrapper.find(".detail-edit-panel .task-input");
    await titleInput.setValue("改名后的历史任务");
    await wrapper.findAll("button").find((button) => button.text() === "保存变更").trigger("click");
    await flushApp();
    await flushApp();

    expect(invokeMock).toHaveBeenCalledWith("update_archived_task", {
      owner: "测试分类",
      taskId: "archived-1",
      title: "改名后的历史任务",
      newOwner: null,
    });
    expect(wrapper.find(".detail-summary strong").text()).toBe("改名后的历史任务");
    expect(wrapper.find(".detail-summary .status-chip").text()).toContain("已完成");
  });

  it("已归档任务改分类后回到历史列表", async () => {
    localStorage.setItem("categories", JSON.stringify(["测试分类", "归档分类"]));
    localStorage.setItem("current-category", "测试分类");
    invokeMock.archivedTasks = [archivedTaskFixture];
    invokeMock.updatedArchivedTask = {
      ...archivedTaskFixture,
      owner: "归档分类",
    };
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".menu-button").trigger("click");
    await wrapper.findAll("button").find((button) => button.text() === "历史任务").trigger("click");
    await flushApp();
    await wrapper.find(".history-main").trigger("click");
    await flushApp();

    await wrapper.find(".detail-actions-row button").trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.find(".detail-edit-panel select").setValue("归档分类");
    await wrapper.findAll("button").find((button) => button.text() === "保存变更").trigger("click");
    await flushApp();
    await flushApp();

    expect(invokeMock).toHaveBeenCalledWith("update_archived_task", {
      owner: "测试分类",
      taskId: "archived-1",
      title: "整理旧资料",
      newOwner: "归档分类",
    });
    expect(wrapper.find(".history-view").exists()).toBe(true);
  });

  it("历史任务支持分类筛选与批量删除", async () => {
    localStorage.setItem("categories", JSON.stringify(["测试分类", "归档分类"]));
    localStorage.setItem("current-category", "测试分类");
    invokeMock.archivedTasks = [
      { ...archivedTaskFixture, id: "history-a", title: "工作归档", owner: "测试分类" },
      { ...archivedTaskFixture, id: "history-b", title: "学习归档", owner: "归档分类" },
    ];
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".menu-button").trigger("click");
    await wrapper.findAll("button").find((button) => button.text() === "历史任务").trigger("click");
    await flushApp();

    const titles = () => wrapper.findAll(".history-main span").map((item) => item.text());
    expect(titles()).toEqual(["工作归档", "学习归档"]);

    await wrapper.find(".history-category-select").setValue("归档分类");
    await wrapper.vm.$nextTick();
    expect(titles()).toEqual(["学习归档"]);
    expect(wrapper.find(".history-main small").text()).toContain("归档分类");

    await wrapper.find(".history-category-select").setValue("all");
    await wrapper.vm.$nextTick();
    // 多选与批量删除默认隐藏，点击“选择”后才出现。
    expect(wrapper.findAll(".history-select").length).toBe(0);
    expect(wrapper.findAll("button").some((button) => button.text() === "批量删除")).toBe(false);
    await wrapper.find(".history-select-toggle").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".history-select").length).toBe(2);
    expect(wrapper.findAll("button").some((button) => button.text() === "批量删除")).toBe(true);
    await wrapper.find(".history-select-toggle").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".history-select").length).toBe(0);

    await wrapper.find(".history-select-toggle").trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button").find((button) => button.text() === "全选").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".history-selected-count").text()).toContain("已选 2 项");

    await wrapper.findAll("button").find((button) => button.text() === "批量删除").trigger("click");
    await wrapper.vm.$nextTick();
    expect(document.body.textContent).toContain("批量删除历史任务");
    document.querySelector(".confirm-actions .confirm-button").click();
    await flushApp();
    await flushApp();

    expect(invokeMock).toHaveBeenCalledWith("delete_archived_tasks", {
      taskIds: ["history-a", "history-b"],
    });
    expect(wrapper.findAll(".history-select").length).toBe(0);
  });

  it("新建周期任务规则可选择所属分类", async () => {
    localStorage.setItem("categories", JSON.stringify(["测试分类", "学习分类"]));
    localStorage.setItem("current-category", "测试分类");
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".menu-button").trigger("click");
    await wrapper.findAll("button").find((button) => button.text() === "周期任务规则").trigger("click");
    await flushApp();
    await wrapper.findAll("button").find((button) => button.text().includes("新建周期任务")).trigger("click");
    await wrapper.vm.$nextTick();

    await wrapper.find('.form-view select[aria-label="所属分类"]').setValue("学习分类");
    await wrapper.find('.form-view input[maxlength="80"]').setValue("每日学习");
    await wrapper.findAll("button").find((button) => button.text() === "保存设置").trigger("click");
    await flushApp();
    await flushApp();

    expect(invokeMock).toHaveBeenCalledWith(
      "create_recurring_task_setting",
      expect.objectContaining({ owner: "学习分类", title: "每日学习" }),
    );
    expect(localStorage.getItem("current-category")).toBe("学习分类");
  });

  it("编辑周期任务规则可修改所属分类", async () => {
    localStorage.setItem("categories", JSON.stringify(["测试分类", "学习分类"]));
    localStorage.setItem("current-category", "测试分类");
    const activeSetting = { ...recurringSettingFixture, status: "生效中" };
    invokeMock.mockImplementation(async (command) => {
      if (command === "list_active_tasks") return [];
      if (command === "list_recurring_task_settings") return [activeSetting];
      if (command === "list_recurring_setting_tasks" || command === "list_recurring_setting_events") return [];
      if (command === "update_recurring_task_setting") {
        return { ...activeSetting, owner: "学习分类" };
      }
      if (command === "is_auto_start_enabled") return false;
      return null;
    });
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    await wrapper.find(".menu-button").trigger("click");
    await wrapper.findAll("button").find((button) => button.text() === "周期任务规则").trigger("click");
    await flushApp();
    await wrapper.find(".rule-action").trigger("click");
    await wrapper.vm.$nextTick();

    await wrapper.find('.form-view select[aria-label="所属分类"]').setValue("学习分类");
    await wrapper.findAll("button").find((button) => button.text() === "保存设置").trigger("click");
    await flushApp();
    await flushApp();

    expect(invokeMock).toHaveBeenCalledWith(
      "update_recurring_task_setting",
      expect.objectContaining({
        owner: "测试分类",
        newOwner: "学习分类",
        settingId: "setting-1",
      }),
    );
    expect(localStorage.getItem("current-category")).toBe("学习分类");
  });

  it("老版本的“用户”数据会自动迁移为分类", async () => {
    localStorage.setItem("current-user", "旧昵称");
    localStorage.setItem("users", JSON.stringify(["旧昵称", "家人"]));
    const wrapper = mountApp();
    await wrapper.vm.$nextTick();
    await flushApp();
    expect(JSON.parse(localStorage.getItem("categories"))).toEqual(["旧昵称", "家人"]);
    expect(localStorage.getItem("users")).toBeNull();
    expect(wrapper.find(".category-tab.active").text()).toBe("旧昵称");
  });
});
