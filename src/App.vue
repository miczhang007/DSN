<template>
  <main class="app-shell" :class="[`size-${noteSize}`, `theme-${noteTheme}`, `font-${noteFont}`]">
    <section
      class="note"
      :class="{ 'is-subview': view !== 'home' }"
      data-tauri-drag-region
      @click="closeMenu"
    >

      <header class="note-header" data-tauri-drag-region>
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
          :class="{ 'quiet-view-title': view !== 'home' }"
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

      <AppMenu
        :open="menuOpen"
        :note-size="noteSize"
        :note-theme="noteTheme"
        :note-font="noteFont"
        :note-signature="noteSignature"
        :auto-start-enabled="autoStartEnabled"
        @history="openHistory"
        @recurring-settings="openRecurringSettings"
        @categories="openCategoryManager"
        @about="openAbout"
        @exit="exitApp"
        @change-size="changeNoteSize"
        @change-theme="changeNoteTheme"
        @change-font="changeNoteFont"
        @change-signature="changeSignature"
        @change-auto-start="changeAutoStart"
        @minimize="minimizeWindow"
      />

      <nav v-if="view === 'home'" class="category-tabs" role="tablist" aria-label="分类">
        <button
          v-for="(category, index) in categories"
          :key="category"
          ref="categoryTabEls"
          class="category-tab"
          type="button"
          role="tab"
          :class="{ active: currentCategory === category }"
          :aria-selected="currentCategory === category"
          :data-index="index"
          @click.stop="selectCategoryTab(category)"
        >
          {{ category }}
        </button>
        <button
          class="category-tab category-tab-add"
          type="button"
          :aria-label="categories.length ? '添加分类' : '新建第一个分类'"
          @click.stop="openCategoryManager"
        >
          +
        </button>
      </nav>

      <section v-if="view === 'home'" class="content has-tabs">
        <div v-if="activeTasks.length" ref="taskListEl" class="task-list" role="list">
          <article
            v-for="(task, index) in activeTasks"
            :key="task.id"
            class="task-row"
            :class="{ dragging: isDragging && dragIndex === index, suspended: taskStatus(task) === 'suspended', completed: taskStatus(task) === 'completed' }"
            role="listitem"
          >
            <button
              class="complete-button"
              type="button"
              :class="{ done: taskStatus(task) === 'completed' }"
              :aria-label="`完成 ${task.title}`"
              @click.stop="completeTaskEntry(task)"
            ></button>
            <button
              class="task-main"
              type="button"
              @mousedown.prevent="startRowDrag($event, index)"
              @click.stop="handleTaskMainClick(task)"
            >
              <span class="task-title-line">
                <span v-if="taskStatus(task) === 'in_progress'" class="in-progress-dot" aria-hidden="true"></span>
                <span class="task-title" :class="{ done: taskStatus(task) === 'completed' }">{{ task.title }}</span>
                <span v-if="task.is_urgent" class="urgent-chip">紧急</span>
                <span v-if="task.is_recurring" class="status-chip status-recurring">周期任务</span>
              </span>
              <span
                v-if="task.next_milestone_title || task.next_milestone_planned_at || task.start_at"
                class="task-meta"
              >
                <span v-if="task.next_milestone_title || task.next_milestone_planned_at" class="next-milestone">
                  {{ nextMilestoneText(task) }}
                </span>
                <span v-if="isMilestoneOverdue(task.next_milestone_planned_at)" class="overdue-chip">已延迟</span>
                <span v-if="task.start_at && taskStatus(task) === 'not_started'" class="start-time">开始 {{ formatDeadline(task.start_at) }}</span>
              </span>
            </button>
          </article>
        </div>
        <div v-else class="empty-state">
          <p>今天还没有待办</p>
          <button class="text-button" type="button" @click.stop="openAdd">添加一个</button>
        </div>
      </section>

      <section v-else-if="view === 'categories'" class="content categories-view" @click.stop>
        <div v-if="categories.length" class="category-list">
          <article v-for="category in categories" :key="category" class="category-row">
            <input
              v-if="editingCategory === category"
              v-model.trim="editCategoryDraft"
              class="category-edit-input"
              type="text"
              maxlength="40"
              @keydown.enter.prevent="saveCategoryName(category)"
              @keydown.esc.prevent="cancelEditCategory"
            />
            <button
              v-else
              class="category-main"
              type="button"
              :class="{ selected: currentCategory === category }"
              @click="switchCategory(category)"
            >
              {{ category }}
            </button>
            <div class="category-actions">
              <button
                v-if="editingCategory === category"
                class="text-button"
                type="button"
                :disabled="!editCategoryDraft"
                @click="saveCategoryName(category)"
              >
                保存
              </button>
              <button v-else class="text-button" type="button" @click="startEditCategory(category)">
                改名
              </button>
              <button class="text-button danger" type="button" @click="deleteCategory(category)">
                删除
              </button>
            </div>
          </article>
        </div>
        <div v-else class="empty-state compact-empty">
          <p>还没有分类</p>
        </div>
        <form class="category-form category-add-row" @submit.prevent="addCategory">
          <span class="field-label">新增分类</span>
          <div class="category-add-line">
            <input
              v-model.trim="categoryDraft"
              type="text"
              maxlength="40"
              placeholder="新分类名称"
              autocomplete="off"
            />
            <button class="text-button" type="submit" :disabled="!categoryDraft">
              添加
            </button>
          </div>
        </form>
      </section>

      <section v-else-if="view === 'add'" class="content form-view" @click.stop>
        <input
          v-model.trim="draft.title"
          class="task-input"
          type="text"
          maxlength="80"
          placeholder="写点什么…"
          autofocus
        />
        <div class="task-type-toggles">
          <label class="toggle-pill recurring-toggle">
            <input v-model="draft.isRecurring" type="checkbox" />
            <span>周期任务</span>
          </label>
          <label v-if="!draft.isRecurring" class="toggle-pill">
            <input v-model="draft.isUrgent" type="checkbox" />
            <span>紧急</span>
          </label>
          <label v-if="!draft.isRecurring" class="toggle-pill">
            <input v-model="draft.isFuture" type="checkbox" @change="toggleFutureTask" />
            <span>未来任务</span>
          </label>
        </div>
        <template v-if="draft.isFuture && !draft.isRecurring">
          <label class="field compact">
            <span>任务开始执行时间</span>
            <span class="date-time-inputs">
              <input v-model="draft.startAt" type="date" />
              <input v-model="draft.startAtTime" type="time" />
            </span>
          </label>
        </template>
        <template v-if="draft.isRecurring">
          <label class="field compact"><span>时间范围</span><select v-model="draft.dateRangeType"><option value="long">长期</option><option value="range">指定日期</option></select></label>
          <label class="field compact"><span>开始日期</span><input v-model="draft.startDate" type="date" /></label>
          <label v-if="draft.dateRangeType === 'range'" class="field compact"><span>结束日期</span><input v-model="draft.endDate" type="date" /></label>
          <label class="field compact"><span>重复频率</span><select v-model="draft.frequencyType"><option value="daily">按日</option><option value="weekly">按周</option><option value="monthly">按月</option></select></label>
          <div v-if="draft.frequencyType === 'daily'" class="weekday-picker"><label v-for="day in weekdayOptions" :key="day.value"><input v-model="draft.weekdays" type="checkbox" :value="day.value" />{{ day.label }}</label></div>
          <label v-if="draft.frequencyType !== 'daily'" class="field compact"><span>重复次数</span><input v-model.number="draft.repeatCount" type="number" min="1" max="31" /></label>
          <label class="field compact"><span>任务生成时间</span><input v-model="draft.generateTime" type="time" /></label>
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
            <span class="date-time-inputs">
              <input
                v-model="draft.milestoneDraftPlannedAt"
                type="date"
                placeholder="计划日期"
              />
              <input
                v-model="draft.milestoneDraftPlannedAtTime"
                type="time"
              />
            </span>
            <div class="milestone-form-actions">
              <button class="text-button" type="submit" :disabled="!draft.milestoneDraftTitle">添加</button>
              <button class="text-button" type="button" @click="draft.milestoneFormOpen = false">收起</button>
            </div>
          </form>
        </div>

        <button class="primary-action primary-block" type="button" :disabled="!draft.title" @click="createTask">
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
              <small>{{ task.completed_at ? '已完成' : '未完成' }} · {{ formatTime(task.archived_at) }}</small>
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
        <div v-if="recurringSettings.length" class="rule-list">
          <article
            v-for="setting in recurringSettings"
            :key="setting.id"
            class="rule-row"
            :class="{ voided: setting.status === '已作废' }"
          >
            <button class="rule-main" type="button" @click="openRecurringSettingDetail(setting)">
              <span class="rule-title">{{ setting.title }}</span>
              <span class="rule-meta">{{ recurringSummary(setting) }} · {{ setting.status }}</span>
            </button>
            <div class="rule-actions">
              <button v-if="setting.status !== '已作废'" class="rule-action" type="button" @click="openRecurringSetting(setting)">编辑</button>
              <button v-if="setting.status === '生效中'" class="rule-action danger" type="button" @click="voidRecurringSetting(setting)">作废</button>
              <button v-if="setting.status === '已作废'" class="rule-action danger" type="button" @click="deleteRecurringSetting(setting)">删除</button>
            </div>
          </article>
        </div>
        <p v-else class="section-empty">还没有周期任务设置</p>
        <button class="dashed-action" type="button" @click="openRecurringSetting()">+ 新建周期任务</button>
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
          <span class="status-chip" :class="`status-${taskStatus(selectedTask)}`">{{ taskStatusText(selectedTask) }}</span>
          <span v-if="selectedTask.deadline_at">截止：{{ formatDeadline(selectedTask.deadline_at) }}</span>
          <span v-if="selectedTask.is_urgent">紧急</span>
          <button v-if="selectedTask.is_recurring" class="recurring-tag" type="button" @click="openRecurringSettingById(selectedTask.recurring_setting_id)">周期规则</button>
        </div>
        <template v-else>
          <div class="detail-summary">
            <strong>{{ selectedTask.title }}</strong>
            <div class="detail-meta-row">
              <span class="status-chip" :class="`status-${taskStatus(selectedTask)}`">{{ taskStatusText(selectedTask) }}</span>
              <span v-if="selectedTask.is_urgent" class="urgent-chip">紧急</span>
              <button v-if="selectedTask.is_recurring" class="recurring-tag" type="button" @click="openRecurringSettingById(selectedTask.recurring_setting_id)">周期规则</button>
            </div>
            <span v-if="selectedTask.start_at" class="detail-field">任务开始执行：{{ formatDeadline(selectedTask.start_at) }}</span>
            <span v-if="selectedTask.deadline_at" class="detail-field">截止：{{ formatDeadline(selectedTask.deadline_at) }}</span>
          </div>
          <div class="detail-actions-row">
            <button v-if="taskStatus(selectedTask) === 'pending' || taskStatus(selectedTask) === 'in_progress'" class="action-pill" data-icon="⏸" type="button" @click="detailAction('suspend')">挂起</button>
            <button v-if="taskStatus(selectedTask) === 'suspended'" class="action-pill" data-icon="▶" type="button" @click="detailAction('activate')">激活</button>
            <button v-if="taskStatus(selectedTask) === 'pending'" class="action-pill" data-icon="▶" type="button" @click="detailAction('start')">进行中</button>
            <button v-if="!selectedTask.completed_at" class="action-pill" data-icon="✓" type="button" @click="detailCompleteEntry">已完成</button>
            <button v-if="taskStatus(selectedTask) === 'completed'" class="action-pill" data-icon="↺" type="button" @click="detailAction('undo_complete')">撤销完成</button>
            <button class="action-pill" data-icon="▣" type="button" @click="detailAction('archive')">归档</button>
            <button class="action-pill" data-icon="✎" type="button" @click="toggleDetailEdit">{{ detailEditOpen ? '收起编辑' : '编辑' }}</button>
            <button class="action-pill" data-icon="↗" type="button" @click="progressFormOpen = !progressFormOpen">{{ progressFormOpen ? '收起进度' : '进度' }}</button>
          </div>
          <div v-if="detailEditOpen" class="detail-actions">
            <label class="field compact">
              <span>任务内容</span>
              <input v-model.trim="editDraft.title" type="text" maxlength="80" />
            </label>
            <div v-if="!selectedTask.is_recurring" class="edit-toggles">
              <label class="check-field">
                <input v-model="editDraft.isUrgent" type="checkbox" />
                <span>紧急</span>
              </label>
              <label class="check-field">
                <input v-model="editDraft.isFuture" type="checkbox" @change="toggleEditFutureTask" />
                <span>未来任务</span>
              </label>
            </div>
            <label v-if="editDraft.isFuture && !selectedTask.is_recurring" class="field compact">
              <span>任务开始执行时间</span>
              <span class="date-time-inputs">
                <input v-model="editDraft.startAt" type="date" />
                <input v-model="editDraft.startAtTime" type="time" />
              </span>
            </label>
            <div class="detail-action-row">
              <button class="text-button" type="button" :disabled="!editDraft.title" @click="saveTaskChanges">保存变更</button>
            </div>
          </div>
          <div v-if="!selectedTask.is_recurring && !detailEditOpen && !progressFormOpen" class="detail-section milestone-section">
            <h2>节点</h2>
            <div v-if="milestones.length" ref="milestoneListEl" class="milestone-list">
              <div
                v-for="(milestone, index) in milestones"
                :key="milestone.id"
                class="milestone-row"
                :class="{ editing: editingMilestoneId === milestone.id, dragging: milestoneDragging && milestoneDragIndex === index, 'has-check': editingMilestoneId !== milestone.id }"
              >
                <template v-if="editingMilestoneId !== milestone.id">
                  <button
                    v-if="!milestone.completed_at"
                    class="milestone-check"
                    type="button"
                    :aria-label="`完成节点 ${milestone.title}`"
                    @mousedown.stop.prevent
                    @click.stop="openNodeCompleteDialog(milestone)"
                  ></button>
                  <span v-else class="milestone-check done" aria-hidden="true"></span>
                </template>
                <template v-if="editingMilestoneId === milestone.id">
                  <div class="milestone-edit-fields">
                    <input v-model.trim="milestoneEditDraft.title" type="text" maxlength="40" placeholder="节点名称" />
                    <span class="date-time-inputs">
                      <input v-model="milestoneEditDraft.plannedAt" type="date" />
                      <input v-model="milestoneEditDraft.plannedAtTime" type="time" />
                    </span>
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
                  <div
                    class="milestone-main"
                    @mousedown.prevent="startMilestoneDrag($event, index)"
                    @click.stop="handleMilestoneMainClick(milestone)"
                  >
                    <span class="milestone-title" :class="{ done: milestone.completed_at }">{{ milestone.title }}</span>
                    <div v-if="expandedMilestoneId === milestone.id" class="milestone-inline-actions">
                      <button v-if="milestone.completed_at" class="text-button" type="button" @click.stop="undoCompleteMilestone(milestone)">
                        撤销完成
                      </button>
                      <button v-if="!milestone.completed_at" class="text-button" type="button" @click.stop="startMilestoneEdit(milestone)">
                        编辑
                      </button>
                      <button class="text-button danger" type="button" @click.stop="deleteMilestone(milestone)">
                        删除
                      </button>
                    </div>
                  </div>
                  <span class="milestone-meta">
                    <span v-if="milestone.completed_at">已完成 {{ formatTime(milestone.completed_at) }}</span>
                    <span v-else-if="milestone.planned_at">计划 {{ formatDeadline(milestone.planned_at) }}</span>
                    <span v-if="!milestone.completed_at && isMilestoneOverdue(milestone.planned_at)" class="overdue-chip">已延迟</span>
                  </span>
                </template>
              </div>
            </div>
            <button
              v-if="!milestoneFormOpen"
              class="text-button milestone-add"
              type="button"
              @click="openMilestoneForm"
            >
              添加节点
            </button>
            <form v-if="milestoneFormOpen" class="milestone-form" @submit.prevent="addMilestone">
              <input v-model.trim="milestoneDraft.title" type="text" maxlength="40" placeholder="节点名称" />
              <span class="date-time-inputs">
                <input
                  v-model="milestoneDraft.plannedAt"
                  type="date"
                />
                <input
                  v-model="milestoneDraft.plannedAtTime"
                  type="time"
                />
              </span>
              <div class="milestone-form-actions">
                <button class="text-button" type="submit" :disabled="!milestoneDraft.title">添加</button>
                <button class="text-button" type="button" @click="closeMilestoneForm">收起</button>
              </div>
            </form>
          </div>
          <div v-if="progressFormOpen" class="progress-inline">
            <input
              v-model.trim="progressDraft"
              type="text"
              maxlength="240"
              placeholder="记录当前进展…"
              @keydown.enter.prevent="progressDraft && saveTaskProgress()"
            />
            <button class="text-button" type="button" :disabled="!progressDraft" @click="saveTaskProgress">添加进度</button>
          </div>
        </template>
        <div v-if="!detailEditOpen && !progressFormOpen" class="event-list">
          <h2>生命周期</h2>
          <div v-for="event in taskEvents" :key="event.id" class="event-row">
            <span class="event-icon" aria-hidden="true">·</span>
            <span class="event-text">{{ eventText(event) }}</span>
            <time>{{ formatTime(event.created_at) }}</time>
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

      <AboutView v-else-if="view === 'about'" :version-label="versionLabel" @open-external="openExternal" />

      <footer class="note-footer">
        <span v-if="currentCategory" class="category-count">{{ activeTasks.length }} 项</span>
        <span class="brand-mark">{{ noteSignature || "桌面便签" }}</span>
      </footer>
    </section>
  </main>
  <ConfirmDialog
    :confirmation="confirmation"
    @cancel="closeConfirmation"
    @confirm="confirmAction"
    @choice="confirmChoice"
    @change-completed="confirmation.isCompleted = $event"
    @change-completed-date="confirmation.state.completedDate = $event"
    @change-completed-time="confirmation.state.completedTime = $event"
  />
  <AppNotice :notice="notice" @close="closeNotice" />
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import AboutView from "./components/AboutView.vue";
import AppMenu from "./components/AppMenu.vue";
import AppNotice from "./components/AppNotice.vue";
import ConfirmDialog from "./components/ConfirmDialog.vue";
import { useHistory } from "./composables/useHistory.js";
import { useNoteSettings } from "./composables/useNoteSettings.js";
import { useNotice } from "./composables/useNotice.js";
import { useRecurringTaskSettings } from "./composables/useRecurringTaskSettings.js";
import { useTaskCreation } from "./composables/useTaskCreation.js";
import { useTaskDetail } from "./composables/useTaskDetail.js";
import { useTaskList } from "./composables/useTaskList.js";
import { useCategories } from "./composables/useCategories.js";
import { formatDeadline, formatTime } from "./lib/datetime.js";
import { setErrorReporter } from "./lib/errors.js";
import { eventText, taskStatus, taskStatusText } from "./lib/labels.js";

// 版本号按 AGENTS.md 在 App.vue 内维护，改应用代码后必须同步时间。
const versionLabel = "v1.5.0 - 2026-11-03 22:46";

const view = ref("home");
const menuOpen = ref(false);
// 当前分类由 App 持有：任务列表与分类管理都需要它，放在最外层避免循环依赖。
const currentCategory = ref("");
// 顶部分类标签卡片：切换后把当前标签滚动到可见区域。
const categoryTabEls = ref([]);
// 确认弹窗与历史操作展开状态被「详情 / 历史 / 分类」多处共用，统一由 App 持有。
const confirmation = ref(null);
const expandedHistoryTaskId = ref("");

const { notice, showNotice, closeNotice } = useNotice();
setErrorReporter((message) => showNotice(message));

const {
  noteSize,
  noteTheme,
  noteFont,
  noteSignature,
  notePosition,
  autoStartEnabled,
  loadSettings,
  applyInitialLayout,
  changeNoteSize,
  changeNoteTheme,
  changeNoteFont,
  changeSignature,
  changeNotePosition,
  changeAutoStart,
} = useNoteSettings({ closeMenu, notify: showNotice });

// openTask 由 useTaskDetail 提供，而 useTaskList 需要它、useTaskDetail 又需要
// useTaskList 的 refreshActiveTasks —— 用函数声明延迟解析，打断循环依赖。
function openTaskDeferred(task) {
  return openTask(task);
}

const {
  activeTasks,
  taskListEl,
  isDragging,
  dragIndex,
  dragMoved,
  refreshActiveTasks,
  startRowDrag,
  onRowDragMove,
  endRowDrag,
  handleTaskMainClick,
  persistOrder,
} = useTaskList({ currentCategory, notify: showNotice, openTask: openTaskDeferred });

const {
  selectedTask,
  taskEvents,
  milestones,
  milestoneDraft,
  editingMilestoneId,
  expandedMilestoneId,
  milestoneEditDraft,
  editDraft,
  milestoneFormOpen,
  progressDraft,
  progressDate,
  progressTime,
  detailEditOpen,
  progressFormOpen,
  detailReturnView,
  milestoneListEl,
  milestoneDragging,
  milestoneDragIndex,
  milestoneDragMoved,
  openTask,
  resetDetailState,
  detailAction,
  toggleDetailEdit,
  toggleEditFutureTask,
  completeTaskEntry,
  detailCompleteEntry,
  openNodeCompleteDialog,
  startMilestoneDrag,
  onMilestoneDragMove,
  endMilestoneDrag,
  handleMilestoneMainClick,
  saveTaskChanges,
  reloadTaskDetail,
  openMilestoneForm,
  closeMilestoneForm,
  addMilestone,
  startMilestoneEdit,
  cancelMilestoneEdit,
  saveMilestoneEdit,
  undoCompleteMilestone,
  deleteMilestone,
  isMilestoneOverdue,
  saveTaskProgress,
  deleteTaskProgress,
} = useTaskDetail({
  currentCategory,
  view,
  menuOpen,
  notify: showNotice,
  confirmation,
  expandedHistoryTaskId,
  refreshActiveTasks,
  openCategoryManager,
  openConfirmation,
});

const {
  categories,
  categoryDraft,
  categoryFormOpen,
  editingCategory,
  editCategoryDraft,
  hydrate: hydrateCategories,
  addCategory,
  openCategoryForm,
  closeCategoryForm,
  switchCategory,
  startEditCategory,
  cancelEditCategory,
  saveCategoryName,
  deleteCategory,
  removeCategory,
} = useCategories({
  currentCategory,
  view,
  openConfirmation,
  resetDetailState: resetSessionState,
  refreshActiveTasks,
});

const { draft, createTask, addDraftMilestone, removeDraftMilestone, toggleFutureTask } = useTaskCreation({
  currentCategory,
  view,
  refreshActiveTasks,
});

const {
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
} = useRecurringTaskSettings({
  currentCategory,
  view,
  menuOpen,
  notify: showNotice,
  expandedHistoryTaskId,
  openConfirmation,
  refreshActiveTasks,
  draft,
  openCategoryManager,
});

const {
  archivedTasks,
  openHistory,
  toggleHistoryActions,
  resetHistoryState,
  historyAction,
  canUndoTask,
  deleteArchivedTask,
  loadArchivedTasks,
} = useHistory({
  currentCategory,
  view,
  menuOpen,
  notify: showNotice,
  confirmation,
  expandedHistoryTaskId,
  openConfirmation,
  refreshActiveTasks,
  openCategoryManager,
});

const weekdayOptions = [
  { label: "一", value: 0 }, { label: "二", value: 1 }, { label: "三", value: 2 },
  { label: "四", value: 3 }, { label: "五", value: 4 }, { label: "六", value: 5 }, { label: "日", value: 6 },
];
let recurringRefreshTimer = null;

const viewTitle = computed(() => {
  const titles = {
    home: "待办",
    categories: "分类",
    add: "新任务",
    history: "历史任务",
    "recurring-settings": "周期任务规则",
    "recurring-setting": "周期设置",
    "recurring-setting-detail": "规则详情",
    detail: "",
    about: "产品简介",
  };
  return titles[view.value] || "";
});

// 一个分类都没有时，"返回"应当直接退出而不是停在空的分类管理页。
const shouldExitFromCategoryManager = computed(() =>
  view.value === "categories" && !categories.value.length && !categoryFormOpen.value,
);

const backButtonLabel = computed(() =>
  shouldExitFromCategoryManager.value ? "退出" : "返回",
);

onMounted(async () => {
  hydrateCategories();
  loadSettings();
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("pointerdown", closeExpandedHistoryActions, true);

  if (currentCategory.value) {
    await refreshActiveTasks();
  }
  await nextTick();
  scrollActiveTabIntoView();
  recurringRefreshTimer = window.setInterval(() => {
    if (currentCategory.value) {
      refreshActiveTasks().catch(() => {});
    }
  }, 60_000);

  // 首屏渲染后再把外观设置作用到窗口，避免阻塞任务列表加载。
  applyInitialLayout();
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
  window.removeEventListener("pointerdown", closeExpandedHistoryActions, true);
  if (recurringRefreshTimer) window.clearInterval(recurringRefreshTimer);
  setErrorReporter(null);
});

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}

function closeMenu() {
  menuOpen.value = false;
}

function closeExpandedHistoryActions(event) {
  if (!expandedHistoryTaskId.value) return;
  if (event.target?.closest?.(".history-action-toggle, .history-actions")) return;
  expandedHistoryTaskId.value = "";
}

function scrollActiveTabIntoView() {
  const tabs = Array.isArray(categoryTabEls.value) ? categoryTabEls.value : [];
  const active = tabs.find((tab) => tab?.classList?.contains("active"));
  active?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}

async function selectCategoryTab(category) {
  if (category === currentCategory.value) return;
  await switchCategory(category);
  await nextTick();
  scrollActiveTabIntoView();
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    menuOpen.value = false;
    expandedHistoryTaskId.value = "";
  }
}

function goHome() {
  expandedHistoryTaskId.value = "";
  view.value = "home";
  selectedTask.value = null;
  taskEvents.value = [];
  milestones.value = [];
  if (currentCategory.value) {
    refreshActiveTasks();
  }
}

async function handleBack() {
  expandedHistoryTaskId.value = "";
  if (shouldExitFromCategoryManager.value) {
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
      await loadArchivedTasks();
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
  if (!currentCategory.value) {
    openCategoryManager();
    return;
  }
  menuOpen.value = false;
  expandedHistoryTaskId.value = "";
  view.value = "add";
}

function openCategoryManager() {
  menuOpen.value = false;
  expandedHistoryTaskId.value = "";
  categoryDraft.value = "";
  categoryFormOpen.value = !categories.value.length;
  editingCategory.value = "";
  editCategoryDraft.value = "";
  view.value = "categories";
}

function openAbout() {
  menuOpen.value = false;
  expandedHistoryTaskId.value = "";
  view.value = "about";
}

function confirmChoice(choice) {
  const action = choice?.action;
  closeConfirmation();
  if (!action) return;
  action().catch((err) => showNotice(err, "操作失败，请稍后重试"));
}

function nextMilestoneText(task) {
  const title = task.next_milestone_title || "未命名";
  const planned = task.next_milestone_planned_at
    ? ` · ${formatDeadline(task.next_milestone_planned_at)}`
    : "";
  return `下一节点：${title}${planned}`;
}

function openConfirmation(title, message, action, actionLabel = "确认删除") {
  expandedHistoryTaskId.value = "";
  confirmation.value = { title, message, action, actionLabel, titleId: "confirm-dialog-title", kind: "delete", isCompleted: false };
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

// 切换或删除分类时清空详情残留与历史列表，避免把上一个分类的数据带过来。
function resetSessionState() {
  resetDetailState();
  resetHistoryState();
}

async function exitApp() {
  await invoke("exit_app");
}

// 无边框窗口没有系统按钮，最小化由便签菜单触发。
async function minimizeWindow() {
  menuOpen.value = false;
  await getCurrentWindow().minimize();
}

async function openExternal(url) {
  try {
    await invoke("open_external_link", { url });
  } catch (err) {
    showNotice(err, "打开链接失败");
  }
}
</script>
