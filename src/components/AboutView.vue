<template>
  <section class="content about-view" @click.stop>
    <div class="about-hero">
      <h2 class="about-name">{{ productFullName }}</h2>
      <div class="about-meta-line">
        <span class="about-version">{{ versionText }}</span>
        <span v-if="updatedAt" class="about-updated">更新于 {{ updatedAt }}</span>
      </div>
    </div>

    <section class="about-release">
      <h3 class="about-release-title">本版更新</h3>
      <ul class="about-release-list">
        <li v-for="note in releaseNotes" :key="note">{{ note }}</li>
      </ul>
    </section>

    <dl class="about-list">
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

    <p class="about-foot">桌面便签 · MIT 开源 · 数据仅存本机</p>
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

// 把 `v1.5.0 - 2026-11-04 10:01` 拆成版本号与更新时间，分别展示。
const releaseMatch = computed(() => /^(v[\d.]+)\s*-\s*(.+)$/.exec(props.versionLabel || ""));
const versionText = computed(() => releaseMatch.value?.[1] ?? props.versionLabel);
const updatedAt = computed(() => releaseMatch.value?.[2] ?? "");
</script>
