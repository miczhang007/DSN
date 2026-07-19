use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
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
            complete_task,
            undo_complete_task,
            rename_user_data,
            delete_user_data,
            set_note_size,
            set_note_position,
            set_minimal_mode,
            is_auto_start_enabled,
            set_auto_start_enabled,
            exit_app
        ])
        .run(tauri::generate_context!());

    if let Err(error) = result {
        write_startup_log(&format!("Tauri runtime failed: {error}"));
    }
}

fn install_panic_logger() {
    std::panic::set_hook(Box::new(|panic_info| {
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
        ",
    )?;

    conn.execute_batch("ALTER TABLE tasks ADD COLUMN owner TEXT NOT NULL DEFAULT 'default';")
        .or_else(|err| {
            if is_duplicate_column_error(&err) {
                Ok(())
            } else {
                Err(err)
            }
        })
}

#[tauri::command]
fn list_active_tasks(state: State<DbState>, owner: String) -> Result<Vec<Task>, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let owner = normalize_owner(&owner)?;
    query_tasks(
        &conn,
        "
        SELECT id, owner, title, deadline_at, is_urgent, created_at, updated_at, completed_at, archived_at
        FROM tasks
        WHERE owner = ?1 AND archived_at IS NULL
        ORDER BY is_urgent DESC,
          CASE WHEN deadline_at IS NULL THEN 1 ELSE 0 END ASC,
          deadline_at ASC,
          created_at ASC
        ",
        &owner,
    )
}

#[tauri::command]
fn list_archived_tasks(state: State<DbState>, owner: String) -> Result<Vec<Task>, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let owner = normalize_owner(&owner)?;
    query_tasks(
        &conn,
        "
        SELECT id, owner, title, deadline_at, is_urgent, created_at, updated_at, completed_at, archived_at
        FROM tasks
        WHERE owner = ?1 AND archived_at IS NOT NULL
        ORDER BY archived_at DESC
        ",
        &owner,
    )
}

#[tauri::command]
fn get_task(state: State<DbState>, owner: String, task_id: String) -> Result<Task, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    let owner = normalize_owner(&owner)?;
    query_task(&conn, &owner, &task_id)
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
    if task.archived_at.is_some() {
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
    if task.is_urgent != is_urgent {
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
            bool_to_i64(is_urgent),
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
    query_task(&conn, &owner, &task_id)?;
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
    conn.execute(
        "
        UPDATE tasks
        SET completed_at = NULL, archived_at = NULL, updated_at = ?1
        WHERE id = ?2 AND owner = ?3
        ",
        params![now, task_id, owner],
    )
    .map_err(|err| err.to_string())?;
    insert_event(&conn, &task_id, "completion_undone", None, None)?;
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
    conn.execute("DELETE FROM tasks WHERE owner = ?1", params![owner])
        .map_err(|err| err.to_string())?;
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
        SELECT id, owner, title, deadline_at, is_urgent, created_at, updated_at, completed_at, archived_at
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
    })
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
