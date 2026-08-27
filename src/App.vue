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
          :class="{ 'quiet-view-title': ['home', 'history', 'recurring-settings', 'recurring-setting-detail'].includes(view) }"
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
          <button type="button" @click="openRecurringSettings">周期任务规则</button>
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
        <div v-if="activeTasks.length" ref="taskListEl" class="task-list" role="list">
          <article
            v-for="(task, index) in activeTasks"
            :key="task.id"
            class="task-row"
            :class="{ dragging: isDragging && dragIndex === index }"
            role="listitem"
          >
            <button
              class="complete-button"
              type="button"
              :aria-label="`完成 ${task.title}`"
              @click.stop="confirmArchiveTask(task.id)"
            ></button>
            <button
              class="task-main"
              type="button"
              @mousedown.prevent="startRowDrag($event, index)"
              @click.stop="handleTaskMainClick(task)"
            >
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
        <div class="task-type-toggles">
          <label class="check-field recurring-toggle">
            <input v-model="draft.isRecurring" type="checkbox" />
            <span>周期任务</span>
          </label>
          <label v-if="!draft.isRecurring" class="check-field">
            <input v-model="draft.isUrgent" type="checkbox" />
            <span>紧急</span>
          </label>
        </div>
        <template v-if="draft.isRecurring">
          <label class="field compact"><span>时间范围</span><select v-model="draft.dateRangeType"><option value="long">长期</option><option value="range">指定日期</option></select></label>
          <label class="field compact"><span>开始日期</span><input v-model="draft.startDate" type="date" /></label>
          <label v-if="draft.dateRangeType === 'range'" class="field compact"><span>结束日期</span><input v-model="draft.endDate" type="date" /></label>
          <label class="field compact"><span>重复频率</span><select v-model="draft.frequencyType"><option value="daily">按日</option><option value="weekly">按周</option><option value="monthly">按月</option></select></label>
          <div v-if="draft.frequencyType === 'daily'" class="weekday-picker"><label v-for="day in weekdayOptions" :key="day.value"><input v-model="draft.weekdays" type="checkbox" :value="day.value" />{{ day.label }}</label></div>
          <label v-if="draft.frequencyType !== 'daily'" class="field compact"><span>重复次数</span><input v-model.number="draft.repeatCount" type="number" min="1" max="31" /></label>
          <label class="field compact"><span>任务生成时间</span><input v-model="draft.generateTime" type="time" /></label>
          <p class="form-hint">周期任务会在符合规则的当天自动生成，任务名称将附带日期。</p>
        </template>

        <div v-if="!draft.isRecurring" class="milestone-editor">
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
            @click.self="expandedHistoryTaskId = ''"
          >
            <button class="history-main" type="button" @click="openTask(task)">
              <span>{{ task.title }}</span>
              <small>{{ task.is_recurring ? `${task.completed_at ? '已完成' : '未完成'} · ` : '完成 ' }}{{ formatTime(task.archived_at) }}</small>
            </button>
            <button class="icon-button history-action-toggle" type="button" aria-label="更多操作" @click="toggleHistoryActions(task.id)">
              <span class="vertical-dots" aria-hidden="true"><span></span><span></span><span></span></span>
            </button>
            <div v-if="expandedHistoryTaskId === task.id" class="history-actions" @click.stop>
              <button v-if="task.completed_at" class="text-button" type="button" @click="historyAction(task, 'undo_completion')">撤销完成</button>
              <button v-else class="text-button" type="button" @click="historyAction(task, 'mark_completed')">已完成</button>
              <button v-if="!task.completed_at && canUndoTask(task)" class="text-button" type="button" @click="historyAction(task, 'undo_archive')">撤销归档</button>
              <button class="text-button danger" type="button" @click="deleteArchivedTask(task)">删除</button>
            </div>
          </article>
        </div>
        <div v-else class="empty-state">
          <p>还没有历史任务</p>
        </div>
      </section>

      <section v-else-if="view === 'recurring-settings'" class="content recurring-settings-view" @click.stop>
        <div v-if="recurringSettings.length" class="history-list">
          <article v-for="setting in recurringSettings" :key="setting.id" class="history-item">
            <button class="history-main" type="button" @click="openRecurringSettingDetail(setting)"><span>{{ setting.title }}</span><small>{{ recurringSummary(setting) }} · {{ setting.status }}</small></button>
            <button class="icon-button history-action-toggle" type="button" aria-label="更多操作" @click="toggleHistoryActions(`setting:${setting.id}`)"><span class="vertical-dots" aria-hidden="true"><span></span><span></span><span></span></span></button>
            <div v-if="expandedHistoryTaskId === `setting:${setting.id}`" class="history-actions" @click.stop>
              <button v-if="setting.status !== '已作废'" class="text-button" type="button" @click="openRecurringSetting(setting)">编辑规则</button>
              <button v-if="setting.status === '生效中'" class="text-button danger" type="button" @click="voidRecurringSetting(setting)">作废</button>
              <button v-if="setting.status === '已作废'" class="text-button danger" type="button" @click="deleteRecurringSetting(setting)">删除</button>
            </div>
          </article>
        </div>
        <div v-else class="empty-state"><p>还没有周期任务设置</p></div>
      </section>

      <section v-else-if="view === 'recurring-setting'" class="content form-view" @click.stop>
        <label class="field"><span>任务</span><input v-model.trim="recurringDraft.title" type="text" maxlength="80" /></label>
        <label class="field compact"><span>时间范围</span><select v-model="recurringDraft.dateRangeType"><option value="long">长期</option><option value="range">指定日期</option></select></label>
        <label class="field compact"><span>开始日期</span><input v-model="recurringDraft.startDate" type="date" /></label>
        <label v-if="recurringDraft.dateRangeType === 'range'" class="field compact"><span>结束日期</span><input v-model="recurringDraft.endDate" type="date" /></label>
        <label class="field compact"><span>重复频率</span><select v-model="recurringDraft.frequencyType"><option value="daily">按日</option><option value="weekly">按周</option><option value="monthly">按月</option></select></label>
        <div v-if="recurringDraft.frequencyType === 'daily'" class="weekday-picker"><label v-for="day in weekdayOptions" :key="day.value"><input v-model="recurringDraft.weekdays" type="checkbox" :value="day.value" />{{ day.label }}</label></div>
        <label v-if="recurringDraft.frequencyType !== 'daily'" class="field compact"><span>重复次数</span><input v-model.number="recurringDraft.repeatCount" type="number" min="1" max="31" /></label>
        <label class="field compact"><span>任务生成时间</span><input v-model="recurringDraft.generateTime" type="time" /></label>
        <button class="primary-action" type="button" :disabled="!recurringDraft.title" @click="saveRecurringSetting">保存设置</button>
      </section>

      <section v-else-if="view === 'recurring-setting-detail'" class="content detail-view" @click.stop>
        <div class="detail-summary compact recurring-detail-summary"><span class="recurring-detail-title">{{ recurringDetail?.title }}</span><span>{{ recurringDetail?.status }}</span></div>
        <div class="detail-section recurring-detail-section"><h2>设置信息</h2><div class="recurring-info-list"><p><span>时间范围</span><strong>{{ recurringDetail?.date_range_type === 'range' ? `${recurringDetail?.start_date} 至 ${recurringDetail?.end_date}` : '长期' }}</strong></p><p><span>重复频率</span><strong>{{ recurringFrequencyText(recurringDetail) }}</strong></p><p><span>生成时间</span><strong>{{ recurringDetail?.generate_time }}</strong></p></div></div>
        <div class="detail-section recurring-detail-section"><h2>操作日志</h2><div v-if="recurringSettingEvents.length" class="event-list"><div v-for="event in recurringSettingEvents" :key="event.id" class="event-row"><time>{{ formatTime(event.created_at) }}</time><span>{{ recurringEventText(event.event_type) }}</span></div></div><p v-else class="section-empty">暂无操作日志</p></div>
        <div class="detail-section recurring-detail-section"><h2>相关任务 <small class="recurring-completed-count">已完成 {{ recurringCompletedCount }} 次</small></h2><div v-if="recurringSettingTasks.length" class="history-list recurring-task-list"><button v-for="task in recurringSettingTasks" :key="task.id" class="history-main" type="button" @click="openTask(task)"><span>{{ task.title }}</span><small :class="recurringTaskStatusClass(task)">{{ recurringTaskStatusText(task) }}</small></button></div><p v-else class="section-empty">暂无相关任务</p></div>
      </section>

      <section v-else-if="view === 'detail' && selectedTask" class="content detail-view" @click.stop>
        <div v-if="selectedTask.archived_at" class="detail-summary">
          <strong>{{ selectedTask.title }}</strong>
          <span>已归档</span>
          <span v-if="selectedTask.deadline_at">截止：{{ formatDeadline(selectedTask.deadline_at) }}</span>
          <span v-if="selectedTask.is_urgent">紧急</span>
          <button v-if="selectedTask.is_recurring" class="recurring-tag" type="button" @click="openRecurringSettingById(selectedTask.recurring_setting_id)">周期任务</button>
        </div>
        <div v-if="selectedTask.is_recurring && !selectedTask.archived_at" class="detail-actions">
          <label class="field compact">
            <span>任务内容</span>
            <input v-model.trim="editDraft.title" type="text" maxlength="80" />
          </label>
          <div class="detail-action-row">
            <button class="text-button" type="button" :disabled="!editDraft.title" @click="saveTaskChanges">保存变更</button>
            <button class="recurring-tag" type="button" @click="openRecurringSettingById(selectedTask.recurring_setting_id)">周期任务</button>
          </div>
          <div class="detail-section progress-section">
            <label class="field compact progress-field">
              <span>进度记录</span>
              <textarea v-model.trim="progressDraft" rows="2" maxlength="240" placeholder="记录当前进展、阻碍或下一步安排"></textarea>
            </label>
            <button class="text-button progress-submit" type="button" :disabled="!progressDraft" @click="saveTaskProgress">添加进度</button>
          </div>
        </div>
        <div v-else-if="!selectedTask.archived_at" class="detail-actions">
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
        <h2 v-if="confirmation.kind !== 'archive'" :id="confirmation.titleId">{{ confirmation.title }}</h2>
        <p v-if="confirmation.kind !== 'archive'">{{ confirmation.message }}</p>
        <label v-if="confirmation.kind === 'archive'" class="check-field confirm-check">
          <input v-model="confirmation.isCompleted" type="checkbox" />
          <span>任务已完成</span>
        </label>
        <div class="confirm-actions">
          <button class="text-button" type="button" @click="closeConfirmation">取消</button>
          <button class="text-button danger confirm-button" type="button" @click="confirmAction">{{ confirmation.actionLabel }}</button>
        </div>
      </section>
    </div>
  </Teleport>
  <Teleport to="body">
    <Transition name="toast">
      <div v-if="notice" class="app-notice" role="alert" aria-live="assertive">
        <span>{{ notice.message }}</span>
        <button type="button" class="icon-button" aria-label="关闭提示" @click="closeNotice">×</button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

const repositoryUrl = "https://github.com/miczhang007/DSN";
const privacyPolicyUrl = "https://github.com/miczhang007/DSN/blob/main/PRIVACY.md";
const productName = "桌面便签";
const productFullName = "桌面便签 / StickyNote";
const versionLabel = "v1.3.1 - 2026-08-27 16:00";
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
  isRecurring: false,
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
  milestoneFormOpen: false,
});
const weekdayOptions = [
  { label: "一", value: 0 }, { label: "二", value: 1 }, { label: "三", value: 2 },
  { label: "四", value: 3 }, { label: "五", value: 4 }, { label: "六", value: 5 }, { label: "日", value: 6 },
];
const recurringSettings = ref([]);
const recurringSettingTasks = ref([]);
const recurringSettingEvents = ref([]);
const recurringDetail = ref(null);
const recurringCompletedCount = computed(() => recurringSettingTasks.value.filter((task) => Boolean(task.completed_at)).length);
const selectedRecurringSettingId = ref("");
const recurringReturnView = ref("home");
const recurringDraft = reactive({ title: "", isUrgent: false, dateRangeType: "long", startDate: localDateInputValue(), endDate: "", frequencyType: "daily", weekdays: [], repeatCount: 1, generateTime: "06:00" });
const editDraft = reactive({ title: "", isUrgent: false });
const milestoneFormOpen = ref(false);
const progressDraft = ref("");
const confirmation = ref(null);
const notice = ref(null);
const expandedHistoryTaskId = ref("");
const detailReturnView = ref("home");
let recurringRefreshTimer = null;
let noticeTimer = null;

const viewTitle = computed(() => {
  const titles = {
    home: "Today",
    users: "",
    add: "New",
    history: "History",
    "recurring-settings": "周期任务",
    "recurring-setting": "周期设置",
    "recurring-setting-detail": "规则详情",
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
  window.addEventListener("pointerdown", closeExpandedHistoryActions, true);

  if (currentUser.value) {
    await refreshActiveTasks();
  }
  recurringRefreshTimer = window.setInterval(() => {
    if (currentUser.value) {
      refreshActiveTasks().catch(() => {});
    }
  }, 60_000);

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
  window.removeEventListener("pointerdown", closeExpandedHistoryActions, true);
  window.removeEventListener("mousemove", onRowDragMove);
  window.removeEventListener("mouseup", endRowDrag);
  if (recurringRefreshTimer) window.clearInterval(recurringRefreshTimer);
  if (noticeTimer) window.clearTimeout(noticeTimer);
});

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}

function closeMenu() {
  menuOpen.value = false;
}

function closeExpandedHistoryActions(event) {
  if (!expandedHistoryTaskId.value || event.target?.closest?.(".history-action-toggle, .history-actions")) return;
  expandedHistoryTaskId.value = "";
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    menuOpen.value = false;
  }
}

function goHome() {
  expandedHistoryTaskId.value = "";
  view.value = "home";
  selectedTask.value = null;
  taskEvents.value = [];
  milestones.value = [];
  if (currentUser.value) {
    refreshActiveTasks();
  }
}

async function handleBack() {
  expandedHistoryTaskId.value = "";
  if (shouldExitFromUserManager.value) {
    await exitApp();
    return;
  }
  if (view.value === "recurring-setting") {
    view.value = recurringReturnView.value || "home";
    if (view.value === "home") await refreshActiveTasks();
    return;
  }
  if (view.value === "recurring-setting-detail") {
    view.value = "recurring-settings";
    return;
  }
  if (view.value === "detail") {
    if (detailReturnView.value === "history") {
      view.value = "history";
      archivedTasks.value = await invoke("list_archived_tasks", { owner: currentUser.value });
    } else if (detailReturnView.value === "recurring-setting") {
      view.value = "recurring-setting";
    } else {
      await goHome();
    }
    selectedTask.value = null;
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
  expandedHistoryTaskId.value = "";
  view.value = "add";
}

async function openHistory() {
  if (!currentUser.value) {
    openUserManager();
    return;
  }
  menuOpen.value = false;
  expandedHistoryTaskId.value = "";
  view.value = "history";
  archivedTasks.value = await invoke("list_archived_tasks", { owner: currentUser.value });
}

async function openRecurringSettings() {
  if (!currentUser.value) return openUserManager();
  menuOpen.value = false;
  expandedHistoryTaskId.value = "";
  recurringSettings.value = await invoke("list_recurring_task_settings", { owner: currentUser.value });
  view.value = "recurring-settings";
}

function voidRecurringSetting(setting) {
  openConfirmation("作废周期任务设置", "作废后不可恢复，且不会再生成新的任务。确定继续吗？", async () => {
    await invoke("void_recurring_task_setting", { owner: currentUser.value, settingId: setting.id });
    expandedHistoryTaskId.value = "";
    recurringSettings.value = await invoke("list_recurring_task_settings", { owner: currentUser.value });
  }, "确认作废");
}

function deleteRecurringSetting(setting) {
  openConfirmation("删除周期任务规则", `确定删除“${setting.title}”吗？删除后不可恢复。`, async () => {
    try {
      await invoke("delete_recurring_task_setting", { owner: currentUser.value, settingId: setting.id });
      expandedHistoryTaskId.value = "";
      recurringSettings.value = await invoke("list_recurring_task_settings", { owner: currentUser.value });
    } catch (err) {
      showNotice(err, "删除周期任务规则失败");
    }
  });
}

async function openRecurringSetting(setting = null) {
  expandedHistoryTaskId.value = "";
  const source = setting || { id: "", title: draft.title, is_urgent: draft.isUrgent, date_range_type: draft.dateRangeType, start_date: draft.startDate, end_date: draft.endDate, frequency_type: draft.frequencyType, weekdays: draft.weekdays.join(","), repeat_count: draft.repeatCount, generate_time: draft.generateTime };
  selectedRecurringSettingId.value = source.id;
  recurringReturnView.value = view.value;
  recurringDraft.title = source.title;
  recurringDraft.isUrgent = false;
  recurringDraft.dateRangeType = source.date_range_type;
  recurringDraft.startDate = source.start_date;
  recurringDraft.endDate = source.end_date || "";
  recurringDraft.frequencyType = source.frequency_type;
  recurringDraft.weekdays = String(source.weekdays || "").split(",").filter(Boolean).map(Number);
  recurringDraft.repeatCount = source.repeat_count || 1;
  recurringDraft.generateTime = source.generate_time || "06:00";
  recurringSettingTasks.value = source.id ? await invoke("list_recurring_setting_tasks", { owner: currentUser.value, settingId: source.id }) : [];
  view.value = "recurring-setting";
}

async function openRecurringSettingDetail(setting) {
  expandedHistoryTaskId.value = "";
  recurringDetail.value = setting;
  recurringSettingTasks.value = await invoke("list_recurring_setting_tasks", { owner: currentUser.value, settingId: setting.id });
  recurringSettingEvents.value = await invoke("list_recurring_setting_events", { owner: currentUser.value, settingId: setting.id });
  view.value = "recurring-setting-detail";
}

async function openRecurringSettingById(id) {
  const latestSettings = await invoke("list_recurring_task_settings", { owner: currentUser.value });
  recurringSettings.value = latestSettings;
  const setting = latestSettings.find((item) => item.id === id);
  if (setting) await openRecurringSetting(setting);
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

async function saveRecurringSetting() {
  const payload = { owner: currentUser.value, title: recurringDraft.title, isUrgent: false, dateRangeType: recurringDraft.dateRangeType, startDate: recurringDraft.startDate, endDate: recurringDraft.dateRangeType === "range" ? recurringDraft.endDate || null : null, frequencyType: recurringDraft.frequencyType, weekdays: recurringDraft.weekdays, repeatCount: recurringDraft.repeatCount, generateTime: recurringDraft.generateTime };
  if (selectedRecurringSettingId.value) {
    if (recurringDraft.status === "已作废") return;
    const updated = await invoke("update_recurring_task_setting", { ...payload, settingId: selectedRecurringSettingId.value });
    recurringSettings.value = recurringSettings.value.map((setting) => setting.id === updated.id ? updated : setting);
    if (recurringDetail.value?.id === updated.id) recurringDetail.value = updated;
  } else {
    await invoke("create_recurring_task_setting", payload);
  }
  if (recurringReturnView.value === "recurring-settings") await openRecurringSettings();
  else { view.value = recurringReturnView.value || "home"; await refreshActiveTasks(); }
}

function openUserManager() {
  menuOpen.value = false;
  expandedHistoryTaskId.value = "";
  userDraft.value = "";
  userFormOpen.value = !users.value.length;
  editingUser.value = "";
  editUserDraft.value = "";
  view.value = "users";
}

function openAbout() {
  menuOpen.value = false;
  expandedHistoryTaskId.value = "";
  view.value = "about";
}

async function openTask(task) {
  if (!currentUser.value) {
    openUserManager();
    return;
  }
  menuOpen.value = false;
  expandedHistoryTaskId.value = "";
  detailReturnView.value = view.value === "history" ? "history" : view.value === "recurring-setting" ? "recurring-setting" : "home";
  selectedTask.value = task;
  editDraft.title = task.title;
  editDraft.isUrgent = Boolean(task.is_urgent);
  progressDraft.value = "";
  taskEvents.value = await invoke("get_task_events", {
    owner: currentUser.value,
    taskId: task.id,
  });
  milestones.value = task.is_recurring
    ? []
    : await invoke("list_milestones", {
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

const taskListEl = ref(null);
const isDragging = ref(false);
const dragIndex = ref(-1);
const dragMoved = ref(false);
const dragStartY = ref(0);
let suppressClick = false;

function startRowDrag(event, index) {
  if (event.button !== 0) return;
  suppressClick = false;
  dragMoved.value = false;
  dragStartY.value = event.clientY;
  isDragging.value = true;
  dragIndex.value = index;
  window.addEventListener("mousemove", onRowDragMove);
  window.addEventListener("mouseup", endRowDrag);
}

function onRowDragMove(event) {
  if (!isDragging.value) return;
  if (!dragMoved.value && Math.abs(event.clientY - dragStartY.value) < 5) return;
  dragMoved.value = true;
  const rows = taskListEl.value?.querySelectorAll(".task-row");
  if (!rows) return;
  let target = -1;
  for (let i = 0; i < rows.length; i++) {
    const rect = rows[i].getBoundingClientRect();
    if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
      target = i;
      break;
    }
  }
  if (target !== -1 && target !== dragIndex.value) {
    const list = [...activeTasks.value];
    const [moved] = list.splice(dragIndex.value, 1);
    list.splice(target, 0, moved);
    activeTasks.value = list;
    dragIndex.value = target;
  }
}

function endRowDrag() {
  if (!isDragging.value) return;
  isDragging.value = false;
  window.removeEventListener("mousemove", onRowDragMove);
  window.removeEventListener("mouseup", endRowDrag);
  if (dragMoved.value) {
    suppressClick = true;
    persistOrder();
  }
  dragIndex.value = -1;
  dragMoved.value = false;
}

async function handleTaskMainClick(task) {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  await openTask(task);
}

async function persistOrder() {
  if (!currentUser.value) return;
  try {
    await invoke("reorder_tasks", {
      owner: currentUser.value,
      orderedIds: activeTasks.value.map((task) => task.id),
    });
  } catch (err) {
    showNotice(err, "保存排序失败");
    await refreshActiveTasks();
  }
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
  draft.isRecurring = false;
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

async function toggleArchivedTaskCompletion(task) {
  if (task.completed_at) {
    await undoCompleteTask(task.id);
  } else {
    await invoke("complete_task", { owner: currentUser.value, taskId: task.id });
    archivedTasks.value = await invoke("list_archived_tasks", { owner: currentUser.value });
  }
}

function toggleHistoryActions(taskId) {
  expandedHistoryTaskId.value = expandedHistoryTaskId.value === taskId ? "" : taskId;
}

async function historyAction(task, action) {
  try {
    await invoke("restore_archived_task", { owner: currentUser.value, taskId: task.id, action });
    archivedTasks.value = await invoke("list_archived_tasks", { owner: currentUser.value });
    await refreshActiveTasks();
    expandedHistoryTaskId.value = "";
  } catch (err) {
    showNotice(err, "历史任务操作失败");
  }
}

function canUndoTask(task) {
  return !task.is_recurring || String(task.occurrence_date || "").startsWith(localDateInputValue());
}

function recurringSummary(setting) {
  const frequency = { daily: "按日", weekly: "按周", monthly: "按月" }[setting.frequency_type] || "";
  return `${frequency}${setting.repeat_count > 1 ? ` · ${setting.repeat_count} 次` : ""} · ${setting.generate_time} 生成`;
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

function openConfirmation(title, message, action, actionLabel = "确认删除") {
  expandedHistoryTaskId.value = "";
  confirmation.value = { title, message, action, actionLabel, titleId: "confirm-dialog-title", kind: "delete", isCompleted: false };
}

function confirmArchiveTask(taskId) {
  const state = { isCompleted: false };
  confirmation.value = { title: "归档任务", message: "是否已完成此任务？勾选后将同时记录完成和归档；不勾选则只记录归档。", actionLabel: "提交", titleId: "confirm-dialog-title", kind: "archive", isCompleted: false, state, action: async () => {
    await invoke("archive_task", { owner: currentUser.value, taskId, isCompleted: state.isCompleted });
    await refreshActiveTasks();
  } };
}

function deleteArchivedTask(task) {
  openConfirmation("删除任务", `确定删除“${task.title}”吗？删除后将从历史和任务列表中隐藏。`, async () => {
    await invoke("delete_task", { owner: currentUser.value, taskId: task.id });
    view.value = "history";
    archivedTasks.value = await invoke("list_archived_tasks", { owner: currentUser.value });
  });
}

function closeConfirmation() {
  confirmation.value = null;
}

async function confirmAction() {
  const current = confirmation.value;
  if (current?.kind === "archive" && current.state) current.state.isCompleted = current.isCompleted;
  const action = current?.action;
  closeConfirmation();
  if (!action) return;
  try {
    await action();
  } catch (err) {
    showNotice(err, "操作失败，请稍后重试");
  }
}

function messageFromError(error, fallback) {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function showNotice(error, fallback) {
  notice.value = { message: messageFromError(error, fallback) };
  if (noticeTimer) window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(closeNotice, 5000);
}

function closeNotice() {
  notice.value = null;
  if (noticeTimer) {
    window.clearTimeout(noticeTimer);
    noticeTimer = null;
  }
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
    showNotice(err, "设置开机自启动失败");
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
    showNotice(err, "设置极简模式失败");
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
    showNotice(err, "打开链接失败");
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

function localDateInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
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
