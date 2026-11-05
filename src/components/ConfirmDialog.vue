<template>
  <Teleport to="body">
    <div v-if="confirmation" class="confirm-backdrop" @click.self="$emit('cancel')">
      <section class="confirm-dialog" role="alertdialog" aria-modal="true" :aria-labelledby="confirmation.titleId">
        <h2 v-if="confirmation.kind !== 'archive'" :id="confirmation.titleId">{{ confirmation.title }}</h2>
        <p v-if="confirmation.kind !== 'archive' && confirmation.message">{{ confirmation.message }}</p>
        <label v-if="confirmation.kind === 'archive'" class="check-field confirm-check">
          <input
            :checked="confirmation.isCompleted"
            type="checkbox"
            @change="$emit('change-completed', $event.target.checked)"
          />
          <span>任务已完成</span>
        </label>
        <label v-if="confirmation.kind === 'complete'" class="field compact confirm-datetime">
          <span>完成时间</span>
          <span class="date-time-inputs">
            <input
              :value="confirmation.state.completedDate"
              type="date"
              @input="$emit('change-completed-date', $event.target.value)"
            />
            <TimeInput
              :model-value="confirmation.state.completedTime"
              @update:model-value="$emit('change-completed-time', $event)"
            />
          </span>
        </label>
        <div class="confirm-actions">
          <button class="text-button" type="button" @click="$emit('cancel')">取消</button>
          <template v-if="confirmation.choices && confirmation.choices.length">
            <button
              v-for="choice in confirmation.choices"
              :key="choice.label"
              class="text-button confirm-button"
              :class="{ danger: choice.danger }"
              type="button"
              @click="$emit('choice', choice)"
            >
              {{ choice.label }}
            </button>
          </template>
          <button v-else class="text-button danger confirm-button" type="button" @click="$emit('confirm')">
            {{ confirmation.actionLabel }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
// 通用确认弹窗：普通确认、归档勾选、完成时间选择、多选项确认（撤销完成等）。
// 弹窗自身不修改父级状态，所有写操作通过事件回传。
import TimeInput from "./TimeInput.vue";

defineProps({
  confirmation: {
    type: Object,
    default: null,
  },
});

defineEmits([
  "cancel",
  "confirm",
  "choice",
  "change-completed",
  "change-completed-date",
  "change-completed-time",
]);
</script>
