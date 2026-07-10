<template>
  <main class="app-shell" :class="[`size-${noteSize}`, `theme-${noteTheme}`]">
    <section class="note" :class="{ 'is-subview': view !== 'home' }" @click="closeMenu">
      <div class="pin-shadow"></div>

      <header class="note-header">
        <button
          v-if="view !== 'home'"
          class="text-button"
          type="button"
          @click.stop="goHome"
        >
          返回
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
              <span v-if="task.deadline_at || task.is_urgent" class="task-meta">
                <span v-if="task.deadline_at">{{ formatDeadline(task.deadline_at) }}</span>
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
        <label class="field">
          <span>截止时间</span>
          <input v-model="draft.deadline" type="datetime-local" />
        </label>
        <label class="check-field">
          <input v-model="draft.isUrgent" type="checkbox" />
          <span>紧急</span>
        </label>
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
        <div class="detail-summary">
          <strong>{{ selectedTask.title }}</strong>
          <span>{{ selectedTask.archived_at ? "已归档" : "待办" }}</span>
          <span>截止：{{ formatDeadline(selectedTask.deadline_at) }}</span>
          <span>紧急：{{ selectedTask.is_urgent ? "是" : "否" }}</span>
        </div>
        <div v-if="!selectedTask.archived_at" class="detail-actions">
          <label class="field compact">
            <span>调整截止时间</span>
            <input v-model="editDraft.deadline" type="datetime-local" />
          </label>
          <label class="check-field">
            <input v-model="editDraft.isUrgent" type="checkbox" />
            <span>紧急</span>
          </label>
          <button class="text-button" type="button" @click="saveTaskChanges">保存变更</button>
        </div>
        <div class="event-list">
          <h2>生命周期</h2>
          <p v-for="event in taskEvents" :key="event.id">
            <time>{{ formatTime(event.created_at) }}</time>
            <span>{{ eventText(event) }}</span>
          </p>
        </div>
      </section>

      <section v-else-if="view === 'about'" class="content about-view" @click.stop>
        <dl>
          <div><dt>产品名称</dt><dd>{{ productFullName }}</dd></div>
          <div><dt>当前版本</dt><dd>{{ versionLabel }}</dd></div>
          <div><dt>收费方式</dt><dd>免费使用</dd></div>
          <div><dt>开发者</dt><dd>南京欧星网路技术有限公司</dd></div>
          <div><dt>源码仓库</dt><dd>{{ repositoryUrl }}</dd></div>
          <div><dt>联系方式</dt><dd>miczhang007@qq.com</dd></div>
        </dl>
      </section>

      <footer class="note-footer">
        <span v-if="currentUser">{{ currentUser }} · {{ activeTasks.length }} items</span>
        <span class="brand-mark">{{ productName }}</span>
      </footer>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

const repositoryUrl = "https://github.com/miczhang007/DSN.git";
const productName = "桌面便签-单机版";
const productFullName = "桌面便签-单机版 / StickyNote";
const versionLabel = "v1.0 - 2026-07-10 18:00";
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
const activeTasks = ref([]);
const archivedTasks = ref([]);
const selectedTask = ref(null);
const taskEvents = ref([]);
const draft = reactive({ title: "", deadline: "", isUrgent: false });
const editDraft = reactive({ deadline: "", isUrgent: false });

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
  window.addEventListener("keydown", handleKeydown);

  if (currentUser.value) {
    await refreshActiveTasks();
  } else {
    view.value = "users";
  }

  requestAnimationFrame(() => {
    const layoutUpdates = [
      invoke("set_note_size", { size: noteSize.value }),
      invoke("set_note_position", { position: notePosition.value }),
    ];
    Promise.allSettled([...layoutUpdates, refreshAutoStartState()]);
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
  if (!currentUser.value) {
    view.value = "users";
    return;
  }
  view.value = "home";
  selectedTask.value = null;
  taskEvents.value = [];
  refreshActiveTasks();
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
  editDraft.deadline = toLocalInputValue(task.deadline_at);
  editDraft.isUrgent = Boolean(task.is_urgent);
  taskEvents.value = await invoke("get_task_events", {
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
  const confirmed = window.confirm(
    `确定删除用户“${user}”吗？\n\n删除后该用户的待办、历史任务和生命周期记录都将被永久删除，不能恢复。`
  );
  if (!confirmed) return;

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
  archivedTasks.value = [];
  await refreshActiveTasks();
}

async function createTask() {
  if (!draft.title) return;
  await invoke("create_task", {
    owner: currentUser.value,
    title: draft.title,
    deadlineAt: draft.deadline ? new Date(draft.deadline).toISOString() : null,
    isUrgent: draft.isUrgent,
  });
  draft.title = "";
  draft.deadline = "";
  draft.isUrgent = false;
  view.value = "home";
  await refreshActiveTasks();
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
  const deadlineAt = editDraft.deadline ? new Date(editDraft.deadline).toISOString() : null;
  await invoke("update_task", {
    owner: currentUser.value,
    taskId: selectedTask.value.id,
    deadlineAt,
    isUrgent: editDraft.isUrgent,
  });
  const updated = await invoke("get_task", {
    owner: currentUser.value,
    taskId: selectedTask.value.id,
  });
  await openTask(updated);
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
    deadline_changed: `截止时间：${formatEventValue(event.before_value)} -> ${formatEventValue(event.after_value)}`,
    urgent_changed: `紧急标记：${formatBool(event.before_value)} -> ${formatBool(event.after_value)}`,
    completed: "完成任务",
    archived: "归档任务",
    completion_undone: "撤销完成",
  };
  return labels[event.event_type] || event.event_type;
}

function formatBool(value) {
  return value === "true" || value === "1" ? "是" : "否";
}

function formatEventValue(value) {
  if (!value) return "无";
  if (value === "true" || value === "false") return formatBool(value);
  return formatDeadline(value);
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




