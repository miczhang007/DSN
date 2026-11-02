<template>
  <Teleport to="body">
    <Transition name="toast">
      <div v-if="notice" class="app-notice" role="alert" aria-live="assertive">
        <span>{{ notice.message }}</span>
        <button type="button" class="icon-button" aria-label="关闭提示" @click="$emit('close')">×</button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
defineProps({
  notice: {
    type: Object,
    default: null,
  },
});

defineEmits(["close"]);
</script>
