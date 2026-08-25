use chrono::{Datelike, Local, NaiveDate, NaiveTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::process::Command;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, State};

const AUTO_START_REG_PATH: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
const AUTO_START_VALUE_NAME: &str = "StickyNote";

struct DbState {
    conn: Mutex<Connection>,
}

#[derive(Serialize)]
struct Task {
    id: String,
    owner: String,
    title: String,
    deadline_at: Option<String>,
    is_urgent: bool,
    created_at: String,
    updated_at: String,
    completed_at: Option<String>,
    archived_at: Option<String>,
    next_milestone_title: Option<String>,
    next_milestone_planned_at: Option<String>,
    recurring_setting_id: Option<String>,
    occurrence_date: Option<String>,
    is_recurring: bool,
}

#[derive(Serialize)]
struct RecurringTaskSetting {
    id: String,
    owner: String,
    title: String,
    is_urgent: bool,
    date_range_type: String,
    start_date: String,
    end_date: Option<String>,
    frequency_type: String,
    weekdays: String,
    generate_time: String,
    repeat_count: i64,
    created_at: String,
    updated_at: String,
    status: String,
    voided_at: Option<String>,
}

#[derive(Serialize)]
struct RecurringSettingEvent {
    id: i64,
    setting_id: String,
    event_type: String,
    created_at: String,
}

#[derive(Serialize)]
struct Milestone {
    id: i64,
    task_id: String,
    title: String,
    planned_at: Option<String>,
    completed_at: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MilestoneInput {
    title: String,
    planned_at: Option<String>,
}

#[derive(Serialize)]
struct TaskEvent {
    id: i64,
    task_id: String,
    event_type: String,
    before_value: Option<String>,
    after_value: Option<String>,
    created_at: String,
}

pub fn run() {
    install_panic_logger();

    let result = tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|err| format!("应用初始化失败：{err}"))?;
            fs::create_dir_all(&app_data_dir).map_err(|err| format!("应用初始化失败：{err}"))?;
            let db_path = app_data_dir.join("desktop-sticky-note.sqlite3");
            let conn = Connection::open(db_path).map_err(|err| format!("无法打开数据库：{err}"))?;
            migrate(&conn).map_err(|err| format!("应用初始化失败：{err}"))?;
            app.manage(DbState {
                conn: Mutex::new(conn),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_active_tasks,
            list_archived_tasks,
            get_task,
            get_task_events,
            create_task,
            update_task,
            add_task_progress,
            delete_task_progress,
            delete_task,
            archive_task,
            restore_archived_task,
            complete_task,
            undo_complete_task,
            reorder_tasks,
            list_milestones,
            add_milestone,
            update_milestone,
            complete_milestone,
            undo_complete_milestone,
            delete_milestone,
            rename_user_data,
            delete_user_data,
            create_recurring_task_setting,
            list_recurring_task_settings,
            update_recurring_task_setting,
            void_recurring_task_setting,
            delete_recurring_task_setting,
            list_recurring_setting_tasks,
            list_recurring_setting_events,
            set_note_size,
            set_note_position,
            set_minimal_mode,
            is_auto_start_enabled,
            set_auto_start_enabled,
            open_external_link,
            exit_app
        ])
        .run(tauri::generate_context!());

    if let Err(error) = result {
        eprintln!("Tauri runtime failed: {error}");
        write_startup_log(&format!("Tauri runtime failed: {error}"));
    }
}

fn install_panic_logger() {
    // 保留默认 panic 输出，便于开发环境定位启动问题；同时写入本地启动日志。
    std::panic::set_hook(Box::new(|panic_info| {
        eprintln!("Unhandled panic: {panic_info}");
        write_startup_log(&format!("Unhandled panic: {panic_info}"));
    }));
}

fn write_startup_log(message: &str) {
    let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") else {
        return;
    };
    let log_dir = std::path::PathBuf::from(local_app_data).join("DesktopStickyNote");
    if fs::create_dir_all(&log_dir).is_err() {
        return;
    }
    let log_path = log_dir.join("startup.log");
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
        let _ = writeln!(file, "{} | {message}", Utc::now().to_rfc3339());
    }
}

fn place_window(window: &tauri::WebviewWindow, position: &str) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "无法获取当前显示器".to_string())?;
    let window_size = window.outer_size().map_err(|err| err.to_string())?;
    let work_area = monitor.work_area();
    let margin = 24_i32;
    let left = work_area.position.x + margin;
    let top = work_area.position.y + margin;
    let right =
        work_area.position.x + work_area.size.width as i32 - window_size.width as i32 - margin;
    let bottom =
        work_area.position.y + work_area.size.height as i32 - window_size.height as i32 - margin;
    let center_x =
        work_area.position.x + (work_area.size.width as i32 - window_size.width as i32) / 2;
    let center_y =
        work_area.position.y + (work_area.size.height as i32 - window_size.height as i32) / 2;
    let (x, y) = match position {
        "center" => (center_x, center_y),
        "bottom-right" => (right, bottom),
        "top-left" => (left, top),
        "bottom-left" => (left, bottom),
        _ => (right, top),
    };
    window
        .set_position(PhysicalPosition::new(
            x.max(work_area.position.x),
            y.max(work_area.position.y),
        ))
        .map_err(|err| err.to_string())
}

fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            owner TEXT NOT NULL DEFAULT 'default',
            title TEXT NOT NULL,
            deadline_at TEXT,
            is_urgent INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            completed_at TEXT,
            archived_at TEXT
            , deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS task_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            before_value TEXT,
            after_value TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(task_id) REFERENCES tasks(id)
        );

        CREATE TABLE IF NOT EXISTS task_milestones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            title TEXT NOT NULL,
            planned_at TEXT,
            completed_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(task_id) REFERENCES tasks(id)
        );

        CREATE TABLE IF NOT EXISTS recurring_task_settings (
            id TEXT PRIMARY KEY,
            owner TEXT NOT NULL,
            title TEXT NOT NULL,
            is_urgent INTEGER NOT NULL DEFAULT 0,
            date_range_type TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT,
            frequency_type TEXT NOT NULL,
            weekdays TEXT NOT NULL DEFAULT '',
            generate_time TEXT NOT NULL DEFAULT '06:00',
            repeat_count INTEGER NOT NULL DEFAULT 1,
            voided_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS recurring_setting_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            setting_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        ",
    )?;

    conn.execute_batch("ALTER TABLE tasks ADD COLUMN owner TEXT NOT NULL DEFAULT 'default';")
        .or_else(|err| {
            if is_duplicate_column_error(&err) {
                Ok(())
            } else {
                Err(err)
            }
        })?;

    conn.execute_batch("ALTER TABLE tasks ADD COLUMN sort_order INTEGER;")
        .or_else(|err| {
            if is_duplicate_column_error(&err) {
                Ok(())
            } else {
                Err(err)
            }
        })?;

    conn.execute_batch("ALTER TABLE tasks ADD COLUMN recurring_setting_id TEXT;")
        .or_else(|err| if is_duplicate_column_error(&err) { Ok(()) } else { Err(err) })?;
    conn.execute_batch("ALTER TABLE tasks ADD COLUMN occurrence_date TEXT;")
        .or_else(|err| if is_duplicate_column_error(&err) { Ok(()) } else { Err(err) })?;
    conn.execute_batch("ALTER TABLE tasks ADD COLUMN deleted_at TEXT;")
        .or_else(|err| if is_duplicate_column_error(&err) { Ok(()) } else { Err(err) })?;
    conn.execute_batch("ALTER TABLE recurring_task_settings ADD COLUMN repeat_count INTEGER NOT NULL DEFAULT 1;")
        .or_else(|err| if is_duplicate_column_error(&err) { Ok(()) } else { Err(err) })?;
    conn.execute_batch("ALTER TABLE recurring_task_settings ADD COLUMN voided_at TEXT;")
        .or_else(|err| if is_duplicate_column_error(&err) { Ok(()) } else { Err(err) })?;

    migrate_legacy_deadlines(conn)?;
    Ok(())
}

/// 将历史任务上的截止时间字段迁移为首个节点，避免升级后旧计划信息丢失。
fn migrate_legacy_deadlines(conn: &Connection) -> rusqlite::Result<()> {
    let mut stmt = conn.prepare(
        "
        SELECT id, deadline_at
        FROM tasks
        WHERE deadline_at IS NOT NULL
          AND id NOT IN (SELECT task_id FROM task_milestones)
        ",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let legacy: Vec<(String, String)> = rows.collect::<rusqlite::Result<_>>()?;
    for (task_id, planned_at) in legacy {
        let now = now_string();
        conn.execute(
            "
            INSERT INTO task_milestones (task_id, title, planned_at, completed_at, created_at, updated_at)
            VALUES (?1, ?2, ?3, NULL, ?4, ?4)
            ",
            params![task_id, "截止时间", planned_at, now],
        )?;
    }
    Ok(())
}

#[tauri::command]
fn list_active_tasks(state: State<DbState>, owner: String) -> Result<Vec<Task>, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let owner = normalize_owner(&owner)?;
    refresh_recurring_tasks(&conn, &owner)?;
    query_tasks(
        &conn,
        "
        SELECT t.id, t.owner, t.title, t.deadline_at, t.is_urgent, t.created_at, t.updated_at, t.completed_at, t.archived_at,
          (SELECT m.title FROM task_milestones m
            WHERE m.task_id = t.id AND m.completed_at IS NULL
            ORDER BY CASE WHEN m.planned_at IS NULL THEN 1 ELSE 0 END, m.planned_at ASC, m.id ASC
            LIMIT 1),
          (SELECT m.planned_at FROM task_milestones m
            WHERE m.task_id = t.id AND m.completed_at IS NULL
            ORDER BY CASE WHEN m.planned_at IS NULL THEN 1 ELSE 0 END, m.planned_at ASC, m.id ASC
            LIMIT 1),
          t.recurring_setting_id, t.occurrence_date,
          CASE WHEN t.recurring_setting_id IS NULL THEN 0 ELSE 1 END
        FROM tasks t
        WHERE t.owner = ?1 AND t.archived_at IS NULL AND t.deleted_at IS NULL
        ORDER BY t.sort_order IS NULL ASC, t.sort_order ASC,
          t.is_urgent DESC,
          CASE WHEN COALESCE(
            (SELECT MIN(m.planned_at) FROM task_milestones m
              WHERE m.task_id = t.id AND m.completed_at IS NULL),
            t.deadline_at) IS NULL THEN 1 ELSE 0 END ASC,
          COALESCE(
            (SELECT MIN(m.planned_at) FROM task_milestones m
              WHERE m.task_id = t.id AND m.completed_at IS NULL),
            t.deadline_at) ASC,
          t.created_at ASC
        ",
        &owner,
    )
}

#[tauri::command]
fn list_archived_tasks(state: State<DbState>, owner: String) -> Result<Vec<Task>, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let owner = normalize_owner(&owner)?;
    refresh_recurring_tasks(&conn, &owner)?;
    query_tasks(
        &conn,
        "
        SELECT t.id, t.owner, t.title, t.deadline_at, t.is_urgent, t.created_at, t.updated_at, t.completed_at, t.archived_at,
          NULL, NULL, t.recurring_setting_id, t.occurrence_date,
          CASE WHEN t.recurring_setting_id IS NULL THEN 0 ELSE 1 END
        FROM tasks t
        WHERE t.owner = ?1 AND t.archived_at IS NOT NULL AND t.deleted_at IS NULL
        ORDER BY t.archived_at DESC
        ",
        &owner,
    )
}

#[tauri::command]
fn get_task(state: State<DbState>, owner: String, task_id: String) -> Result<Task, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let owner = normalize_owner(&owner)?;
    let mut stmt = conn
        .prepare(
            "
            SELECT t.id, t.owner, t.title, t.deadline_at, t.is_urgent, t.created_at, t.updated_at, t.completed_at, t.archived_at,
              (SELECT m.title FROM task_milestones m
                WHERE m.task_id = t.id AND m.completed_at IS NULL
                ORDER BY CASE WHEN m.planned_at IS NULL THEN 1 ELSE 0 END, m.planned_at ASC, m.id ASC
                LIMIT 1),
              (SELECT m.planned_at FROM task_milestones m
                WHERE m.task_id = t.id AND m.completed_at IS NULL
                ORDER BY CASE WHEN m.planned_at IS NULL THEN 1 ELSE 0 END, m.planned_at ASC, m.id ASC
                LIMIT 1),
              t.recurring_setting_id, t.occurrence_date,
              CASE WHEN t.recurring_setting_id IS NULL THEN 0 ELSE 1 END
            FROM tasks t
            WHERE t.id = ?1 AND t.owner = ?2 AND t.deleted_at IS NULL
            ",
        )
        .map_err(|err| err.to_string())?;
    stmt.query_row(params![task_id, owner], map_task)
        .optional()
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "任务不存在".to_string())
}

#[tauri::command]
fn get_task_events(
    state: State<DbState>,
    owner: String,
    task_id: String,
) -> Result<Vec<TaskEvent>, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let owner = normalize_owner(&owner)?;
    let mut stmt = conn
        .prepare(
            "
            SELECT id, task_id, event_type, before_value, after_value, created_at
            FROM task_events
            WHERE task_id = ?1
              AND EXISTS (
                SELECT 1 FROM tasks
                WHERE tasks.id = task_events.task_id AND tasks.owner = ?2
              )
            ORDER BY created_at ASC, id ASC
            ",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![task_id, owner], map_event)
        .map_err(|err| err.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn create_task(
    state: State<DbState>,
    owner: String,
    title: String,
    deadline_at: Option<String>,
    is_urgent: bool,
    milestones: Option<Vec<MilestoneInput>>,
) -> Result<Task, String> {
    let owner = normalize_owner(&owner)?;
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() {
        return Err("任务标题不能为空".to_string());
    }

    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let now = now_string();
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "
        INSERT INTO tasks (id, owner, title, deadline_at, is_urgent, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
        ",
        params![
            id,
            owner,
            trimmed_title,
            deadline_at,
            bool_to_i64(is_urgent),
            now
        ],
    )
    .map_err(|err| err.to_string())?;
    insert_event(&conn, &id, "created", None, Some(trimmed_title))?;
    if let Some(task_deadline) = query_task(&conn, &owner, &id)?.deadline_at {
        insert_event(&conn, &id, "deadline_changed", None, Some(&task_deadline))?;
    }
    if is_urgent {
        insert_event(&conn, &id, "urgent_changed", Some("false"), Some("true"))?;
    }

    if let Some(items) = milestones {
        for item in items {
            let milestone_title = item.title.trim();
            if milestone_title.is_empty() {
                return Err("节点名称不能为空".to_string());
            }
            if milestone_title.chars().count() > 40 {
                return Err("节点名称不能超过 40 个字符".to_string());
            }
            let milestone_now = now_string();
            conn.execute(
                "
                INSERT INTO task_milestones (task_id, title, planned_at, completed_at, created_at, updated_at)
                VALUES (?1, ?2, ?3, NULL, ?4, ?4)
                ",
                params![id, milestone_title, item.planned_at, milestone_now],
            )
            .map_err(|err| err.to_string())?;
        }
    }

    query_task(&conn, &owner, &id)
}

#[tauri::command]
fn update_task(
    state: State<DbState>,
    owner: String,
    task_id: String,
    title: String,
    deadline_at: Option<String>,
    is_urgent: bool,
) -> Result<Task, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let owner = normalize_owner(&owner)?;
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() {
        return Err("任务标题不能为空".to_string());
    }
    let task = query_task(&conn, &owner, &task_id)?;
    if task.archived_at.is_some() && !task.is_recurring {
        return Err("已归档任务不能修改".to_string());
    }

    let now = now_string();
    if task.title != trimmed_title {
        insert_event(
            &conn,
            &task_id,
            "title_changed",
            Some(&task.title),
            Some(trimmed_title),
        )?;
    }
    if task.deadline_at != deadline_at {
        insert_event(
            &conn,
            &task_id,
            "deadline_changed",
            task.deadline_at.as_deref(),
            deadline_at.as_deref(),
        )?;
    }
    if !task.is_recurring && task.is_urgent != is_urgent {
        insert_event(
            &conn,
            &task_id,
            "urgent_changed",
            Some(if task.is_urgent { "true" } else { "false" }),
            Some(if is_urgent { "true" } else { "false" }),
        )?;
    }

    conn.execute(
        "
        UPDATE tasks
        SET title = ?1, deadline_at = ?2, is_urgent = ?3, updated_at = ?4
        WHERE id = ?5 AND owner = ?6
        ",
        params![
            trimmed_title,
            deadline_at,
            bool_to_i64(if task.is_recurring { task.is_urgent } else { is_urgent }),
            now,
            task_id,
            owner
        ],
    )
    .map_err(|err| err.to_string())?;
    query_task(&conn, &owner, &task_id)
}

#[tauri::command]
fn add_task_progress(
    state: State<DbState>,
    owner: String,
    task_id: String,
    progress: String,
) -> Result<(), String> {
    let owner = normalize_owner(&owner)?;
    let progress = progress.trim();
    if progress.is_empty() {
        return Err("进度内容不能为空".to_string());
    }
    if progress.chars().count() > 240 {
        return Err("进度内容不能超过 240 个字符".to_string());
    }

    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let task = query_task(&conn, &owner, &task_id)?;
    if task.archived_at.is_some() {
        return Err("已归档任务不能维护进度".to_string());
    }
    insert_event(&conn, &task_id, "progress_updated", None, Some(progress))
}

#[tauri::command]
fn delete_task_progress(
    state: State<DbState>,
    owner: String,
    task_id: String,
    event_id: i64,
) -> Result<(), String> {
    let owner = normalize_owner(&owner)?;
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let task = query_task(&conn, &owner, &task_id)?;
    let deleted = conn
        .execute(
            "
            DELETE FROM task_events
            WHERE id = ?1 AND task_id = ?2 AND event_type = 'progress_updated'
            ",
            params![event_id, task_id],
        )
        .map_err(|err| err.to_string())?;
    if deleted == 0 {
        return Err("进度记录不存在或无法删除".to_string());
    }
    Ok(())
}

#[tauri::command]
fn complete_task(state: State<DbState>, owner: String, task_id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let owner = normalize_owner(&owner)?;
    let task = query_task(&conn, &owner, &task_id)?;
    if task.archived_at.is_some() {
        if task.is_recurring && task.completed_at.is_none() {
            let now = now_string();
            conn.execute(
                "UPDATE tasks SET completed_at=?1, updated_at=?1 WHERE id=?2 AND owner=?3",
                params![now, task_id, owner],
            ).map_err(|err| err.to_string())?;
            insert_event(&conn, &task_id, "completed", None, None)?;
        }
        return Ok(());
    }
    let now = now_string();
    conn.execute(
        "
        UPDATE tasks
        SET completed_at = ?1, archived_at = ?1, updated_at = ?1
        WHERE id = ?2 AND owner = ?3
        ",
        params![now, task_id, owner],
    )
    .map_err(|err| err.to_string())?;
    insert_event(&conn, &task_id, "completed", None, None)?;
    insert_event(&conn, &task_id, "archived", None, None)?;
    Ok(())
}

#[tauri::command]
fn undo_complete_task(state: State<DbState>, owner: String, task_id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let owner = normalize_owner(&owner)?;
    let task = query_task(&conn, &owner, &task_id)?;
    if task.archived_at.is_none() {
        return Ok(());
    }
    let now = now_string();
    let sql = if task.is_recurring && task.occurrence_date.as_deref() != Some(&local_today_string()) {
        "UPDATE tasks SET completed_at = NULL, updated_at = ?1 WHERE id = ?2 AND owner = ?3"
    } else {
        "UPDATE tasks SET completed_at = NULL, archived_at = NULL, updated_at = ?1 WHERE id = ?2 AND owner = ?3"
    };
    conn.execute(sql, params![now, task_id, owner])
    .map_err(|err| err.to_string())?;
    insert_event(&conn, &task_id, "completion_undone", None, None)?;
    Ok(())
}

#[tauri::command]
fn reorder_tasks(state: State<DbState>, owner: String, ordered_ids: Vec<String>) -> Result<(), String> {
    let owner = normalize_owner(&owner)?;
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let now = now_string();
    for (index, task_id) in ordered_ids.iter().enumerate() {
        conn.execute(
            "
            UPDATE tasks
            SET sort_order = ?1, updated_at = ?2
            WHERE id = ?3 AND owner = ?4 AND archived_at IS NULL
            ",
            params![index as i64, now, task_id, owner],
        )
        .map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn rename_user_data(
    state: State<DbState>,
    old_owner: String,
    new_owner: String,
) -> Result<(), String> {
    let old_owner = normalize_owner(&old_owner)?;
    let new_owner = normalize_owner(&new_owner)?;
    if old_owner == new_owner {
        return Ok(());
    }

    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    conn.execute(
        "
        UPDATE tasks
        SET owner = ?1, updated_at = ?2
        WHERE owner = ?3
        ",
        params![new_owner, now_string(), old_owner],
    )
    .map_err(|err| err.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_user_data(state: State<DbState>, owner: String) -> Result<(), String> {
    let owner = normalize_owner(&owner)?;
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    conn.execute(
        "
        DELETE FROM task_events
        WHERE task_id IN (
          SELECT id FROM tasks WHERE owner = ?1
        )
        ",
        params![owner],
    )
    .map_err(|err| err.to_string())?;
    conn.execute(
        "
        DELETE FROM task_milestones
        WHERE task_id IN (
          SELECT id FROM tasks WHERE owner = ?1
        )
        ",
        params![owner],
    )
    .map_err(|err| err.to_string())?;
    conn.execute("DELETE FROM tasks WHERE owner = ?1", params![owner])
        .map_err(|err| err.to_string())?;
    conn.execute("DELETE FROM recurring_task_settings WHERE owner = ?1", params![owner])
        .map_err(|err| err.to_string())?;
    Ok(())
}

#[tauri::command]
fn archive_task(state: State<DbState>, owner: String, task_id: String, is_completed: bool) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let owner = normalize_owner(&owner)?;
    let task = query_task(&conn, &owner, &task_id)?;
    if task.archived_at.is_some() { return Ok(()); }
    let now = now_string();
    conn.execute(
        "UPDATE tasks SET completed_at=?1, archived_at=?2, updated_at=?2 WHERE id=?3 AND owner=?4",
        params![if is_completed { Some(now.clone()) } else { Option::<String>::None }, now, task_id, owner],
    ).map_err(|err| err.to_string())?;
    if is_completed { insert_event(&conn, &task_id, "completed", None, None)?; }
    insert_event(&conn, &task_id, "archived", None, None)?;
    Ok(())
}

#[tauri::command]
fn restore_archived_task(state: State<DbState>, owner: String, task_id: String, action: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let owner = normalize_owner(&owner)?;
    let task = query_task(&conn, &owner, &task_id)?;
    if task.archived_at.is_none() { return Ok(()); }
    let recurring_overdue = task.is_recurring && !recurring_task_is_current(&conn, &task)?;
    let now = now_string();
    match action.as_str() {
        "undo_completion" if task.completed_at.is_some() => {
            let archived_at = if recurring_overdue { task.archived_at.clone() } else { None };
            conn.execute("UPDATE tasks SET completed_at=NULL, archived_at=?1, updated_at=?2 WHERE id=?3 AND owner=?4", params![archived_at, now, task_id, owner]).map_err(|err| err.to_string())?;
            if !recurring_overdue { conn.execute("UPDATE tasks SET archived_at=NULL WHERE id=?1", params![task_id]).map_err(|err| err.to_string())?; }
            insert_event(&conn, &task_id, "completion_undone", None, None)?;
        }
        "mark_completed" if task.completed_at.is_none() => {
            conn.execute("UPDATE tasks SET completed_at=?1, updated_at=?1 WHERE id=?2 AND owner=?3", params![now, task_id, owner]).map_err(|err| err.to_string())?;
            insert_event(&conn, &task_id, "completed", None, None)?;
        }
        "undo_archive" if task.completed_at.is_none() && !recurring_overdue => {
            conn.execute("UPDATE tasks SET archived_at=NULL, updated_at=?1 WHERE id=?2 AND owner=?3", params![now, task_id, owner]).map_err(|err| err.to_string())?;
            insert_event(&conn, &task_id, "archive_undone", None, None)?;
        }
        _ => return Err("当前任务状态不支持该操作".to_string()),
    }
    Ok(())
}

fn recurring_task_is_current(conn: &Connection, task: &Task) -> Result<bool, String> {
    let Some(setting_id) = task.recurring_setting_id.as_deref() else { return Ok(true); };
    let setting = query_recurring_setting_by_id(conn, setting_id)?;
    let today = Local::now().date_naive();
    Ok(task.occurrence_date.as_deref().map(|value| value.split('#').next().unwrap_or(value) == today.to_string()).unwrap_or(false) && setting_applies_on(&setting, today))
}

#[tauri::command]
fn delete_task(state: State<DbState>, owner: String, task_id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let owner = normalize_owner(&owner)?;
    let task = query_task(&conn, &owner, &task_id)?;
    if task.archived_at.is_none() { return Err("只能删除已归档任务".to_string()); }
    conn.execute("UPDATE tasks SET deleted_at=?1, updated_at=?1 WHERE id=?2 AND owner=?3", params![now_string(), task_id, owner]).map_err(|err| err.to_string())?;
    Ok(())
}

#[tauri::command]
fn create_recurring_task_setting(
    state: State<DbState>,
    owner: String,
    title: String,
    _is_urgent: bool,
    date_range_type: String,
    start_date: String,
    end_date: Option<String>,
    frequency_type: String,
    weekdays: Vec<i64>,
    generate_time: String,
    repeat_count: i64,
) -> Result<RecurringTaskSetting, String> {
    let owner = normalize_owner(&owner)?;
    validate_recurring_setting(&title, &date_range_type, &start_date, end_date.as_deref(), &frequency_type, &weekdays, &generate_time, repeat_count)?;
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_string();
    conn.execute(
        "INSERT INTO recurring_task_settings (id, owner, title, is_urgent, date_range_type, start_date, end_date, frequency_type, weekdays, generate_time, repeat_count, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)",
        params![id, owner, title.trim(), 0_i64, date_range_type, start_date, end_date, frequency_type, weekdays_to_string(&weekdays), generate_time, repeat_count, now],
    ).map_err(|err| err.to_string())?;
    conn.execute("INSERT INTO recurring_setting_events (setting_id,event_type,created_at) VALUES (?1,'created',?2)", params![id, now]).map_err(|err| err.to_string())?;
    refresh_recurring_tasks(&conn, &owner)?;
    query_recurring_setting(&conn, &owner, &id)
}

#[tauri::command]
fn void_recurring_task_setting(state: State<DbState>, owner: String, setting_id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let owner = normalize_owner(&owner)?;
    let setting = query_recurring_setting(&conn, &owner, &setting_id)?;
    if setting.status != "生效中" { return Err("只有生效中的周期任务设置可以作废".to_string()); }
    let now = now_string();
    conn.execute("UPDATE recurring_task_settings SET voided_at=?1, updated_at=?1 WHERE id=?2 AND owner=?3", params![now, setting_id, owner]).map_err(|err| err.to_string())?;
    conn.execute("INSERT INTO recurring_setting_events (setting_id,event_type,created_at) VALUES (?1,'voided',?2)", params![setting_id, now]).map_err(|err| err.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_recurring_task_setting(state: State<DbState>, owner: String, setting_id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let owner = normalize_owner(&owner)?;
    let setting = query_recurring_setting(&conn, &owner, &setting_id)?;
    if setting.status != "已作废" { return Err("只有已作废的周期任务规则可以删除".to_string()); }
    let active_task_count: i64 = conn.query_row("SELECT COUNT(1) FROM tasks WHERE owner=?1 AND recurring_setting_id=?2 AND deleted_at IS NULL", params![owner, setting_id], |row| row.get(0)).map_err(|err| err.to_string())?;
    if active_task_count > 0 { return Err(format!("该规则仍被 {} 条未删除任务引用，无法删除。请先处理相关任务。", active_task_count)); }
    conn.execute("DELETE FROM recurring_setting_events WHERE setting_id=?1", params![setting_id]).map_err(|err| err.to_string())?;
    conn.execute("DELETE FROM recurring_task_settings WHERE id=?1 AND owner=?2", params![setting_id, owner]).map_err(|err| err.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_recurring_task_settings(state: State<DbState>, owner: String) -> Result<Vec<RecurringTaskSetting>, String> {
    let owner = normalize_owner(&owner)?;
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    refresh_recurring_tasks(&conn, &owner)?;
    let mut stmt = conn.prepare(
        "SELECT id, owner, title, is_urgent, date_range_type, start_date, end_date, frequency_type, weekdays, generate_time, repeat_count, created_at, updated_at, voided_at
         FROM recurring_task_settings WHERE owner = ?1 ORDER BY created_at DESC"
    ).map_err(|err| err.to_string())?;
    let rows = stmt.query_map(params![owner], map_recurring_setting).map_err(|err| err.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|err| err.to_string())
}

#[tauri::command]
fn update_recurring_task_setting(
    state: State<DbState>, owner: String, setting_id: String, title: String, _is_urgent: bool,
    date_range_type: String, start_date: String, end_date: Option<String>, frequency_type: String,
    weekdays: Vec<i64>, generate_time: String, repeat_count: i64,
) -> Result<RecurringTaskSetting, String> {
    let owner = normalize_owner(&owner)?;
    validate_recurring_setting(&title, &date_range_type, &start_date, end_date.as_deref(), &frequency_type, &weekdays, &generate_time, repeat_count)?;
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let current = query_recurring_setting(&conn, &owner, &setting_id)?;
    if current.status == "已作废" { return Err("已作废的周期任务规则不可编辑".to_string()); }
    let affected = conn.execute(
        "UPDATE recurring_task_settings SET title=?1, is_urgent=?2, date_range_type=?3, start_date=?4, end_date=?5, frequency_type=?6, weekdays=?7, generate_time=?8, repeat_count=?9, updated_at=?10 WHERE id=?11 AND owner=?12",
        params![title.trim(), 0_i64, date_range_type, start_date, end_date, frequency_type, weekdays_to_string(&weekdays), generate_time, repeat_count, now_string(), setting_id, owner],
    ).map_err(|err| err.to_string())?;
    if affected == 0 { return Err("周期任务设置不存在".to_string()); }
    conn.execute("INSERT INTO recurring_setting_events (setting_id,event_type,created_at) VALUES (?1,'updated',?2)", params![setting_id, now_string()]).map_err(|err| err.to_string())?;
    refresh_recurring_tasks(&conn, &owner)?;
    query_recurring_setting(&conn, &owner, &setting_id)
}

#[tauri::command]
fn list_recurring_setting_events(state: State<DbState>, owner: String, setting_id: String) -> Result<Vec<RecurringSettingEvent>, String> {
    let owner = normalize_owner(&owner)?;
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    query_recurring_setting(&conn, &owner, &setting_id)?;
    let mut stmt = conn.prepare("SELECT id, setting_id, event_type, created_at FROM recurring_setting_events WHERE setting_id=?1 ORDER BY created_at ASC, id ASC").map_err(|err| err.to_string())?;
    let events = stmt.query_map(params![setting_id], |row| Ok(RecurringSettingEvent { id: row.get(0)?, setting_id: row.get(1)?, event_type: row.get(2)?, created_at: row.get(3)? })).map_err(|err| err.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>().map_err(|err| err.to_string())?;
    Ok(events)
}

#[tauri::command]
fn list_recurring_setting_tasks(state: State<DbState>, owner: String, setting_id: String) -> Result<Vec<Task>, String> {
    let owner = normalize_owner(&owner)?;
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    query_recurring_setting(&conn, &owner, &setting_id)?;
    let mut stmt = conn.prepare(
        "SELECT id, owner, title, deadline_at, is_urgent, created_at, updated_at, completed_at, archived_at, NULL, NULL, recurring_setting_id, occurrence_date, 1
         FROM tasks WHERE owner=?1 AND recurring_setting_id=?2 AND deleted_at IS NULL ORDER BY occurrence_date DESC, created_at DESC"
    ).map_err(|err| err.to_string())?;
    let rows = stmt.query_map(params![owner, setting_id], map_task).map_err(|err| err.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|err| err.to_string())
}

#[tauri::command]
fn list_milestones(
    state: State<DbState>,
    owner: String,
    task_id: String,
) -> Result<Vec<Milestone>, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let owner = normalize_owner(&owner)?;
    let task = query_task(&conn, &owner, &task_id)?;
    if task.is_recurring { return Err("周期任务不支持节点".to_string()); }
    let mut stmt = conn
        .prepare(
            "
            SELECT id, task_id, title, planned_at, completed_at, created_at, updated_at
            FROM task_milestones
            WHERE task_id = ?1
            ORDER BY CASE WHEN planned_at IS NULL THEN 1 ELSE 0 END, planned_at ASC, id ASC
            ",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![task_id], map_milestone)
        .map_err(|err| err.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn add_milestone(
    state: State<DbState>,
    owner: String,
    task_id: String,
    title: String,
    planned_at: Option<String>,
) -> Result<Milestone, String> {
    let owner = normalize_owner(&owner)?;
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() {
        return Err("节点名称不能为空".to_string());
    }
    if trimmed_title.chars().count() > 40 {
        return Err("节点名称不能超过 40 个字符".to_string());
    }

    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let task = query_task(&conn, &owner, &task_id)?;
    if task.is_recurring { return Err("周期任务不支持节点".to_string()); }
    if task.archived_at.is_some() {
        return Err("已归档任务不能添加节点".to_string());
    }

    let now = now_string();
    conn.execute(
        "
        INSERT INTO task_milestones (task_id, title, planned_at, completed_at, created_at, updated_at)
        VALUES (?1, ?2, ?3, NULL, ?4, ?4)
        ",
        params![task_id, trimmed_title, planned_at, now],
    )
    .map_err(|err| err.to_string())?;
    let milestone_id = conn.last_insert_rowid();
    insert_event(&conn, &task_id, "milestone_created", None, Some(trimmed_title))?;
    if let Some(planned) = planned_at.as_deref() {
        insert_event(&conn, &task_id, "milestone_planned_changed", None, Some(planned))?;
    }
    query_milestone(&conn, &task_id, milestone_id)
}

#[tauri::command]
fn update_milestone(
    state: State<DbState>,
    owner: String,
    task_id: String,
    milestone_id: i64,
    title: String,
    planned_at: Option<String>,
) -> Result<Milestone, String> {
    let owner = normalize_owner(&owner)?;
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() {
        return Err("节点名称不能为空".to_string());
    }
    if trimmed_title.chars().count() > 40 {
        return Err("节点名称不能超过 40 个字符".to_string());
    }

    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let task = query_task(&conn, &owner, &task_id)?;
    if task.is_recurring { return Err("周期任务不支持节点".to_string()); }
    if task.archived_at.is_some() {
        return Err("已归档任务不能修改节点".to_string());
    }
    let milestone = query_milestone(&conn, &task_id, milestone_id)?;
    if milestone.completed_at.is_some() {
        return Err("已完成的节点不能修改".to_string());
    }

    let now = now_string();
    if milestone.title != trimmed_title {
        insert_event(
            &conn,
            &task_id,
            "milestone_renamed",
            Some(&milestone.title),
            Some(trimmed_title),
        )?;
    }
    if milestone.planned_at != planned_at {
        insert_event(
            &conn,
            &task_id,
            "milestone_planned_changed",
            milestone.planned_at.as_deref(),
            planned_at.as_deref(),
        )?;
    }
    conn.execute(
        "
        UPDATE task_milestones
        SET title = ?1, planned_at = ?2, updated_at = ?3
        WHERE id = ?4 AND task_id = ?5
        ",
        params![trimmed_title, planned_at, now, milestone_id, task_id],
    )
    .map_err(|err| err.to_string())?;
    query_milestone(&conn, &task_id, milestone_id)
}

#[tauri::command]
fn complete_milestone(
    state: State<DbState>,
    owner: String,
    task_id: String,
    milestone_id: i64,
) -> Result<(), String> {
    let owner = normalize_owner(&owner)?;
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let task = query_task(&conn, &owner, &task_id)?;
    if task.is_recurring { return Err("周期任务不支持节点".to_string()); }
    let milestone = query_milestone(&conn, &task_id, milestone_id)?;
    if milestone.completed_at.is_some() {
        return Ok(());
    }
    let now = now_string();
    conn.execute(
        "
        UPDATE task_milestones
        SET completed_at = ?1, updated_at = ?1
        WHERE id = ?2 AND task_id = ?3
        ",
        params![now, milestone_id, task_id],
    )
    .map_err(|err| err.to_string())?;
    let progress_text = format!("完成节点：{}", milestone.title);
    insert_event(
        &conn,
        &task_id,
        "progress_updated",
        None,
        Some(&progress_text),
    )?;
    Ok(())
}

#[tauri::command]
fn undo_complete_milestone(
    state: State<DbState>,
    owner: String,
    task_id: String,
    milestone_id: i64,
) -> Result<(), String> {
    let owner = normalize_owner(&owner)?;
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let task = query_task(&conn, &owner, &task_id)?;
    if task.is_recurring { return Err("周期任务不支持节点".to_string()); }
    let milestone = query_milestone(&conn, &task_id, milestone_id)?;
    if milestone.completed_at.is_none() {
        return Ok(());
    }
    let now = now_string();
    conn.execute(
        "
        UPDATE task_milestones
        SET completed_at = NULL, updated_at = ?1
        WHERE id = ?2 AND task_id = ?3
        ",
        params![now, milestone_id, task_id],
    )
    .map_err(|err| err.to_string())?;
    let progress_text = format!("撤销完成节点：{}", milestone.title);
    insert_event(
        &conn,
        &task_id,
        "progress_updated",
        None,
        Some(&progress_text),
    )?;
    Ok(())
}

#[tauri::command]
fn delete_milestone(
    state: State<DbState>,
    owner: String,
    task_id: String,
    milestone_id: i64,
) -> Result<(), String> {
    let owner = normalize_owner(&owner)?;
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let task = query_task(&conn, &owner, &task_id)?;
    if task.is_recurring { return Err("周期任务不支持节点".to_string()); }
    if task.archived_at.is_some() {
        return Err("已归档任务不能删除节点".to_string());
    }
    let milestone = query_milestone(&conn, &task_id, milestone_id)?;
    conn.execute(
        "
        DELETE FROM task_milestones
        WHERE id = ?1 AND task_id = ?2
        ",
        params![milestone_id, task_id],
    )
    .map_err(|err| err.to_string())?;
    insert_event(
        &conn,
        &task_id,
        "milestone_deleted",
        Some(&milestone.title),
        None,
    )?;
    Ok(())
}

#[tauri::command]
fn set_note_size(app: AppHandle, size: String) -> Result<(), String> {
    let (width, height) = match size.as_str() {
        "small" => (300.0, 420.0),
        "large" => (440.0, 640.0),
        _ => (360.0, 520.0),
    };
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    window
        .set_size(tauri::LogicalSize::new(width, height))
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn set_note_position(app: AppHandle, position: String) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    place_window(&window, &position)
}

#[tauri::command]
fn set_minimal_mode(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    window
        .set_decorations(!enabled)
        .map_err(|err| format!("设置窗口外框失败：{err}"))?;
    window
        .set_skip_taskbar(enabled)
        .map_err(|err| format!("设置任务栏显示失败：{err}"))?;
    Ok(enabled)
}

#[tauri::command]
fn is_auto_start_enabled() -> Result<bool, String> {
    let status = Command::new("reg")
        .args(["query", AUTO_START_REG_PATH, "/v", AUTO_START_VALUE_NAME])
        .status()
        .map_err(|err| format!("读取自启动状态失败：{err}"))?;
    Ok(status.success())
}

#[tauri::command]
fn set_auto_start_enabled(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let status = if enabled {
        let exe_path = std::env::current_exe()
            .map_err(|err| format!("获取程序路径失败：{err}"))?
            .to_string_lossy()
            .to_string();
        let launch_value = format!("\"{exe_path}\"");
        Command::new("reg")
            .args([
                "add",
                AUTO_START_REG_PATH,
                "/v",
                AUTO_START_VALUE_NAME,
                "/t",
                "REG_SZ",
                "/d",
                &launch_value,
                "/f",
            ])
            .status()
    } else {
        Command::new("reg")
            .args([
                "delete",
                AUTO_START_REG_PATH,
                "/v",
                AUTO_START_VALUE_NAME,
                "/f",
            ])
            .status()
    }
    .map_err(|err| format!("设置自启动失败：{err}"))?;

    if enabled && !status.success() {
        return Err("开启自启动失败".to_string());
    }
    if !enabled && !status.success() {
        return Ok(false);
    }

    app.emit("auto-start-changed", enabled)
        .map_err(|err| err.to_string())?;
    Ok(enabled)
}

#[tauri::command]
fn exit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn open_external_link(url: String) -> Result<(), String> {
    let status = Command::new("cmd")
        .args(["/c", "start", "", &url])
        .status()
        .map_err(|err| format!("打开链接失败：{err}"))?;
    if !status.success() {
        return Err("打开链接失败".to_string());
    }
    Ok(())
}

fn refresh_recurring_tasks(conn: &Connection, owner: &str) -> Result<(), String> {
    let today = Local::now().date_naive();
    let today_string = today.to_string();
    let now = now_string();
    conn.execute(
        "UPDATE tasks SET archived_at=?1, updated_at=?1
         WHERE owner=?2 AND recurring_setting_id IS NOT NULL AND archived_at IS NULL AND substr(occurrence_date, 1, 10) < ?3",
        params![now, owner, today_string],
    ).map_err(|err| err.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, owner, title, is_urgent, date_range_type, start_date, end_date, frequency_type, weekdays, generate_time, repeat_count, created_at, updated_at, voided_at
        FROM recurring_task_settings WHERE owner=?1 AND voided_at IS NULL"
    ).map_err(|err| err.to_string())?;
    let settings = stmt.query_map(params![owner], map_recurring_setting).map_err(|err| err.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>().map_err(|err| err.to_string())?;
    let current_time = Local::now().time();
    for setting in settings {
        if !setting_applies_on(&setting, today) || current_time < parse_generate_time(&setting.generate_time)? { continue; }
        let occurrences = if setting.frequency_type == "daily" { 1 } else { setting.repeat_count.max(1) };
        for occurrence_index in 1..=occurrences {
            let occurrence_key = if occurrences > 1 { format!("{}#{}", today_string, occurrence_index) } else { today_string.clone() };
            let existing: Option<(Option<String>,)> = conn.query_row(
                "SELECT completed_at FROM tasks WHERE recurring_setting_id=?1 AND occurrence_date=?2",
                params![setting.id, occurrence_key],
                |row| Ok((row.get(0)?,)),
            ).optional().map_err(|err| err.to_string())?;
            if let Some((completed_at,)) = existing {
                // 同一周期内严格串行：上一条未完成时，不创建下一条。
                if completed_at.is_none() { break; }
                continue;
            }
            // 只创建当前第一个缺失实例；完成后下一次刷新才会创建下一条。
            let task_title = recurring_instance_title(&setting, today, occurrence_index, occurrences);
            let inserted = conn.execute(
                "INSERT INTO tasks (id, owner, title, deadline_at, is_urgent, created_at, updated_at, recurring_setting_id, occurrence_date)
                 SELECT ?1, ?2, ?3, NULL, 0, ?4, ?4, ?5, ?6
                 WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE recurring_setting_id=?5 AND occurrence_date=?6)",
                params![uuid::Uuid::new_v4().to_string(), owner, task_title, now_string(), setting.id, occurrence_key],
            ).map_err(|err| err.to_string())?;
            if inserted > 0 {
                let task_id: String = conn.query_row("SELECT id FROM tasks WHERE recurring_setting_id=?1 AND occurrence_date=?2", params![setting.id, occurrence_key], |row| row.get(0)).map_err(|err| err.to_string())?;
                insert_event(conn, &task_id, "created", None, Some(&task_title))?;
                break;
            }
        }
    }
    Ok(())
}

fn setting_applies_on(setting: &RecurringTaskSetting, date: NaiveDate) -> bool {
    if setting.voided_at.is_some() { return false; }
    let Ok(start) = NaiveDate::parse_from_str(&setting.start_date, "%Y-%m-%d") else { return false; };
    if date < start { return false; }
    if setting.date_range_type == "range" {
        let Some(end_text) = setting.end_date.as_deref() else { return false; };
        let Ok(end) = NaiveDate::parse_from_str(end_text, "%Y-%m-%d") else { return false; };
        if date > end { return false; }
    }
    match setting.frequency_type.as_str() {
        "daily" => {
            let weekdays: Vec<u32> = setting.weekdays.split(',').filter_map(|v| v.parse::<u32>().ok()).collect();
            weekdays.into_iter().any(|day| day == date.weekday().num_days_from_monday())
        },
        "weekly" => date.weekday() == start.weekday(),
        "monthly" => date.day() == start.day().min(28),
        _ => false,
    }
}

fn parse_generate_time(value: &str) -> Result<NaiveTime, String> {
    NaiveTime::parse_from_str(value, "%H:%M").map_err(|_| "任务生成时间格式无效".to_string())
}

fn validate_recurring_setting(title: &str, date_range_type: &str, start_date: &str, end_date: Option<&str>, frequency_type: &str, weekdays: &[i64], generate_time: &str, repeat_count: i64) -> Result<(), String> {
    if title.trim().is_empty() { return Err("任务名称不能为空".to_string()); }
    if title.chars().count() > 80 { return Err("任务名称不能超过 80 个字符".to_string()); }
    let start = NaiveDate::parse_from_str(start_date, "%Y-%m-%d").map_err(|_| "开始日期无效".to_string())?;
    if date_range_type != "long" && date_range_type != "range" { return Err("时间范围无效".to_string()); }
    if date_range_type == "range" {
        let end = end_date.ok_or_else(|| "请设置结束日期".to_string())?;
        let end = NaiveDate::parse_from_str(end, "%Y-%m-%d").map_err(|_| "结束日期无效".to_string())?;
        if end < start { return Err("结束日期不能早于开始日期".to_string()); }
    }
    if !matches!(frequency_type, "daily" | "weekly" | "monthly") { return Err("重复频率无效".to_string()); }
    if frequency_type == "daily" && (weekdays.is_empty() || weekdays.iter().any(|day| !(0..=6).contains(day))) { return Err("请至少选择一个重复日".to_string()); }
    if matches!(frequency_type, "weekly" | "monthly") && !(1..=31).contains(&repeat_count) { return Err("重复次数必须为 1 到 31".to_string()); }
    parse_generate_time(generate_time)?;
    Ok(())
}

fn recurring_instance_title(setting: &RecurringTaskSetting, date: NaiveDate, occurrence_index: i64, occurrences: i64) -> String {
    let label = match setting.frequency_type.as_str() {
        "weekly" => format!("{}年{}月第{}周", date.year(), date.month(), ((date.day0() / 7) + 1)),
        "monthly" => format!("{}年{}月", date.year(), date.month()),
        _ => date.format("%Y-%m-%d").to_string(),
    };
    if occurrences > 1 { format!("{}（{} 第{}次）", setting.title, label, occurrence_index) } else { format!("{}（{}）", setting.title, label) }
}

fn weekdays_to_string(weekdays: &[i64]) -> String {
    let mut days = weekdays.to_vec(); days.sort(); days.dedup();
    days.iter().map(i64::to_string).collect::<Vec<_>>().join(",")
}

fn local_today_string() -> String { Local::now().date_naive().to_string() }

fn query_tasks(conn: &Connection, sql: &str, owner: &str) -> Result<Vec<Task>, String> {
    let mut stmt = conn.prepare(sql).map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![owner], map_task)
        .map_err(|err| err.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|err| err.to_string())
}

fn query_task(conn: &Connection, owner: &str, task_id: &str) -> Result<Task, String> {
    conn.query_row(
        "
        SELECT id, owner, title, deadline_at, is_urgent, created_at, updated_at, completed_at, archived_at,
          NULL, NULL, recurring_setting_id, occurrence_date,
          CASE WHEN recurring_setting_id IS NULL THEN 0 ELSE 1 END
        FROM tasks
        WHERE id = ?1 AND owner = ?2
        ",
        params![task_id, owner],
        map_task,
    )
    .optional()
    .map_err(|err| err.to_string())?
    .ok_or_else(|| "任务不存在".to_string())
}

fn map_task(row: &rusqlite::Row) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get(0)?,
        owner: row.get(1)?,
        title: row.get(2)?,
        deadline_at: row.get(3)?,
        is_urgent: row.get::<_, i64>(4)? == 1,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
        completed_at: row.get(7)?,
        archived_at: row.get(8)?,
        next_milestone_title: row.get(9)?,
        next_milestone_planned_at: row.get(10)?,
        recurring_setting_id: row.get(11)?,
        occurrence_date: row.get(12)?,
        is_recurring: row.get::<_, i64>(13)? == 1,
    })
}

fn map_recurring_setting(row: &rusqlite::Row) -> rusqlite::Result<RecurringTaskSetting> {
    let start_date: String = row.get(5)?;
    let end_date: Option<String> = row.get(6)?;
    let voided_at: Option<String> = row.get(13)?;
    let status = if voided_at.is_some() { "已作废".to_string() } else { match (NaiveDate::parse_from_str(&start_date, "%Y-%m-%d").ok(), end_date.as_deref().and_then(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())) {
        (Some(start), _) if Local::now().date_naive() < start => "未开始",
        (_, Some(end)) if Local::now().date_naive() > end => "已结束",
        _ => "生效中",
    }.to_string() };
    Ok(RecurringTaskSetting { id: row.get(0)?, owner: row.get(1)?, title: row.get(2)?, is_urgent: row.get::<_, i64>(3)? == 1, date_range_type: row.get(4)?, start_date, end_date, frequency_type: row.get(7)?, weekdays: row.get(8)?, generate_time: row.get(9)?, repeat_count: row.get(10)?, created_at: row.get(11)?, updated_at: row.get(12)?, status, voided_at })
}

fn query_recurring_setting(conn: &Connection, owner: &str, setting_id: &str) -> Result<RecurringTaskSetting, String> {
    conn.query_row("SELECT id, owner, title, is_urgent, date_range_type, start_date, end_date, frequency_type, weekdays, generate_time, repeat_count, created_at, updated_at, voided_at FROM recurring_task_settings WHERE id=?1 AND owner=?2", params![setting_id, owner], map_recurring_setting)
        .optional().map_err(|err| err.to_string())?.ok_or_else(|| "周期任务设置不存在".to_string())
}

fn query_recurring_setting_by_id(conn: &Connection, setting_id: &str) -> Result<RecurringTaskSetting, String> {
    conn.query_row("SELECT id, owner, title, is_urgent, date_range_type, start_date, end_date, frequency_type, weekdays, generate_time, repeat_count, created_at, updated_at, voided_at FROM recurring_task_settings WHERE id=?1", params![setting_id], map_recurring_setting)
        .optional().map_err(|err| err.to_string())?.ok_or_else(|| "周期任务设置不存在".to_string())
}

fn map_event(row: &rusqlite::Row) -> rusqlite::Result<TaskEvent> {
    Ok(TaskEvent {
        id: row.get(0)?,
        task_id: row.get(1)?,
        event_type: row.get(2)?,
        before_value: row.get(3)?,
        after_value: row.get(4)?,
        created_at: row.get(5)?,
    })
}

fn query_milestone(
    conn: &Connection,
    task_id: &str,
    milestone_id: i64,
) -> Result<Milestone, String> {
    conn.query_row(
        "
        SELECT id, task_id, title, planned_at, completed_at, created_at, updated_at
        FROM task_milestones
        WHERE id = ?1 AND task_id = ?2
        ",
        params![milestone_id, task_id],
        map_milestone,
    )
    .optional()
    .map_err(|err| err.to_string())?
    .ok_or_else(|| "节点不存在".to_string())
}

fn map_milestone(row: &rusqlite::Row) -> rusqlite::Result<Milestone> {
    Ok(Milestone {
        id: row.get(0)?,
        task_id: row.get(1)?,
        title: row.get(2)?,
        planned_at: row.get(3)?,
        completed_at: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

fn insert_event(
    conn: &Connection,
    task_id: &str,
    event_type: &str,
    before_value: Option<&str>,
    after_value: Option<&str>,
) -> Result<(), String> {
    conn.execute(
        "
        INSERT INTO task_events (task_id, event_type, before_value, after_value, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        ",
        params![task_id, event_type, before_value, after_value, now_string()],
    )
    .map_err(|err| err.to_string())?;
    Ok(())
}

fn now_string() -> String {
    Utc::now().to_rfc3339()
}

fn bool_to_i64(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}

fn normalize_owner(owner: &str) -> Result<String, String> {
    let trimmed = owner.trim();
    if trimmed.is_empty() {
        return Err("登录用户不能为空".to_string());
    }
    Ok(trimmed.to_string())
}

fn is_duplicate_column_error(err: &rusqlite::Error) -> bool {
    err.to_string().contains("duplicate column name")
}

#[cfg(test)]
mod recurring_task_change_tests {
    use super::*;

    fn test_connection() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        conn
    }

    fn insert_rule(conn: &Connection, id: &str, frequency: &str, repeat_count: i64) {
        let today = Local::now().date_naive().to_string();
        conn.execute(
            "INSERT INTO recurring_task_settings (id, owner, title, is_urgent, date_range_type, start_date, end_date, frequency_type, weekdays, generate_time, repeat_count, created_at, updated_at)
             VALUES (?1, 'test', '测试规则', 0, 'long', ?2, NULL, ?3, '', '00:00', ?4, ?5, ?5)",
            params![id, today, frequency, repeat_count, now_string()],
        ).unwrap();
    }

    fn daily_setting(weekdays: &str) -> RecurringTaskSetting {
        RecurringTaskSetting {
            id: "setting-1".to_string(), owner: "test".to_string(), title: "每日任务".to_string(),
            is_urgent: false, date_range_type: "long".to_string(), start_date: "2026-08-24".to_string(),
            end_date: None, frequency_type: "daily".to_string(), weekdays: weekdays.to_string(),
            generate_time: "06:00".to_string(), repeat_count: 1, created_at: "".to_string(),
            updated_at: "".to_string(), status: "生效中".to_string(), voided_at: None,
        }
    }

    #[test]
    fn daily_rule_without_weekdays_does_not_apply() {
        assert!(!setting_applies_on(&daily_setting(""), NaiveDate::from_ymd_opt(2026, 8, 25).unwrap()));
    }

    #[test]
    fn daily_rule_with_weekdays_only_applies_on_selected_days() {
        assert!(setting_applies_on(&daily_setting("0"), NaiveDate::from_ymd_opt(2026, 8, 24).unwrap()));
        assert!(!setting_applies_on(&daily_setting("0"), NaiveDate::from_ymd_opt(2026, 8, 25).unwrap()));
    }

    #[test]
    fn refresh_creates_today_task_for_daily_rule_on_selected_weekday() {
        let conn = test_connection();
        insert_rule(&conn, "daily-rule", "daily", 1);
        let weekday = Local::now().date_naive().weekday().num_days_from_monday().to_string();
        conn.execute("UPDATE recurring_task_settings SET weekdays=?1 WHERE id='daily-rule'", params![weekday]).unwrap();

        refresh_recurring_tasks(&conn, "test").unwrap();

        let today = Local::now().date_naive().to_string();
        let task_count: i64 = conn.query_row("SELECT COUNT(1) FROM tasks WHERE recurring_setting_id='daily-rule' AND occurrence_date=?1", params![today], |row| row.get(0)).unwrap();
        let event_count: i64 = conn.query_row("SELECT COUNT(1) FROM task_events WHERE event_type='created'", [], |row| row.get(0)).unwrap();
        assert_eq!(task_count, 1);
        assert_eq!(event_count, 1);
    }

    #[test]
    fn refresh_creates_weekly_occurrences_in_sequence() {
        let conn = test_connection();
        insert_rule(&conn, "weekly-rule", "weekly", 2);

        refresh_recurring_tasks(&conn, "test").unwrap();
        let today = Local::now().date_naive().to_string();
        let first_key = format!("{}#1", today);
        let second_key = format!("{}#2", today);
        let first_id: String = conn.query_row("SELECT id FROM tasks WHERE recurring_setting_id='weekly-rule' AND occurrence_date=?1", params![first_key], |row| row.get(0)).unwrap();
        let second_before: i64 = conn.query_row("SELECT COUNT(1) FROM tasks WHERE recurring_setting_id='weekly-rule' AND occurrence_date=?1", params![second_key.clone()], |row| row.get(0)).unwrap();
        assert_eq!(second_before, 0);

        conn.execute("UPDATE tasks SET completed_at=?1 WHERE id=?2", params![now_string(), first_id]).unwrap();
        refresh_recurring_tasks(&conn, "test").unwrap();
        let second_after: i64 = conn.query_row("SELECT COUNT(1) FROM tasks WHERE recurring_setting_id='weekly-rule' AND occurrence_date=?1", params![second_key], |row| row.get(0)).unwrap();
        assert_eq!(second_after, 1);
    }

    #[test]
    fn refresh_archives_overdue_recurring_task() {
        let conn = test_connection();
        let yesterday = (Local::now().date_naive() - chrono::Duration::days(1)).to_string();
        conn.execute(
            "INSERT INTO tasks (id, owner, title, is_urgent, created_at, updated_at, recurring_setting_id, occurrence_date)
             VALUES ('overdue-task', 'test', '过期任务', 0, ?1, ?1, 'old-rule', ?2)",
            params![now_string(), yesterday],
        ).unwrap();

        refresh_recurring_tasks(&conn, "test").unwrap();
        let archived: Option<String> = conn.query_row("SELECT archived_at FROM tasks WHERE id='overdue-task'", [], |row| row.get(0)).unwrap();
        assert!(archived.is_some());
    }
}

#[cfg(test)]
mod main_scenario_tests {
    use super::*;

    fn test_connection() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        conn
    }

    fn insert_standard_task(conn: &Connection, task_id: &str, title: &str) {
        let now = now_string();
        conn.execute(
            "INSERT INTO tasks (id, owner, title, is_urgent, created_at, updated_at) VALUES (?1, '主场景用户', ?2, 0, ?3, ?3)",
            params![task_id, title, now],
        ).unwrap();
        insert_event(conn, task_id, "created", None, Some(title)).unwrap();
    }

    #[test]
    fn standard_task_lifecycle_keeps_data_and_lifecycle_events_consistent() {
        let conn = test_connection();
        let task_id = "main-task";
        insert_standard_task(&conn, task_id, "整理发布资料");
        let now = now_string();

        conn.execute("INSERT INTO task_milestones (task_id, title, planned_at, created_at, updated_at) VALUES (?1, '完成说明', '2026-08-25', ?2, ?2)", params![task_id, now]).unwrap();
        insert_event(&conn, task_id, "milestone_created", None, Some("完成说明")).unwrap();
        insert_event(&conn, task_id, "progress_updated", None, Some("已完成资料整理")).unwrap();
        conn.execute("UPDATE task_milestones SET completed_at=?1, updated_at=?1 WHERE task_id=?2", params![now, task_id]).unwrap();
        insert_event(&conn, task_id, "progress_updated", None, Some("完成节点：完成说明")).unwrap();
        conn.execute("UPDATE tasks SET title='整理发布资料（已确认）', completed_at=?1, archived_at=?1, updated_at=?1 WHERE id=?2", params![now, task_id]).unwrap();
        insert_event(&conn, task_id, "title_changed", Some("整理发布资料"), Some("整理发布资料（已确认）")).unwrap();
        insert_event(&conn, task_id, "completed", None, None).unwrap();
        insert_event(&conn, task_id, "archived", None, None).unwrap();

        let task: (String, Option<String>, Option<String>) = conn.query_row("SELECT title, completed_at, archived_at FROM tasks WHERE id=?1", params![task_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))).unwrap();
        let milestone_completed: Option<String> = conn.query_row("SELECT completed_at FROM task_milestones WHERE task_id=?1", params![task_id], |row| row.get(0)).unwrap();
        let events: i64 = conn.query_row("SELECT COUNT(1) FROM task_events WHERE task_id=?1 AND event_type IN ('created', 'milestone_created', 'progress_updated', 'title_changed', 'completed', 'archived')", params![task_id], |row| row.get(0)).unwrap();
        assert_eq!(task.0, "整理发布资料（已确认）");
        assert!(task.1.is_some() && task.2.is_some() && milestone_completed.is_some());
        assert_eq!(events, 7);
    }

    #[test]
    fn archived_task_can_return_to_current_list_or_be_logically_deleted() {
        let conn = test_connection();
        insert_standard_task(&conn, "restored-task", "可恢复任务");
        insert_standard_task(&conn, "deleted-task", "可删除任务");
        let now = now_string();
        conn.execute("UPDATE tasks SET archived_at=?1, completed_at=?1 WHERE id IN ('restored-task', 'deleted-task')", params![now]).unwrap();

        conn.execute("UPDATE tasks SET completed_at=NULL, archived_at=NULL, updated_at=?1 WHERE id='restored-task'", params![now_string()]).unwrap();
        insert_event(&conn, "restored-task", "completion_undone", None, None).unwrap();
        conn.execute("UPDATE tasks SET deleted_at=?1, updated_at=?1 WHERE id='deleted-task'", params![now_string()]).unwrap();

        let current_count: i64 = conn.query_row("SELECT COUNT(1) FROM tasks WHERE id='restored-task' AND archived_at IS NULL AND deleted_at IS NULL", [], |row| row.get(0)).unwrap();
        let archived_visible_count: i64 = conn.query_row("SELECT COUNT(1) FROM tasks WHERE archived_at IS NOT NULL AND deleted_at IS NULL", [], |row| row.get(0)).unwrap();
        let deleted_count: i64 = conn.query_row("SELECT COUNT(1) FROM tasks WHERE id='deleted-task' AND deleted_at IS NOT NULL", [], |row| row.get(0)).unwrap();
        assert_eq!(current_count, 1);
        assert_eq!(archived_visible_count, 0);
        assert_eq!(deleted_count, 1);
    }

    #[test]
    fn recurring_rule_generates_task_and_voiding_prevents_future_generation() {
        let conn = test_connection();
        let today = Local::now().date_naive();
        let weekday = today.weekday().num_days_from_monday().to_string();
        conn.execute(
            "INSERT INTO recurring_task_settings (id, owner, title, is_urgent, date_range_type, start_date, frequency_type, weekdays, generate_time, repeat_count, created_at, updated_at) VALUES ('main-rule', '主场景用户', '每日检查', 0, 'long', ?1, 'daily', ?2, '00:00', 1, ?3, ?3)",
            params![today.to_string(), weekday, now_string()],
        ).unwrap();
        conn.execute("INSERT INTO recurring_setting_events (setting_id, event_type, created_at) VALUES ('main-rule', 'created', ?1)", params![now_string()]).unwrap();

        refresh_recurring_tasks(&conn, "主场景用户").unwrap();
        let generated_count: i64 = conn.query_row("SELECT COUNT(1) FROM tasks WHERE recurring_setting_id='main-rule' AND deleted_at IS NULL", [], |row| row.get(0)).unwrap();
        conn.execute("UPDATE recurring_task_settings SET voided_at=?1 WHERE id='main-rule'", params![now_string()]).unwrap();
        conn.execute("INSERT INTO recurring_setting_events (setting_id, event_type, created_at) VALUES ('main-rule', 'voided', ?1)", params![now_string()]).unwrap();
        assert!(!setting_applies_on(&query_recurring_setting_by_id(&conn, "main-rule").unwrap(), today));
        let setting_event_count: i64 = conn.query_row("SELECT COUNT(1) FROM recurring_setting_events WHERE setting_id='main-rule' AND event_type='voided'", [], |row| row.get(0)).unwrap();
        assert_eq!(generated_count, 1);
        assert_eq!(setting_event_count, 1);
    }
}
