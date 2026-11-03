// 本地分类列表的读写。
//
// 业务数据（任务、节点、生命周期）全部在 SQLite；localStorage 只保存
// "当前使用哪个分类"以及这里的分类列表，二者都不是云端身份。

const CATEGORIES_KEY = "categories";
const LEGACY_USERS_KEY = "users";
const CURRENT_KEY = "current-category";
const LEGACY_CURRENT_KEY = "current-user";

export function normalizeCategoryName(value) {
  return String(value || "").trim();
}

function readList(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(saved) ? saved.map(normalizeCategoryName).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function loadCategories() {
  const categories = readList(CATEGORIES_KEY);
  if (categories.length) return categories;

  // 老版本把分类叫作"用户"，首次升级时把旧列表迁移过来，避免用户看到空列表。
  const legacy = readList(LEGACY_USERS_KEY);
  if (legacy.length) {
    saveCategories(legacy);
    localStorage.removeItem(LEGACY_USERS_KEY);
  }
  return legacy;
}

export function saveCategories(list) {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(list));
}

export function loadCurrentCategory() {
  const current = localStorage.getItem(CURRENT_KEY);
  if (current) return current;
  return localStorage.getItem(LEGACY_CURRENT_KEY) || "";
}

export function saveCurrentCategory(name) {
  if (name) {
    localStorage.setItem(CURRENT_KEY, name);
    localStorage.removeItem(LEGACY_CURRENT_KEY);
  } else {
    localStorage.removeItem(CURRENT_KEY);
    localStorage.removeItem(LEGACY_CURRENT_KEY);
  }
}
