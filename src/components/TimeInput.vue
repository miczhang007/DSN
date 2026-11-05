<template>
  <span class="time-input" :class="{ 'has-value': modelValue }">
    <input
      type="time"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
    />
    <button
      v-if="modelValue"
      class="time-clear"
      type="button"
      :aria-label="clearLabel"
      @click="$emit('update:modelValue', '')"
    >×</button>
  </span>
</template>

<script setup>
// 时间输入组件：有小时/分钟时用“清除”按钮替换原生钟表图标，清除后钟表图标恢复。
// 清除后时间留空，调用方可以只按日期记录（完成时间、计划时间等均为选填）。
defineProps({
  modelValue: { type: String, default: "" },
  clearLabel: { type: String, default: "清除时间" },
});

defineEmits(["update:modelValue"]);
</script>
