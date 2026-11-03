// 本地分类管理：分类列表、当前分类与增删改切换。
//
// 说明：这里没有账号体系，分类只是本地任务归属（owner）的名称，
// 列表保存在 localStorage，任务数据在 SQLite。

import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import {
  loadCategories,
  loadCurrentCategory,
  normalizeCategoryName,
  saveCategories,
  saveCurrentCategory,
} from "../lib/category-storage.js";

/**
 * @param {object} deps
 * @param {import("vue").Ref<string>} deps.currentCategory   当前分类（由 App 持有）
 * @param {import("vue").Ref<string>} deps.view              当前视图，切换分类后需要改动
 * @param {Function} deps.openConfirmation                   打开应用内确认弹窗
 * @param {Function} deps.resetDetailState                   清空详情页残留状态
 * @param {Function} deps.refreshActiveTasks                 重新加载待办列表
 */
export function useCategories({ currentCategory, view, openConfirmation, resetDetailState, refreshActiveTasks }) {
  const categories = ref([]);
  const categoryDraft = ref("");
  const categoryFormOpen = ref(false);
  const editingCategory = ref("");
  const editCategoryDraft = ref("");

  /** 从 localStorage 恢复当前分类与分类列表（启动时调用）。 */
  function hydrate() {
    currentCategory.value = loadCurrentCategory();
    categories.value = loadCategories();
    if (currentCategory.value && !categories.value.includes(currentCategory.value)) {
      categories.value.unshift(currentCategory.value);
      saveCategories(categories.value);
    }
  }

  // 支持一次输入多个分类：逗号、顿号、分号、斜杠或空格分隔
  function parseCategoryNames(text) {
    return String(text || "")
      .split(/[\s,，、;；/]+/)
      .map((name) => normalizeCategoryName(name))
      .filter(Boolean);
  }

  async function addCategory() {
    const names = parseCategoryNames(categoryDraft.value);
    if (!names.length) return;
    const added = [];
    names.forEach((name) => {
      if (categories.value.includes(name)) return;
      categories.value.push(name);
      added.push(name);
    });
    if (!added.length) {
      categoryDraft.value = "";
      return;
    }
    saveCategories(categories.value);
    categoryDraft.value = "";
    categoryFormOpen.value = false;
    await switchCategory(added[0]);
  }

  function openCategoryForm() {
    categoryFormOpen.value = true;
  }

  function closeCategoryForm() {
    categoryDraft.value = "";
    categoryFormOpen.value = false;
  }

  async function switchCategory(category) {
    currentCategory.value = category;
    saveCurrentCategory(category);
    resetDetailState();
    editingCategory.value = "";
    view.value = "home";
    await refreshActiveTasks();
  }

  function startEditCategory(category) {
    editingCategory.value = category;
    editCategoryDraft.value = category;
  }

  function cancelEditCategory() {
    editingCategory.value = "";
    editCategoryDraft.value = "";
  }

  async function saveCategoryName(oldCategory) {
    const nextCategory = normalizeCategoryName(editCategoryDraft.value);
    if (!nextCategory) return;
    if (nextCategory !== oldCategory && categories.value.includes(nextCategory)) return;

    await invoke("rename_category_data", { oldOwner: oldCategory, newOwner: nextCategory });
    categories.value = categories.value.map((category) => (category === oldCategory ? nextCategory : category));
    saveCategories(categories.value);
    if (currentCategory.value === oldCategory) {
      currentCategory.value = nextCategory;
      saveCurrentCategory(nextCategory);
    }
    cancelEditCategory();
    await refreshActiveTasks();
  }

  async function deleteCategory(category) {
    openConfirmation(
      "删除分类",
      `确定删除分类“${category}”吗？删除后该分类下的待办、历史任务和生命周期记录都将被永久删除，不能恢复。`,
      () => removeCategory(category),
    );
  }

  async function removeCategory(category) {
    await invoke("delete_category_data", { owner: category });
    categories.value = categories.value.filter((item) => item !== category);
    saveCategories(categories.value);
    if (currentCategory.value === category) {
      currentCategory.value = categories.value[0] || "";
      if (currentCategory.value) {
        saveCurrentCategory(currentCategory.value);
        view.value = "home";
      } else {
        saveCurrentCategory("");
        view.value = "categories";
      }
    }
    resetDetailState();
    await refreshActiveTasks();
  }

  return {
    categories,
    categoryDraft,
    categoryFormOpen,
    editingCategory,
    editCategoryDraft,
    hydrate,
    addCategory,
    openCategoryForm,
    closeCategoryForm,
    switchCategory,
    startEditCategory,
    cancelEditCategory,
    saveCategoryName,
    deleteCategory,
    removeCategory,
  };
}
