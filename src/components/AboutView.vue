<template>
  <section class="content about-view" @click.stop>
    <div class="about-hero">
      <h2 class="about-name">{{ productFullName }}</h2>
    </div>

    <dl class="about-list">
      <div>
        <dt>版本</dt>
        <dd><span class="about-version">{{ versionText }}</span></dd>
      </div>
      <div>
        <dt>更新时间</dt>
        <dd><span class="about-updated">{{ updatedAt || "未记录" }}</span></dd>
      </div>
      <div>
        <dt>更新内容</dt>
        <dd>
          <ul class="about-release-list">
            <li v-for="note in releaseNotes" :key="note">{{ note }}</li>
          </ul>
        </dd>
      </div>
      <div>
        <dt>开发者</dt>
        <dd>miczhang（个人开发者）</dd>
      </div>
      <div>
        <dt>数据说明</dt>
        <dd>便签数据默认仅保存在本机，不上传至服务器</dd>
      </div>
      <div>
        <dt>源码仓库</dt>
        <dd>
          <a href="#" rel="noreferrer" @click.prevent="$emit('open-external', repositoryUrl)">GitHub 开源仓库</a>
        </dd>
      </div>
      <div>
        <dt>隐私政策</dt>
        <dd>
          <a href="#" rel="noreferrer" @click.prevent="$emit('open-external', privacyPolicyUrl)">查看隐私政策</a>
        </dd>
      </div>
      <div>
        <dt>联系方式</dt>
        <dd>miczhang007@qq.com</dd>
      </div>
    </dl>
  </section>
</template>

<script setup>
// 产品简介页：静态信息来自 product-info，版本号由 App.vue 传入
// （AGENTS.md 要求 versionLabel 在 App.vue 中维护，格式固定为 `vX.Y.Z - YYYY-MM-DD HH:mm`）。
import { computed } from "vue";
import { privacyPolicyUrl, productFullName, releaseNotes, repositoryUrl } from "../lib/product-info.js";

const props = defineProps({
  versionLabel: { type: String, default: "" },
});

defineEmits(["open-external"]);

// 把 `v1.5.1 - 2026-11-06 23:01` 拆成版本号与更新时间，作为信息列表中的两行。
const releaseMatch = computed(() => /^(v[\d.]+)\s*-\s*(.+)$/.exec(props.versionLabel || ""));
const versionText = computed(() => releaseMatch.value?.[1] ?? props.versionLabel);
const updatedAt = computed(() => releaseMatch.value?.[2] ?? "");
</script>
