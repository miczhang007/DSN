//! 任务合并。
//!
//! 把当前分类下多个未归档的普通任务合并为一个新任务：
//! - 新任务使用用户编辑后的名称，状态固定为「待完成」；
//! - 原任务的节点、进度与生命周期日志整体迁移到新任务名下；
//! - 原任务删除（节点与日志已经迁移，不会留下孤儿数据）；
//! - 周期任务不参与合并：它们由周期规则自动生成，合并会破坏规则实例的追踪。

use std::collections::HashSet;

use rusqlite::{params, Connection};
use tauri::State;

use crate::{insert_event, now_string, query_task, DbState, Task};

const MAX_TITLE_CHARS: usize = 80;

#[tauri::command]
pub fn merge_tasks(
    state: State<DbState>,
    owner: String,
    task_ids: Vec<String>,
    title: String,
) -> Result<Task, String> {
    let conn = state.conn.lock().map_err(|err| err.to_string())?;
    apply_merge(&conn, &owner, &task_ids, &title)
}

fn apply_merge(
    conn: &Connection,
    owner: &str,
    task_ids: &[String],
    title: &str,
) -> Result<Task, String> {
    let owner = owner.trim();
    if owner.is_empty() {
        return Err("分类不能为空".to_string());
    }
    let title = title.trim();
    if title.is_empty() {
        return Err("合并后的任务名称不能为空".to_string());
    }
    if title.chars().count() > MAX_TITLE_CHARS {
        return Err(format!("任务名称不能超过 {MAX_TITLE_CHARS} 个字符"));
    }

    // 去空、去重，并保留用户勾选顺序：节点合并顺序按该顺序排列。
    let mut ids: Vec<String> = Vec::new();
    let mut seen = HashSet::new();
    for id in task_ids {
        let id = id.trim();
        if id.is_empty() {
            continue;
        }
        if seen.insert(id.to_string()) {
            ids.push(id.to_string());
        }
    }
    if ids.len() < 2 {
        return Err("请至少选择两个任务进行合并".to_string());
    }

    let mut sources = Vec::with_capacity(ids.len());
    for id in &ids {
        let task = query_task(conn, owner, id)?;
        if task.archived_at.is_some() {
            return Err(format!("任务“{}”已归档，不能合并", task.title));
        }
        if task.is_recurring {
            return Err(format!("周期任务“{}”不支持合并", task.title));
        }
        sources.push(task);
    }

    let tx = conn.unchecked_transaction().map_err(|err| err.to_string())?;
    let now = now_string();
    let new_id = uuid::Uuid::new_v4().to_string();
    let is_urgent = sources.iter().any(|task| task.is_urgent);

    // 与 create_task 一致：新任务排到当前列表第一位。
    tx.execute(
        "UPDATE tasks SET sort_order = sort_order + 1, updated_at = ?1
         WHERE owner = ?2 AND archived_at IS NULL AND deleted_at IS NULL AND sort_order IS NOT NULL",
        params![now, owner],
    )
    .map_err(|err| err.to_string())?;
    tx.execute(
        "INSERT INTO tasks (id, owner, title, is_urgent, created_at, updated_at, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5, 0)",
        params![
            new_id,
            owner,
            title,
            if is_urgent { 1_i64 } else { 0_i64 },
            now
        ],
    )
    .map_err(|err| err.to_string())?;

    // 生命周期日志与进度记录整体迁移，保留原时间与顺序。
    for id in &ids {
        tx.execute(
            "UPDATE task_events SET task_id = ?1 WHERE task_id = ?2",
            params![new_id, id],
        )
        .map_err(|err| err.to_string())?;
    }

    // 节点按「勾选任务顺序 + 原任务内节点顺序」重新编号，合并后仍可拖动排序。
    let mut next_order = 0_i64;
    for id in &ids {
        let milestone_ids: Vec<i64> = {
            let mut stmt = tx
                .prepare(
                    "SELECT id FROM task_milestones
                     WHERE task_id = ?1
                     ORDER BY sort_order IS NULL ASC, sort_order ASC,
                       CASE WHEN planned_at IS NULL THEN 1 ELSE 0 END,
                       planned_at ASC, id ASC",
                )
                .map_err(|err| err.to_string())?;
            let rows = stmt
                .query_map(params![id], |row| row.get::<_, i64>(0))
                .map_err(|err| err.to_string())?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|err| err.to_string())?
        };
        for milestone_id in milestone_ids {
            tx.execute(
                "UPDATE task_milestones SET task_id = ?1, sort_order = ?2 WHERE id = ?3",
                params![new_id, next_order, milestone_id],
            )
            .map_err(|err| err.to_string())?;
            next_order += 1;
        }
    }

    let source_titles = sources
        .iter()
        .map(|task| task.title.as_str())
        .collect::<Vec<_>>()
        .join("、");
    insert_event(&tx, &new_id, "merged", None, Some(&source_titles))?;

    // 合并后状态固定为待完成：若迁移来的日志里还留有“有效完成”状态，
    // 补一条撤销完成让日志与任务状态保持一致（历史完成记录本身保留）。
    if has_effective_completion(&tx, &new_id)? {
        insert_event(
            &tx,
            &new_id,
            "completion_undone",
            None,
            Some("合并后重置为待完成"),
        )?;
    }

    for id in &ids {
        tx.execute(
            "DELETE FROM tasks WHERE id = ?1 AND owner = ?2",
            params![id, owner],
        )
        .map_err(|err| err.to_string())?;
    }
    tx.commit().map_err(|err| err.to_string())?;

    query_task(conn, owner, &new_id)
}

fn has_effective_completion(conn: &Connection, task_id: &str) -> Result<bool, String> {
    let mut stmt = conn
        .prepare(
            "SELECT event_type FROM task_events
             WHERE task_id = ?1 ORDER BY created_at ASC, id ASC",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![task_id], |row| row.get::<_, String>(0))
        .map_err(|err| err.to_string())?;
    let mut completed = false;
    for event_type in rows {
        match event_type.map_err(|err| err.to_string())?.as_str() {
            "completed" => completed = true,
            "completion_undone" => completed = false,
            _ => {}
        }
    }
    Ok(completed)
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

    fn insert_task(conn: &Connection, id: &str, title: &str, is_urgent: bool) {
        conn.execute(
            "INSERT INTO tasks (id, owner, title, is_urgent, created_at, updated_at)
             VALUES (?1, '工作', ?2, ?3, '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00')",
            params![id, title, if is_urgent { 1_i64 } else { 0_i64 }],
        )
        .expect("写入任务");
    }

    fn insert_milestone(conn: &Connection, task_id: &str, title: &str, sort_order: i64) {
        conn.execute(
            "INSERT INTO task_milestones (task_id, title, created_at, updated_at, sort_order)
             VALUES (?1, ?2, '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00', ?3)",
            params![task_id, title, sort_order],
        )
        .expect("写入节点");
    }

    #[test]
    fn merge_combines_children_and_resets_to_pending() {
        let conn = test_connection();
        insert_task(&conn, "task-a", "任务A", true);
        insert_task(&conn, "task-b", "任务B", false);
        conn.execute(
            "UPDATE tasks SET completed_at = '2026-01-02T00:00:00+00:00' WHERE id = 'task-b'",
            [],
        )
        .expect("标记任务B完成");

        insert_milestone(&conn, "task-a", "A节点1", 0);
        insert_milestone(&conn, "task-a", "A节点2", 1);
        insert_milestone(&conn, "task-b", "B节点1", 0);
        insert_event(&conn, "task-a", "created", None, Some("任务A")).expect("A创建日志");
        insert_event(&conn, "task-a", "progress_updated", None, Some("A进度")).expect("A进度");
        insert_event(&conn, "task-b", "created", None, Some("任务B")).expect("B创建日志");
        insert_event(&conn, "task-b", "completed", None, None).expect("B完成日志");

        let ids = vec!["task-a".to_string(), "task-b".to_string()];
        let merged = apply_merge(&conn, "工作", &ids, "合并后的任务").expect("合并任务");

        assert_eq!(merged.title, "合并后的任务");
        assert_eq!(merged.status, "pending", "合并后状态应为待完成");
        assert!(merged.is_urgent, "任一原任务紧急时合并任务也应紧急");
        assert!(merged.archived_at.is_none());
        assert!(merged.completed_at.is_none());

        let source_count: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM tasks WHERE id IN ('task-a', 'task-b')",
                [],
                |row| row.get(0),
            )
            .expect("统计原任务");
        assert_eq!(source_count, 0, "原任务应被删除");

        let titles: Vec<String> = {
            let mut stmt = conn
                .prepare(
                    "SELECT title FROM task_milestones WHERE task_id = ?1
                     ORDER BY sort_order ASC, id ASC",
                )
                .expect("查询节点");
            let rows = stmt
                .query_map(params![merged.id], |row| row.get::<_, String>(0))
                .expect("读取节点");
            rows.collect::<rusqlite::Result<Vec<_>>>().expect("收集节点")
        };
        assert_eq!(titles, vec!["A节点1", "A节点2", "B节点1"]);

        let progress_count: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM task_events WHERE task_id = ?1 AND event_type = 'progress_updated'",
                params![merged.id],
                |row| row.get(0),
            )
            .expect("统计进度");
        assert_eq!(progress_count, 1, "原任务进度应迁移到合并任务");
        let merged_event_count: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM task_events WHERE task_id = ?1 AND event_type = 'merged'",
                params![merged.id],
                |row| row.get(0),
            )
            .expect("统计合并日志");
        assert_eq!(merged_event_count, 1);
        let reset_count: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM task_events WHERE task_id = ?1 AND event_type = 'completion_undone'",
                params![merged.id],
                |row| row.get(0),
            )
            .expect("统计撤销完成");
        assert_eq!(reset_count, 1, "原任务的有效完成应被重置");
        assert!(
            !has_effective_completion(&conn, &merged.id).expect("读取完成状态"),
            "合并后不应保留有效完成状态"
        );
    }

    #[test]
    fn merge_requires_two_distinct_unarchived_normal_tasks() {
        let conn = test_connection();
        insert_task(&conn, "task-a", "任务A", false);
        insert_task(&conn, "task-b", "任务B", false);
        conn.execute(
            "INSERT INTO tasks (id, owner, title, is_urgent, created_at, updated_at, archived_at)
             VALUES ('archived', '工作', '已归档任务', 0,
                     '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00',
                     '2026-01-02T00:00:00+00:00')",
            [],
        )
        .expect("写入归档任务");
        conn.execute(
            "INSERT INTO tasks (id, owner, title, is_urgent, created_at, updated_at, recurring_setting_id, occurrence_date)
             VALUES ('recurring', '工作', '周期任务', 0,
                     '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00',
                     'setting-1', '2026-01-01')",
            [],
        )
        .expect("写入周期任务");

        assert!(apply_merge(&conn, "工作", &["task-a".to_string()], "合并").is_err());
        assert!(apply_merge(
            &conn,
            "工作",
            &["task-a".to_string(), "task-a".to_string()],
            "合并"
        )
        .is_err());
        assert!(apply_merge(
            &conn,
            "工作",
            &["task-a".to_string(), "archived".to_string()],
            "合并"
        )
        .is_err());
        assert!(apply_merge(
            &conn,
            "工作",
            &["task-a".to_string(), "recurring".to_string()],
            "合并"
        )
        .is_err());
        assert!(apply_merge(&conn, "工作", &["task-a".to_string(), "task-b".to_string()], "").is_err());
        // 校验失败不应删除任何任务
        let remaining: i64 = conn
            .query_row("SELECT COUNT(1) FROM tasks", [], |row| row.get(0))
            .expect("统计任务");
        assert_eq!(remaining, 4);
    }

    #[test]
    fn merge_only_allows_tasks_in_the_same_category() {
        let conn = test_connection();
        insert_task(&conn, "task-a", "任务A", false);
        conn.execute(
            "INSERT INTO tasks (id, owner, title, is_urgent, created_at, updated_at)
             VALUES ('other', '生活', '别的分类任务', 0, '2026-01-01T00:00:00+00:00',
                     '2026-01-01T00:00:00+00:00')",
            [],
        )
        .expect("写入其他分类任务");

        assert!(apply_merge(
            &conn,
            "工作",
            &["task-a".to_string(), "other".to_string()],
            "合并"
        )
        .is_err());
    }
}
