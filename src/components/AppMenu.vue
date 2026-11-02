<template>
  <Transition name="fade">
    <nav v-if="open" class="note-menu" aria-label="菜单" @click.stop>
      <button type="button" @click="$emit('history')">历史任务</button>
      <button type="button" @click="$emit('recurring-settings')">周期任务规则</button>
      <button type="button" @click="$emit('users')">用户管理</button>
      <div class="menu-section">
        <label>
          <span>便签大小</span>
          <select :value="noteSize" @change="$emit('change-size', $event.target.value)">
            <option v-for="size in sizeOptions" :key="size.value" :value="size.value">
              {{ size.label }}
            </option>
          </select>
        </label>
      </div>
      <div class="menu-section">
        <label>
          <span>便签主题</span>
          <select :value="noteTheme" @change="$emit('change-theme', $event.target.value)">
            <option v-for="theme in themeOptions" :key="theme.value" :value="theme.value">
              {{ theme.label }}
            </option>
          </select>
        </label>
      </div>
      <div class="menu-section">
        <label>
          <span>便签位置</span>
          <select :value="notePosition" @change="$emit('change-position', $event.target.value)">
            <option v-for="position in positionOptions" :key="position.value" :value="position.value">
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
          @change="$emit('change-auto-start', $event.target.checked)"
        />
      </label>
      <label class="menu-toggle">
        <span>极简模式</span>
        <input
          :checked="minimalModeEnabled"
          type="checkbox"
          role="switch"
          @change="$emit('change-minimal', $event.target.checked)"
        />
      </label>
      <button type="button" @click="$emit('about')">产品简介</button>
      <button type="button" class="danger" @click="$emit('exit')">退出</button>
    </nav>
  </Transition>
</template>

<script setup>
// 侧边菜单：只负责展示与事件回传，选项数据属于展示层，随组件内聚。
defineProps({
  open: { type: Boolean, default: false },
  noteSize: { type: String, default: "medium" },
  noteTheme: { type: String, default: "yellow" },
  notePosition: { type: String, default: "top-right" },
  autoStartEnabled: { type: Boolean, default: false },
  minimalModeEnabled: { type: Boolean, default: false },
});

defineEmits([
  "history",
  "recurring-settings",
  "users",
  "about",
  "exit",
  "change-size",
  "change-theme",
  "change-position",
  "change-auto-start",
  "change-minimal",
]);

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
</script>
