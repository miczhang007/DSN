<template>
  <main class="app-shell" :class="[`size-${noteSize}`, `theme-${noteTheme}`, { 'minimal-mode': minimalModeEnabled }]">
    <section class="note" :class="{ 'is-subview': view !== 'home' }" @click="closeMenu">
      <div class="pin-shadow"></div>

      <header class="note-header">
        <button
          v-if="view !== 'home'"
          class="text-button"
          type="button"
          @click.stop="handleBack"
        >
          {{ backButtonLabel }}
        </button>
        <h1
          v-if="viewTitle"
          :class="{ 'quiet-view-title': view === 'home' || view === 'history' }"
        >
          {{ viewTitle }}
        </h1>
        <div class="header-actions" v-if="view === 'home'">
          <button class="icon-button add-button" type="button" aria-label="添加任务" @click.stop="openAdd">
            +
          </button>
          <button class="icon-button menu-button" type="button" aria-label="打开菜单" @click.stop="toggleMenu">
            <span class="vertical-dots" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </span>
          </button>
        </div>
      </header>

      <Transition name="fade">
        <nav v-if="menuOpen" class="note-menu" aria-label="菜单" @click.stop>
          <button type="button" @click="openHistory">历史任务</button>
          <button type="button" @click="openUserManager">用户管理</button>
          <div class="menu-section">
            <label>
              <span>便签大小</span>
              <select :value="noteSize" @change="changeNoteSize($event.target.value)">
                <option v-for="size in sizeOptions" :key="size.value" :value="size.value">
                  {{ size.label }}
                </option>
              </select>
            </label>
          </div>
          <div class="menu-section">
            <label>
              <span>便签主题</span>
              <select :value="noteTheme" @change="changeNoteTheme($event.target.value)">
                <option v-for="theme in themeOptions" :key="theme.value" :value="theme.value">
                  {{ theme.label }}
                </option>
              </select>
            </label>
          </div>
          <div class="menu-section">
            <label>
              <span>便签位置</span>
              <select :value="notePosition" @change="changeNotePosition($event.target.value)">
                <option
                  v-for="position in positionOptions"
                  :key="position.value"
                  :value="position.value"
                >
                  {{ position.label }}
                </option>
              </select>
            </label>
          </div>
          <label class="menu-toggle">
            <span>开机自启动</span>
            <input
              :checked="autoStartEnabled"
              type="checkbox"
              role="switch"
              @change="changeAutoStart($event.target.checked)"
            />
          </label>
          <label class="menu-toggle">
            <span>极简模式</span>
            <input
              :checked="minimalModeEnabled"
              type="checkbox"
              role="switch"
              @change="changeMinimalMode($event.target.checked)"
            />
          </label>
          <button type="button" @click="openAbout">产品简介</button>
          <button type="button" class="danger" @click="exitApp">退出</button>
        </nav>
      </Transition>

      <section v-if="view === 'home'" class="content">
        <div v-if="activeTasks.length" class="task-list" role="list">
          <article
            v-for="task in activeTasks"
            :key="task.id"
            class="task-row"
            role="listitem"
          >
            <button
              class="complete-button"
              type="button"
              :aria-label="`完成 ${task.title}`"
              @click.stop="completeTask(task.id)"
            ></button>
            <button class="task-main" type="button" @click.stop="openTask(task)">
              <span class="task-title">{{ task.title }}</span>
              <span v-if="task.next_milestone_title || task.next_milestone_planned_at || task.is_urgent" class="task-meta">
                <span v-if="task.next_milestone_title || task.next_milestone_planned_at" class="next-milestone">
                  {{ nextMilestoneText(task) }}
                </span>
                <span v-if="isMilestoneOverdue(task.next_milestone_planned_at)" class="overdue-chip">已延迟</span>
                <span v-if="task.is_urgent" class="urgent-chip">紧急</span>
              </span>
            </button>
          </article>
        </div>
        <div v-else class="empty-state">
          <p>今天还没有待办</p>
          <button class="text-button" type="button" @click.stop="openAdd">添加一个</button>
        </div>
      </section>

      <section v-else-if="view === 'users'" class="content users-view" @click.stop>
        <div v-if="!userFormOpen" class="user-add-collapsed">
          <button class="primary-action" type="button" @click="openUserForm">
            添加用户
          </button>
        </div>
        <form v-else class="user-form" @submit.prevent="addUser">
          <label class="field">
            <span>新增用户</span>
            <input
              v-model.trim="userDraft"
              type="text"
              maxlength="40"
              autocomplete="username"
              autofocus
            />
          </label>
          <button class="primary-action" type="submit" :disabled="!userDraft">
            添加
          </button>
          <button class="text-button" type="button" @click="closeUserForm">
            收起
          </button>
        </form>
        <div v-if="users.length" class="user-list">
          <article v-for="user in users" :key="user" class="user-row">
            <input
              v-if="editingUser === user"
              v-model.trim="editUserDraft"
              class="user-edit-input"
              type="text"
              maxlength="40"
              @keydown.enter.prevent="saveUserName(user)"
              @keydown.esc.prevent="cancelEditUser"
            />
            <button
              v-else
              class="user-main"
              type="button"
              :class="{ selected: currentUser === user }"
              @click="switchUser(user)"
            >
              {{ user }}
            </button>
            <div class="user-actions">
              <button
                v-if="editingUser === user"
                class="text-button"
                type="button"
                :disabled="!editUserDraft"
                @click="saveUserName(user)"
              >
                保存
              </button>
              <button v-else class="text-button" type="button" @click="startEditUser(user)">
                改名
              </button>
              <button class="text-button danger" type="button" @click="deleteUser(user)">
                删除
              </button>
            </div>
          </article>
        </div>
        <div v-else class="empty-state compact-empty">
          <p>还没有用户</p>
        </div>
      </section>

      <section v-else-if="view === 'add'" class="content form-view" @click.stop>
        <label class="field">
          <span>任务</span>
          <input v-model.trim="draft.title" type="text" maxlength="80" autofocus />
        </label>
        <label class="check-field">
          <input v-model="draft.isUrgent" type="checkbox" />
          <span>紧急</span>
        </label>

        <div class="milestone-editor">
          <div v-if="draft.milestones.length" class="milestone-list">
            <div v-for="(ms, index) in draft.milestones" :key="index" class="milestone-row draft-row">
              <div class="milestone-main">
                <span class="milestone-title">{{ ms.title }}</span>
                <span class="milestone-meta">
                  <span v-if="ms.plannedAt">计划 {{ formatDeadline(ms.plannedAt) }}</span>
                </span>
              </div>
              <div class="milestone-actions">
                <button class="text-button" type="button" @click="removeDraftMilestone(index)">移除</button>
              </div>
            </div>
          </div>
          <button
            v-if="!draft.milestoneFormOpen"
            class="text-button"
            type="button"
            @click="draft.milestoneFormOpen = true"
          >
            添加节点
          </button>
          <form v-else class="milestone-form" @submit.prevent="addDraftMilestone">
            <input v-model.trim="draft.milestoneDraftTitle" type="text" maxlength="40" placeholder="节点名称" />
            <input
              v-model="draft.milestoneDraftPlannedAt"
              type="datetime-local"
              @focus="fillDefaultPlannedTime(draft, 'milestoneDraftPlannedAt')"
            />
            <div class="milestone-form-actions">
              <button class="text-button" type="submit" :disabled="!draft.milestoneDraftTitle">添加</button>
              <button class="text-button" type="button" @click="draft.milestoneFormOpen = false">收起</button>
            </div>
          </form>
        </div>

        <button class="primary-action" type="button" :disabled="!draft.title" @click="createTask">
          添加任务
        </button>
      </section>

      <section v-else-if="view === 'history'" class="content history-view" @click.stop>
        <div v-if="archivedTasks.length" class="history-list">
          <article
            v-for="task in archivedTasks"
            :key="task.id"
            class="history-item"
          >
            <button class="history-main" type="button" @click="openTask(task)">
              <span>{{ task.title }}</span>
              <small>完成 {{ formatTime(task.completed_at) }}</small>
            </button>
            <button class="text-button" type="button" @click="undoCompleteTask(task.id)">
              撤销完成
            </button>
          </article>
        </div>
        <div v-else class="empty-state">
          <p>还没有历史任务</p>
        </div>
      </section>

      <section v-else-if="view === 'detail' && selectedTask" class="content detail-view" @click.stop>
        <div v-if="selectedTask.archived_at" class="detail-summary">
          <strong>{{ selectedTask.title }}</strong>
          <span>已归档</span>
          <span v-if="selectedTask.deadline_at">截止：{{ formatDeadline(selectedTask.deadline_at) }}</span>
          <span v-if="selectedTask.is_urgent">紧急</span>
        </div>
        <div v-if="!selectedTask.archived_at" class="detail-actions">
          <label class="field compact">
            <span>任务内容</span>
            <input v-model.trim="editDraft.title" type="text" maxlength="80" />
          </label>
          <label class="check-field">
            <input v-model="editDraft.isUrgent" type="checkbox" />
            <span>紧急</span>
          </label>
          <button class="text-button" type="button" :disabled="!editDraft.title" @click="saveTaskChanges">保存变更</button>

          <div class="detail-section milestone-section">
            <h2>节点</h2>
            <div v-if="milestones.length" class="milestone-list">
              <div
                v-for="milestone in milestones"
                :key="milestone.id"
                class="milestone-row"
                :class="{ editing: editingMilestoneId === milestone.id }"
              >
                <button
                  class="milestone-check"
                  type="button"
                  :class="{ done: milestone.completed_at }"
                  :aria-label="`完成节点 ${milestone.title}`"
                  @click="completeMilestone(milestone)"
                ></button>
                <template v-if="editingMilestoneId === milestone.id">
                  <div class="milestone-edit-fields">
                    <input v-model.trim="milestoneEditDraft.title" type="text" maxlength="40" placeholder="节点名称" />
                    <input v-model="milestoneEditDraft.plannedAt" type="datetime-local" />
                  </div>
                  <div class="milestone-actions">
                    <button class="text-button" type="button" :disabled="!milestoneEditDraft.title" @click="saveMilestoneEdit(milestone)">
                      保存
                    </button>
                    <button class="text-button" type="button" @click="cancelMilestoneEdit">
                      取消
                    </button>
                  </div>
                </template>
                <template v-else>
                  <div class="milestone-main">
                    <span class="milestone-title" :class="{ done: milestone.completed_at }">{{ milestone.title }}</span>
                    <span class="milestone-meta">
                      <span v-if="milestone.planned_at">计划 {{ formatDeadline(milestone.planned_at) }}</span>
                      <span v-if="milestone.completed_at">完成 {{ formatTime(milestone.completed_at) }}</span>
                      <span v-else-if="isMilestoneOverdue(milestone.planned_at)" class="overdue-chip">已延迟</span>
                    </span>
                  </div>
                  <div class="milestone-actions">
                    <button v-if="milestone.completed_at" class="text-button" type="button" @click="undoCompleteMilestone(milestone)">
                      撤销
                    </button>
                    <button v-else class="text-button" type="button" @click="startMilestoneEdit(milestone)">
                      编辑
                    </button>
                    <button class="text-button danger" type="button" @click="deleteMilestone(milestone)">
                      删除
                    </button>
                  </div>
                </template>
              </div>
            </div>
            <button
              v-if="!milestoneFormOpen"
              class="text-button"
              type="button"
              @click="openMilestoneForm"
            >
              添加节点
            </button>
            <form v-else class="milestone-form" @submit.prevent="addMilestone">
              <input v-model.trim="milestoneDraft.title" type="text" maxlength="40" placeholder="节点名称" />
              <input
                v-model="milestoneDraft.plannedAt"
                type="datetime-local"
                @focus="fillDefaultPlannedTime(milestoneDraft, 'plannedAt')"
              />
              <div class="milestone-form-actions">
                <button class="text-button" type="submit" :disabled="!milestoneDraft.title">添加</button>
                <button class="text-button" type="button" @click="closeMilestoneForm">收起</button>
              </div>
            </form>
          </div>

          <div class="detail-section progress-section">
            <label class="field compact progress-field">
              <span>进度记录</span>
              <textarea
                v-model.trim="progressDraft"
                rows="2"
                maxlength="240"
                placeholder="记录当前进展、阻碍或下一步安排"
              ></textarea>
            </label>
            <button class="text-button progress-submit" type="button" :disabled="!progressDraft" @click="saveTaskProgress">添加进度</button>
          </div>
        </div>
        <div class="event-list">
          <h2>生命周期</h2>
          <div v-for="event in taskEvents" :key="event.id" class="event-row">
            <time>{{ formatTime(event.created_at) }}</time>
            <span>{{ eventText(event) }}</span>
            <button
              v-if="event.event_type === 'progress_updated'"
              class="text-button danger event-delete"
              type="button"
              @click="deleteTaskProgress(event)"
            >
              删除
            </button>
          </div>
        </div>
      </section>

      <section v-else-if="view === 'about'" class="content about-view" @click.stop>
        <dl>
          <div><dt>产品名称</dt><dd>{{ productFullName }}</dd></div>
          <div><dt>当前版本</dt><dd>{{ versionLabel }}</dd></div>
          <div><dt>开发者</dt><dd>miczhang（个人开发者）</dd></div>
          <div><dt>数据说明</dt><dd>便签数据默认仅保存在本机，不上传至服务器</dd></div>
          <div><dt>源码仓库</dt><dd><a href="#" rel="noreferrer" @click.prevent="openExternal(repositoryUrl)">GitHub 开源仓库</a></dd></div>
          <div><dt>隐私政策</dt><dd><a href="#" rel="noreferrer" @click.prevent="openExternal(privacyPolicyUrl)">查看隐私政策</a></dd></div>
          <div><dt>联系方式</dt><dd>miczhang007@qq.com</dd></div>
        </dl>
      </section>

      <footer class="note-footer">
        <span v-if="currentUser">{{ currentUser }} · {{ activeTasks.length }} items</span>
        <span class="brand-mark">{{ productName }}</span>
      </footer>
    </section>
  </main>
  <Teleport to="body">
    <div v-if="confirmation" class="confirm-backdrop" @click.self="closeConfirmation">
      <section class="confirm-dialog" role="alertdialog" aria-modal="true" :aria-labelledby="confirmation.titleId">
        <h2 :id="confirmation.titleId">{{ confirmation.title }}</h2>
        <p>{{ confirmation.message }}</p>
        <div class="confirm-actions">
          <button class="text-button" type="button" @click="closeConfirmation">取消</button>
          <button class="text-button danger confirm-button" type="button" @click="confirmAction">确认删除</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

const repositoryUrl = "https://github.com/miczhang007/DSN";
const privacyPolicyUrl = "https://github.com/miczhang007/DSN/blob/main/PRIVACY.md";
const productName = "桌面便签";
const productFullName = "桌面便签 / StickyNote";
const versionLabel = "v1.1.0 - 2026-08-18 13:39";
const sizeOptions = [
  { label: "小", value: "small" },
  { label: "中", value: "medium" },
  { label: "大", value: "large" },
];
const themeOptions = [
  { label: "黄色", value: "yellow" },
  { label: "蓝色", value: "blue" },
  { label: "绿色", value: "green" },
  { label: "粉红", value: "pink" },
  { label: "白色", value: "white" },
];
const positionOptions = [
  { label: "居中", value: "center" },
  { label: "右上", value: "top-right" },
  { label: "右下", value: "bottom-right" },
  { label: "左上", value: "top-left" },
  { label: "左下", value: "bottom-left" },
];

const view = ref("home");
const menuOpen = ref(false);
const currentUser = ref("");
const users = ref([]);
const userDraft = ref("");
const userFormOpen = ref(false);
const editingUser = ref("");
const editUserDraft = ref("");
const noteSize = ref("medium");
const noteTheme = ref("yellow");
const notePosition = ref("top-right");
const autoStartEnabled = ref(false);
const minimalModeEnabled = ref(false);
const activeTasks = ref([]);
const archivedTasks = ref([]);
const selectedTask = ref(null);
const taskEvents = ref([]);
const milestones = ref([]);
const milestoneDraft = reactive({ title: "", plannedAt: "" });
const editingMilestoneId = ref(null);
const milestoneEditDraft = reactive({ title: "", plannedAt: "" });
const draft = reactive({
  title: "",
  isUrgent: false,
  milestones: [],
  milestoneDraftTitle: "",
  milestoneDraftPlannedAt: "",
  milestoneFormOpen: false,
});
const editDraft = reactive({ title: "", isUrgent: false });
const milestoneFormOpen = ref(false);
const progressDraft = ref("");
const confirmation = ref(null);

const viewTitle = computed(() => {
  const titles = {
    home: "Today",
    users: "",
    add: "New",
    history: "History",
    detail: "Detail",
    about: "",
  };
  return titles[view.value] || "";
});

const shouldExitFromUserManager = computed(() =>
  view.value === "users" && !users.value.length && !userFormOpen.value,
);

const backButtonLabel = computed(() =>
  shouldExitFromUserManager.value ? "退出" : "返回",
);

onMounted(async () => {
  currentUser.value = localStorage.getItem("current-user") || "";
  users.value = loadUsers();
  if (currentUser.value && !users.value.includes(currentUser.value)) {
    users.value.unshift(currentUser.value);
    saveUsers();
  }
  noteSize.value = localStorage.getItem("note-size") || "medium";
  noteTheme.value = localStorage.getItem("note-theme") || "yellow";
  notePosition.value = localStorage.getItem("note-position") || "top-right";
  minimalModeEnabled.value = localStorage.getItem("minimal-mode") === "true";
  window.addEventListener("keydown", handleKeydown);

  if (currentUser.value) {
    await refreshActiveTasks();
  }

  requestAnimationFrame(() => {
    const layoutUpdates = [
      invoke("set_note_size", { size: noteSize.value }),
      invoke("set_note_position", { position: notePosition.value }),
    ];
    Promise.allSettled([
      ...layoutUpdates,
      refreshAutoStartState(),
      invoke("set_minimal_mode", { enabled: minimalModeEnabled.value }),
    ]);
  });
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}

function closeMenu() {
  menuOpen.value = false;
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    menuOpen.value = false;
  }
}

function goHome() {
  view.value = "home";
  selectedTask.value = null;
  taskEvents.value = [];
  milestones.value = [];
  if (currentUser.value) {
    refreshActiveTasks();
  }
}

async function handleBack() {
  if (shouldExitFromUserManager.value) {
    await exitApp();
    return;
  }
  goHome();
}

function openAdd() {
  if (!currentUser.value) {
    openUserManager();
    return;
  }
  menuOpen.value = false;
  view.value = "add";
}

async function openHistory() {
  if (!currentUser.value) {
    openUserManager();
    return;
  }
  menuOpen.value = false;
  view.value = "history";
  archivedTasks.value = await invoke("list_archived_tasks", { owner: currentUser.value });
}

function openUserManager() {
  menuOpen.value = false;
  userDraft.value = "";
  userFormOpen.value = !users.value.length;
  editingUser.value = "";
  editUserDraft.value = "";
  view.value = "users";
}

function openAbout() {
  menuOpen.value = false;
  view.value = "about";
}

async function openTask(task) {
  if (!currentUser.value) {
    openUserManager();
    return;
  }
  menuOpen.value = false;
  selectedTask.value = task;
  editDraft.title = task.title;
  editDraft.isUrgent = Boolean(task.is_urgent);
  progressDraft.value = "";
  taskEvents.value = await invoke("get_task_events", {
    owner: currentUser.value,
    taskId: task.id,
  });
  milestones.value = await invoke("list_milestones", {
    owner: currentUser.value,
    taskId: task.id,
  });
  view.value = "detail";
}

async function refreshActiveTasks() {
  if (!currentUser.value) {
    activeTasks.value = [];
    return;
  }
  activeTasks.value = await invoke("list_active_tasks", { owner: currentUser.value });
}

async function addUser() {
  const nextUser = normalizeUserName(userDraft.value);
  if (!nextUser || users.value.includes(nextUser)) return;
  users.value.push(nextUser);
  saveUsers();
  userDraft.value = "";
  userFormOpen.value = false;
  await switchUser(nextUser);
}

function openUserForm() {
  userFormOpen.value = true;
}

function closeUserForm() {
  userDraft.value = "";
  userFormOpen.value = false;
}

async function switchUser(user) {
  currentUser.value = user;
  localStorage.setItem("current-user", user);
  selectedTask.value = null;
  taskEvents.value = [];
  milestones.value = [];
  archivedTasks.value = [];
  editingUser.value = "";
  view.value = "home";
  await refreshActiveTasks();
}

function startEditUser(user) {
  editingUser.value = user;
  editUserDraft.value = user;
}

function cancelEditUser() {
  editingUser.value = "";
  editUserDraft.value = "";
}

async function saveUserName(oldUser) {
  const nextUser = normalizeUserName(editUserDraft.value);
  if (!nextUser) return;
  if (nextUser !== oldUser && users.value.includes(nextUser)) return;

  await invoke("rename_user_data", { oldOwner: oldUser, newOwner: nextUser });
  users.value = users.value.map((user) => (user === oldUser ? nextUser : user));
  saveUsers();
  if (currentUser.value === oldUser) {
    currentUser.value = nextUser;
    localStorage.setItem("current-user", nextUser);
  }
  cancelEditUser();
  await refreshActiveTasks();
}

async function deleteUser(user) {
  openConfirmation(
    "删除用户",
    `确定删除用户“${user}”吗？删除后该用户的待办、历史任务和生命周期记录都将被永久删除，不能恢复。`,
    () => removeUser(user),
  );
}

async function removeUser(user) {
  await invoke("delete_user_data", { owner: user });
  users.value = users.value.filter((item) => item !== user);
  saveUsers();
  if (currentUser.value === user) {
    currentUser.value = users.value[0] || "";
    if (currentUser.value) {
      localStorage.setItem("current-user", currentUser.value);
      view.value = "home";
    } else {
      localStorage.removeItem("current-user");
      view.value = "users";
    }
  }
  selectedTask.value = null;
  taskEvents.value = [];
  milestones.value = [];
  archivedTasks.value = [];
  await refreshActiveTasks();
}

async function createTask() {
  if (!draft.title) return;
  const milestones = draft.milestones.map((ms) => ({
    title: ms.title,
    plannedAt: ms.plannedAt ? new Date(ms.plannedAt).toISOString() : null,
  }));
  await invoke("create_task", {
    owner: currentUser.value,
    title: draft.title,
    deadlineAt: null,
    isUrgent: draft.isUrgent,
    milestones: milestones.length ? milestones : null,
  });
  draft.title = "";
  draft.isUrgent = false;
  draft.milestones = [];
  draft.milestoneDraftTitle = "";
  draft.milestoneDraftPlannedAt = "";
  view.value = "home";
  await refreshActiveTasks();
}

function addDraftMilestone() {
  if (!draft.milestoneDraftTitle) return;
  draft.milestones.push({
    title: draft.milestoneDraftTitle,
    plannedAt: draft.milestoneDraftPlannedAt,
  });
  draft.milestoneDraftTitle = "";
  draft.milestoneDraftPlannedAt = "";
}

function removeDraftMilestone(index) {
  draft.milestones.splice(index, 1);
}

function fillDefaultPlannedTime(target, key) {
  if (target[key]) return;
  const now = new Date();
  now.setMinutes(0, 0, 0);
  target[key] = toLocalInputValue(now.toISOString());
}

async function completeTask(taskId) {
  await invoke("complete_task", { owner: currentUser.value, taskId });
  await refreshActiveTasks();
}

async function undoCompleteTask(taskId) {
  await invoke("undo_complete_task", { owner: currentUser.value, taskId });
  archivedTasks.value = await invoke("list_archived_tasks", { owner: currentUser.value });
  await refreshActiveTasks();
}

async function saveTaskChanges() {
  if (!selectedTask.value) return;
  if (!editDraft.title) return;
  await invoke("update_task", {
    owner: currentUser.value,
    taskId: selectedTask.value.id,
    title: editDraft.title,
    deadlineAt: null,
    isUrgent: editDraft.isUrgent,
  });
  const updated = await invoke("get_task", {
    owner: currentUser.value,
    taskId: selectedTask.value.id,
  });
  await openTask(updated);
}

async function reloadTaskDetail() {
  if (!selectedTask.value) return;
  const updated = await invoke("get_task", {
    owner: currentUser.value,
    taskId: selectedTask.value.id,
  });
  await openTask(updated);
}

function openMilestoneForm() {
  milestoneFormOpen.value = true;
}

function closeMilestoneForm() {
  milestoneDraft.title = "";
  milestoneDraft.plannedAt = "";
  milestoneFormOpen.value = false;
}

async function addMilestone() {
  if (!selectedTask.value || !milestoneDraft.title) return;
  await invoke("add_milestone", {
    owner: currentUser.value,
    taskId: selectedTask.value.id,
    title: milestoneDraft.title,
    plannedAt: milestoneDraft.plannedAt
      ? new Date(milestoneDraft.plannedAt).toISOString()
      : null,
  });
  milestoneDraft.title = "";
  milestoneDraft.plannedAt = "";
  milestoneFormOpen.value = false;
  await reloadTaskDetail();
}

function startMilestoneEdit(milestone) {
  editingMilestoneId.value = milestone.id;
  milestoneEditDraft.title = milestone.title;
  milestoneEditDraft.plannedAt = toLocalInputValue(milestone.planned_at);
}

function cancelMilestoneEdit() {
  editingMilestoneId.value = null;
}

async function saveMilestoneEdit(milestone) {
  if (!selectedTask.value || !milestoneEditDraft.title) return;
  await invoke("update_milestone", {
    owner: currentUser.value,
    taskId: selectedTask.value.id,
    milestoneId: milestone.id,
    title: milestoneEditDraft.title,
    plannedAt: milestoneEditDraft.plannedAt
      ? new Date(milestoneEditDraft.plannedAt).toISOString()
      : null,
  });
  editingMilestoneId.value = null;
  await reloadTaskDetail();
}

async function completeMilestone(milestone) {
  if (!selectedTask.value || milestone.completed_at) return;
  await invoke("complete_milestone", {
    owner: currentUser.value,
    taskId: selectedTask.value.id,
    milestoneId: milestone.id,
  });
  await reloadTaskDetail();
}

async function undoCompleteMilestone(milestone) {
  if (!selectedTask.value) return;
  await invoke("undo_complete_milestone", {
    owner: currentUser.value,
    taskId: selectedTask.value.id,
    milestoneId: milestone.id,
  });
  await reloadTaskDetail();
}

function deleteMilestone(milestone) {
  openConfirmation(
    "删除节点",
    `确定删除节点“${milestone.title}”吗？此操作不能恢复。`,
    () => removeMilestone(milestone),
  );
}

async function removeMilestone(milestone) {
  if (!selectedTask.value) return;
  await invoke("delete_milestone", {
    owner: currentUser.value,
    taskId: selectedTask.value.id,
    milestoneId: milestone.id,
  });
  await reloadTaskDetail();
}

function isMilestoneOverdue(plannedAt) {
  if (!plannedAt) return false;
  return new Date(plannedAt).getTime() < Date.now();
}

function nextMilestoneText(task) {
  const title = task.next_milestone_title || "未命名";
  const planned = task.next_milestone_planned_at
    ? ` · ${formatDeadline(task.next_milestone_planned_at)}`
    : "";
  return `下一节点：${title}${planned}`;
}

async function saveTaskProgress() {
  if (!selectedTask.value || !progressDraft.value) return;
  await invoke("add_task_progress", {
    owner: currentUser.value,
    taskId: selectedTask.value.id,
    progress: progressDraft.value,
  });
  const updated = await invoke("get_task", {
    owner: currentUser.value,
    taskId: selectedTask.value.id,
  });
  await openTask(updated);
}

async function deleteTaskProgress(event) {
  if (!selectedTask.value) return;
  const taskId = selectedTask.value.id;
  openConfirmation("删除进度", "确定删除这条进度记录吗？此操作不能恢复。", () =>
    removeTaskProgress(taskId, event.id),
  );
}

async function removeTaskProgress(taskId, eventId) {
  await invoke("delete_task_progress", {
    owner: currentUser.value,
    taskId,
    eventId,
  });
  const updated = await invoke("get_task", {
    owner: currentUser.value,
    taskId,
  });
  await openTask(updated);
}

function openConfirmation(title, message, action) {
  confirmation.value = { title, message, action, titleId: "confirm-dialog-title" };
}

function closeConfirmation() {
  confirmation.value = null;
}

async function confirmAction() {
  const action = confirmation.value?.action;
  closeConfirmation();
  if (action) await action();
}

async function changeNoteSize(size) {
  noteSize.value = size;
  localStorage.setItem("note-size", size);
  await invoke("set_note_size", { size });
  await invoke("set_note_position", { position: notePosition.value });
}

function changeNoteTheme(theme) {
  noteTheme.value = theme;
  localStorage.setItem("note-theme", theme);
}

async function changeNotePosition(position) {
  notePosition.value = position;
  localStorage.setItem("note-position", position);
  menuOpen.value = false;
  await invoke("set_note_position", { position });
}

async function changeAutoStart(enabled) {
  const previous = autoStartEnabled.value;
  autoStartEnabled.value = enabled;
  try {
    autoStartEnabled.value = await invoke("set_auto_start_enabled", { enabled });
  } catch (err) {
    autoStartEnabled.value = previous;
    window.alert(err || "设置开机自启动失败");
  }
}

async function changeMinimalMode(enabled) {
  const previous = minimalModeEnabled.value;
  minimalModeEnabled.value = enabled;
  try {
    minimalModeEnabled.value = await invoke("set_minimal_mode", { enabled });
    localStorage.setItem("minimal-mode", String(minimalModeEnabled.value));
  } catch (err) {
    minimalModeEnabled.value = previous;
    window.alert(err || "设置极简模式失败");
  }
}

async function refreshAutoStartState() {
  try {
    autoStartEnabled.value = await invoke("is_auto_start_enabled");
  } catch {
    autoStartEnabled.value = false;
  }
}

async function exitApp() {
  await invoke("exit_app");
}

async function openExternal(url) {
  try {
    await invoke("open_external_link", { url });
  } catch (err) {
    window.alert(err || "打开链接失败");
  }
}

function formatDeadline(value) {
  if (!value) return "无截止时间";
  const date = new Date(value);
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLocalInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function eventText(event) {
  const labels = {
    created: "创建任务",
    title_changed: `任务内容：${formatTextValue(event.before_value)} -> ${formatTextValue(event.after_value)}`,
    deadline_changed: `截止时间：${formatDeadline(event.before_value)} -> ${formatDeadline(event.after_value)}`,
    urgent_changed: `紧急标记：${formatBool(event.before_value)} -> ${formatBool(event.after_value)}`,
    progress_updated: formatTextValue(event.after_value),
    milestone_created: `新增节点：${formatTextValue(event.after_value)}`,
    milestone_renamed: `节点改名：${formatTextValue(event.before_value)} -> ${formatTextValue(event.after_value)}`,
    milestone_planned_changed: `节点计划时间：${formatDeadline(event.before_value)} -> ${formatDeadline(event.after_value)}`,
    milestone_deleted: `删除节点：${formatTextValue(event.before_value)}`,
    completed: "完成任务",
    archived: "归档任务",
    completion_undone: "撤销完成",
  };
  return labels[event.event_type] || event.event_type;
}

function formatBool(value) {
  return value === "true" || value === "1" ? "是" : "否";
}

function formatTextValue(value) {
  if (!value) return "无";
  return value;
}

function loadUsers() {
  try {
    const savedUsers = JSON.parse(localStorage.getItem("users") || "[]");
    return Array.isArray(savedUsers)
      ? savedUsers.map(normalizeUserName).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function saveUsers() {
  localStorage.setItem("users", JSON.stringify(users.value));
}

function normalizeUserName(value) {
  return String(value || "").trim();
}
</script>




