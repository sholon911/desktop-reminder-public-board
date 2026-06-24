(function () {
  function tauriCore() {
    if (!window.__TAURI__ || !window.__TAURI__.core) {
      throw new Error("Tauri API 尚未加载");
    }
    return window.__TAURI__.core;
  }

  function tauriEvent() {
    if (!window.__TAURI__ || !window.__TAURI__.event) {
      throw new Error("Tauri Event API 尚未加载");
    }
    return window.__TAURI__.event;
  }

  async function chooseAudioFile() {
    if (window.__TAURI__?.dialog?.open) {
      const file = await window.__TAURI__.dialog.open({
        multiple: false,
        filters: [{ name: "Audio", extensions: ["mp3", "wav", "ogg", "m4a"] }]
      });
      return file ? `file:///${String(file).replaceAll("\\", "/")}` : null;
    }
    return null;
  }

  window.desktopBoard = {
    getState: () => tauriCore().invoke("state_get"),
    initialize: (payload) => tauriCore().invoke("state_initialize", { payload }),
    verifyAdmin: (password) => tauriCore().invoke("admin_verify", { password }),
    resetAdminPassword: (payload) => tauriCore().invoke("admin_reset_password", { payload }),
    createTodo: (payload) => tauriCore().invoke("todo_create", { payload }),
    updateTodo: (id, payload) => tauriCore().invoke("todo_update", { id, payload }),
    completeTodo: (id, actorUserId) => tauriCore().invoke("todo_complete", { id, actorUserId }),
    deleteTodo: (id, actorUserId) => tauriCore().invoke("todo_delete", { id, actorUserId }),
    purgeTodo: (id, adminPassword) => tauriCore().invoke("todo_purge", { id, adminPassword }),
    createNotice: (payload) => tauriCore().invoke("notice_create", { payload }),
    confirmNotice: (noticeId, userId) => tauriCore().invoke("notice_confirm", { noticeId, userId }),
    confirmHandover: (payload) => tauriCore().invoke("handover_confirm", { payload }),
    updateSettings: (payload) => tauriCore().invoke("settings_update", { payload }),
    addUser: (name, adminPassword) => tauriCore().invoke("user_add", { name, adminPassword }),
    addCategory: (name, adminPassword) => tauriCore().invoke("category_add", { name, adminPassword }),
    acknowledgeReminders: (todoIds, actorUserId) => tauriCore().invoke("reminder_acknowledge", { todoIds, actorUserId }),
    snoozeReminders: (todoIds, minutes, actorUserId) => tauriCore().invoke("reminder_snooze", { todoIds, minutes, actorUserId }),
    createBackup: () => tauriCore().invoke("backup_create"),
    listBackups: () => tauriCore().invoke("backup_list"),
    restoreBackup: (backupPath, adminPassword) => tauriCore().invoke("backup_restore", { backupPath, adminPassword }),
    chooseAudioFile,
    setPanelMode: (payload) => tauriCore().invoke("window_set_panel_mode", { payload }),
    startDragWindow: () => {
      if (window.__TAURI__?.webviewWindow?.getCurrentWebviewWindow) {
        return window.__TAURI__.webviewWindow.getCurrentWebviewWindow()
          .startDragging()
          .catch(() => tauriCore().invoke("window_start_dragging"));
      }
      return tauriCore().invoke("window_start_dragging");
    },
    hideToTray: () => tauriCore().invoke("window_hide_to_tray"),
    minimizeWindow: () => tauriCore().invoke("window_minimize"),
    toggleMaximizeWindow: () => tauriCore().invoke("window_toggle_maximize"),
    systemBeep: () => tauriCore().invoke("sound_system_beep"),
    onRemindersDue: (callback) => {
      let unlisten = null;
      tauriEvent().listen("reminders:due", (event) => callback(event.payload)).then((dispose) => {
        unlisten = dispose;
      });
      return () => {
        if (unlisten) unlisten();
      };
    },
    onStateChanged: (callback) => {
      let unlisten = null;
      tauriEvent().listen("state:changed", (event) => callback(event.payload)).then((dispose) => {
        unlisten = dispose;
      });
      return () => {
        if (unlisten) unlisten();
      };
    }
  };
})();
