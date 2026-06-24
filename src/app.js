const api = window.desktopBoard;

const priorityLabels = {
  normal: "普通",
  important: "重要",
  urgent: "紧急"
};

const repeatLabels = {
  none: "不重复",
  daily: "每天",
  weekly: "每周",
  monthly: "每月"
};

const sounds = {
  clear: {
    label: "清脆叮咚",
    wave: "sine",
    pattern: [{ f: 880, d: 0.16 }, { f: 1175, d: 0.24 }]
  },
  double: {
    label: "双声提醒",
    wave: "triangle",
    pattern: [{ f: 740, d: 0.12 }, { f: 0, d: 0.06 }, { f: 740, d: 0.12 }, { f: 988, d: 0.2 }]
  },
  bell: {
    label: "办公室铃声",
    wave: "sine",
    pattern: [{ f: 659, d: 0.18 }, { f: 880, d: 0.18 }, { f: 1047, d: 0.28 }]
  },
  urgent: {
    label: "急促警报",
    wave: "square",
    pattern: [{ f: 988, d: 0.1 }, { f: 0, d: 0.04 }, { f: 988, d: 0.1 }, { f: 0, d: 0.04 }, { f: 1175, d: 0.16 }]
  },
  soft: {
    label: "柔和提示",
    wave: "sine",
    pattern: [{ f: 523, d: 0.18 }, { f: 659, d: 0.22 }, { f: 784, d: 0.28 }]
  },
  custom: { label: "自定义音频", notes: [] }
};

let state = null;
let activeTab = "todos";
let todoSearch = "";
let priorityFilter = "all";
let adminUnlocked = false;
let adminPassword = "";
let currentActorId = "";
let editingTodoId = null;
let reminderTodos = [];
let toastTimer = null;
let activeAudioContext = null;
let activeAudioElement = null;
let activeAudioTimer = null;
let keyboardBound = false;

const app = document.querySelector("#app");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getUserName(id) {
  return state?.users?.find((user) => user.id === id)?.name || "未选择";
}

function getCategory(id) {
  return state?.categories?.find((category) => category.id === id) || null;
}

function getCategoryName(id) {
  return getCategory(id)?.name || "未分类";
}

function dataFilePath() {
  if (!state?.dataDir) return "board-data.json";
  const separator = state.dataDir.includes("/") ? "/" : "\\";
  return `${state.dataDir}${separator}board-data.json`;
}

function pendingTodos() {
  return state?.todos?.filter((todo) => todo.status === "pending") || [];
}

function activeNotices() {
  return state?.notices?.filter((notice) => notice.status !== "deleted" && notice.status !== "completed") || [];
}

function tabBadge(count) {
  return count ? `<span class="tab-badge">${count > 99 ? "99+" : count}</span>` : "";
}

function openAddTodo() {
  editingTodoId = null;
  activeTab = "add";
  render();
}

function formatDate(value) {
  if (!value) return "未设置";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "无效时间";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function toInputDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromInputDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function parseChineseNumber(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d+$/.test(text)) return Number(text);
  const digits = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (text === "十") return 10;
  if (text.startsWith("十")) return 10 + (digits[text.slice(1)] || 0);
  if (text.includes("十")) {
    const [tens, ones] = text.split("十");
    return (digits[tens] || 0) * 10 + (digits[ones] || 0);
  }
  return digits[text] ?? null;
}

function normalizeHour(hour, meridiem) {
  let normalized = hour;
  if (["下午", "晚上", "傍晚", "今晚", "明晚"].includes(meridiem) && normalized < 12) normalized += 12;
  if (meridiem === "中午" && normalized > 0 && normalized < 11) normalized += 12;
  if (["凌晨"].includes(meridiem) && normalized === 12) normalized = 0;
  return normalized;
}

function parseMinute(value) {
  if (!value) return 0;
  if (value === "半") return 30;
  if (value === "一刻") return 15;
  if (value === "三刻") return 45;
  const parsed = parseChineseNumber(value);
  return parsed == null ? 0 : Math.min(59, parsed);
}

function cleanReminderText(text, phrase) {
  return text
    .replace(phrase, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[，,。；;：:\s]+|[，,。；;：:\s]+$/g, "")
    .trim();
}

function buildDate({ dayOffset = 0, month = null, day = null, weekday = null, nextWeek = false, hour = 9, minute = 0, meridiem = "" }) {
  const date = new Date();
  date.setSeconds(0, 0);
  if (month != null && day != null) {
    date.setMonth(month - 1, day);
    if (date.getTime() < Date.now()) date.setFullYear(date.getFullYear() + 1);
  } else if (weekday != null) {
    const today = date.getDay() || 7;
    let diff = weekday - today;
    if (nextWeek || diff <= 0) diff += 7;
    date.setDate(date.getDate() + diff);
  } else {
    date.setDate(date.getDate() + dayOffset);
  }
  date.setHours(normalizeHour(hour, meridiem), minute, 0, 0);
  return date;
}

function getRelativeDayOffset(token) {
  if (!token) return 0;
  if (["明天", "明早", "明晚"].includes(token)) return 1;
  if (token === "后天") return 2;
  if (token === "大后天") return 3;
  return 0;
}

function parseWeekday(value) {
  const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
  if (/^[1-7]$/.test(value)) return Number(value);
  return map[value] || null;
}

function parseNaturalReminder(text) {
  const source = String(text || "").trim();
  if (!source) return null;
  const number = "\\d{1,2}|[一二两三四五六七八九十]{1,3}";
  const meridiem = "(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上|今晚|明早|明晚)?";
  const timeSuffix = "(?:点|时)(?:钟)?";

  const relativePattern = new RegExp(`((?:今天|明天|后天|大后天|明早|明晚)?\\s*${meridiem}\\s*(${number})\\s*${timeSuffix}\\s*(半|一刻|三刻|${number})?\\s*(?:分|分钟)?)`);
  let match = source.match(relativePattern);
  if (match && (match[0].includes("点") || match[0].includes("时"))) {
    const dayToken = match[1].match(/今天|明天|后天|大后天|明早|明晚/)?.[0] || "";
    const phraseMeridiem = match[2] || dayToken;
    const hour = parseChineseNumber(match[3]);
    if (hour != null && hour <= 24) {
      const date = buildDate({
        dayOffset: getRelativeDayOffset(dayToken),
        hour,
        minute: parseMinute(match[4]),
        meridiem: phraseMeridiem
      });
      return { date, phrase: match[1], cleanText: cleanReminderText(source, match[1]) };
    }
  }

  const numericDatePattern = new RegExp(`((\\d{1,2})[\\/-](\\d{1,2})\\s*${meridiem}\\s*(\\d{1,2})(?::|：)(\\d{1,2}))`);
  match = source.match(numericDatePattern);
  if (match) {
    const date = buildDate({
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[5]),
      minute: Number(match[6]),
      meridiem: match[4] || ""
    });
    return { date, phrase: match[1], cleanText: cleanReminderText(source, match[1]) };
  }

  const monthDayPattern = new RegExp(`(((\\d{1,2}|[一二两三四五六七八九十]{1,3})\\s*月\\s*(\\d{1,2}|[一二两三四五六七八九十]{1,3})\\s*(?:日|号)?\\s*${meridiem}\\s*(${number})\\s*${timeSuffix}\\s*(半|一刻|三刻|${number})?\\s*(?:分|分钟)?))`);
  match = source.match(monthDayPattern);
  if (match) {
    const month = parseChineseNumber(match[3]);
    const day = parseChineseNumber(match[4]);
    const hour = parseChineseNumber(match[6]);
    if (month && day && hour != null) {
      const date = buildDate({
        month,
        day,
        hour,
        minute: parseMinute(match[7]),
        meridiem: match[5] || ""
      });
      return { date, phrase: match[1], cleanText: cleanReminderText(source, match[1]) };
    }
  }

  const weekdayPattern = new RegExp(`(((下周|本周|这周)?\\s*(?:周|星期)\\s*([一二三四五六日天1-7])\\s*${meridiem}\\s*(${number})\\s*${timeSuffix}\\s*(半|一刻|三刻|${number})?\\s*(?:分|分钟)?))`);
  match = source.match(weekdayPattern);
  if (match) {
    const weekday = parseWeekday(match[4]);
    const hour = parseChineseNumber(match[6]);
    if (weekday && hour != null) {
      const date = buildDate({
        weekday,
        nextWeek: match[3] === "下周",
        hour,
        minute: parseMinute(match[7]),
        meridiem: match[5] || ""
      });
      return { date, phrase: match[1], cleanText: cleanReminderText(source, match[1]) };
    }
  }

  return null;
}

function applyNaturalReminder(titleInput, remindInput, options = {}) {
  if (!titleInput || !remindInput) return null;
  const parsed = parseNaturalReminder(titleInput.value);
  const hint = document.querySelector("#timeParseHint");
  if (!parsed) {
    if (hint && !options.quiet) {
      hint.textContent = "没有识别到时间，内容会按完整输入保存。";
      hint.className = "time-parse-hint";
    }
    return null;
  }

  if (parsed.cleanText) {
    titleInput.value = parsed.cleanText;
  }
  remindInput.value = toInputDateTime(parsed.date.toISOString());
  remindInput.dataset.autoParsed = "true";
  if (hint && !options.quiet) {
    hint.textContent = `已识别提醒时间：${formatDate(parsed.date.toISOString())}`;
    hint.className = "time-parse-hint success";
  }
  return parsed;
}

function showToast(message, type = "ok") {
  clearTimeout(toastTimer);
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  toastTimer = setTimeout(() => {
    toast.className = "toast";
  }, 2600);
}

async function run(task, successMessage) {
  try {
    const result = await task();
    if (result && result.version) setState(result);
    if (successMessage) showToast(successMessage);
    return result;
  } catch (error) {
    showToast(error.message || String(error), "error");
    return null;
  }
}

function setState(nextState) {
  state = nextState;
  if (!currentActorId && state?.users?.length) currentActorId = state.users[0].id;
  render();
}

function visibleTodos() {
  if (!state) return [];
  return state.todos
    .filter((todo) => todo.status !== "purged")
    .filter((todo) => {
      if (priorityFilter !== "all" && todo.priority !== priorityFilter) return false;
      const keyword = todoSearch.trim().toLowerCase();
      if (!keyword) return true;
      const categoryName = getCategoryName(todo.categoryId);
      return [todo.title, todo.note, categoryName, getUserName(todo.ownerUserId)]
        .some((value) => String(value || "").toLowerCase().includes(keyword));
    })
    .sort((a, b) => {
      const aOverdue = isOverdue(a) ? 1 : 0;
      const bOverdue = isOverdue(b) ? 1 : 0;
      if (aOverdue !== bOverdue) return bOverdue - aOverdue;
      const priorityOrder = { urgent: 3, important: 2, normal: 1 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) return priorityOrder[b.priority] - priorityOrder[a.priority];
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

function isOverdue(todo) {
  if (!todo || todo.status !== "pending") return false;
  const target = todo.dueAt || todo.remindAt;
  if (!target) return false;
  return new Date(target).getTime() < Date.now();
}

function render() {
  if (!state) {
    app.innerHTML = `<div class="loading">正在打开桌面提醒公共栏...</div>`;
    return;
  }
  if (!state.initialized) {
    renderWizard();
    return;
  }
  app.innerHTML = `
    <div class="shell" style="--panel-color: ${escapeHtml(state.settings.panel.color || "#fffdf7")}">
      ${renderTitlebar()}
      ${renderBody()}
      ${renderReminderOverlay()}
      <div id="toast" class="toast"></div>
    </div>
  `;
  bindCommonEvents();
  bindKeyboardShortcuts();
  if (activeTab === "add" || activeTab === "todos") bindTodos();
  if (activeTab === "notices") bindNotices();
  if (activeTab === "handover") bindHandover();
  if (activeTab === "admin") bindAdmin();
  bindReminderOverlay();
}

function renderTitlebar() {
  const filePath = dataFilePath();
  const modeLabel = state.settings.mode === "multi" ? "多人模式" : "单人模式";
  const topLabel = state.settings.panel.alwaysOnTop ? "窗口置顶" : "窗口置底";
  return `
    <header class="titlebar" data-tauri-drag-region>
      <div class="drag-region" data-tauri-drag-region>
        <div class="title-line" data-tauri-drag-region>
          <strong data-tauri-drag-region>桌面提醒公共栏</strong>
          <span class="mode-badge ${state.settings.mode === "multi" ? "multi" : "single"}" data-tauri-drag-region>${modeLabel}</span>
        </div>
        <span class="data-file" title="${escapeHtml(filePath)}" data-tauri-drag-region>board-data.json</span>
      </div>
      <div class="title-actions">
        <label class="actor-switch" title="用户切换">
          <span>👤</span>
          <select id="currentActor" class="small-select" aria-label="用户切换">
            ${state.users.filter((user) => user.active).map((user) => `<option value="${user.id}" ${user.id === currentActorId ? "selected" : ""}>${escapeHtml(user.name)}</option>`).join("")}
          </select>
        </label>
        <details class="more-menu">
          <summary title="更多信息和窗口选项">...</summary>
          <div class="more-panel">
            <div>
              <span>数据文件</span>
              <strong title="${escapeHtml(filePath)}">board-data.json</strong>
            </div>
            <div>
              <span>当前模式</span>
              <strong>${modeLabel}</strong>
            </div>
            <button id="toggleTop" type="button">${topLabel}</button>
          </div>
        </details>
      </div>
      <div class="window-controls" aria-label="窗口控制">
        <button class="window-btn minimize-btn" id="minimizeWindow" title="缩小" aria-label="缩小">−</button>
        <button class="window-btn maximize-btn" id="toggleMaximizeWindow" title="最大化" aria-label="最大化">□</button>
        <button class="window-btn window-close-btn" id="hideToTray" title="关闭到托盘" aria-label="关闭到托盘">×</button>
      </div>
    </header>
  `;
}

function renderBody() {
  const handoverCount = state.settings.mode === "multi" ? pendingTodos().length : 0;
  return `
    <nav class="tabs">
      <button class="${activeTab === "todos" ? "active" : ""}" data-tab="todos">待办 ${tabBadge(pendingTodos().length)}</button>
      <button class="${activeTab === "notices" ? "active" : ""}" data-tab="notices">通知 ${tabBadge(activeNotices().length)}</button>
      <button class="${activeTab === "handover" ? "active" : ""}" data-tab="handover">交接 ${tabBadge(handoverCount)}</button>
      <button class="${activeTab === "admin" ? "active" : ""}" data-tab="admin">设置</button>
    </nav>
    <main class="content">
      ${activeTab === "add" ? renderAddTab() : ""}
      ${activeTab === "todos" ? renderTodosTab() : ""}
      ${activeTab === "notices" ? renderNoticesTab() : ""}
      ${activeTab === "handover" ? renderHandoverTab() : ""}
      ${activeTab === "admin" ? renderAdminTab() : ""}
    </main>
    ${activeTab !== "add" ? `<button class="fab-add" id="openAddTodo" title="新增待办 (Ctrl+N)" aria-label="新增待办">+</button>` : ""}
  `;
}

function renderAddTab() {
  const todo = editingTodoId ? state.todos.find((item) => item.id === editingTodoId) : null;
  return `
    <section class="quick-form add-panel">
      <div class="section-head">
        <h2>${todo ? "编辑待办" : "新增待办"}</h2>
        ${todo ? `<button class="ghost" id="cancelEdit">取消</button>` : ""}
      </div>
      <form id="todoForm" class="form-grid">
        <input type="hidden" name="id" value="${escapeHtml(todo?.id || "")}">
        <label class="span-2">内容
          <input id="todoTitle" name="title" required maxlength="120" value="${escapeHtml(todo?.title || "")}" placeholder="例如：明天早上10点给6058抄电表算房租">
          <span id="timeParseHint" class="time-parse-hint">可直接输入“明天早上10点”“下周一下午3点”等时间。</span>
        </label>
        <label>分类
          <select name="categoryId">
            ${state.categories.filter((category) => category.active).map((category) => `<option value="${category.id}" ${category.id === todo?.categoryId ? "selected" : ""}>${escapeHtml(category.name)}</option>`).join("")}
          </select>
        </label>
        <label>优先级
          <select name="priority">
            ${Object.entries(priorityLabels).map(([value, label]) => `<option value="${value}" ${value === (todo?.priority || "normal") ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
        <label>创建人
          <select name="creatorUserId">
            ${state.users.filter((user) => user.active).map((user) => `<option value="${user.id}" ${user.id === (todo?.creatorUserId || currentActorId) ? "selected" : ""}>${escapeHtml(user.name)}</option>`).join("")}
          </select>
        </label>
        <label>负责人
          <select name="ownerUserId">
            <option value="">未指定</option>
            ${state.users.filter((user) => user.active).map((user) => `<option value="${user.id}" ${user.id === todo?.ownerUserId ? "selected" : ""}>${escapeHtml(user.name)}</option>`).join("")}
          </select>
        </label>
        <label>提醒对象
          <select name="remindTarget">
            <option value="one" ${(todo?.remindTarget || "one") === "one" ? "selected" : ""}>负责人</option>
            <option value="all" ${todo?.remindTarget === "all" ? "selected" : ""}>所有人</option>
          </select>
        </label>
        <label>重复
          <select name="repeatRule">
            ${Object.entries(repeatLabels).map(([value, label]) => `<option value="${value}" ${value === (todo?.repeatRule || "none") ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
        <label>提醒时间
          <input type="datetime-local" name="remindAt" value="${toInputDateTime(todo?.remindAt)}">
        </label>
        <label>截止时间
          <input type="datetime-local" name="dueAt" value="${toInputDateTime(todo?.dueAt)}">
        </label>
        <label class="span-2">备注
          <textarea name="note" maxlength="500" placeholder="点开详情时显示">${escapeHtml(todo?.note || "")}</textarea>
        </label>
        <button class="primary span-2" type="submit">${todo ? "保存修改" : "添加待办"}</button>
      </form>
    </section>
  `;
}

function renderTodosTab() {
  const todos = visibleTodos();
  const pendingCount = todos.filter((item) => item.status === "pending").length;
  const hasAnyTodo = state.todos.some((todo) => todo.status !== "purged");
  const filtering = Boolean(todoSearch.trim()) || priorityFilter !== "all";
  return `
    <section class="list-section">
      <div class="section-head">
        <h2>我的待办</h2>
        ${pendingCount ? `<span>${pendingCount} 未完成</span>` : ""}
      </div>
      <div class="todo-toolbar">
        <input id="todoSearch" value="${escapeHtml(todoSearch)}" placeholder="搜索待办、备注、负责人">
        <select id="priorityFilter" aria-label="按优先级筛选">
          <option value="all" ${priorityFilter === "all" ? "selected" : ""}>全部优先级</option>
          <option value="urgent" ${priorityFilter === "urgent" ? "selected" : ""}>紧急</option>
          <option value="important" ${priorityFilter === "important" ? "selected" : ""}>重要</option>
          <option value="normal" ${priorityFilter === "normal" ? "selected" : ""}>普通</option>
        </select>
      </div>
      <div class="todo-list">
        ${todos.length ? todos.map(renderTodoCard).join("") : filtering && hasAnyTodo ? renderFilteredEmptyState() : renderTodoEmptyState()}
      </div>
    </section>
  `;
}

function renderTodoEmptyState() {
  return `
    <div class="empty-state">
      <div class="empty-icon">✓</div>
      <strong>太棒了，暂无待办事项！</strong>
      <p>点击下方按钮新建一条</p>
      <button class="primary" type="button" data-open-add>+ 新增待办</button>
    </div>
  `;
}

function renderFilteredEmptyState() {
  return `
    <div class="empty-state">
      <div class="empty-icon">⌕</div>
      <strong>没有匹配的待办</strong>
      <p>换个关键词或筛选条件再看一次</p>
      <button type="button" id="clearTodoFilters">清空筛选</button>
    </div>
  `;
}

function renderTodoCard(todo) {
  const overdue = isOverdue(todo);
  const category = getCategory(todo.categoryId);
  return `
    <article class="todo-card ${todo.priority} ${todo.status} ${overdue ? "overdue" : ""}">
      <div class="todo-main">
        <div class="todo-title">${escapeHtml(todo.title)}</div>
        <span class="pill ${overdue ? "red" : todo.priority}">${overdue ? "已超时" : priorityLabels[todo.priority]}</span>
      </div>
      <div class="todo-tags">
        <span class="pill blue">${escapeHtml(category?.name || "未分类")}</span>
        ${todo.repeatRule !== "none" ? `<span class="pill gray">${repeatLabels[todo.repeatRule]}</span>` : ""}
        ${todo.lockedByHandover ? `<span class="pill amber">已交接</span>` : ""}
      </div>
      <div class="meta">
        <span>提醒 ${formatDate(todo.snoozedUntil || todo.remindAt)}</span>
        <span>截止 ${formatDate(todo.dueAt)}</span>
        <span>负责人 ${escapeHtml(getUserName(todo.ownerUserId))}</span>
      </div>
      ${todo.note ? `<p class="note">${escapeHtml(todo.note)}</p>` : ""}
      <div class="card-actions">
        ${todo.status !== "done" ? `<button data-action="complete" data-id="${todo.id}">完成</button>` : ""}
        ${todo.status !== "done" && !todo.lockedByHandover ? `<button data-action="edit" data-id="${todo.id}">编辑</button>` : ""}
        <button data-action="purge" data-id="${todo.id}" class="danger-text">管理员删除</button>
      </div>
    </article>
  `;
}

function renderNoticesTab() {
  const notices = state.notices.filter((notice) => notice.status !== "deleted");
  return `
    <section class="list-section">
      <div class="section-head">
        <h2>管理员通知</h2>
        <span>全员确认后完成</span>
      </div>
      <div class="todo-list">
        ${notices.length ? notices.map(renderNoticeCard).join("") : `<div class="empty">还没有管理员通知。</div>`}
      </div>
    </section>
  `;
}

function renderNoticeCard(notice) {
  const users = state.users.filter((user) => user.active);
  const confirmedCount = users.filter((user) => notice.confirmations[user.id]).length;
  return `
    <article class="notice-card ${notice.status}">
      <div class="todo-main">
        <div class="todo-title">${escapeHtml(notice.title)}</div>
        <span class="pill ${notice.status === "completed" ? "green" : "amber"}">${confirmedCount}/${users.length}</span>
      </div>
      ${notice.body ? `<p class="note">${escapeHtml(notice.body)}</p>` : ""}
      <div class="confirm-grid">
        ${users.map((user) => `
          <div class="confirm-person">
            <span>${escapeHtml(user.name)}</span>
            <strong>${notice.confirmations[user.id] ? "已确认" : "未确认"}</strong>
          </div>
        `).join("")}
      </div>
      ${notice.status !== "completed" ? `
        <div class="card-actions">
          <button class="primary" data-action="confirmNotice" data-id="${notice.id}">当前人员确认</button>
        </div>
      ` : ""}
    </article>
  `;
}

function renderHandoverTab() {
  const pendingCount = state.todos.filter((todo) => todo.status === "pending").length;
  return `
    <section class="quick-form">
      <div class="section-head">
        <h2>接班确认</h2>
        <span>${state.settings.mode === "multi" ? "未完成事项会转为交接事项" : "单人模式不改变分类"}</span>
      </div>
      <form id="handoverForm" class="form-grid">
        <label>接班人
          <select name="toUserId">
            ${state.users.filter((user) => user.active).map((user) => `<option value="${user.id}" ${user.id === currentActorId ? "selected" : ""}>${escapeHtml(user.name)}</option>`).join("")}
          </select>
        </label>
        <label>班次
          <select name="shiftId">
            <option value="">不选择班次</option>
            ${state.shifts.filter((shift) => shift.active).map((shift) => `<option value="${shift.id}">${escapeHtml(shift.name)}</option>`).join("")}
          </select>
        </label>
        <button class="primary span-2" type="submit">确认接班 ${pendingCount ? `(${pendingCount} 项未完成)` : ""}</button>
      </form>
    </section>
    <section class="list-section">
      <div class="section-head">
        <h2>最近交接</h2>
      </div>
      <div class="history-list">
        ${state.handovers.slice(0, 12).map((handover) => `
          <div class="history-row">
            <strong>${escapeHtml(getUserName(handover.toUserId))}</strong>
            <span>确认接班</span>
            <time>${formatDate(handover.confirmedAt)}</time>
          </div>
        `).join("") || `<div class="empty">还没有交接记录。</div>`}
      </div>
    </section>
  `;
}

function renderAdminTab() {
  if (!adminUnlocked) {
    return `
      <section class="quick-form">
        <div class="section-head">
          <h2>管理员后台</h2>
          <span>进入后台需要密码</span>
        </div>
        <form id="adminLogin" class="form-grid">
          <label class="span-2">管理员密码
            <input type="password" name="password" required placeholder="请输入管理员密码">
          </label>
          <button class="primary span-2" type="submit">进入后台</button>
        </form>
        <details class="reset-box">
          <summary>忘记密码</summary>
          <form id="resetPasswordForm" class="form-grid">
            <p class="hint span-2">安全问题：${escapeHtml(state.settings.securityQuestion || "未设置")}</p>
            <label>答案
              <input name="securityAnswer" required>
            </label>
            <label>新密码
              <input name="newPassword" type="password" required>
            </label>
            <button class="span-2" type="submit">重置密码</button>
          </form>
        </details>
      </section>
    `;
  }

  return `
    <section class="admin-grid">
      <div class="admin-card">
        <h2>创建管理员通知</h2>
        <form id="noticeForm" class="form-grid">
          <label class="span-2">标题
            <input name="title" required maxlength="120" placeholder="例如：今晚必须检查门禁">
          </label>
          <label class="span-2">内容
            <textarea name="body" maxlength="500"></textarea>
          </label>
          <button class="primary span-2" type="submit">发布通知</button>
        </form>
      </div>

      <div class="admin-card">
        <h2>人员和分类</h2>
        <form id="userForm" class="inline-form">
          <input name="name" placeholder="新增人员">
          <button>添加</button>
        </form>
        <form id="categoryForm" class="inline-form">
          <input name="name" placeholder="新增分类">
          <button>添加</button>
        </form>
        <div class="chips">
          ${state.users.filter((user) => user.active).map((user) => `<span>${escapeHtml(user.name)}</span>`).join("")}
        </div>
        <div class="chips">
          ${state.categories.filter((category) => category.active).map((category) => `<span>${escapeHtml(category.name)}</span>`).join("")}
        </div>
      </div>

      <div class="admin-card">
        <h2>面板设置</h2>
        <form id="settingsForm" class="form-grid">
          <label>模式
            <select name="mode">
              <option value="single" ${state.settings.mode === "single" ? "selected" : ""}>单人模式</option>
              <option value="multi" ${state.settings.mode === "multi" ? "selected" : ""}>多人模式</option>
            </select>
          </label>
          <label>提醒声音
            <select name="sound">
              ${Object.entries(sounds).map(([value, sound]) => `<option value="${value}" ${state.settings.sound === value ? "selected" : ""}>${sound.label}</option>`).join("")}
            </select>
          </label>
          <label>透明度
            <input type="range" name="opacity" min="0.55" max="1" step="0.05" value="${state.settings.panel.opacity || 1}">
          </label>
          <label>颜色
            <input type="color" name="color" value="${state.settings.panel.color || "#fffdf7"}">
          </label>
          <label class="check">
            <input type="checkbox" name="alwaysOnTop" ${state.settings.panel.alwaysOnTop ? "checked" : ""}>
            <span>始终置顶</span>
          </label>
          <label class="check">
            <input type="checkbox" name="locked" ${state.settings.panel.locked ? "checked" : ""}>
            <span>锁定位置提示</span>
          </label>
          <button class="span-2" type="button" id="chooseSound">选择本地音频</button>
          <button class="span-2" type="button" id="previewSound">试听声音</button>
          <button class="primary span-2" type="submit">保存设置</button>
        </form>
      </div>

      <div class="admin-card">
        <h2>备份</h2>
        <p class="hint">数据目录：${escapeHtml(state.dataDir)}</p>
        <p class="hint">最近备份：${formatDate(state.settings.lastBackupAt)}</p>
        <button id="manualBackup">立即备份</button>
        <div id="backupList" class="backup-list"></div>
      </div>

      <div class="admin-card wide">
        <h2>历史记录</h2>
        <div class="history-list">
          ${state.auditLogs.slice(0, 80).map((log) => `
            <div class="history-row">
              <strong>${escapeHtml(log.actorName)}</strong>
              <span>${escapeHtml(log.action)} · ${escapeHtml(log.entityType)}</span>
              <time>${formatDate(log.createdAt)}</time>
            </div>
          `).join("") || `<div class="empty">暂无历史记录。</div>`}
        </div>
      </div>
    </section>
  `;
}

function renderReminderOverlay() {
  if (!reminderTodos.length) return "";
  return `
    <div class="modal-backdrop">
      <section class="reminder-modal">
        <div class="modal-head">
          <h2>待处理提醒</h2>
          <span class="pill red">${reminderTodos.length} 条</span>
        </div>
        <div class="reminder-list">
          ${reminderTodos.map((todo) => `
            <article class="reminder-item">
              <strong>${escapeHtml(todo.title)}</strong>
              <div class="meta">
                <span>提醒 ${formatDate(todo.snoozedUntil || todo.remindAt)}</span>
                <span>负责人 ${escapeHtml(getUserName(todo.ownerUserId))}</span>
                <span>${priorityLabels[todo.priority]}</span>
              </div>
            </article>
          `).join("")}
        </div>
        <label class="modal-actor">确认人
          <select id="reminderActor">
            ${state.users.filter((user) => user.active).map((user) => `<option value="${user.id}" ${user.id === currentActorId ? "selected" : ""}>${escapeHtml(user.name)}</option>`).join("")}
          </select>
        </label>
        <div class="modal-actions">
          <button data-reminder="snooze5">稍后 5 分钟</button>
          <button data-reminder="snooze30">稍后 30 分钟</button>
          <button data-reminder="complete">标记完成</button>
          <button data-reminder="details">打开详情</button>
          <button class="primary" data-reminder="ack">知道了</button>
        </div>
      </section>
    </div>
  `;
}

function renderWizard() {
  app.innerHTML = `
    <div class="wizard">
      <section class="wizard-card">
        <div class="wizard-side">
          <h1>桌面提醒公共栏</h1>
          <p>第一次打开，先设置本机人员、密码、分类和模式。</p>
          <ol>
            <li>完全本地保存</li>
            <li>开机后显示桌面栏</li>
            <li>提醒、交接、公告确认</li>
          </ol>
        </div>
        <form id="wizardForm" class="wizard-form">
          <h2>初始化</h2>
          <label>使用模式
            <select name="mode">
              <option value="single">单人模式</option>
              <option value="multi" selected>多人模式</option>
            </select>
          </label>
          <label>超级管理员姓名
            <input name="superAdminName" required value="管理员">
          </label>
          <label>管理员密码
            <input name="adminPassword" type="password" required minlength="6" placeholder="至少 6 位">
          </label>
          <label>安全问题
            <input name="securityQuestion" required value="第一家店的名称是什么？">
          </label>
          <label>安全问题答案
            <input name="securityAnswer" required>
          </label>
          <label>人员名单
            <textarea name="users" required>张三
李四
王五</textarea>
          </label>
          <label>分类
            <textarea name="categories" required>个人待办
前台事项
卫生检查
客户跟进
设备维护
交接事项</textarea>
          </label>
          <label class="check">
            <input type="checkbox" name="autoLaunch" checked>
            <span>打包后开机自启动</span>
          </label>
          <button class="primary" type="submit">开始使用</button>
        </form>
      </section>
      <div id="toast" class="toast"></div>
    </div>
  `;
  document.querySelector("#wizardForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      mode: form.get("mode"),
      superAdminName: form.get("superAdminName"),
      adminPassword: form.get("adminPassword"),
      securityQuestion: form.get("securityQuestion"),
      securityAnswer: form.get("securityAnswer"),
      users: splitLines(form.get("users")),
      categories: splitLines(form.get("categories")),
      autoLaunch: form.get("autoLaunch") === "on"
    };
    await run(() => api.initialize(payload), "初始化完成");
  });
}

function splitLines(value) {
  return String(value || "")
    .split(/[\n,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function bindCommonEvents() {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeTab = button.dataset.tab;
      editingTodoId = null;
      render();
    });
  });
  document.querySelector("#currentActor")?.addEventListener("change", (event) => {
    currentActorId = event.target.value;
  });
  document.querySelector("#openAddTodo")?.addEventListener("click", openAddTodo);
  document.querySelectorAll("[data-open-add]").forEach((button) => {
    button.addEventListener("click", openAddTodo);
  });
  document.querySelector("#toggleTop")?.addEventListener("click", async () => {
    const next = !state.settings.panel.alwaysOnTop;
    await run(() => api.setPanelMode({ alwaysOnTop: next }), next ? "已设为窗口置顶" : "已设为窗口置底");
  });
  document.querySelector(".drag-region")?.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || event.detail > 1) return;
    api.startDragWindow?.().catch(() => {});
  });
  document.querySelector("#minimizeWindow")?.addEventListener("click", () => {
    api.minimizeWindow();
  });
  document.querySelector("#toggleMaximizeWindow")?.addEventListener("click", () => {
    api.toggleMaximizeWindow();
  });
  document.querySelector("#hideToTray")?.addEventListener("click", () => {
    api.hideToTray();
  });
}

function bindKeyboardShortcuts() {
  if (keyboardBound) return;
  keyboardBound = true;
  window.addEventListener("keydown", (event) => {
    const target = event.target;
    const isTyping = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
    if (event.ctrlKey && event.key.toLowerCase() === "n") {
      event.preventDefault();
      openAddTodo();
    }
    if (event.key === "Escape" && activeTab === "add" && !isTyping) {
      editingTodoId = null;
      activeTab = "todos";
      render();
    }
  });
}

function bindTodos() {
  document.querySelector("#cancelEdit")?.addEventListener("click", () => {
    editingTodoId = null;
    render();
  });
  const todoForm = document.querySelector("#todoForm");
  const titleInput = document.querySelector("#todoTitle");
  const remindInput = todoForm?.elements?.remindAt;
  titleInput?.addEventListener("blur", () => applyNaturalReminder(titleInput, remindInput));
  remindInput?.addEventListener("change", () => {
    remindInput.dataset.autoParsed = "false";
  });
  document.querySelector("#todoForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const parsed = applyNaturalReminder(formElement.elements.title, formElement.elements.remindAt, { quiet: true });
    const form = new FormData(formElement);
    const parsedRemindAt = parsed && (formElement.elements.remindAt.dataset.autoParsed === "true" || !form.get("remindAt"))
      ? parsed.date.toISOString()
      : null;
    const payload = {
      title: form.get("title"),
      categoryId: form.get("categoryId"),
      priority: form.get("priority"),
      creatorUserId: form.get("creatorUserId"),
      ownerUserId: form.get("ownerUserId"),
      remindTarget: form.get("remindTarget"),
      remindUserId: form.get("ownerUserId"),
      repeatRule: form.get("repeatRule"),
      remindAt: parsedRemindAt || fromInputDateTime(form.get("remindAt")),
      dueAt: fromInputDateTime(form.get("dueAt")),
      note: form.get("note"),
      actorUserId: currentActorId
    };
    const id = form.get("id");
    if (id) {
      const saved = await run(() => api.updateTodo(id, payload), "已保存修改");
      if (saved) {
        editingTodoId = null;
        activeTab = "todos";
        render();
      }
    } else {
      const saved = await run(() => api.createTodo(payload), "已添加待办");
      if (saved) {
        activeTab = "todos";
        render();
      }
    }
  });
  document.querySelector("#todoSearch")?.addEventListener("input", (event) => {
    todoSearch = event.target.value;
    render();
  });
  document.querySelector("#priorityFilter")?.addEventListener("change", (event) => {
    priorityFilter = event.target.value;
    render();
  });
  document.querySelector("#clearTodoFilters")?.addEventListener("click", () => {
    todoSearch = "";
    priorityFilter = "all";
    render();
  });
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.id;
      const action = button.dataset.action;
      if (action === "complete") await run(() => api.completeTodo(id, currentActorId), "已完成");
      if (action === "edit") {
        editingTodoId = id;
        activeTab = "add";
        render();
      }
      if (action === "purge") {
        const password = window.prompt("请输入管理员密码，删除后不可恢复：");
        if (password) await run(() => api.purgeTodo(id, password), "已彻底删除");
      }
    });
  });
}

function bindNotices() {
  document.querySelectorAll("[data-action='confirmNotice']").forEach((button) => {
    button.addEventListener("click", async () => {
      await run(() => api.confirmNotice(button.dataset.id, currentActorId), "已确认通知");
    });
  });
}

function bindHandover() {
  document.querySelector("#handoverForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    currentActorId = form.get("toUserId");
    await run(() => api.confirmHandover({
      toUserId: form.get("toUserId"),
      shiftId: form.get("shiftId")
    }), "已确认接班");
  });
}

function bindAdmin() {
  document.querySelector("#adminLogin")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const ok = await run(() => api.verifyAdmin(password));
    if (ok) {
      adminUnlocked = true;
      adminPassword = password;
      showToast("已进入后台");
      render();
    } else {
      showToast("管理员密码不正确", "error");
    }
  });

  document.querySelector("#resetPasswordForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(() => api.resetAdminPassword({
      securityAnswer: form.get("securityAnswer"),
      newPassword: form.get("newPassword")
    }), "密码已重置");
  });

  document.querySelector("#noticeForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(() => api.createNotice({
      title: form.get("title"),
      body: form.get("body"),
      adminPassword
    }), "通知已发布");
  });

  document.querySelector("#userForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(() => api.addUser(form.get("name"), adminPassword), "人员已添加");
  });

  document.querySelector("#categoryForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(() => api.addCategory(form.get("name"), adminPassword), "分类已添加");
  });

  document.querySelector("#settingsForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(() => api.updateSettings({
      adminPassword,
      mode: form.get("mode"),
      sound: form.get("sound"),
      panel: {
        opacity: Number(form.get("opacity")),
        color: form.get("color"),
        alwaysOnTop: form.get("alwaysOnTop") === "on",
        locked: form.get("locked") === "on"
      }
    }), "设置已保存");
  });

  document.querySelector("#chooseSound")?.addEventListener("click", async () => {
    const url = await run(() => api.chooseAudioFile());
    if (!url) return;
    await run(() => api.updateSettings({
      adminPassword,
      sound: "custom",
      customSoundUrl: url
    }), "已选择本地音频");
  });

  document.querySelector("#previewSound")?.addEventListener("click", async () => {
    const form = document.querySelector("#settingsForm");
    const selectedSound = form?.elements?.sound?.value || state.settings.sound;
    await playAlertSound(selectedSound, { durationMs: 3000 });
    showToast("已试听提醒声音");
  });

  document.querySelector("#manualBackup")?.addEventListener("click", async () => {
    const backupPath = await run(() => api.createBackup(), "备份已创建");
    if (backupPath) loadBackupList();
  });

  loadBackupList();
}

async function loadBackupList() {
  const target = document.querySelector("#backupList");
  if (!target) return;
  const backups = await run(() => api.listBackups());
  if (!Array.isArray(backups)) return;
  target.innerHTML = backups.slice(0, 8).map((backup) => `
    <div class="backup-row">
      <span>${escapeHtml(backup.name)}</span>
      <button data-backup="${escapeHtml(backup.path)}">恢复</button>
    </div>
  `).join("") || `<div class="empty">暂无备份。</div>`;
  target.querySelectorAll("[data-backup]").forEach((button) => {
    button.addEventListener("click", async () => {
      await run(() => api.restoreBackup(button.dataset.backup, adminPassword), "备份已恢复");
    });
  });
}

function bindReminderOverlay() {
  document.querySelector("#reminderActor")?.addEventListener("change", (event) => {
    currentActorId = event.target.value;
  });
  document.querySelectorAll("[data-reminder]").forEach((button) => {
    button.addEventListener("click", async () => {
      stopAlertSound();
      const action = button.dataset.reminder;
      const ids = reminderTodos.map((todo) => todo.id);
      const actor = document.querySelector("#reminderActor")?.value || currentActorId;
      currentActorId = actor;
      if (action === "ack") {
        await run(() => api.acknowledgeReminders(ids, actor), "已确认提醒");
        reminderTodos = [];
      }
      if (action === "snooze5") {
        await run(() => api.snoozeReminders(ids, 5, actor), "5 分钟后再提醒");
        reminderTodos = [];
      }
      if (action === "snooze30") {
        await run(() => api.snoozeReminders(ids, 30, actor), "30 分钟后再提醒");
        reminderTodos = [];
      }
      if (action === "complete") {
        for (const id of ids) {
          await api.completeTodo(id, actor);
        }
        await api.acknowledgeReminders(ids, actor);
        state = await api.getState();
        reminderTodos = [];
        showToast("已标记完成");
      }
      if (action === "details") {
        activeTab = "todos";
        reminderTodos = [];
      }
      render();
    });
  });
}

function stopAlertSound() {
  clearTimeout(activeAudioTimer);
  activeAudioTimer = null;
  if (activeAudioElement) {
    activeAudioElement.pause();
    activeAudioElement.currentTime = 0;
    activeAudioElement = null;
  }
  if (activeAudioContext) {
    activeAudioContext.close().catch(() => {});
    activeAudioContext = null;
  }
}

async function playAlertSound(soundKey = state?.settings?.sound || "clear", options = {}) {
  const durationMs = options.durationMs ?? 15000;
  stopAlertSound();
  if (soundKey === "custom" && state?.settings?.customSoundUrl) {
    try {
      const audio = new Audio(state.settings.customSoundUrl);
      audio.volume = 0.9;
      audio.loop = true;
      activeAudioElement = audio;
      await audio.play();
      activeAudioTimer = setTimeout(stopAlertSound, durationMs);
      return;
    } catch {
      // Fall back to generated sound.
    }
  }
  const sound = sounds[soundKey]?.pattern ? sounds[soundKey] : sounds.clear;
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    activeAudioContext = context;
    if (context.state === "suspended") await context.resume();
    let start = context.currentTime + 0.02;
    const endAt = context.currentTime + durationMs / 1000;
    while (start < endAt) {
      sound.pattern.forEach((part) => {
        if (start >= endAt) return;
        if (!part.f) {
          start += part.d;
          return;
        }
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = sound.wave || "sine";
        oscillator.frequency.setValueAtTime(part.f, start);
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.exponentialRampToValueAtTime(0.42, start + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.001, Math.min(start + part.d, endAt));
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(Math.min(start + part.d + 0.02, endAt));
        start += part.d + 0.04;
      });
      start += 0.35;
    }
    activeAudioTimer = setTimeout(stopAlertSound, durationMs);
  } catch {
    await api.systemBeep();
  }
}

api.onStateChanged((nextState) => {
  state = nextState;
  if (!currentActorId && state.users?.length) currentActorId = state.users[0].id;
  render();
});

api.onRemindersDue((todos) => {
  reminderTodos = todos || [];
  playAlertSound().catch(() => api.systemBeep());
  render();
});

api.getState().then(setState).catch((error) => {
  app.innerHTML = `<div class="loading error">${escapeHtml(error.message || String(error))}</div>`;
});
