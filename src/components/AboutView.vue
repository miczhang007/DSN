<template>
  <section class="content about-view" @click.stop>
    <div class="about-hero">
      <h2 class="about-name">{{ productFullName }}</h2>
      <span class="about-version">{{ versionLabel }}</span>
    </div>

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
// （AGENTS.md 要求 versionLabel 在 App.vue 中维护）。
import { privacyPolicyUrl, productFullName, repositoryUrl } from "../lib/product-info.js";

defineProps({
  versionLabel: { type: String, default: "" },
});

defineEmits(["open-external"]);
</script>
