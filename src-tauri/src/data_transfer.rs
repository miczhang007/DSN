//! 本地数据导出与导入。
//!
//! 导出格式固定为 JSON（见 `BACKUP_FORMAT` / `BACKUP_SCHEMA_VERSION`）：
//! 任务、生命周期、节点与周期规则按表导出，而不是直接复制 SQLite 文件。
//! 这样既能跨应用版本校验数据，也能支持“增量覆盖”这种逐条合并的导入方式。
//!
//! 导入分两种模式：
//! - `overwrite`（完全覆盖）：清空本地全部业务数据后写入备份内容；
//! - `merge`（增量覆盖）：保留本地独有任务，按备份覆盖同 ID 任务及其节点/日志，
//!   并新增备份中的其他任务。

use std::collections::HashSet;
use std::fs;
use std::path::Path;

use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{now_string, DbState};

const BACKUP_FORMAT: &str = "desktop-sticky-note-backup";
const BACKUP_SCHEMA_VERSION: u32 = 1;
const DATA_VERSION_META_KEY: &str = "data_version";

/// 导出文件的顶层结构。字段统一使用 camelCase，便于用户直接打开查看。
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupFile {
    format: String,
    schema_version: u32,
    #[serde(default)]
    app_version: String,
    #[serde(default)]
    exported_at: String,
    #[serde(default)]
    data_version: Option<String>,
    #[serde(default)]
    categories: Vec<String>,
    /// 界面外观、签名与当前分类等展示类个性化设置；旧备份可为空。
    #[serde(default)]
    preferences: Option<Preferences>,
    #[serde(default)]
    tasks: Vec<TaskRecord>,
    #[serde(default)]
    task_events: Vec<TaskEventRecord>,
    #[serde(default)]
    milestones: Vec<MilestoneRecord>,
    #[serde(default)]
    recurring_settings: Vec<RecurringSettingRecord>,
    #[serde(default)]
    recurring_setting_events: Vec<RecurringSettingEventRecord>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskRecord {
    id: String,
    #[serde(default)]
    owner: String,
    #[serde(default)]
    title: String,
    deadline_at: Option<String>,
    #[serde(default)]
    is_urgent: bool,
    #[serde(default)]
    created_at: String,
    #[serde(default)]
    updated_at: String,
    completed_at: Option<String>,
    archived_at: Option<String>,
    deleted_at: Option<String>,
    sort_order: Option<i64>,
    /// 进行中临时置顶前的手工排序；用于恢复“进行中撤出后回到原位”的状态。
    sort_order_before_progress: Option<i64>,
    recurring_setting_id: Option<String>,
    occurrence_date: Option<String>,
    suspended_at: Option<String>,
    start_at: Option<String>,
    started_at: Option<String>,
    reactivated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskEventRecord {
    #[serde(default)]
    task_id: String,
    #[serde(default)]
    event_type: String,
    before_value: Option<String>,
    after_value: Option<String>,
    #[serde(default)]
    created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MilestoneRecord {
    #[serde(default)]
    task_id: String,
    #[serde(default)]
    title: String,
    planned_at: Option<String>,
    completed_at: Option<String>,
    started_at: Option<String>,
    #[serde(default)]
    created_at: String,
    #[serde(default)]
    updated_at: String,
    sort_order: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecurringSettingRecord {
    #[serde(default)]
    id: String,
    #[serde(default)]
    owner: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    is_urgent: bool,
    #[serde(default)]
    date_range_type: String,
    #[serde(default)]
    start_date: String,
    end_date: Option<String>,
    #[serde(default)]
    frequency_type: String,
    #[serde(default)]
    weekdays: String,
    #[serde(default)]
    generate_time: String,
    #[serde(default)]
    repeat_count: i64,
    voided_at: Option<String>,
    #[serde(default)]
    created_at: String,
    #[serde(default)]
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecurringSettingEventRecord {
    #[serde(default)]
    setting_id: String,
    #[serde(default)]
    event_type: String,
    #[serde(default)]
    created_at: String,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    #[serde(default)]
    note_size: Option<String>,
    #[serde(default)]
    note_theme: Option<String>,
    #[serde(default)]
    note_font: Option<String>,
    #[serde(default)]
    note_signature: Option<String>,
    #[serde(default)]
    note_position: Option<String>,
    #[serde(default)]
    current_category: Option<String>,
}

/// 数据管理页展示的本地数据概览。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataOverview {
    data_version: Option<String>,
    task_count: i64,
    archived_task_count: i64,
    recurring_rule_count: i64,
}

/// 选择一个备份文件后返回的摘要，用于导入前确认。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataFilePreview {
    path: String,
    file_name: String,
    app_version: String,
    exported_at: String,
    data_version: Option<String>,
    task_count: usize,
    archived_task_count: usize,
    recurring_rule_count: usize,
    category_count: usize,
    categories: Vec<String>,
    preferences: Option<Preferences>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    mode: String,
    imported_at: String,
    data_version: Option<String>,
    added_tasks: usize,
    updated_tasks: usize,
    kept_local_tasks: usize,
    /// 备份中周期规则已不存在、导入时转为普通任务的数量。
    orphan_recurring_tasks: usize,
    categories: Vec<String>,
    preferences: Option<Preferences>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ImportMode {
    Overwrite,
    Merge,
}

impl ImportMode {
    fn parse(value: &str) -> Result<Self, String> {
        match value.trim() {
            "overwrite" => Ok(Self::Overwrite),
            "merge" => Ok(Self::Merge),
            _ => Err("未知的导入模式".to_string()),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Overwrite => "overwrite",
            Self::Merge => "merge",
        }
    }
}

/// 当前数据版本：业务表最近一次写入时间与最近一次导入时间中的较大者。
///
/// 正常编辑会更新业务行的 `updated_at` / 写入新事件；导入则额外记录
/// `app_meta.data_version`，保证“完全覆盖为旧备份”时版本仍向前推进。
fn compute_data_version(conn: &Connection) -> Result<Option<String>, String> {
    let derived: Option<String> = conn
        .query_row(
            "SELECT MAX(ts) FROM (
               SELECT updated_at AS ts FROM tasks
               UNION ALL SELECT created_at FROM task_events
               UNION ALL SELECT updated_at FROM task_milestones
               UNION ALL SELECT updated_at FROM recurring_task_settings
               UNION ALL SELECT created_at FROM recurring_setting_events
             )",
            [],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    let stored: Option<String> = conn
        .query_row(
            "SELECT value FROM app_meta WHERE key = ?1",
            params![DATA_VERSION_META_KEY],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?;
    Ok([derived, stored].into_iter().flatten().max())
}

fn set_data_version(conn: &Connection, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO app_meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![DATA_VERSION_META_KEY, value],
    )
    .map_err(db_error)?;
    Ok(())
}

fn db_error(err: rusqlite::Error) -> String {
    err.to_string()
}

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

fn query_export_tasks(conn: &Connection) -> Result<Vec<TaskRecord>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, owner, title, deadline_at, is_urgent, created_at, updated_at,
                    completed_at, archived_at, deleted_at, sort_order,
                    sort_order_before_progress,
                    recurring_setting_id, occurrence_date, suspended_at, start_at,
                    started_at, reactivated_at
             FROM tasks ORDER BY created_at ASC, id ASC",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(TaskRecord {
                id: row.get(0)?,
                owner: row.get(1)?,
                title: row.get(2)?,
                deadline_at: row.get(3)?,
                is_urgent: row.get::<_, i64>(4)? == 1,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                completed_at: row.get(7)?,
                archived_at: row.get(8)?,
                deleted_at: row.get(9)?,
                sort_order: row.get(10)?,
                sort_order_before_progress: row.get(11)?,
                recurring_setting_id: row.get(12)?,
                occurrence_date: row.get(13)?,
                suspended_at: row.get(14)?,
                start_at: row.get(15)?,
                started_at: row.get(16)?,
                reactivated_at: row.get(17)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(db_error)
}

fn query_export_task_events(conn: &Connection) -> Result<Vec<TaskEventRecord>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT task_id, event_type, before_value, after_value, created_at
             FROM task_events ORDER BY id ASC",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(TaskEventRecord {
                task_id: row.get(0)?,
                event_type: row.get(1)?,
                before_value: row.get(2)?,
                after_value: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(db_error)
}

fn query_export_milestones(conn: &Connection) -> Result<Vec<MilestoneRecord>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT task_id, title, planned_at, completed_at, started_at,
                    created_at, updated_at, sort_order
             FROM task_milestones ORDER BY id ASC",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(MilestoneRecord {
                task_id: row.get(0)?,
                title: row.get(1)?,
                planned_at: row.get(2)?,
                completed_at: row.get(3)?,
                started_at: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                sort_order: row.get(7)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(db_error)
}

fn query_export_recurring_settings(
    conn: &Connection,
) -> Result<Vec<RecurringSettingRecord>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, owner, title, is_urgent, date_range_type, start_date, end_date,
                    frequency_type, weekdays, generate_time, repeat_count, voided_at,
                    created_at, updated_at
             FROM recurring_task_settings ORDER BY created_at ASC, id ASC",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(RecurringSettingRecord {
                id: row.get(0)?,
                owner: row.get(1)?,
                title: row.get(2)?,
                is_urgent: row.get::<_, i64>(3)? == 1,
                date_range_type: row.get(4)?,
                start_date: row.get(5)?,
                end_date: row.get(6)?,
                frequency_type: row.get(7)?,
                weekdays: row.get(8)?,
                generate_time: row.get(9)?,
                repeat_count: row.get(10)?,
                voided_at: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(db_error)
}

fn query_export_recurring_setting_events(
    conn: &Connection,
) -> Result<Vec<RecurringSettingEventRecord>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT setting_id, event_type, created_at
             FROM recurring_setting_events ORDER BY id ASC",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(RecurringSettingEventRecord {
                setting_id: row.get(0)?,
                event_type: row.get(1)?,
                created_at: row.get(2)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(db_error)
}

fn push_unique_category(list: &mut Vec<String>, seen: &mut HashSet<String>, value: &str) {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return;
    }
    if seen.insert(trimmed.to_string()) {
        list.push(trimmed.to_string());
    }
}

/// 分类列表以界面传入的本地分类为准，同时补齐任务/规则里出现的归属名，
/// 避免出现“有任务但备份里没有对应分类”的残缺备份。
fn normalized_categories(backup: &BackupFile) -> Vec<String> {
    let mut list = Vec::new();
    let mut seen = HashSet::new();
    for category in &backup.categories {
        push_unique_category(&mut list, &mut seen, category);
    }
    for task in &backup.tasks {
        push_unique_category(&mut list, &mut seen, &task.owner);
    }
    for setting in &backup.recurring_settings {
        push_unique_category(&mut list, &mut seen, &setting.owner);
    }
    list
}

fn build_backup(
    conn: &Connection,
    categories: Vec<String>,
    preferences: Option<Preferences>,
) -> Result<BackupFile, String> {
    let tasks = query_export_tasks(conn)?;
    let task_events = query_export_task_events(conn)?;
    let milestones = query_export_milestones(conn)?;
    let recurring_settings = query_export_recurring_settings(conn)?;
    let recurring_setting_events = query_export_recurring_setting_events(conn)?;
    let data_version = compute_data_version(conn)?;

    let mut backup = BackupFile {
        format: BACKUP_FORMAT.to_string(),
        schema_version: BACKUP_SCHEMA_VERSION,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        exported_at: now_string(),
        data_version,
        categories,
        preferences,
        tasks,
        task_events,
        milestones,
        recurring_settings,
        recurring_setting_events,
    };
    backup.categories = normalized_categories(&backup);
    Ok(backup)
}

// ---------------------------------------------------------------------------
// 导入：解析与校验
// ---------------------------------------------------------------------------

fn parse_backup(text: &str) -> Result<BackupFile, String> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let backup: BackupFile =
        serde_json::from_str(text).map_err(|err| format!("备份文件不是有效的 JSON：{err}"))?;
    validate_backup(&backup)?;
    Ok(backup)
}

fn validate_backup(backup: &BackupFile) -> Result<(), String> {
    if backup.format != BACKUP_FORMAT {
        return Err("所选文件不是桌面便签的备份文件".to_string());
    }
    if backup.schema_version != BACKUP_SCHEMA_VERSION {
        return Err(format!(
            "备份文件版本为 v{}，当前应用仅支持 v{}，请升级应用后再导入",
            backup.schema_version, BACKUP_SCHEMA_VERSION
        ));
    }

    let mut task_ids = HashSet::new();
    for task in &backup.tasks {
        let id = task.id.trim();
        if id.is_empty() {
            return Err("备份文件中有任务缺少 ID".to_string());
        }
        if !task_ids.insert(id.to_string()) {
            return Err(format!("备份文件中任务 ID 重复：{id}"));
        }
        if task.owner.trim().is_empty() {
            return Err("备份文件中有任务缺少所属分类".to_string());
        }
        if task.title.trim().is_empty() {
            return Err(format!("备份文件中任务 {id} 缺少标题"));
        }
    }

    for event in &backup.task_events {
        if !task_ids.contains(event.task_id.trim()) {
            return Err(format!(
                "备份文件不完整：生命周期记录引用的任务 {} 不存在",
                event.task_id
            ));
        }
    }
    for milestone in &backup.milestones {
        if !task_ids.contains(milestone.task_id.trim()) {
            return Err(format!(
                "备份文件不完整：节点“{}”引用的任务 {} 不存在",
                milestone.title, milestone.task_id
            ));
        }
        if milestone.title.trim().is_empty() {
            return Err("备份文件中有节点缺少名称".to_string());
        }
    }

    let mut setting_ids = HashSet::new();
    for setting in &backup.recurring_settings {
        let id = setting.id.trim();
        if id.is_empty() {
            return Err("备份文件中有周期规则缺少 ID".to_string());
        }
        if !setting_ids.insert(id.to_string()) {
            return Err(format!("备份文件中周期规则 ID 重复：{id}"));
        }
        if setting.owner.trim().is_empty() {
            return Err("备份文件中有周期规则缺少所属分类".to_string());
        }
        if setting.title.trim().is_empty() {
            return Err(format!("备份文件中周期规则 {id} 缺少名称"));
        }
    }
    for event in &backup.recurring_setting_events {
        if !setting_ids.contains(event.setting_id.trim()) {
            return Err(format!(
                "备份文件不完整：周期规则日志引用的规则 {} 不存在",
                event.setting_id
            ));
        }
    }
    Ok(())
}

fn preview_for(backup: &BackupFile, path: &Path) -> DataFilePreview {
    let categories = normalized_categories(backup);
    DataFilePreview {
        path: path.to_string_lossy().into_owned(),
        file_name: path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.to_string_lossy().into_owned()),
        app_version: backup.app_version.clone(),
        exported_at: backup.exported_at.clone(),
        data_version: backup.data_version.clone(),
        task_count: backup
            .tasks
            .iter()
            .filter(|task| task.deleted_at.is_none())
            .count(),
        archived_task_count: backup
            .tasks
            .iter()
            .filter(|task| task.deleted_at.is_none() && task.archived_at.is_some())
            .count(),
        recurring_rule_count: backup.recurring_settings.len(),
        category_count: categories.len(),
        categories,
        preferences: backup.preferences.clone(),
    }
}

// ---------------------------------------------------------------------------
// 导入：写入
// ---------------------------------------------------------------------------

fn query_all_task_ids(conn: &Connection) -> Result<HashSet<String>, String> {
    let mut stmt = conn.prepare("SELECT id FROM tasks").map_err(db_error)?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(db_error)?;
    rows.collect::<rusqlite::Result<HashSet<String>>>()
        .map_err(db_error)
}

fn clear_all_data(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "DELETE FROM task_events;
         DELETE FROM task_milestones;
         DELETE FROM tasks;
         DELETE FROM recurring_setting_events;
         DELETE FROM recurring_task_settings;",
    )
    .map_err(db_error)
}

fn upsert_task(conn: &Connection, task: &TaskRecord) -> Result<(), String> {
    conn.execute(
        "INSERT INTO tasks (
           id, owner, title, deadline_at, is_urgent, created_at, updated_at,
           completed_at, archived_at, deleted_at, sort_order,
           sort_order_before_progress,
           recurring_setting_id, occurrence_date, suspended_at, start_at,
           started_at, reactivated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
         ON CONFLICT(id) DO UPDATE SET
           owner = excluded.owner,
           title = excluded.title,
           deadline_at = excluded.deadline_at,
           is_urgent = excluded.is_urgent,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at,
           completed_at = excluded.completed_at,
           archived_at = excluded.archived_at,
           deleted_at = excluded.deleted_at,
           sort_order = excluded.sort_order,
           sort_order_before_progress = excluded.sort_order_before_progress,
           recurring_setting_id = excluded.recurring_setting_id,
           occurrence_date = excluded.occurrence_date,
           suspended_at = excluded.suspended_at,
           start_at = excluded.start_at,
           started_at = excluded.started_at,
           reactivated_at = excluded.reactivated_at",
        params![
            task.id,
            task.owner.trim(),
            task.title.trim(),
            task.deadline_at,
            if task.is_urgent { 1_i64 } else { 0_i64 },
            task.created_at,
            task.updated_at,
            task.completed_at,
            task.archived_at,
            task.deleted_at,
            task.sort_order,
            task.sort_order_before_progress,
            task.recurring_setting_id,
            task.occurrence_date,
            task.suspended_at,
            task.start_at,
            task.started_at,
            task.reactivated_at
        ],
    )
    .map_err(db_error)?;
    Ok(())
}

fn upsert_recurring_setting(
    conn: &Connection,
    setting: &RecurringSettingRecord,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO recurring_task_settings (
           id, owner, title, is_urgent, date_range_type, start_date, end_date,
           frequency_type, weekdays, generate_time, repeat_count, voided_at,
           created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
         ON CONFLICT(id) DO UPDATE SET
           owner = excluded.owner,
           title = excluded.title,
           is_urgent = excluded.is_urgent,
           date_range_type = excluded.date_range_type,
           start_date = excluded.start_date,
           end_date = excluded.end_date,
           frequency_type = excluded.frequency_type,
           weekdays = excluded.weekdays,
           generate_time = excluded.generate_time,
           repeat_count = excluded.repeat_count,
           voided_at = excluded.voided_at,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at",
        params![
            setting.id,
            setting.owner.trim(),
            setting.title.trim(),
            if setting.is_urgent { 1_i64 } else { 0_i64 },
            setting.date_range_type,
            setting.start_date,
            setting.end_date,
            setting.frequency_type,
            setting.weekdays,
            setting.generate_time,
            setting.repeat_count,
            setting.voided_at,
            setting.created_at,
            setting.updated_at
        ],
    )
    .map_err(db_error)?;
    Ok(())
}

fn apply_backup(
    conn: &Connection,
    backup: &BackupFile,
    mode: ImportMode,
) -> Result<ImportResult, String> {
    let imported_task_ids: HashSet<String> = backup
        .tasks
        .iter()
        .map(|task| task.id.trim().to_string())
        .collect();
    let local_task_ids = query_all_task_ids(conn)?;

    let (added_tasks, updated_tasks, kept_local_tasks) = match mode {
        ImportMode::Overwrite => (imported_task_ids.len(), 0, 0),
        ImportMode::Merge => (
            imported_task_ids.difference(&local_task_ids).count(),
            imported_task_ids.intersection(&local_task_ids).count(),
            local_task_ids.difference(&imported_task_ids).count(),
        ),
    };

    let categories = normalized_categories(backup);
    let imported_at = now_string();
    let tx = conn.unchecked_transaction().map_err(db_error)?;

    if mode == ImportMode::Overwrite {
        clear_all_data(&tx)?;
    }

    // 周期规则先写入：任务可能引用规则。
    for setting in &backup.recurring_settings {
        upsert_recurring_setting(&tx, setting)?;
        tx.execute(
            "DELETE FROM recurring_setting_events WHERE setting_id = ?1",
            params![setting.id],
        )
        .map_err(db_error)?;
    }
    for event in &backup.recurring_setting_events {
        tx.execute(
            "INSERT INTO recurring_setting_events (setting_id, event_type, created_at)
             VALUES (?1, ?2, ?3)",
            params![event.setting_id, event.event_type, event.created_at],
        )
        .map_err(db_error)?;
    }

    // 任务与子表：备份内出现的任务整体替换，本地独有任务与子表保持不动。
    for task in &backup.tasks {
        upsert_task(&tx, task)?;
        tx.execute(
            "DELETE FROM task_events WHERE task_id = ?1",
            params![task.id],
        )
        .map_err(db_error)?;
        tx.execute(
            "DELETE FROM task_milestones WHERE task_id = ?1",
            params![task.id],
        )
        .map_err(db_error)?;
    }
    for milestone in &backup.milestones {
        tx.execute(
            "INSERT INTO task_milestones (
               task_id, title, planned_at, completed_at, started_at,
               created_at, updated_at, sort_order
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                milestone.task_id,
                milestone.title.trim(),
                milestone.planned_at,
                milestone.completed_at,
                milestone.started_at,
                milestone.created_at,
                milestone.updated_at,
                milestone.sort_order
            ],
        )
        .map_err(db_error)?;
    }
    for event in &backup.task_events {
        tx.execute(
            "INSERT INTO task_events (task_id, event_type, before_value, after_value, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                event.task_id,
                event.event_type,
                event.before_value,
                event.after_value,
                event.created_at
            ],
        )
        .map_err(db_error)?;
    }

    // 兼容历史备份：已软删除的任务可能还引用已被删除的周期规则。
    // 这类引用不应阻断整包导入，转为普通任务并保留任务本身的数据。
    let mut orphan_recurring_tasks = 0usize;
    for task in &backup.tasks {
        let Some(setting_id) = task.recurring_setting_id.as_deref() else {
            continue;
        };
        let exists: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM recurring_task_settings WHERE id = ?1)",
                params![setting_id],
                |row| row.get(0),
            )
            .map_err(db_error)?;
        if !exists {
            tx.execute(
                "UPDATE tasks SET recurring_setting_id = NULL WHERE id = ?1",
                params![task.id],
            )
            .map_err(db_error)?;
            orphan_recurring_tasks += 1;
        }
    }

    // 恢复“进行中临时置顶”状态：备份中的进行中任务重新进入置顶区，
    // 其他状态的任务清理临时位置。
    for task in &backup.tasks {
        if task.deleted_at.is_some() {
            continue;
        }
        crate::sync_task_progress_order(&tx, task.owner.trim(), task.id.trim())?;
    }

    set_data_version(&tx, &imported_at)?;
    let data_version = compute_data_version(&tx)?;
    tx.commit().map_err(db_error)?;

    Ok(ImportResult {
        mode: mode.as_str().to_string(),
        imported_at,
        data_version,
        added_tasks,
        updated_tasks,
        kept_local_tasks,
        orphan_recurring_tasks,
        categories,
        preferences: backup.preferences.clone(),
    })
}

// ---------------------------------------------------------------------------
// Tauri 命令
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_data_overview(state: State<DbState>) -> Result<DataOverview, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let task_count: i64 = conn
        .query_row(
            "SELECT COUNT(1) FROM tasks WHERE deleted_at IS NULL",
            [],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    let archived_task_count: i64 = conn
        .query_row(
            "SELECT COUNT(1) FROM tasks WHERE deleted_at IS NULL AND archived_at IS NOT NULL",
            [],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    let recurring_rule_count: i64 = conn
        .query_row("SELECT COUNT(1) FROM recurring_task_settings", [], |row| {
            row.get(0)
        })
        .map_err(db_error)?;
    Ok(DataOverview {
        data_version: compute_data_version(&conn)?,
        task_count,
        archived_task_count,
        recurring_rule_count,
    })
}

#[tauri::command]
pub fn export_data(
    state: State<DbState>,
    categories: Vec<String>,
    preferences: Option<Preferences>,
) -> Result<Option<String>, String> {
    // 先取数据快照并释放数据库锁，避免系统文件对话框打开期间阻塞其他命令。
    let backup = {
        let conn = state.conn.lock().map_err(|err| err.to_string())?;
        build_backup(&conn, categories, preferences)?
    };

    let default_name = format!(
        "桌面便签数据备份-{}.json",
        Local::now().format("%Y%m%d-%H%M%S")
    );
    let Some(path) = win_dialog::pick_save_path(&default_name, "导出便签数据")? else {
        return Ok(None);
    };
    let json = serde_json::to_string_pretty(&backup)
        .map_err(|err| format!("生成备份内容失败：{err}"))?;
    fs::write(&path, json.as_bytes()).map_err(|err| format!("写入备份文件失败：{err}"))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn inspect_import_file() -> Result<Option<DataFilePreview>, String> {
    let Some(path) = win_dialog::pick_open_path("导入便签数据")? else {
        return Ok(None);
    };
    let text = fs::read_to_string(&path).map_err(|err| format!("读取备份文件失败：{err}"))?;
    let backup = parse_backup(&text)?;
    Ok(Some(preview_for(&backup, &path)))
}

#[tauri::command]
pub fn import_data(
    state: State<DbState>,
    path: String,
    mode: String,
) -> Result<ImportResult, String> {
    let mode = ImportMode::parse(&mode)?;
    let text = fs::read_to_string(&path).map_err(|err| format!("读取备份文件失败：{err}"))?;
    let backup = parse_backup(&text)?;
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    apply_backup(&conn, &backup, mode)
}

// ---------------------------------------------------------------------------
// 系统文件对话框（Windows）
// ---------------------------------------------------------------------------

#[cfg(windows)]
mod win_dialog {
    use std::ffi::c_void;
    use std::path::PathBuf;

    const OFN_OVERWRITEPROMPT: u32 = 0x0000_0002;
    const OFN_NOCHANGEDIR: u32 = 0x0000_0008;
    const OFN_PATHMUSTEXIST: u32 = 0x0000_0800;
    const OFN_FILEMUSTEXIST: u32 = 0x0000_1000;
    const OFN_EXPLORER: u32 = 0x0008_0000;

    const FILTER: &str = "数据备份文件 (*.json)\0*.json\0所有文件 (*.*)\0*.*\0\0";
    const DEFAULT_EXTENSION: &str = "json";

    /// Win32 `OPENFILENAMEW` 的 Rust 布局。字段名只影响可读性，顺序必须与 SDK 一致。
    #[repr(C)]
    struct OpenFileNameW {
        struct_size: u32,
        owner: *mut c_void,
        instance: *mut c_void,
        filter: *const u16,
        custom_filter: *mut u16,
        max_custom_filter: u32,
        filter_index: u32,
        file: *mut u16,
        max_file: u32,
        file_title: *mut u16,
        max_file_title: u32,
        initial_dir: *const u16,
        title: *const u16,
        flags: u32,
        file_offset: u16,
        file_extension: u16,
        default_extension: *const u16,
        custom_data: isize,
        hook: *mut c_void,
        template_name: *const u16,
        reserved: *mut c_void,
        reserved2: u32,
        flags_ex: u32,
    }

    #[link(name = "comdlg32")]
    extern "system" {
        fn GetOpenFileNameW(dialog: *mut OpenFileNameW) -> i32;
        fn GetSaveFileNameW(dialog: *mut OpenFileNameW) -> i32;
        fn CommDlgExtendedError() -> u32;
    }

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn run(default_name: Option<&str>, title: &str, open: bool) -> Result<Option<PathBuf>, String> {
        let mut buffer = vec![0u16; 2048];
        if let Some(name) = default_name {
            let units: Vec<u16> = name.encode_utf16().collect();
            let length = units.len().min(buffer.len() - 1);
            buffer[..length].copy_from_slice(&units[..length]);
        }

        // FILTER 自带结束空串，再补一个结束 0 保证双空字符结尾。
        let filter: Vec<u16> = FILTER
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        let title = wide(title);
        let default_extension = wide(DEFAULT_EXTENSION);
        let mut flags = OFN_EXPLORER | OFN_NOCHANGEDIR | OFN_PATHMUSTEXIST;
        if open {
            flags |= OFN_FILEMUSTEXIST;
        } else {
            flags |= OFN_OVERWRITEPROMPT;
        }

        let mut dialog = OpenFileNameW {
            struct_size: std::mem::size_of::<OpenFileNameW>() as u32,
            owner: std::ptr::null_mut(),
            instance: std::ptr::null_mut(),
            filter: filter.as_ptr(),
            custom_filter: std::ptr::null_mut(),
            max_custom_filter: 0,
            filter_index: 1,
            file: buffer.as_mut_ptr(),
            max_file: buffer.len() as u32,
            file_title: std::ptr::null_mut(),
            max_file_title: 0,
            initial_dir: std::ptr::null(),
            title: title.as_ptr(),
            flags,
            file_offset: 0,
            file_extension: 0,
            default_extension: default_extension.as_ptr(),
            custom_data: 0,
            hook: std::ptr::null_mut(),
            template_name: std::ptr::null(),
            reserved: std::ptr::null_mut(),
            reserved2: 0,
            flags_ex: 0,
        };

        let success = unsafe {
            if open {
                GetOpenFileNameW(&mut dialog)
            } else {
                GetSaveFileNameW(&mut dialog)
            }
        };
        if success == 0 {
            // 返回 0 既可能是用户取消，也可能是对话框调用失败；
            // CommDlgExtendedError 为 0 表示取消，否则把真实错误抛给界面。
            let error_code = unsafe { CommDlgExtendedError() };
            if error_code == 0 {
                return Ok(None);
            }
            return Err(format!(
                "打开系统文件对话框失败（错误码 {error_code}）"
            ));
        }

        let end = buffer
            .iter()
            .position(|unit| *unit == 0)
            .unwrap_or(buffer.len());
        if end == 0 {
            return Ok(None);
        }
        Ok(Some(PathBuf::from(String::from_utf16_lossy(&buffer[..end]))))
    }

    pub fn pick_save_path(default_name: &str, title: &str) -> Result<Option<PathBuf>, String> {
        run(Some(default_name), title, false)
    }

    pub fn pick_open_path(title: &str) -> Result<Option<PathBuf>, String> {
        run(None, title, true)
    }

    /// 用固定偏移锁定 `OPENFILENAMEW` 布局，避免字段顺序/对齐被误改后
    /// 系统对话框静默失效（调用失败与用户取消共用返回值，很难在线发现）。
    #[cfg(test)]
    mod layout_tests {
        use super::*;
        use std::mem::{offset_of, size_of};

        #[test]
        fn open_file_name_layout_matches_win32_sdk() {
            assert_eq!(size_of::<OpenFileNameW>(), 152);
            assert_eq!(offset_of!(OpenFileNameW, owner), 8);
            assert_eq!(offset_of!(OpenFileNameW, filter), 24);
            assert_eq!(offset_of!(OpenFileNameW, file), 48);
            assert_eq!(offset_of!(OpenFileNameW, max_file), 56);
            assert_eq!(offset_of!(OpenFileNameW, file_title), 64);
            assert_eq!(offset_of!(OpenFileNameW, flags), 96);
            assert_eq!(offset_of!(OpenFileNameW, default_extension), 104);
            assert_eq!(offset_of!(OpenFileNameW, custom_data), 112);
            assert_eq!(offset_of!(OpenFileNameW, template_name), 128);
            assert_eq!(offset_of!(OpenFileNameW, flags_ex), 148);
        }
    }
}

#[cfg(not(windows))]
mod win_dialog {
    use std::path::PathBuf;

    pub fn pick_save_path(_default_name: &str, _title: &str) -> Result<Option<PathBuf>, String> {
        Err("当前系统暂不支持系统文件选择".to_string())
    }

    pub fn pick_open_path(_title: &str) -> Result<Option<PathBuf>, String> {
        Err("当前系统暂不支持系统文件选择".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{configure_connection, migrate};

    fn test_connection() -> Connection {
        let conn = Connection::open_in_memory().expect("内存库");
        configure_connection(&conn).expect("配置连接");
        migrate(&conn).expect("初始化表结构");
        conn
    }

    fn task_record(id: &str, owner: &str, title: &str, updated_at: &str) -> TaskRecord {
        TaskRecord {
            id: id.to_string(),
            owner: owner.to_string(),
            title: title.to_string(),
            deadline_at: None,
            is_urgent: false,
            created_at: "2026-01-01T00:00:00+00:00".to_string(),
            updated_at: updated_at.to_string(),
            completed_at: None,
            archived_at: None,
            deleted_at: None,
            sort_order: None,
            sort_order_before_progress: None,
            recurring_setting_id: None,
            occurrence_date: None,
            suspended_at: None,
            start_at: None,
            started_at: None,
            reactivated_at: None,
        }
    }

    fn event_record(task_id: &str, event_type: &str, created_at: &str) -> TaskEventRecord {
        TaskEventRecord {
            task_id: task_id.to_string(),
            event_type: event_type.to_string(),
            before_value: None,
            after_value: None,
            created_at: created_at.to_string(),
        }
    }

    fn backup_with(tasks: Vec<TaskRecord>) -> BackupFile {
        BackupFile {
            format: BACKUP_FORMAT.to_string(),
            schema_version: BACKUP_SCHEMA_VERSION,
            app_version: "1.5.1".to_string(),
            exported_at: "2026-01-02T00:00:00+00:00".to_string(),
            data_version: Some("2026-01-02T00:00:00+00:00".to_string()),
            categories: vec!["工作".to_string(), "生活".to_string()],
            preferences: None,
            tasks,
            task_events: Vec::new(),
            milestones: Vec::new(),
            recurring_settings: Vec::new(),
            recurring_setting_events: Vec::new(),
        }
    }

    #[test]
    fn backup_roundtrip_preserves_exported_tables() {
        let source = test_connection();
        source
            .execute(
                "INSERT INTO tasks
                   (id, owner, title, is_urgent, created_at, updated_at, archived_at, sort_order)
                 VALUES ('task-1', '工作', '整理资料', 1,
                         '2026-01-01T00:00:00+00:00', '2026-01-02T00:00:00+00:00',
                         NULL, 0)",
                [],
            )
            .expect("写入任务");
        source
            .execute(
                "INSERT INTO task_milestones (task_id, title, planned_at, created_at, updated_at)
                 VALUES ('task-1', '完成初稿', '2026-01-03', '2026-01-01T00:00:00+00:00',
                         '2026-01-01T00:00:00+00:00')",
                [],
            )
            .expect("写入节点");
        source
            .execute(
                "INSERT INTO task_events (task_id, event_type, created_at)
                 VALUES ('task-1', 'created', '2026-01-01T00:00:00+00:00')",
                [],
            )
            .expect("写入事件");
        source
            .execute(
                "INSERT INTO recurring_task_settings
                   (id, owner, title, is_urgent, date_range_type, start_date, end_date,
                    frequency_type, weekdays, generate_time, repeat_count, created_at, updated_at)
                 VALUES ('setting-1', '工作', '每日整理', 0, 'long', '2026-01-01', NULL,
                         'daily', '0,1,2,3,4', '06:00', 1,
                         '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00')",
                [],
            )
            .expect("写入周期规则");
        source
            .execute(
                "INSERT INTO recurring_setting_events (setting_id, event_type, created_at)
                 VALUES ('setting-1', 'created', '2026-01-01T00:00:00+00:00')",
                [],
            )
            .expect("写入规则日志");

        let preferences = Preferences {
            note_size: Some("large".to_string()),
            note_theme: Some("blue".to_string()),
            note_font: Some("xingshu".to_string()),
            note_signature: Some("我的签名".to_string()),
            note_position: Some("bottom-right".to_string()),
            current_category: Some("工作".to_string()),
        };
        let backup = build_backup(
            &source,
            vec!["工作".to_string(), "生活".to_string()],
            Some(preferences.clone()),
        )
        .expect("生成备份");
        let json = serde_json::to_string_pretty(&backup).expect("序列化备份");

        let target = test_connection();
        let parsed = parse_backup(&json).expect("解析备份");
        let result = apply_backup(&target, &parsed, ImportMode::Overwrite).expect("导入备份");
        assert_eq!(
            result.preferences,
            Some(preferences),
            "界面/签名等个性化设置应随备份往返"
        );

        assert_eq!(result.added_tasks, 1);
        assert_eq!(
            result.categories,
            vec!["工作".to_string(), "生活".to_string()]
        );
        assert!(result.data_version.is_some());
        let title: String = target
            .query_row("SELECT title FROM tasks WHERE id='task-1'", [], |row| {
                row.get(0)
            })
            .expect("读取任务");
        assert_eq!(title, "整理资料");
        let milestones: i64 = target
            .query_row("SELECT COUNT(1) FROM task_milestones", [], |row| row.get(0))
            .expect("统计节点");
        assert_eq!(milestones, 1);
        let events: i64 = target
            .query_row("SELECT COUNT(1) FROM task_events", [], |row| row.get(0))
            .expect("统计事件");
        assert_eq!(events, 1);
        let settings: i64 = target
            .query_row(
                "SELECT COUNT(1) FROM recurring_task_settings",
                [],
                |row| row.get(0),
            )
            .expect("统计规则");
        assert_eq!(settings, 1);
        let setting_events: i64 = target
            .query_row(
                "SELECT COUNT(1) FROM recurring_setting_events",
                [],
                |row| row.get(0),
            )
            .expect("统计规则日志");
        assert_eq!(setting_events, 1);
    }

    #[test]
    fn overwrite_replaces_all_local_data() {
        let conn = test_connection();
        conn.execute(
            "INSERT INTO tasks (id, owner, title, is_urgent, created_at, updated_at)
             VALUES ('local-1', '本地', '本地任务', 0, '2026-01-01T00:00:00+00:00',
                     '2026-01-01T00:00:00+00:00'),
                    ('local-2', '本地', '另一条', 0, '2026-01-01T00:00:00+00:00',
                     '2026-01-01T00:00:00+00:00')",
            [],
        )
        .expect("写入本地任务");

        let backup = backup_with(vec![task_record(
            "imported-1",
            "导入",
            "导入任务",
            "2026-01-02T00:00:00+00:00",
        )]);
        let result =
            apply_backup(&conn, &backup, ImportMode::Overwrite).expect("完全覆盖导入");

        assert_eq!(result.added_tasks, 1);
        let remaining: i64 = conn
            .query_row("SELECT COUNT(1) FROM tasks", [], |row| row.get(0))
            .expect("统计任务");
        assert_eq!(remaining, 1, "完全覆盖后不应保留本地任务");
        let owner: String = conn
            .query_row("SELECT owner FROM tasks", [], |row| row.get(0))
            .expect("读取分类");
        assert_eq!(owner, "导入");
    }

    #[test]
    fn merge_keeps_local_tasks_and_overwrites_same_id() {
        let conn = test_connection();
        conn.execute(
            "INSERT INTO tasks (id, owner, title, is_urgent, created_at, updated_at)
             VALUES ('shared', '本地', '旧标题', 0, '2026-01-01T00:00:00+00:00',
                     '2026-01-01T00:00:00+00:00'),
                    ('local-only', '本地', '仅本地', 0, '2026-01-01T00:00:00+00:00',
                     '2026-01-01T00:00:00+00:00')",
            [],
        )
        .expect("写入本地任务");
        conn.execute(
            "INSERT INTO task_events (task_id, event_type, created_at)
             VALUES ('shared', 'created', '2026-01-01T00:00:00+00:00')",
            [],
        )
        .expect("写入本地日志");

        let mut backup = backup_with(vec![
            task_record("shared", "导入", "新标题", "2026-01-02T00:00:00+00:00"),
            task_record("imported", "导入", "新增任务", "2026-01-02T00:00:00+00:00"),
        ]);
        backup.task_events = vec![
            event_record("shared", "created", "2026-01-01T00:00:00+00:00"),
            event_record("shared", "title_changed", "2026-01-02T00:00:00+00:00"),
            event_record("imported", "created", "2026-01-02T00:00:00+00:00"),
        ];
        backup.milestones = vec![MilestoneRecord {
            task_id: "shared".to_string(),
            title: "新节点".to_string(),
            planned_at: None,
            completed_at: None,
            started_at: None,
            created_at: "2026-01-02T00:00:00+00:00".to_string(),
            updated_at: "2026-01-02T00:00:00+00:00".to_string(),
            sort_order: None,
        }];

        let result = apply_backup(&conn, &backup, ImportMode::Merge).expect("增量导入");

        assert_eq!(result.added_tasks, 1);
        assert_eq!(result.updated_tasks, 1);
        assert_eq!(result.kept_local_tasks, 1);
        let title: String = conn
            .query_row("SELECT title FROM tasks WHERE id='shared'", [], |row| {
                row.get(0)
            })
            .expect("读取同 ID 任务");
        assert_eq!(title, "新标题", "同 ID 任务应按备份覆盖");
        let owner: String = conn
            .query_row("SELECT owner FROM tasks WHERE id='shared'", [], |row| {
                row.get(0)
            })
            .expect("读取分类");
        assert_eq!(owner, "导入");
        assert!(
            conn.query_row("SELECT 1 FROM tasks WHERE id='local-only'", [], |_| Ok(
                ()
            ))
            .optional()
            .expect("查询本地任务")
            .is_some(),
            "增量导入不得删除本地独有任务"
        );
        let shared_events: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM task_events WHERE task_id='shared'",
                [],
                |row| row.get(0),
            )
            .expect("统计同 ID 任务日志");
        assert_eq!(shared_events, 2, "同 ID 任务的日志应整体替换为备份内容");
        let milestones: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM task_milestones WHERE task_id='shared'",
                [],
                |row| row.get(0),
            )
            .expect("统计同 ID 任务节点");
        assert_eq!(milestones, 1);
    }

    #[test]
    fn failed_overwrite_import_rolls_back_local_data() {
        let conn = test_connection();
        conn.execute(
            "INSERT INTO tasks (id, owner, title, is_urgent, created_at, updated_at)
             VALUES ('local-1', '本地', '本地任务', 0, '2026-01-01T00:00:00+00:00',
                     '2026-01-01T00:00:00+00:00')",
            [],
        )
        .expect("写入本地任务");
        conn.execute_batch(
            "CREATE TRIGGER fail_import BEFORE INSERT ON tasks
             WHEN NEW.title = '导入失败'
             BEGIN SELECT RAISE(ABORT, '模拟导入失败'); END;",
        )
        .expect("创建失败触发器");

        let backup = backup_with(vec![task_record(
            "imported-1",
            "导入",
            "导入失败",
            "2026-01-02T00:00:00+00:00",
        )]);

        let error = apply_backup(&conn, &backup, ImportMode::Overwrite).expect_err("应导入失败");
        assert!(error.contains("模拟导入失败"), "错误信息应说明导入失败：{error}");

        // 事务回滚：失败后本地数据必须原样保留，而不是被“清空一半”。
        let remaining: i64 = conn
            .query_row("SELECT COUNT(1) FROM tasks", [], |row| row.get(0))
            .expect("统计任务");
        assert_eq!(remaining, 1);
        let local_title: String = conn
            .query_row("SELECT title FROM tasks WHERE id='local-1'", [], |row| {
                row.get(0)
            })
            .expect("读取本地任务");
        assert_eq!(local_title, "本地任务");
    }

    #[test]
    fn import_turns_orphan_recurring_tasks_into_regular_tasks() {
        let conn = test_connection();
        let mut backup = backup_with(vec![task_record(
            "imported-1",
            "生活",
            "饭后散步（第35周）",
            "2026-01-02T00:00:00+00:00",
        )]);
        backup.tasks[0].recurring_setting_id = Some("missing-setting".to_string());

        let result = apply_backup(&conn, &backup, ImportMode::Overwrite)
            .expect("缺失周期规则不应阻断整包导入");
        assert_eq!(result.orphan_recurring_tasks, 1);

        let setting_id: Option<String> = conn
            .query_row(
                "SELECT recurring_setting_id FROM tasks WHERE id='imported-1'",
                [],
                |row| row.get(0),
            )
            .expect("读取导入任务");
        assert_eq!(setting_id, None);
        let title: String = conn
            .query_row("SELECT title FROM tasks WHERE id='imported-1'", [], |row| {
                row.get(0)
            })
            .expect("读取导入任务标题");
        assert_eq!(title, "饭后散步（第35周）");
    }

    #[test]
    fn data_version_survives_older_backup_import() {
        let conn = test_connection();
        assert_eq!(compute_data_version(&conn).expect("读取版本"), None);
        set_data_version(&conn, "2026-02-01T00:00:00+00:00").expect("写入版本");
        assert_eq!(
            compute_data_version(&conn).expect("读取版本"),
            Some("2026-02-01T00:00:00+00:00".to_string())
        );

        // 完全覆盖为更旧的数据后，导入时间仍应让版本向前推进。
        let backup = backup_with(vec![task_record(
            "old",
            "工作",
            "旧任务",
            "2026-01-01T00:00:00+00:00",
        )]);
        let result = apply_backup(&conn, &backup, ImportMode::Overwrite).expect("导入旧备份");
        let version = result.data_version.expect("导入后应存在版本");
        assert!(
            version > "2026-02-01T00:00:00+00:00".to_string(),
            "导入后的版本应不早于本次导入时间"
        );
    }

    #[test]
    fn parse_rejects_broken_or_unknown_backups() {
        let wrong_format = serde_json::json!({
            "format": "other-app",
            "schemaVersion": 1,
            "tasks": []
        });
        assert!(parse_backup(&wrong_format.to_string()).is_err());

        let future_schema = serde_json::json!({
            "format": BACKUP_FORMAT,
            "schemaVersion": 99,
            "tasks": []
        });
        assert!(parse_backup(&future_schema.to_string()).is_err());

        let duplicate_task = serde_json::json!({
            "format": BACKUP_FORMAT,
            "schemaVersion": 1,
            "tasks": [
                {"id": "dup", "owner": "工作", "title": "A"},
                {"id": "dup", "owner": "工作", "title": "B"}
            ]
        });
        assert!(parse_backup(&duplicate_task.to_string()).is_err());

        let dangling_event = serde_json::json!({
            "format": BACKUP_FORMAT,
            "schemaVersion": 1,
            "tasks": [],
            "taskEvents": [{"taskId": "missing", "eventType": "created"}]
        });
        assert!(parse_backup(&dangling_event.to_string()).is_err());

        let valid = serde_json::json!({
            "format": BACKUP_FORMAT,
            "schemaVersion": 1,
            "tasks": [{"id": "t1", "owner": "工作", "title": "任务"}]
        });
        assert!(parse_backup(&valid.to_string()).is_ok());
    }
}
