use chrono::{DateTime, Duration, Months, Utc};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::Sha256;
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
};
use uuid::Uuid;

pub type StoreResult<T> = Result<T, String>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PanelSettings {
    #[serde(default)]
    pub always_on_top: bool,
    #[serde(default = "default_opacity")]
    pub opacity: f64,
    #[serde(default)]
    pub locked: bool,
    #[serde(default = "default_panel_color")]
    pub color: String,
    #[serde(default)]
    pub x: Option<i32>,
    #[serde(default)]
    pub y: Option<i32>,
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
}

impl Default for PanelSettings {
    fn default() -> Self {
        Self {
            always_on_top: false,
            opacity: 1.0,
            locked: true,
            color: default_panel_color(),
            x: None,
            y: None,
            width: None,
            height: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default = "default_mode")]
    pub mode: String,
    #[serde(default)]
    pub admin_password_hash: Option<String>,
    #[serde(default)]
    pub security_question: String,
    #[serde(default)]
    pub security_answer_hash: Option<String>,
    #[serde(default)]
    pub super_admin_name: String,
    #[serde(default = "default_sound")]
    pub sound: String,
    #[serde(default)]
    pub custom_sound_url: String,
    #[serde(default = "default_backup_hours")]
    pub backup_every_hours: u64,
    #[serde(default)]
    pub last_backup_at: Option<String>,
    #[serde(default)]
    pub panel: PanelSettings,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            mode: default_mode(),
            admin_password_hash: None,
            security_question: String::new(),
            security_answer_hash: None,
            super_admin_name: String::new(),
            sound: default_sound(),
            custom_sound_url: String::new(),
            backup_every_hours: default_backup_hours(),
            last_backup_at: None,
            panel: PanelSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    pub name: String,
    #[serde(default = "default_true")]
    pub active: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub name: String,
    #[serde(default = "default_category_color")]
    pub color: String,
    #[serde(default = "default_true")]
    pub active: bool,
    #[serde(default)]
    pub sort_order: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shift {
    pub id: String,
    pub name: String,
    #[serde(default = "default_true")]
    pub active: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Todo {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub category_id: Option<String>,
    #[serde(default)]
    pub creator_user_id: Option<String>,
    #[serde(default)]
    pub owner_user_id: Option<String>,
    #[serde(default = "default_remind_target")]
    pub remind_target: String,
    #[serde(default)]
    pub remind_user_id: Option<String>,
    #[serde(default)]
    pub due_at: Option<String>,
    #[serde(default)]
    pub remind_at: Option<String>,
    #[serde(default = "default_repeat_rule")]
    pub repeat_rule: String,
    #[serde(default = "default_priority")]
    pub priority: String,
    #[serde(default = "default_todo_status")]
    pub status: String,
    #[serde(default)]
    pub completed_at: Option<String>,
    #[serde(default)]
    pub visible_until: Option<String>,
    #[serde(default)]
    pub snoozed_until: Option<String>,
    #[serde(default)]
    pub acknowledged_at: Option<String>,
    #[serde(default)]
    pub last_reminded_at: Option<String>,
    #[serde(default)]
    pub locked_by_handover: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Notice {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub creator_name: String,
    #[serde(default = "default_notice_status")]
    pub status: String,
    #[serde(default)]
    pub confirmations: HashMap<String, String>,
    pub created_at: String,
    #[serde(default)]
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Handover {
    pub id: String,
    #[serde(default)]
    pub to_user_id: Option<String>,
    #[serde(default)]
    pub shift_id: Option<String>,
    #[serde(default)]
    pub confirmed_by_user_id: Option<String>,
    pub confirmed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditLog {
    pub id: String,
    #[serde(default)]
    pub actor_name: String,
    pub action: String,
    pub entity_type: String,
    pub entity_id: String,
    #[serde(default)]
    pub before: Option<Value>,
    #[serde(default)]
    pub after: Option<Value>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardState {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub initialized: bool,
    #[serde(default)]
    pub settings: Settings,
    #[serde(default)]
    pub users: Vec<User>,
    #[serde(default)]
    pub categories: Vec<Category>,
    #[serde(default)]
    pub shifts: Vec<Shift>,
    #[serde(default)]
    pub todos: Vec<Todo>,
    #[serde(default)]
    pub notices: Vec<Notice>,
    #[serde(default)]
    pub handovers: Vec<Handover>,
    #[serde(default)]
    pub audit_logs: Vec<AuditLog>,
    pub created_at: String,
    pub updated_at: String,
}

impl Default for BoardState {
    fn default() -> Self {
        let now = now_iso();
        Self {
            version: 1,
            initialized: false,
            settings: Settings::default(),
            users: vec![],
            categories: vec![],
            shifts: vec![],
            todos: vec![],
            notices: vec![],
            handovers: vec![],
            audit_logs: vec![],
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicState {
    #[serde(flatten)]
    pub state: BoardState,
    pub data_dir: String,
    pub backup_dir: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub created_at: String,
}

pub struct LocalStore {
    pub data_dir: PathBuf,
    pub backup_dir: PathBuf,
    pub file_path: PathBuf,
    pub state: BoardState,
}

impl LocalStore {
    pub fn new(data_dir: PathBuf) -> Self {
        let backup_dir = data_dir.join("backups");
        let file_path = data_dir.join("board-data.json");
        Self {
            data_dir,
            backup_dir,
            file_path,
            state: BoardState::default(),
        }
    }

    pub fn init(&mut self) -> StoreResult<()> {
        fs::create_dir_all(&self.data_dir).map_err(to_err)?;
        fs::create_dir_all(&self.backup_dir).map_err(to_err)?;
        if self.file_path.exists() {
            let text = fs::read_to_string(&self.file_path).map_err(to_err)?;
            self.state = serde_json::from_str(&text).unwrap_or_else(|_| BoardState::default());
        } else {
            self.save()?;
        }
        Ok(())
    }

    pub fn public_state(&self) -> PublicState {
        let mut state = self.state.clone();
        state.settings.admin_password_hash = None;
        state.settings.security_answer_hash = None;
        PublicState {
            state,
            data_dir: self.data_dir.to_string_lossy().to_string(),
            backup_dir: self.backup_dir.to_string_lossy().to_string(),
        }
    }

    pub fn save(&mut self) -> StoreResult<()> {
        self.state.updated_at = now_iso();
        fs::create_dir_all(&self.data_dir).map_err(to_err)?;
        let tmp = self.file_path.with_extension("json.tmp");
        let text = serde_json::to_string_pretty(&self.state).map_err(to_err)?;
        fs::write(&tmp, text).map_err(to_err)?;
        fs::rename(tmp, &self.file_path).map_err(to_err)?;
        Ok(())
    }

    pub fn backup(&mut self, reason: &str) -> StoreResult<String> {
        fs::create_dir_all(&self.backup_dir).map_err(to_err)?;
        let stamp = now_iso().replace([':', '.'], "-");
        let path = self.backup_dir.join(format!("board-data-{stamp}-{reason}.json"));
        fs::write(&path, serde_json::to_string_pretty(&self.state).map_err(to_err)?).map_err(to_err)?;
        self.state.settings.last_backup_at = Some(now_iso());
        self.save()?;
        Ok(path.to_string_lossy().to_string())
    }

    pub fn list_backups(&self) -> StoreResult<Vec<BackupInfo>> {
        fs::create_dir_all(&self.backup_dir).map_err(to_err)?;
        let mut result = vec![];
        for entry in fs::read_dir(&self.backup_dir).map_err(to_err)? {
            let entry = entry.map_err(to_err)?;
            let path = entry.path();
            if path.extension().and_then(|v| v.to_str()) != Some("json") {
                continue;
            }
            let meta = entry.metadata().map_err(to_err)?;
            result.push(BackupInfo {
                name: entry.file_name().to_string_lossy().to_string(),
                path: path.to_string_lossy().to_string(),
                size: meta.len(),
                created_at: meta
                    .created()
                    .or_else(|_| meta.modified())
                    .map(|t| DateTime::<Utc>::from(t).to_rfc3339())
                    .unwrap_or_else(|_| now_iso()),
            });
        }
        result.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(result)
    }

    pub fn restore_backup(&mut self, backup_path: &str, admin_password: &str) -> StoreResult<PublicState> {
        if !self.verify_admin(admin_password) {
            return Err("管理员密码不正确".into());
        }
        let path = PathBuf::from(backup_path);
        let backup_root = self.backup_dir.canonicalize().map_err(to_err)?;
        let canonical = path.canonicalize().map_err(to_err)?;
        if !canonical.starts_with(backup_root) {
            return Err("只能恢复备份目录内的文件".into());
        }
        let text = fs::read_to_string(canonical).map_err(to_err)?;
        self.state = serde_json::from_str(&text).map_err(to_err)?;
        self.audit("system", "恢复备份", "backup", backup_path, None, Some(json_obj("backupPath", backup_path)));
        self.save()?;
        Ok(self.public_state())
    }

    pub fn initialize(&mut self, payload: Value) -> StoreResult<PublicState> {
        if self.state.initialized {
            return Err("软件已经初始化".into());
        }
        let users_raw = value_array_strings(&payload, "users");
        let categories_raw = value_array_strings(&payload, "categories");
        let admin_password = value_str(&payload, "adminPassword").unwrap_or_default();
        let security_question = value_str(&payload, "securityQuestion").unwrap_or_default();
        let security_answer = value_str(&payload, "securityAnswer").unwrap_or_default();
        if users_raw.is_empty() {
            return Err("至少需要添加 1 位人员".into());
        }
        if categories_raw.is_empty() {
            return Err("至少需要添加 1 个分类".into());
        }
        if admin_password.len() < 6 {
            return Err("管理员密码至少 6 位".into());
        }
        if security_question.trim().is_empty() || security_answer.trim().is_empty() {
            return Err("请设置安全问题和答案".into());
        }
        let mut users: Vec<User> = users_raw
            .into_iter()
            .enumerate()
            .map(|(_, name)| User {
                id: create_id("user"),
                name,
                active: true,
                created_at: now_iso(),
            })
            .collect();
        let super_admin = value_str(&payload, "superAdminName").unwrap_or_else(|| users[0].name.clone());
        if !users.iter().any(|u| u.name == super_admin) {
            users.insert(
                0,
                User {
                    id: create_id("user"),
                    name: super_admin.clone(),
                    active: true,
                    created_at: now_iso(),
                },
            );
        }
        let categories: Vec<Category> = categories_raw
            .into_iter()
            .enumerate()
            .map(|(index, name)| Category {
                id: create_id("cat"),
                name,
                color: default_category_color_by_index(index),
                active: true,
                sort_order: index,
            })
            .collect();
        self.state.initialized = true;
        self.state.settings.mode = match value_str(&payload, "mode").as_deref() {
            Some("multi") => "multi".into(),
            _ => "single".into(),
        };
        self.state.settings.admin_password_hash = Some(hash_secret(&admin_password));
        self.state.settings.security_question = security_question;
        self.state.settings.security_answer_hash = Some(hash_secret(&security_answer));
        self.state.settings.super_admin_name = super_admin.clone();
        self.state.users = users.clone();
        self.state.categories = categories.clone();
        self.state.shifts = ["早班", "中班", "晚班"]
            .iter()
            .map(|name| Shift {
                id: create_id("shift"),
                name: (*name).into(),
                active: true,
                created_at: now_iso(),
            })
            .collect();
        self.audit(
            &super_admin,
            "初始化软件",
            "settings",
            "initialization",
            None,
            Some(serde_json::json!({
                "mode": self.state.settings.mode,
                "users": users.iter().map(|u| &u.name).collect::<Vec<_>>(),
                "categories": categories.iter().map(|c| &c.name).collect::<Vec<_>>()
            })),
        );
        self.save()?;
        self.backup("startup")?;
        Ok(self.public_state())
    }

    pub fn verify_admin(&self, password: &str) -> bool {
        self.state
            .settings
            .admin_password_hash
            .as_deref()
            .map(|stored| verify_secret(password, stored))
            .unwrap_or(false)
    }

    pub fn reset_admin_password(&mut self, payload: Value) -> StoreResult<bool> {
        let answer = value_str(&payload, "securityAnswer").unwrap_or_default();
        let ok = self
            .state
            .settings
            .security_answer_hash
            .as_deref()
            .map(|stored| verify_secret(&answer, stored))
            .unwrap_or(false);
        if !ok {
            return Err("安全问题答案不正确".into());
        }
        let password = value_str(&payload, "newPassword").unwrap_or_default();
        if password.len() < 6 {
            return Err("新密码至少 6 位".into());
        }
        self.state.settings.admin_password_hash = Some(hash_secret(&password));
        self.audit("system", "重置管理员密码", "settings", "adminPassword", None, Some(json_bool("resetBySecurityQuestion", true)));
        self.save()?;
        Ok(true)
    }

    pub fn create_todo(&mut self, input: Value) -> StoreResult<PublicState> {
        let title = value_str(&input, "title").unwrap_or_default();
        if title.trim().is_empty() {
            return Err("待办内容不能为空".into());
        }
        let created_at = now_iso();
        let todo = Todo {
            id: create_id("todo"),
            title: title.trim().into(),
            note: value_str(&input, "note").unwrap_or_default(),
            category_id: value_str(&input, "categoryId").or_else(|| self.state.categories.first().map(|c| c.id.clone())),
            creator_user_id: value_str(&input, "creatorUserId").or_else(|| self.state.users.first().map(|u| u.id.clone())),
            owner_user_id: value_str(&input, "ownerUserId"),
            remind_target: if value_str(&input, "remindTarget").as_deref() == Some("all") { "all".into() } else { "one".into() },
            remind_user_id: value_str(&input, "remindUserId"),
            due_at: normalize_date_input(value_str(&input, "dueAt")),
            remind_at: normalize_date_input(value_str(&input, "remindAt")),
            repeat_rule: normalize_choice(value_str(&input, "repeatRule"), &["none", "daily", "weekly", "monthly"], "none"),
            priority: normalize_choice(value_str(&input, "priority"), &["normal", "important", "urgent"], "normal"),
            status: "pending".into(),
            completed_at: None,
            visible_until: None,
            snoozed_until: None,
            acknowledged_at: None,
            last_reminded_at: None,
            locked_by_handover: false,
            created_at: created_at.clone(),
            updated_at: created_at,
        };
        let actor = self.find_user_name(todo.creator_user_id.as_deref());
        self.state.todos.insert(0, todo.clone());
        self.audit(&actor, "新增待办", "todo", &todo.id, None, Some(serde_json::to_value(&todo).map_err(to_err)?));
        self.save()?;
        Ok(self.public_state())
    }

    pub fn update_todo(&mut self, id: &str, input: Value) -> StoreResult<PublicState> {
        let index = self.state.todos.iter().position(|t| t.id == id).ok_or("待办不存在")?;
        if self.state.todos[index].status == "done" || self.state.todos[index].locked_by_handover {
            return Err("已完成或已交接事项不能由普通用户修改".into());
        }
        let actor_user_id = value_str(&input, "actorUserId");
        let before = serde_json::to_value(&self.state.todos[index]).map_err(to_err)?;
        let after = {
            let todo = &mut self.state.todos[index];
            if let Some(title) = value_str(&input, "title") {
                if title.trim().is_empty() {
                    return Err("待办内容不能为空".into());
                }
                todo.title = title.trim().into();
            }
            todo.note = value_str(&input, "note").unwrap_or_default();
            if let Some(v) = value_str(&input, "categoryId") { todo.category_id = Some(v); }
            if let Some(v) = value_str(&input, "creatorUserId") { todo.creator_user_id = Some(v); }
            todo.owner_user_id = value_str(&input, "ownerUserId");
            todo.remind_target = if value_str(&input, "remindTarget").as_deref() == Some("all") { "all".into() } else { "one".into() };
            todo.remind_user_id = value_str(&input, "remindUserId");
            todo.due_at = normalize_date_input(value_str(&input, "dueAt"));
            todo.remind_at = normalize_date_input(value_str(&input, "remindAt"));
            todo.repeat_rule = normalize_choice(value_str(&input, "repeatRule"), &["none", "daily", "weekly", "monthly"], &todo.repeat_rule);
            todo.priority = normalize_choice(value_str(&input, "priority"), &["normal", "important", "urgent"], &todo.priority);
            todo.updated_at = now_iso();
            serde_json::to_value(todo.clone()).map_err(to_err)?
        };
        let actor = self.find_user_name(actor_user_id.as_deref().or(self.state.todos[index].creator_user_id.as_deref()));
        self.audit(&actor, "修改待办", "todo", id, Some(before), Some(after));
        self.save()?;
        Ok(self.public_state())
    }

    pub fn complete_todo(&mut self, id: &str, actor_user_id: Option<String>) -> StoreResult<PublicState> {
        let index = self.state.todos.iter().position(|t| t.id == id).ok_or("待办不存在")?;
        let before = serde_json::to_value(&self.state.todos[index]).map_err(to_err)?;
        let completed_at = now_iso();
        self.state.todos[index].status = "done".into();
        self.state.todos[index].completed_at = Some(completed_at.clone());
        self.state.todos[index].visible_until = None;
        self.state.todos[index].updated_at = completed_at.clone();
        let todo_after = self.state.todos[index].clone();
        if todo_after.repeat_rule != "none" {
            if let Some(remind_at) = &todo_after.remind_at {
                let next_reminder = add_time(remind_at, &todo_after.repeat_rule);
                let mut next = todo_after.clone();
                next.id = create_id("todo");
                next.status = "pending".into();
                next.completed_at = None;
                next.snoozed_until = None;
                next.acknowledged_at = None;
                next.last_reminded_at = None;
                next.remind_at = next_reminder;
                next.due_at = todo_after.due_at.as_deref().and_then(|d| add_time(d, &todo_after.repeat_rule));
                next.created_at = completed_at.clone();
                next.updated_at = completed_at.clone();
                self.state.todos.insert(0, next.clone());
                self.audit(&self.find_user_name(actor_user_id.as_deref()), "生成下一次重复待办", "todo", &next.id, None, Some(serde_json::to_value(&next).map_err(to_err)?));
            }
        }
        self.audit(&self.find_user_name(actor_user_id.as_deref()), "完成待办", "todo", id, Some(before), Some(serde_json::to_value(todo_after).map_err(to_err)?));
        self.save()?;
        Ok(self.public_state())
    }

    pub fn delete_todo_from_panel(&self) -> StoreResult<PublicState> {
        Err("待办事项会一直保留，请由管理员输入密码彻底删除".into())
    }

    pub fn purge_todo(&mut self, id: &str, admin_password: &str) -> StoreResult<PublicState> {
        if !self.verify_admin(admin_password) {
            return Err("管理员密码不正确".into());
        }
        let index = self.state.todos.iter().position(|t| t.id == id).ok_or("待办不存在")?;
        let before = serde_json::to_value(&self.state.todos[index]).map_err(to_err)?;
        self.state.todos.remove(index);
        let actor = self.state.settings.super_admin_name.clone();
        self.audit(&actor, "彻底删除待办", "todo", id, Some(before), Some(json_bool("purged", true)));
        self.save()?;
        Ok(self.public_state())
    }

    pub fn create_notice(&mut self, input: Value) -> StoreResult<PublicState> {
        let password = value_str(&input, "adminPassword").unwrap_or_default();
        if !self.verify_admin(&password) {
            return Err("管理员密码不正确".into());
        }
        let title = value_str(&input, "title").unwrap_or_default();
        if title.trim().is_empty() {
            return Err("通知标题不能为空".into());
        }
        let notice = Notice {
            id: create_id("notice"),
            title: title.trim().into(),
            body: value_str(&input, "body").unwrap_or_default(),
            creator_name: if self.state.settings.super_admin_name.is_empty() { "管理员".into() } else { self.state.settings.super_admin_name.clone() },
            status: "active".into(),
            confirmations: HashMap::new(),
            created_at: now_iso(),
            completed_at: None,
        };
        self.state.notices.insert(0, notice.clone());
        self.audit(&notice.creator_name, "创建公告通知", "notice", &notice.id, None, Some(serde_json::to_value(&notice).map_err(to_err)?));
        self.save()?;
        Ok(self.public_state())
    }

    pub fn confirm_notice(&mut self, notice_id: &str, user_id: &str) -> StoreResult<PublicState> {
        let index = self.state.notices.iter().position(|n| n.id == notice_id).ok_or("通知不存在")?;
        let before = serde_json::to_value(&self.state.notices[index]).map_err(to_err)?;
        self.state.notices[index].confirmations.insert(user_id.into(), now_iso());
        let all_confirmed = self
            .state
            .users
            .iter()
            .filter(|u| u.active)
            .all(|u| self.state.notices[index].confirmations.contains_key(&u.id));
        if all_confirmed {
            self.state.notices[index].status = "completed".into();
            self.state.notices[index].completed_at = Some(now_iso());
        }
        let after = serde_json::to_value(&self.state.notices[index]).map_err(to_err)?;
        self.audit(&self.find_user_name(Some(user_id)), "确认公告通知", "notice", notice_id, Some(before), Some(after));
        self.save()?;
        Ok(self.public_state())
    }

    pub fn confirm_handover(&mut self, input: Value) -> StoreResult<PublicState> {
        let to_user_id = value_str(&input, "toUserId").ok_or("请选择接班人")?;
        if self.state.settings.mode == "multi" {
            let cat_id = self.find_or_create_handover_category();
            for todo in &mut self.state.todos {
                if todo.status == "pending" {
                    todo.category_id = Some(cat_id.clone());
                    todo.locked_by_handover = true;
                    todo.updated_at = now_iso();
                }
            }
        }
        let handover = Handover {
            id: create_id("handover"),
            to_user_id: Some(to_user_id.clone()),
            shift_id: value_str(&input, "shiftId"),
            confirmed_by_user_id: Some(to_user_id.clone()),
            confirmed_at: now_iso(),
        };
        self.state.handovers.insert(0, handover.clone());
        self.audit(&self.find_user_name(Some(&to_user_id)), "确认接班", "handover", &handover.id, None, Some(serde_json::to_value(&handover).map_err(to_err)?));
        self.save()?;
        Ok(self.public_state())
    }

    pub fn update_settings(&mut self, input: Value) -> StoreResult<PublicState> {
        if let Some(password) = value_str(&input, "adminPassword") {
            if !password.is_empty() && !self.verify_admin(&password) {
                return Err("管理员密码不正确".into());
            }
        }
        let before = serde_json::to_value(&self.state.settings).map_err(to_err)?;
        if let Some(mode) = value_str(&input, "mode") {
            self.state.settings.mode = if mode == "multi" { "multi".into() } else { "single".into() };
        }
        if let Some(sound) = value_str(&input, "sound") { self.state.settings.sound = sound; }
        if let Some(custom) = value_str(&input, "customSoundUrl") { self.state.settings.custom_sound_url = custom; }
        if let Some(panel) = input.get("panel") {
            if let Some(v) = value_bool(panel, "alwaysOnTop") { self.state.settings.panel.always_on_top = v; }
            if let Some(v) = value_bool(panel, "locked") { self.state.settings.panel.locked = v; }
            if let Some(v) = panel.get("opacity").and_then(|v| v.as_f64()) { self.state.settings.panel.opacity = v; }
            if let Some(v) = value_str(panel, "color") { self.state.settings.panel.color = v; }
        }
        let after = serde_json::to_value(&self.state.settings).map_err(to_err)?;
        if !value_bool(&input, "silent").unwrap_or(false) {
            let actor = self.state.settings.super_admin_name.clone();
            self.audit(&actor, "修改设置", "settings", "settings", Some(before), Some(after));
        }
        self.save()?;
        Ok(self.public_state())
    }

    pub fn add_user(&mut self, name: &str, admin_password: &str) -> StoreResult<PublicState> {
        if !self.verify_admin(admin_password) { return Err("管理员密码不正确".into()); }
        let clean = name.trim();
        if clean.is_empty() { return Err("姓名不能为空".into()); }
        if self.state.users.iter().any(|u| u.active && u.name == clean) { return Err("人员已存在".into()); }
        let user = User { id: create_id("user"), name: clean.into(), active: true, created_at: now_iso() };
        self.state.users.push(user.clone());
        let actor = self.state.settings.super_admin_name.clone();
        self.audit(&actor, "新增人员", "user", &user.id, None, Some(serde_json::to_value(&user).map_err(to_err)?));
        self.save()?;
        Ok(self.public_state())
    }

    pub fn add_category(&mut self, name: &str, admin_password: &str) -> StoreResult<PublicState> {
        if !self.verify_admin(admin_password) { return Err("管理员密码不正确".into()); }
        let clean = name.trim();
        if clean.is_empty() { return Err("分类不能为空".into()); }
        if self.state.categories.iter().any(|c| c.active && c.name == clean) { return Err("分类已存在".into()); }
        let category = Category {
            id: create_id("cat"),
            name: clean.into(),
            color: default_category_color_by_index(self.state.categories.len()),
            active: true,
            sort_order: self.state.categories.len(),
        };
        self.state.categories.push(category.clone());
        let actor = self.state.settings.super_admin_name.clone();
        self.audit(&actor, "新增分类", "category", &category.id, None, Some(serde_json::to_value(&category).map_err(to_err)?));
        self.save()?;
        Ok(self.public_state())
    }

    pub fn get_due_reminders(&self) -> Vec<Todo> {
        let now = Utc::now();
        self.state
            .todos
            .iter()
            .filter(|todo| {
                if todo.status != "pending" { return false; }
                let target = todo.snoozed_until.as_ref().or(todo.remind_at.as_ref()).or(todo.due_at.as_ref());
                let Some(target) = target else { return false; };
                let Some(target_dt) = parse_iso(target) else { return false; };
                if target_dt > now { return false; }
                let Some(last) = todo.last_reminded_at.as_ref().and_then(|v| parse_iso(v)) else { return true; };
                now.signed_duration_since(last) >= Duration::minutes(10)
            })
            .cloned()
            .collect()
    }

    pub fn mark_reminded(&mut self, todo_ids: &[String]) -> StoreResult<()> {
        let time = now_iso();
        for todo in &mut self.state.todos {
            if todo_ids.contains(&todo.id) {
                todo.last_reminded_at = Some(time.clone());
            }
        }
        self.save()
    }

    pub fn acknowledge_reminders(&mut self, todo_ids: Vec<String>, actor_user_id: Option<String>) -> StoreResult<PublicState> {
        let time = now_iso();
        for id in todo_ids {
            if let Some(index) = self.state.todos.iter().position(|t| t.id == id) {
                let before = serde_json::to_value(&self.state.todos[index]).map_err(to_err)?;
                self.state.todos[index].acknowledged_at = Some(time.clone());
                self.state.todos[index].snoozed_until = None;
                self.state.todos[index].last_reminded_at = Some(time.clone());
                let after = serde_json::to_value(&self.state.todos[index]).map_err(to_err)?;
                self.audit(&self.find_user_name(actor_user_id.as_deref()), "知道了提醒", "todo", &id, Some(before), Some(after));
            }
        }
        self.save()?;
        Ok(self.public_state())
    }

    pub fn snooze_reminders(&mut self, todo_ids: Vec<String>, minutes: i64, actor_user_id: Option<String>) -> StoreResult<PublicState> {
        let until = (Utc::now() + Duration::minutes(minutes)).to_rfc3339();
        for id in todo_ids {
            if let Some(index) = self.state.todos.iter().position(|t| t.id == id) {
                let before = serde_json::to_value(&self.state.todos[index]).map_err(to_err)?;
                self.state.todos[index].snoozed_until = Some(until.clone());
                self.state.todos[index].last_reminded_at = None;
                let after = serde_json::to_value(&self.state.todos[index]).map_err(to_err)?;
                self.audit(&self.find_user_name(actor_user_id.as_deref()), &format!("稍后 {minutes} 分钟提醒"), "todo", &id, Some(before), Some(after));
            }
        }
        self.save()?;
        Ok(self.public_state())
    }

    pub fn cleanup_completed_visibility(&mut self) -> StoreResult<bool> {
        Ok(false)
    }

    fn find_user_name(&self, id: Option<&str>) -> String {
        id.and_then(|id| self.state.users.iter().find(|u| u.id == id).map(|u| u.name.clone()))
            .unwrap_or_else(|| "未选择".into())
    }

    fn find_or_create_handover_category(&mut self) -> String {
        if let Some(cat) = self.state.categories.iter().find(|c| c.active && c.name == "交接事项") {
            return cat.id.clone();
        }
        let category = Category {
            id: create_id("cat"),
            name: "交接事项".into(),
            color: "#2563eb".into(),
            active: true,
            sort_order: self.state.categories.len(),
        };
        let id = category.id.clone();
        self.state.categories.push(category);
        id
    }

    fn audit(&mut self, actor_name: &str, action: &str, entity_type: &str, entity_id: &str, before: Option<Value>, after: Option<Value>) {
        self.state.audit_logs.insert(
            0,
            AuditLog {
                id: create_id("log"),
                actor_name: actor_name.into(),
                action: action.into(),
                entity_type: entity_type.into(),
                entity_id: entity_id.into(),
                before,
                after,
                created_at: now_iso(),
            },
        );
        if self.state.audit_logs.len() > 5000 {
            self.state.audit_logs.truncate(5000);
        }
    }
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn create_id(prefix: &str) -> String {
    format!("{}_{}_{}", prefix, Utc::now().timestamp_millis(), Uuid::new_v4().simple())
}

fn hash_secret(secret: &str) -> String {
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    let salt_hex = hex::encode(salt);
    let mut out = [0u8; 32];
    pbkdf2_hmac::<Sha256>(secret.as_bytes(), salt_hex.as_bytes(), 120_000, &mut out);
    format!("{}:{}", salt_hex, hex::encode(out))
}

fn verify_secret(secret: &str, stored: &str) -> bool {
    let Some((salt, hash)) = stored.split_once(':') else { return false; };
    let mut out = [0u8; 32];
    pbkdf2_hmac::<Sha256>(secret.as_bytes(), salt.as_bytes(), 120_000, &mut out);
    hex::encode(out) == hash
}

fn parse_iso(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value).ok().map(|dt| dt.with_timezone(&Utc))
}

fn normalize_date_input(value: Option<String>) -> Option<String> {
    value.and_then(|v| parse_iso(&v).map(|dt| dt.to_rfc3339()))
}

fn add_time(value: &str, repeat_rule: &str) -> Option<String> {
    let dt = parse_iso(value)?;
    let next = match repeat_rule {
        "daily" => dt + Duration::days(1),
        "weekly" => dt + Duration::weeks(1),
        "monthly" => dt.checked_add_months(Months::new(1)).unwrap_or(dt + Duration::days(30)),
        _ => dt,
    };
    Some(next.to_rfc3339())
}

fn value_str(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(|v| v.as_str()).map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

fn value_bool(value: &Value, key: &str) -> Option<bool> {
    value.get(key).and_then(|v| v.as_bool())
}

fn value_array_strings(value: &Value, key: &str) -> Vec<String> {
    let mut out = vec![];
    if let Some(items) = value.get(key).and_then(|v| v.as_array()) {
        for item in items {
            if let Some(text) = item.as_str().map(|v| v.trim()).filter(|v| !v.is_empty()) {
                if !out.iter().any(|v: &String| v == text) {
                    out.push(text.to_string());
                }
            }
        }
    }
    out
}

fn normalize_choice(value: Option<String>, choices: &[&str], default: &str) -> String {
    value.filter(|v| choices.contains(&v.as_str())).unwrap_or_else(|| default.into())
}

fn json_bool(key: &str, value: bool) -> Value {
    serde_json::json!({ key: value })
}

fn json_obj(key: &str, value: &str) -> Value {
    serde_json::json!({ key: value })
}

fn to_err<E: std::fmt::Display>(error: E) -> String {
    error.to_string()
}

fn default_version() -> u32 { 1 }
fn default_mode() -> String { "single".into() }
fn default_sound() -> String { "clear".into() }
fn default_backup_hours() -> u64 { 2 }
fn default_opacity() -> f64 { 1.0 }
fn default_panel_color() -> String { "#fffdf7".into() }
fn default_true() -> bool { true }
fn default_category_color() -> String { "#2563eb".into() }
fn default_remind_target() -> String { "one".into() }
fn default_repeat_rule() -> String { "none".into() }
fn default_priority() -> String { "normal".into() }
fn default_todo_status() -> String { "pending".into() }
fn default_notice_status() -> String { "active".into() }

fn default_category_color_by_index(index: usize) -> String {
    ["#2563eb", "#168a5b", "#b7791f", "#c43131", "#6b7280", "#7c3aed"][index % 6].into()
}
