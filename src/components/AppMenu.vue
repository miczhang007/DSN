<template>
  <Transition name="fade">
    <nav v-if="open" class="note-menu" aria-label="菜单" @click.stop>
      <div class="menu-nav">
        <button type="button" @click="$emit('history')">历史任务</button>
        <button type="button" @click="$emit('recurring-settings')">周期任务规则</button>
        <button type="button" @click="$emit('categories')">分类管理</button>
      </div>

      <div class="menu-group">
        <span class="field-label">外观</span>
        <div class="theme-dots">
          <button
            v-for="theme in themeOptions"
            :key="theme.value"
            class="theme-dot"
            type="button"
            :class="{ active: noteTheme === theme.value }"
            :style="{ background: theme.color }"
            :aria-label="theme.label"
            @click="$emit('change-theme', theme.value)"
          ></button>
        </div>
      </div>

      <div class="menu-group">
        <span class="field-label">大小</span>
        <div class="segmented">
          <button
            v-for="size in sizeOptions"
            :key="size.value"
            type="button"
            :class="{ active: noteSize === size.value }"
            @click="$emit('change-size', size.value)"
          >
            {{ size.label }}
          </button>
        </div>
      </div>

      <div class="menu-group">
        <span class="field-label">自定义签名</span>
        <input
          class="signature-input"
          :value="noteSignature"
          type="text"
          maxlength="20"
          placeholder="桌面便签"
          @input="$emit('change-signature', $event.target.value)"
        />
      </div>

      <div class="menu-group">
        <span class="field-label">字体</span>
        <div class="segmented">
          <button
            v-for="font in fontOptions"
            :key="font.value"
            type="button"
            :class="{ active: noteFont === font.value }"
            @click="$emit('change-font', font.value)"
          >
            {{ font.label }}
          </button>
        </div>
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

      <button type="button" class="menu-footer-action" @click="$emit('about')">产品简介</button>
      <button type="button" class="menu-footer-action danger" @click="$emit('exit')">退出</button>
    </nav>
  </Transition>
</template>

<script setup>
// 侧滑菜单：外观设置与导航入口，只负责展示与事件回传。
defineProps({
  open: { type: Boolean, default: false },
  noteSize: { type: String, default: "medium" },
  noteTheme: { type: String, default: "yellow" },
  noteFont: { type: String, default: "xikai" },
  noteSignature: { type: String, default: "" },
  autoStartEnabled: { type: Boolean, default: false },
});

defineEmits([
  "history",
  "recurring-settings",
  "categories",
  "about",
  "exit",
  "change-size",
  "change-theme",
  "change-font",
  "change-signature",
  "change-auto-start",
]);

const sizeOptions = [
  { label: "小", value: "small" },
  { label: "中", value: "medium" },
  { label: "大", value: "large" },
];

const fontOptions = [
  { label: "细楷", value: "xikai" },
  { label: "硬笔", value: "yingbi" },
  { label: "毛笔", value: "maobi" },
  { label: "行书", value: "xingshu" },
  { label: "楷体", value: "kaishu" },
];

const themeOptions = [
  { label: "黄色", value: "yellow", color: "#f7e6a3" },
  { label: "蓝色", value: "blue", color: "#cfe3f4" },
  { label: "绿色", value: "green", color: "#d8ecc4" },
  { label: "粉红", value: "pink", color: "#f6d2dc" },
  { label: "白色", value: "white", color: "#f5f1e4" },
];

</script>
