(() => {
  "use strict";

  const config = window.DASHBOARD_CONFIG || {};
  const dashboard = document.getElementById("dashboard");
  const nav = document.getElementById("session-nav");
  const status = document.getElementById("data-status");
  const updatedAt = document.getElementById("updated-at");
  const subtitle = document.getElementById("session-subtitle");
  const sessionTitle = document.getElementById("session-title");
  const exportButton = document.getElementById("export-button");
  const adminButton = document.getElementById("admin-button");
  const adminEntryDialog = document.getElementById("admin-entry-dialog");
  const adminEntryForm = document.getElementById("admin-entry-form");
  const adminEntryEmail = document.getElementById("admin-entry-email");
  const qrDialog = document.getElementById("qr-dialog");
  const qrDialogImage = document.getElementById("qr-dialog-image");
  const qrDialogTitle = document.getElementById("qr-dialog-title");
  const presentationDialog = document.getElementById("presentation-dialog");
  const presentationTitle = document.getElementById("presentation-dialog-title");
  const presentationKicker = document.getElementById("presentation-dialog-kicker");
  const presentationContent = document.getElementById("presentation-dialog-content");
  const leaderboardDialog = document.getElementById("leaderboard-dialog");
  const leaderboardDialogTitle = document.getElementById("leaderboard-dialog-title");
  const leaderboardDialogContent = document.getElementById("leaderboard-dialog-content");
  const sessionControl = document.getElementById("session-control");
  const controlFab = document.getElementById("control-fab");
  const controlPanel = document.getElementById("control-panel");
  const controlFrame = document.getElementById("control-frame");
  const controlAuthLink = document.getElementById("control-auth-link");
  const demoControl = document.getElementById("demo-control");
  const controlSessionLabel = document.getElementById("control-session-label");
  const globalTimerBanner = document.getElementById("global-timer-banner");
  const floatingMetrics = document.getElementById("floating-metrics");
  const floatingResponseCount = document.getElementById("floating-response-count");
  const floatingUnitCount = document.getElementById("floating-unit-count");
  const formatNumber = new Intl.NumberFormat("vi-VN");
  const urlParams = new URLSearchParams(location.search);
  const fakeMode = urlParams.get("demo") === "1";
  const fakePhase = fakeMode && ["live", "timed", "not_started", "closed"].includes(urlParams.get("trangthai"))
    ? (urlParams.get("trangthai") === "live" ? "NOT_STARTED" : urlParams.get("trangthai").toUpperCase())
    : "";
  const fakeTimerMinutes = fakeMode ? Math.max(0, Number(urlParams.get("demotimer") || 0)) : 0;
  const requestedFakeTimerEnd = fakeMode ? Number(urlParams.get("democloseat") || 0) : 0;
  const fakeTimerEndsAt = requestedFakeTimerEnd || (fakeTimerMinutes ? Date.now() + fakeTimerMinutes * 60000 : 0);
  const fakeTimerStartedAt = fakeTimerEndsAt ? fakeTimerEndsAt - fakeTimerMinutes * 60000 : 0;
  const fakeTimerSessionId = Number(urlParams.get("phien")) || 1;
  if (fakeTimerEndsAt && !requestedFakeTimerEnd) {
    urlParams.set("democloseat", String(fakeTimerEndsAt));
    history.replaceState({}, "", `${location.pathname}?${urlParams.toString()}`);
  }

  let payload = null;
  let courseData = null;
  let courseLoading = false;
  let activeSession = getSessionFromUrl();
  let selectedQuestion = 0;
  let responseSearch = "";
  let closedLivePreview = false;
  let timer = null;
  let lastLivePayload = null;
  let countdownExpired = false;
  let isLoading = false;
  let refreshQueued = false;
  let forceRefreshQueued = false;
  const jsonpCallbacks = Object.create(null);
  const ignoreLateJsonp = () => {};
  // A late script can safely call a removed request without leaking callbacks.
  window.__giaLaiDashboardCallbacks = new Proxy(jsonpCallbacks, {
    get: (callbacks, key) => callbacks[key] || ignoreLateJsonp
  });
  let usingFallbackData = false;
  const detailStates = new Map();
  const scrollStates = new Map();
  const demoSessionStates = new Map();
  const controlSessionStates = new Map();
  const pendingSessionActions = new Map();
  let adminRequested = false;
  let adminMessageSource = null;
  let adminChannelToken = "";
  const accessPreferenceKey = "gia-lai-7-phien.access.v1";

  configureAdminLinks();

  const escapeHtml = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function configureAdminLinks() {
    if (fakeMode) {
      exportButton.hidden = true;
      adminButton.hidden = true;
      sessionControl.hidden = false;
      controlFrame.hidden = true;
      demoControl.hidden = false;
      return;
    }
    if (!config.adminUrl) {
      exportButton.hidden = true;
      adminButton.hidden = true;
      sessionControl.hidden = true;
      return;
    }
    sessionControl.hidden = true;
    exportButton.hidden = true;
    const separator = config.adminUrl.includes("?") ? "&" : "?";
    controlAuthLink.href = `${config.adminUrl}${separator}admin=1`;
    adminButton.hidden = false;
    const preference = readAccessPreference();
    if (preference?.email) adminEntryEmail.value = preference.email;
    if (preference?.mode === "admin") {
      enableAdminView();
      return;
    }
    if (preference?.mode === "public") return;
    adminEntryDialog.showModal();
  }

  function readAccessPreference() {
    try {
      const preference = JSON.parse(localStorage.getItem(accessPreferenceKey) || "null");
      if (!preference || preference.version !== 1 || preference.adminUrl !== config.adminUrl ||
          !["admin", "public"].includes(preference.mode)) return null;
      const email = typeof preference.email === "string" ? preference.email.trim().toLowerCase() : "";
      if (preference.mode === "admin" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
      return {mode: preference.mode, email};
    } catch (_) { return null; }
  }

  function saveAccessPreference(mode) {
    // Store only the UI choice, never an authentication token or Google session.
    try {
      localStorage.setItem(accessPreferenceKey, JSON.stringify({version: 1, mode,
        email: adminEntryEmail.value.trim().toLowerCase(), adminUrl: config.adminUrl}));
    } catch (_) { /* Restricted storage must not prevent access to the dashboard. */ }
  }

  function enableAdminView() {
    // Restoring the UI does not grant permission: Apps Script still verifies Google.
    adminRequested = true;
    adminMessageSource = null;
    controlFrame.dataset.session = "";
    sessionControl.hidden = false;
    controlPanel.hidden = false;
    controlFrame.hidden = false;
    controlFab.setAttribute("aria-expanded", "true");
  }

  function getSessionFromUrl() {
    if (urlParams.get("view") === "course") return 0;
    const value = Number(urlParams.get("phien"));
    return value >= 1 && value <= 7 ? value : 1;
  }

  function phaseOf(session) {
    if (!session) return "NOT_STARTED";
    const id = Number(session.id);
    const ctrlState = controlSessionStates.get(id);
    if (ctrlState && ctrlState.phase) {
      if (ctrlState.phase === "TIMED" && ctrlState.timerEndsAt && Date.now() >= new Date(ctrlState.timerEndsAt).getTime()) {
        ctrlState.phase = "CLOSED";
        ctrlState.closedAt = ctrlState.timerEndsAt;
      }
      return ctrlState.phase;
    }
    const demoState = fakeMode ? getDemoSessionState(session) : null;
    if (demoState) {
      if (demoState.phase === "TIMED" && demoState.timerEndsAt && Date.now() >= demoState.timerEndsAt) {
        demoState.phase = "CLOSED";
        demoState.closedAt = demoState.timerEndsAt;
        demoState.timerEndsAt = 0;
      }
      return demoState.phase;
    }
    if (session.phase === "CLOSED") return "CLOSED";
    if (session.phase === "TIMED" || session.timerEndsAt) return "TIMED";
    return "NOT_STARTED";
  }

  function phaseLabel(phase) {
    if (phase === "CLOSED") return "Đã chốt";
    if (phase === "TIMED") return "Đang đếm ngược";
    return "Chưa bắt đầu";
  }

  function getDemoSessionState(session) {
    if (!fakeMode) return null;
    const id = Number(session.id);
    if (!demoSessionStates.has(id)) {
      const hasInitialTimer = id === fakeTimerSessionId && Boolean(fakeTimerEndsAt);
      demoSessionStates.set(id, {
        phase: hasInitialTimer ? (Date.now() < fakeTimerEndsAt ? "TIMED" : "CLOSED") : (fakePhase || (session.phase === "CLOSED" ? "CLOSED" : "NOT_STARTED")),
        closedAt: hasInitialTimer && Date.now() >= fakeTimerEndsAt ? fakeTimerEndsAt : (session.closedAt ? new Date(session.closedAt).getTime() : 0),
        timerStartedAt: hasInitialTimer ? fakeTimerStartedAt : 0,
        timerEndsAt: hasInitialTimer && Date.now() < fakeTimerEndsAt ? fakeTimerEndsAt : 0
      });
    }
    return demoSessionStates.get(id);
  }

  function applyDemoSessionState(session) {
    const state = getDemoSessionState(session);
    if (!state) return;
    phaseOf(session);
    session.phase = state.phase;
    session.closedAt = state.phase === "CLOSED" && state.closedAt ? new Date(state.closedAt).toISOString() : null;
    session.timerStartedAt = state.timerStartedAt ? new Date(state.timerStartedAt).toISOString() : null;
    session.timerEndsAt = state.timerEndsAt ? new Date(state.timerEndsAt).toISOString() : null;
  }

  function setStatus(mode, text) {
    status.className = `status status-${mode}`;
    status.textContent = text;
  }

  async function loadData(forceRefresh = false) {
    if (isLoading) {
      refreshQueued = true;
      forceRefreshQueued ||= forceRefresh === true;
      return;
    }
    const requestStartedAt = Date.now();
    isLoading = true;
    if (!payload) setStatus("loading", "Đang tải dữ liệu…");
    try {
      const dataUrl = fakeMode ? (config.fakeDataUrl || "data/fake.json") : config.apiUrl;
      if (!dataUrl) throw new Error("DATA_URL_EMPTY");
      const separator = dataUrl.includes("?") ? "&" : "?";
      const force = !fakeMode && forceRefresh === true ? "&refresh=1" : "";
      const requestUrl = `${dataUrl}${separator}_=${Date.now()}${force}`;
      if (!fakeMode && /^https:\/\/script\.google\.com\/macros\/s\//.test(dataUrl)) {
        // Apps Script JSONP avoids a slow CORS fetch attempt before each poll.
        payload = await fetchJsonp(requestUrl);
      } else try {
        const response = await fetchWithTimeout(requestUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        payload = await response.json();
      } catch (fetchError) {
        if (fakeMode) throw fetchError;
        payload = await fetchJsonp(requestUrl);
      }
      if (!payload || !Array.isArray(payload.sessions)) throw new Error("DATA_INVALID");
      controlSessionStates.forEach((state, id) => {
        if (!pendingSessionActions.has(id) && requestStartedAt >= (state._receivedAt || 0)) controlSessionStates.delete(id);
      });
      lastLivePayload = payload;
      usingFallbackData = false;
      setStatus(fakeMode ? "demo" : "live", fakeMode ? "Dữ liệu giả lập" : "Dữ liệu trực tiếp");
    } catch (error) {
      if (!fakeMode && lastLivePayload) {
        payload = lastLivePayload;
        usingFallbackData = false;
        setStatus("error", "Mất kết nối tạm thời · đang hiển thị dữ liệu gần nhất");
      } else {
        const response = await fetchWithTimeout(`${config.demoDataUrl || "data/demo.json"}?_=${Date.now()}`, 8000);
        payload = await response.json();
        usingFallbackData = !fakeMode;
        setStatus(config.apiUrl ? "error" : "demo", config.apiUrl ? "Không kết nối được dữ liệu" : "Chế độ xem trước");
      }
    } finally {
      isLoading = false;
      if (refreshQueued) {
        const force = forceRefreshQueued;
        refreshQueued = false;
        forceRefreshQueued = false;
        queueMicrotask(() => loadData(force));
      }
    }
    applyPendingControlStates();
    render();
  }

  async function fetchWithTimeout(url, timeoutMs = 12000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { cache: "no-store", signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  function fetchJsonp(url, timeoutMs = 25000) {
    return new Promise((resolve, reject) => {
      const requestKey = `r${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const callback = `__giaLaiDashboardCallbacks.${requestKey}`;
      const script = document.createElement("script");
      const separator = url.includes("?") ? "&" : "?";
      let done = false;
      const finish = (error, data) => {
        if (done) return;
        done = true;
        clearTimeout(timerId);
        script.remove();
        delete jsonpCallbacks[requestKey];
        if (error) reject(error);
        else resolve(data);
      };
      const timerId = setTimeout(() => finish(new Error("JSONP_TIMEOUT")), timeoutMs);
      jsonpCallbacks[requestKey] = data => finish(null, data);
      script.onerror = () => finish(new Error("JSONP_FAILED"));
      script.src = `${url}${separator}callback=${encodeURIComponent(callback)}`;
      document.head.appendChild(script);
    });
  }

  function applyPendingControlStates() {
    if (!payload?.sessions) return;
    controlSessionStates.forEach((state, id) => {
      const session = payload.sessions.find(item => Number(item.id) === Number(id));
      if (session) Object.assign(session, state);
    });
  }

  function render() {
    captureUiState();
    const sessions = payload?.sessions || [];
    renderNav(sessions);
    if (activeSession === 0) {
      sessionTitle.textContent = "Tổng kết khóa · Gia Lai";
      subtitle.textContent = "Vinh danh đơn vị tích cực và đạt thành tích cao";
      sessionControl.hidden = true;
      globalTimerBanner.hidden = true;
      floatingMetrics.hidden = true;
      window.GiaLaiCourse.render(dashboard,courseData,{loading:courseLoading,adminUrl:adminRequested?config.adminUrl:"",email:adminEntryEmail.value});
      if (!courseData && !courseLoading) loadCourse();
      return;
    }
    if (adminRequested || fakeMode) sessionControl.hidden = false;
    const session = sessions.find(item => Number(item.id) === activeSession) || sessions[0];
    if (!session) {
      dashboard.innerHTML = '<div class="empty">Chưa có cấu hình dữ liệu phiên.</div>';
      return;
    }
    applyDemoSessionState(session);
    selectedQuestion = Math.min(selectedQuestion, Math.max(0, (session.questions?.length || 1) - 1));
    sessionTitle.textContent = `Phiên ${session.id} – ${session.description || session.typeLabel}`;
    subtitle.textContent = session.typeLabel;
    updatedAt.textContent = payload.updatedAt ? `Cập nhật: ${new Date(payload.updatedAt).toLocaleString("vi-VN")}` : "";
    const phase = phaseOf(session);
    if (phase !== "CLOSED") {
      closedLivePreview = false;
      if (leaderboardDialog.open) leaderboardDialog.close();
      if (participantDialog?.open) participantDialog.close();
      if (presentationDialog.open && presentationContent.classList.contains("presentation-answer")) presentationDialog.close();
    }
    const pendingAction = pendingSessionActions.get(Number(session.id));
    const closing = pendingAction === "close";
    renderGlobalTimer(session, closing ? "PROCESSING" : phase);
    const showingClosedLivePreview = phase === "CLOSED" && closedLivePreview;
    const contentPhase = showingClosedLivePreview ? "LIVE" : phase;
    dashboard.dataset.kind = session.kind || "";
    dashboard.dataset.phase = closing ? "PROCESSING" : phase;
    dashboard.dataset.view = closing ? "processing" : showingClosedLivePreview ? "live-preview" : phase.toLowerCase();
    dashboard.innerHTML = `
      <section class="section-head">
        <div><p class="section-kicker">KẾT QUẢ PHIÊN ${session.id}</p><h2>${escapeHtml(session.description || session.name)}</h2></div>
        <div class="section-tools">
          <button class="session-qr" type="button" data-open-qr="${session.id}" aria-label="Phóng to mã QR Phiên ${session.id}"><img src="assets/qr/session-${session.id}.png" alt=""><span><small>MÃ QR LÀM BÀI</small><strong>Phiên ${session.id}</strong><em>Nhấn để phóng to</em></span></button>
          <div class="section-badges"><span class="phase-pill phase-${closing ? "processing" : phase.toLowerCase()}">${closing ? "Đang xử lý" : phaseLabel(phase)}</span><span class="type-pill">${escapeHtml(session.typeLabel)}</span></div>
        </div>
      </section>
      ${closing ? "" : renderClosedViewSwitch(phase, showingClosedLivePreview)}
      ${closing ? renderProcessingNotice() : renderPhaseNotice(session, phase, showingClosedLivePreview)}
      ${renderMetrics(session, contentPhase, showingClosedLivePreview)}
      ${renderUnitParticipation(session)}
      ${renderSessionContent(session, contentPhase)}
    `;
    restoreUiState();
    updateCountdowns();
    updateQuickControl(session);
    bindSessionControls(session);
    updateFloatingMetrics(session);
  }

  function updateFloatingMetrics(session) {
    const count = phaseOf(session) === "CLOSED"
      ? session.totalResponses
      : (session.currentResponses ?? session.totalResponses ?? 0);
    floatingResponseCount.textContent = formatNumber.format(Number(count) || 0);
    floatingUnitCount.textContent = formatUnitParticipation(session);
    syncFloatingMetricsVisibility();
  }

  function syncFloatingMetricsVisibility() {
    const original = dashboard.querySelector(".metrics");
    if (!original) { floatingMetrics.hidden = true; return; }
    const stickyBottom = Math.max(nav.getBoundingClientRect().bottom, globalTimerBanner.hidden ? 0 : globalTimerBanner.getBoundingClientRect().bottom);
    floatingMetrics.style.top = `${Math.max(8, stickyBottom + 8)}px`;
    floatingMetrics.hidden = original.getBoundingClientRect().bottom >= stickyBottom + 8;
  }

  function updateQuickControl(session) {
    if (fakeMode) {
      if (!controlPanel.hidden) renderDemoQuickControl(session);
      return;
    }
    if (!config.adminUrl || !adminRequested) return;
    controlSessionLabel.textContent = `Phiên ${session.id}`;
    controlFab.textContent = `Mở điều khiển Phiên ${session.id}`;
    const separator = config.adminUrl.includes("?") ? "&" : "?";
    if (controlFrame.dataset.session !== String(session.id)) adminChannelToken = crypto.randomUUID();
    const compactUrl = `${config.adminUrl}${separator}admin=1&view=compact&session=${session.id}&email=${encodeURIComponent(adminEntryEmail.value.trim().toLowerCase())}&channelToken=${encodeURIComponent(adminChannelToken)}`;
    if (controlFrame.dataset.session !== String(session.id)) {
      adminMessageSource = null;
      controlFrame.dataset.session = String(session.id);
      controlFrame.src = compactUrl;
    }
  }

  function renderDemoQuickControl(session) {
    controlSessionLabel.textContent = `Phiên ${session.id}`;
    controlFab.textContent = `Mở điều khiển Phiên ${session.id}`;
    applyDemoSessionState(session);
    const phase = phaseOf(session);
    const closed = phase === "CLOSED";
    const timed = !closed && Boolean(session.timerEndsAt);
    const count = closed ? session.totalResponses : (session.currentResponses ?? session.totalResponses ?? 0);
    demoControl.innerHTML = `<section class="demo-control-card"><div class="demo-control-status"><span>CHẾ ĐỘ DEMO · KHÔNG ẢNH HƯỞNG DỮ LIỆU THẬT</span><b>${closed ? "Đã chốt giả lập" : timed ? "Đang đếm ngược giả lập" : "Chưa bắt đầu giả lập"}</b></div>${timed ? `<strong class="demo-countdown" data-countdown="${escapeHtml(session.timerEndsAt)}">Còn lại: --:--</strong>` : ""}<div class="demo-control-count"><strong>${formatNumber.format(count)}</strong><span>bài giả lập</span></div>${closed ? `<button type="button" data-demo-action="reopen">Mở lại phiên demo</button>` : `<label>Thời gian làm bài <span>(phút)</span><input type="number" min="0.1" max="10080" step="0.1" value="15" data-demo-duration aria-label="Thời gian làm bài tính bằng phút"></label><button type="button" data-demo-action="timer">${timed ? "Đặt lại giờ demo" : "Bắt đầu đếm ngược"}</button><button class="demo-close-now" type="button" data-demo-action="close">Kết thúc ngay bản demo</button>`}</section>`;
    demoControl.querySelectorAll("[data-demo-action]").forEach(button => button.addEventListener("click", () => mutateDemoSession(session, button.dataset.demoAction)));
    updateCountdowns();
  }

  function renderGlobalTimer(session, phase) {
    if (phase !== "TIMED" || !session.timerEndsAt) {
      globalTimerBanner.hidden = true;
      globalTimerBanner.innerHTML = "";
      return;
    }
    globalTimerBanner.hidden = false;
    globalTimerBanner.innerHTML = `<strong>Phiên ${session.id} đang làm bài</strong><span data-countdown="${escapeHtml(session.timerEndsAt)}">Còn lại: --:--</span>`;
  }

  function mutateDemoSession(session, action) {
    const state = getDemoSessionState(session);
    let timerMinutes = 0;
    const id = Number(session.id);
    if (action === "timer") {
      const minutes = Number(demoControl.querySelector("[data-demo-duration]")?.value);
      if (!(minutes > 0)) return;
      timerMinutes = minutes;
      state.phase = "TIMED";
      state.closedAt = 0;
      state.timerStartedAt = Date.now();
      state.timerEndsAt = state.timerStartedAt + minutes * 60000;
    } else if (action === "close") {
      state.phase = "CLOSED";
      state.closedAt = Date.now();
      state.timerStartedAt = 0;
      state.timerEndsAt = 0;
      pendingSessionActions.set(id, "close");
    } else if (action === "reopen") {
      state.phase = "NOT_STARTED";
      state.closedAt = 0;
      state.timerStartedAt = 0;
      state.timerEndsAt = 0;
      pendingSessionActions.delete(id);
      closedLivePreview = false;
    }
    controlSessionStates.set(id, {
      phase: state.phase,
      timerStartedAt: state.timerStartedAt ? new Date(state.timerStartedAt).toISOString() : null,
      timerEndsAt: state.timerEndsAt ? new Date(state.timerEndsAt).toISOString() : null,
      closedAt: state.closedAt ? new Date(state.closedAt).toISOString() : null
    });
    persistDemoUrlState(state, timerMinutes);
    applyDemoSessionState(session);
    closeControlPanel();
    render();
    if (action === "close") {
      setTimeout(() => {
        pendingSessionActions.delete(id);
        render();
      }, 600);
    }
  }

  function persistDemoUrlState(state, timerMinutes) {
    const params = new URLSearchParams(location.search);
    params.set("trangthai", state.phase.toLowerCase());
    if (state.timerEndsAt) {
      params.set("demotimer", String(timerMinutes || Math.max(0.1, (state.timerEndsAt - state.timerStartedAt) / 60000)));
      params.set("democloseat", String(state.timerEndsAt));
    } else {
      params.delete("demotimer");
      params.delete("democloseat");
    }
    history.replaceState({}, "", `${location.pathname}?${params.toString()}`);
  }

  function captureUiState() {
    dashboard.querySelectorAll("details[data-ui-state]").forEach(element => {
      detailStates.set(element.dataset.uiState, element.open);
    });
    dashboard.querySelectorAll("[data-ui-scroll]").forEach(element => {
      scrollStates.set(element.dataset.uiScroll, { left: element.scrollLeft, top: element.scrollTop });
    });
  }

  function restoreUiState() {
    dashboard.querySelectorAll("details[data-ui-state]").forEach(element => {
      if (detailStates.has(element.dataset.uiState)) element.open = detailStates.get(element.dataset.uiState);
    });
    dashboard.querySelectorAll("[data-ui-scroll]").forEach(element => {
      const saved = scrollStates.get(element.dataset.uiScroll);
      if (saved) {
        element.scrollLeft = saved.left;
        element.scrollTop = saved.top;
      }
    });
  }

  function renderClosedViewSwitch(phase, showingLivePreview) {
    if (phase !== "CLOSED") return "";
    return `<section class="closed-view-switch"><div class="view-switch-copy"><span>CHẾ ĐỘ HIỂN THỊ</span><strong>${showingLivePreview ? "Màn hình lúc nhận bài" : "Kết quả tổng hợp sau khi chốt"}</strong></div><div class="view-switch-buttons" role="group" aria-label="Chọn chế độ hiển thị"><button type="button" class="${showingLivePreview ? "" : "active"}" data-closed-view="summary">Kết quả tổng hợp</button><button type="button" class="${showingLivePreview ? "active preview" : ""}" data-closed-view="live">Màn hình lúc nhận bài</button></div></section>`;
  }

  function renderPhaseNotice(session, phase, showingLivePreview) {
    if (phase !== "CLOSED") {
      if (!session.timerEndsAt) return `<div class="phase-notice live-notice"><strong>Phiên chưa bắt đầu</strong><span>Nhấn “Bắt đầu” trong bảng điều khiển để chạy thời gian làm bài.</span></div>`;
      return `<div class="phase-notice timer-notice"><strong>Phiên đang đếm ngược</strong><span class="public-countdown" data-countdown="${escapeHtml(session.timerEndsAt)}">Còn lại: --:--</span></div>`;
    }
    if (showingLivePreview) {
      const closedAt = session.closedAt ? new Date(session.closedAt).toLocaleString("vi-VN") : "theo dữ liệu mô phỏng";
      return `<div class="phase-notice preview-notice"><strong>Đang xem lại giao diện lúc nhận bài</strong><span>Sử dụng ${formatNumber.format(session.totalResponses || 0)} bài tại thời điểm chốt ${escapeHtml(closedAt)}.</span></div>`;
    }
    return "";
  }

  function renderProcessingNotice() {
    return `<div class="phase-notice processing-notice"><strong>Đang kết thúc phiên</strong><span>Hệ thống đang chốt số liệu và tạo màn hình tổng hợp…</span></div>`;
  }

  function updateCountdowns() {
    let hasExpired = false;
    document.querySelectorAll("[data-countdown]").forEach(element => {
      const remaining = Math.max(0, new Date(element.dataset.countdown).getTime() - Date.now());
      const totalSeconds = Math.ceil(remaining / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      element.textContent = `Còn lại: ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
      if (remaining <= 0) hasExpired = true;
    });
    if (hasExpired && !countdownExpired) {
      countdownExpired = true;
      loadData(true);
    }
    if (!hasExpired) countdownExpired = false;
  }

  function renderNav(sessions) {
    nav.innerHTML = sessions.map(session => {
      const phase = phaseOf(session);
      return `<button class="session-tab ${Number(session.id) === activeSession ? "active" : ""}" data-session="${session.id}" type="button" aria-label="Phiên ${session.id}"><span>${session.id}</span><i class="tab-phase ${phase.toLowerCase()}"></i></button>`;
    }).join("") + `<button class="session-tab course-tab ${activeSession===0?"active":""}" data-course type="button">Tổng kết khóa</button>`;
    nav.querySelector("[data-course]").addEventListener("click",()=>{
      activeSession=0;
      const params=new URLSearchParams(location.search);params.set("view","course");params.delete("phien");
      history.replaceState({},"",`${location.pathname}?${params.toString()}`);
      render();loadCourse();scrollTo({top:0,behavior:"smooth"});
    });
    nav.querySelectorAll("[data-session]").forEach(button => button.addEventListener("click", () => {
      activeSession = Number(button.dataset.session);
      selectedQuestion = 0;
      responseSearch = "";
      closedLivePreview = false;
      const params = new URLSearchParams(location.search);
      params.delete("view");
      params.set("phien", activeSession);
      history.replaceState({}, "", `${location.pathname}?${params.toString()}`);
      render();
      scrollTo({ top: 0, behavior: "smooth" });
    }));
  }

  function renderMetrics(session, phase, showingClosedLivePreview = false) {
    if (phase !== "CLOSED") {
      const responseCount = showingClosedLivePreview ? session.totalResponses : (session.currentResponses ?? session.totalResponses ?? 0);
      const responseNote = showingClosedLivePreview ? "Số bài tại thời điểm chốt" : "Cập nhật theo phản hồi mới";
      return `<section class="metrics metrics-2">${metric("Số bài đã nhận", formatNumber.format(responseCount || 0), responseNote)}${metric("Đơn vị tham gia", formatUnitParticipation(session), unitParticipationNote(session))}</section>`;
    }
    const summary = session.quizSummary || {};
    let metrics;
    if (session.kind === "quiz") {
      metrics = [
        metric("Tổng số bài", formatNumber.format(session.totalResponses || 0), "Số bài tại thời điểm chốt"),
        metric("Điểm trung bình", session.scoreStats?.count ? score(session.scoreStats.average) : "—", session.scoreStats?.maxScore ? `Trên thang ${session.scoreStats.maxScore}` : "Chưa có dữ liệu"),
        metric("Tỷ lệ đúng trung bình", session.scoreStats?.count ? `${score(summary.averageCorrectPercent)}%` : "—", "Tính lại từ đáp án chuẩn"),
        metric("Đơn vị tham gia", formatUnitParticipation(session), unitParticipationNote(session))
      ];
    } else if (session.kind === "ordering") {
      metrics = [metric("Tổng số bài", formatNumber.format(session.totalResponses || 0), "Số bài tại thời điểm chốt"), metric("Đúng hoàn toàn", formatNumber.format(session.ordering?.correctCount || 0), "Đúng toàn bộ 13 bước"), metric("Tỷ lệ đúng", `${score(session.ordering?.correctRate || 0)}%`, "Đúng hoàn toàn"), metric("Phương án khác nhau", formatNumber.format(session.ordering?.uniqueSequenceCount || 0), "Các chuỗi đã được gửi")];
    } else if (session.kind === "true_false") {
      metrics = [metric("Tổng số bài", formatNumber.format(session.totalResponses || 0), "Số bài tại thời điểm chốt"), metric("Tỷ lệ đúng trung bình", session.scoreStats?.count ? `${score(summary.averageCorrectPercent)}%` : "—", "Trên 10 nhận định"), metric("Có giải thích", session.totalResponses ? `${score(session.explanationStats?.rate || 0)}%` : "—", session.totalResponses ? `${formatNumber.format(session.explanationStats?.count || 0)} lượt giải thích` : "Chưa có dữ liệu"), metric("Đơn vị tham gia", formatUnitParticipation(session), unitParticipationNote(session))];
    } else {
      metrics = [metric("Tổng phản hồi", formatNumber.format(session.totalResponses || 0), "Bài đã gửi trước khi chốt"), metric("Đơn vị tham gia", formatUnitParticipation(session), unitParticipationNote(session))];
    }
    return `<section class="metrics metrics-${metrics.length}">${metrics.join("")}</section>`;
  }

  function metric(label, value, note) {
    return `<article class="metric"><span class="metric-label">${escapeHtml(label)}</span><strong class="metric-value">${escapeHtml(value)}</strong><span class="metric-note">${escapeHtml(note)}</span></article>`;
  }

  function formatUnitParticipation(session) {
    const participating = Number(session.participatingUnits || 0);
    const total = Number(session.totalUnits || 0);
    return total ? `${formatNumber.format(participating)}/${formatNumber.format(total)}` : formatNumber.format(participating);
  }

  function unitParticipationNote(session) {
    const missing = Array.isArray(session.missingUnits) ? session.missingUnits.length : Math.max(0, Number(session.totalUnits || 0) - Number(session.participatingUnits || 0));
    return missing ? `Còn ${formatNumber.format(missing)} đơn vị chưa có bài` : "Đủ đơn vị trong danh mục";
  }

  function renderSessionContent(session, phase) {
    if (session.error) return `<div class="empty">${escapeHtml(session.error)}</div>`;
    const live = phase !== "CLOSED";
    let content;
    if (session.kind === "quiz") content = live ? renderLiveQuiz(session) : renderQuizDashboard(session);
    else if (session.kind === "ordering") content = live ? renderLiveOrdering(session) : renderOrderingDashboard(session);
    else if (session.kind === "true_false") content = renderTrueFalseDashboard(session, live);
    else content = renderOpenDashboard(session, live);
    return (live ? "" : renderLeaderboard(session)) + content + (live ? "" : renderUnitBreakdown(session));
  }

  function renderLeaderboard(session) {
    const topParticipants = session.topParticipants || [];
    if (topParticipants.length > 0) {
      return renderTopParticipantsLeaderboard(session, topParticipants);
    }
    if (session.aiReviewPending) {
      return `<section class="ai-review-pending panel"><p class="panel-kicker">${session.kind === "true_false" ? "ĐÚNG / SAI VÀ GIẢI THÍCH" : "BÀI TỰ LUẬN"}</p><h3>Chưa công bố vinh danh</h3><p>${session.kind === "true_false" ? "Đang chờ chấm các lời giải thích theo căn cứ giáo viên." : "Đang chờ chấm các ý theo đáp án tham chiếu."} Bảng xếp hạng chỉ xuất hiện khi các bài trong phiên đã được chấm xong.</p></section>`;
    }
    const leaders = session.leaderboard || [];
    if (!leaders.length) return "";
    return renderTopParticipantsLeaderboard(session, leaders);
  }
  function _legacyLeaderboardNote() {
    return "Tối đa 10 người · xếp theo điểm, ưu tiên nộp sớm";
  }

  function renderTopParticipantsLeaderboard(session, participants, presentation = false) {
    const label = participants.length === 1 ? "Top 1" : `Top ${participants.length}`;
    const isQuiz = session.kind === "quiz" || session.kind === "true_false";
    const methodNote = session.kind === "true_false" ? "Xếp theo số lựa chọn đúng, rồi số giải thích đạt, cuối cùng là thời gian" : isQuiz ? "Xếp theo số câu đúng, rồi thời gian hoàn thành" : session.kind === "ordering" ? "Xếp theo số bước đúng vị trí, rồi thời gian hoàn thành" : "Xếp theo số ý đúng, rồi thời gian hoàn thành";
    const featured = participants.slice(0, 3);
    const remaining = participants.slice(3);

    const personCard = (person, actualIndex, featuredCard = false) => {
      const rank = person.rank || actualIndex + 1;
      const rankClass = rank === 1 ? "rank-1" : rank === 2 ? "rank-2" : rank === 3 ? "rank-3" : `rank-${rank}`;
      const scoreBadge = person.scoreText || person.scoreChoice || person.result || "Đạt";
      const positionText = person.position ? escapeHtml(person.position) : "";
      const hasDetails = !!(person.questionDetails?.length || person.matchedItems?.length || person.essay);
      const cardTag = hasDetails ? "button" : "div";
      const cardAction = hasDetails ? ` type="button" data-open-participant="${actualIndex}" aria-label="Xem bài làm của ${escapeHtml(person.name)}"` : "";
      const detailHint = hasDetails ? `<span class="view-detail-hint">Xem chi tiết <b>→</b></span>` : "";
      
      if (!featuredCard) {
        return `
          <${cardTag}${cardAction} class="top-participant-card ranking-card ${rankClass}">
            <span class="rank-badge">#${rank}</span>
            <span class="ranking-identity">
              <strong class="participant-name">${escapeHtml(person.name || "Chưa có họ tên")}</strong>
              ${positionText ? `<small class="participant-position">${positionText}</small>` : ""}
              ${presentation ? `<span class="ranking-meta"><strong>${escapeHtml(person.unit || "Chưa xác định đơn vị")}</strong><small>${escapeHtml(formatRankTime(person))}</small></span>` : ""}
            </span>
            ${presentation ? "" : `<strong class="ranking-unit">${escapeHtml(person.unit || "Chưa xác định đơn vị")}</strong><small class="participant-submitted"><b>${escapeHtml(formatRankTime(person))}</b></small>`}
            <span class="ranking-actions"><span class="score-pill">${escapeHtml(scoreBadge)}</span>${detailHint}</span>
          </${cardTag}>`;
      }
      const initials = String(person.name || "?").trim().split(/\s+/).slice(-2).map(word => word[0]).join("").toUpperCase();
      const seconds = Math.max(0, Math.floor(Number(person.durationSeconds) || 0));
      const duration = Number.isFinite(Number(person.durationSeconds)) ? `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}` : "—";
      const leaves = `<path d="M27 57 C12 43 11 27 19 9" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M22 53 C12 55 8 48 9 42 C17 43 22 47 22 53 M17 42 C8 43 5 36 7 30 C14 31 18 36 17 42 M15 31 C7 29 6 21 9 17 C15 20 17 26 15 31 M17 20 C11 16 13 8 18 4 C22 10 21 16 17 20 M24 48 C30 43 28 36 24 33 C20 39 20 44 24 48 M20 35 C26 30 25 24 21 20 C17 25 17 31 20 35"/>`;
      return `
        <${cardTag}${cardAction} class="top-participant-card ${featuredCard ? "podium-card" : "ranking-card"} ${rankClass}">
          <span class="podium-medal" aria-label="Hạng ${rank}"><svg viewBox="0 0 100 70" aria-hidden="true"><g fill="currentColor">${leaves}<g transform="translate(100 0) scale(-1 1)">${leaves}</g></g><circle cx="50" cy="29" r="24" fill="currentColor" stroke="rgba(255,255,255,.65)" stroke-width="3"/><text x="50" y="39" text-anchor="middle" fill="white" font-family="Georgia,serif" font-size="32">${rank}</text></svg></span>
          <span class="podium-identity"><span class="podium-avatar" aria-hidden="true">${escapeHtml(initials)}</span><span class="participant-info">
            <strong class="participant-name">${escapeHtml(person.name || "Chưa có họ tên")}</strong>
            <span class="participant-meta-line">
              <small class="participant-unit">${escapeHtml(person.unit || "Chưa xác định đơn vị")}</small>
              ${positionText ? `<small class="participant-position">${positionText}</small>` : ""}
            </span>
          </span></span>
          <span class="podium-stats"><span><i aria-hidden="true">✓</i><span><strong>${escapeHtml(scoreBadge)}</strong><small>Kết quả</small></span></span><span><i class="podium-clock" aria-hidden="true">◷</i><span><strong>${duration}</strong><small>Nộp sau khi mở phiên</small></span></span></span>
          <span class="podium-cta">${hasDetails ? "Xem bài làm <b>→</b>" : "Chưa có chi tiết bài làm"}</span>
        </${cardTag}>`;
    };

    return `
      <section class="leaderboard panel top-participants-panel">
        <div class="leaderboard-heading">
          <div>
            <p class="panel-kicker">VINH DANH TOP NỘI DUNG TỐT NHẤT</p>
            <h3>${label} bài làm dẫn đầu</h3>
          </div>
          <div class="leaderboard-heading-actions"><span class="leaderboard-ai-note">${methodNote}</span>${presentation ? "" : '<button type="button" class="presentation-trigger" data-open-leaderboard>Mở bảng vinh danh ↗</button>'}</div>
        </div>
        <div class="top-podium" data-count="${featured.length}" aria-label="Ba học viên đứng đầu">${featured.map((person, index) => personCard(person, index, true)).join("")}</div>
        ${remaining.length ? `<ol class="top-participants-list" start="4">${remaining.map((person, index) => `<li>${personCard(person, index + 3, false)}</li>`).join("")}</ol>` : ""}
      </section>
    `;
  }

  function openLeaderboardPresentation(session) {
    const participants = session.topParticipants?.length ? session.topParticipants : session.leaderboard || [];
    if (phaseOf(session) !== "CLOSED" || session.aiReviewPending || !participants.length) return;
    leaderboardDialogTitle.textContent = `Bảng vinh danh · Phiên ${session.id}`;
    leaderboardDialogContent.innerHTML = `<p class="leaderboard-presentation-note">${escapeHtml(session.description || session.name)} · Chọn học viên để xem bài làm</p>${renderTopParticipantsLeaderboard(session, participants.slice(0, 10), true)}`;
    bindParticipantControls(leaderboardDialogContent, session);
    leaderboardDialog.showModal();
    leaderboardDialogContent.scrollTop = 0;
  }

  function formatSubmittedTime(value) {
    if (!value) return "Chưa có giờ nộp";
    const text = String(value);
    const d = new Date(text);
    if (!isNaN(d.getTime()) && text.includes("T")) {
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      const seconds = String(d.getSeconds()).padStart(2, "0");
      return `Nộp lúc ${hours}:${minutes}:${seconds}`;
    }
    const match = text.match(/(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?/);
    return match ? `Nộp lúc ${match[0]}` : "Chưa có giờ nộp";
  }
  function formatRankTime(person) {
    if (Number.isFinite(Number(person.durationSeconds))) {
      const seconds = Math.max(0, Math.floor(Number(person.durationSeconds)));
      return `Hoàn thành sau ${Math.floor(seconds / 60)} phút ${String(seconds % 60).padStart(2, "0")} giây`;
    }
    return formatSubmittedTime(person.submittedAt || person.completedAt);
  }

  function renderLiveQuiz(session) {
    const questions = session.questions || [];
    return `<section class="content-grid"><article class="panel full panel-primary">${panelHeading("Tổng quan lựa chọn theo câu", "Chọn một câu để xem 4 phương án")}<div class="overview-legend"><span><i class="segment-0"></i> Phương án A</span><span><i class="segment-1"></i> Phương án B</span><span><i class="segment-2"></i> Phương án C</span><span><i class="segment-3"></i> Phương án D</span></div><div class="quiz-overview">${questions.length ? questions.map((question, index) => {
      const total = Number(question.totalAnswers || 0);
      const options = question.options || [];
      const summary = options.map((option, optionIndex) => `<span class="overview-segment segment-${optionIndex}" style="width:${total ? clampPercent(Number(option.count || 0) / total * 100) : 0}%" title="${escapeHtml(option.label)}: ${formatNumber.format(option.count || 0)} lượt"></span>`).join("");
      return `<details class="quiz-overview-item" data-ui-state="session-${session.id}-quiz-${index}"><summary><span class="overview-number">Câu ${index + 1}</span><span class="overview-title">${escapeHtml(question.title)}</span><span class="overview-total">${formatNumber.format(total)} lượt</span><span class="overview-strip">${summary || '<span class="overview-empty"></span>'}</span><span class="overview-chevron">⌄</span></summary><div class="overview-detail"><div class="expanded-question"><span>CÂU ${index + 1}</span><strong>${escapeHtml(question.title)}</strong></div>${options.length ? options.map((option, optionIndex) => { const percent = total ? Number(option.count || 0) / total * 100 : 0; return `<div class="overview-option option-${optionIndex}"><span class="option-dot segment-${optionIndex}"></span><span class="overview-option-label"><b class="option-letter">${String.fromCharCode(65 + optionIndex)}</b><span>${escapeHtml(option.label)}</span></span><strong>${formatNumber.format(option.count || 0)} <em>lượt</em><br><span>${score(percent)}%</span></strong><div class="overview-option-bar"><i class="segment-${optionIndex}" style="width:${clampPercent(percent)}%"></i></div></div>`; }).join("") : renderInlineEmpty("Chưa có dữ liệu lựa chọn.")}</div></details>`;
    }).join("") : renderInlineEmpty("Chưa có dữ liệu câu hỏi.")}</div></article></section>`;
  }

  function renderQuizDashboard(session) {
    const questions = session.questions || [];
    if (!session.totalResponses && !questions.length) return renderEmpty();
    return `<section class="content-grid">${renderAccuracyChart(questions, Number(session.id) === 4)}${renderCorrectDistribution(session)}${questions.length ? renderAnswerExplorer(questions) : renderEmpty("Chưa có dữ liệu câu hỏi.")}</section>`;
  }

  function renderAccuracyChart(questions, sortAscending) {
    const source = questions.map((question, index) => ({ ...question, number: index + 1 }));
    if (sortAscending) source.sort((a, b) => Number(a.correctPercent || 0) - Number(b.correctPercent || 0));
    return `<article class="panel ${sortAscending ? "" : "panel-primary"}">${panelHeading("Tỷ lệ trả lời đúng theo câu", "Tổng hợp sau khi chốt phiên")}<div class="horizontal-chart">${source.length ? source.map(question => `<div class="horizontal-row" title="${escapeHtml(question.title)}"><span class="axis-label">Câu ${question.number}</span><div class="bar-track"><div class="bar-fill ${Number(question.correctPercent || 0) < 50 ? "red" : ""}" style="width:${clampPercent(question.correctPercent)}%"></div></div><strong>${score(question.correctPercent || 0)}%</strong></div>`).join("") : renderInlineEmpty()}</div></article>`;
  }

  function renderCorrectDistribution(session) {
    const distribution = session.quizSummary?.correctDistribution || [];
    const maximum = Math.max(1, ...distribution.map(item => Number(item.count || 0)));
    const questionCount = session.questions?.length || 0;
    const map = new Map(distribution.map(item => [Number(item.label), Number(item.count || 0)]));
    const columns = Array.from({ length: questionCount + 1 }, (_, index) => ({ label: index, count: map.get(index) || 0 }));
    return `<article class="panel">${panelHeading("Số bài theo số câu trả lời đúng", `Từ 0 đến ${questionCount} câu đúng`)}<div class="column-chart">${columns.map(item => `<div class="column-item"><span class="column-value">${item.count}</span><div class="column-track"><div class="column-fill" style="height:${item.count / maximum * 100}%"></div></div><span class="column-label">${item.label} câu</span></div>`).join("")}</div></article>`;
  }

  function renderAnswerExplorer(questions) {
    const question = questions[selectedQuestion] || questions[0];
    if (!question) return "";
    const total = Math.max(1, Number(question.totalAnswers || 0));
    const options = question.options || [];
    return `<article class="panel full answer-explorer">${panelHeading("Phân bố đáp án của câu đang chọn", "Chọn một câu để xem chi tiết")}${questionSelector(questions)}<div class="question-focus"><span class="question-number">CÂU ${selectedQuestion + 1}</span><h3>${escapeHtml(question.title)}</h3></div><div class="answer-bars">${options.length ? options.map(option => {
      const percent = Number(option.count || 0) / total * 100;
      return `<div class="answer-row ${option.isCorrect ? "answer-correct" : ""}"><div class="answer-label">${escapeHtml(option.label)}${option.isCorrect ? '<span class="correct-badge">Đáp án đúng</span>' : ""}</div><div class="answer-measure"><div class="bar-track"><div class="bar-fill ${option.isCorrect ? "correct" : ""}" style="width:${clampPercent(percent)}%"></div></div><strong>${formatNumber.format(option.count || 0)} · ${score(percent)}%</strong></div></div>`;
    }).join("") : renderInlineEmpty("Chưa có người trả lời câu này.")}${question.correctAnswer && !options.some(option => option.isCorrect) ? `<div class="reference-inline"><strong>Đáp án đúng:</strong> ${escapeHtml(question.correctAnswer)} · chưa có người chọn</div>` : ""}</div></article>`;
  }

  function renderLiveOrdering(session) {
    const samples = session.ordering?.samples || [];
    return `<section class="content-grid">${renderPromptCard(session)}<article class="panel full panel-primary">${panelHeading("10 bài gửi đầu tiên", "Trình tự được đọc từ trái sang phải")}<div class="sample-stream">${samples.length ? samples.map(renderOrderingSample).join("") : renderInlineEmpty("Chưa có bài gửi.")}</div></article></section>`;
  }

  function renderOrderingDashboard(session) {
    const ordering = session.ordering || {};
    const positions = ordering.positionAccuracy || [];
    const correctSteps = getCorrectSteps(session);
    return `<section class="content-grid ordering-dashboard">
      ${renderPromptCard(session, true)}
      <article class="panel full reference-panel ordering-reference-panel">
        <div class="panel-heading panel-heading-actions"><div><p class="panel-kicker">TRỰC QUAN</p><h3>Trình tự đúng quy trình (13 bước)</h3></div><button class="presentation-trigger" type="button" data-present="answer">Chiếu trình tự đúng ↗</button></div>
        ${renderCorrectSteps(correctSteps)}
      </article>
      <article class="panel full">
        ${panelHeading("Tỷ lệ đặt đúng vị trí của từng bước", "Nhận diện bước thường bị đặt sai")}
        <div class="horizontal-chart position-chart">
          ${positions.length ? positions.map(item => `<div class="horizontal-row"><span class="axis-label wide">Bước ${escapeHtml(item.step)} ở vị trí ${item.position}</span><div class="bar-track"><div class="bar-fill ${Number(item.percent || 0) < 50 ? "red" : ""}" style="width:${clampPercent(item.percent)}%"></div></div><strong>${score(item.percent || 0)}%</strong></div>`).join("") : renderInlineEmpty()}
        </div>
      </article>
      <article class="panel full">
        ${panelHeading("Các phương án sai phổ biến", "Tối đa 5 trình tự được gửi nhiều nhất")}
        ${renderWrongSequences(ordering.commonSequences || [])}
      </article>
    </section>`;
  }

  function getCorrectSteps(session) {
    const ordering = session.ordering || {};
    return ordering.correctSteps || String(ordering.correctSequence || "").split(",").filter(Boolean).map((step, index) => ({ position: index + 1, step: step.trim(), text: session.prompt?.items?.[Number(step) - 1] || "" }));
  }

  function renderCorrectSteps(steps) {
    return `<div class="ordering-ref-list correct-step-list">${steps.map(item => `<div class="ordering-ref-row"><span class="ordering-ref-pos">Vị trí ${String(item.position).padStart(2, "0")}</span><span class="ordering-ref-step">Bước ${escapeHtml(item.step)}</span><strong class="ordering-ref-text">${escapeHtml(item.text || "Chưa có nội dung bước")}</strong></div>`).join("")}</div>`;
  }

  function renderOrderingSample(value, index) {
    const steps = String(value || "").split(/[,;\-–—]+/).map(step => step.trim()).filter(Boolean);
    return `<article class="sample-card"><div class="sample-card-heading"><span>Bài ${index + 1}</span><small>${steps.length} bước</small></div><div class="sample-number-flow" data-ui-scroll="session-${activeSession}-ordering-sample-${index}" aria-label="Trình tự bài ${index + 1}">${steps.map((step, position) => `<span class="sample-number"><b>${escapeHtml(step)}</b>${position < steps.length - 1 ? '<i>—</i>' : ""}</span>`).join("")}</div></article>`;
  }

  function renderWrongSequences(sequences) {
    if (!sequences.length) return renderInlineEmpty("Chưa có phương án sai để tổng hợp.");
    return `<div class="table-wrap"><table><thead><tr><th>Số thứ tự</th><th>Chuỗi trả lời</th><th>Số người</th></tr></thead><tbody>${sequences.map((item, index) => `<tr><td>${index + 1}</td><td class="sequence-cell">${escapeHtml(formatStepSequence(item.value))}</td><td><strong>${formatNumber.format(item.count || 0)}</strong></td></tr>`).join("")}</tbody></table></div>`;
  }

  function renderTrueFalseDashboard(session, live) {
    const questions = session.questions || [];
    const question = questions[selectedQuestion] || questions[0];
    return `<section class="content-grid"><article class="panel full ${live ? "panel-primary" : ""}">${panelHeading("Phân bố lựa chọn Đúng / Sai", live ? "Theo dõi trực tiếp" : "Đáp án đúng được đánh dấu màu xanh lá")}<div class="tf-grid" data-ui-scroll="session-${session.id}-true-false-questions">${questions.map((item, index) => {
      const trueCount = optionCount(item, "Đúng");
      const falseCount = optionCount(item, "Sai");
      const total = Math.max(1, Number(session.totalResponses || 0));
      const correctAnswer = live ? "" : String(item.correctAnswer || "");
      const trueIsCorrect = normalizeText(correctAnswer) === normalizeText("Đúng");
      const falseIsCorrect = normalizeText(correctAnswer) === normalizeText("Sai");
      return `<button type="button" class="tf-card ${index === selectedQuestion ? "active" : ""}" data-question="${index}"><span class="tf-card-heading"><b>Câu ${index + 1}</b>${correctAnswer ? `<em>Đáp án: ${escapeHtml(correctAnswer)}</em>` : ""}</span><div class="${trueIsCorrect ? "correct-choice" : ""}"><strong>${formatNumber.format(trueCount)}</strong><small>Đúng · ${score(trueCount / total * 100)}%</small></div><div class="${falseIsCorrect ? "correct-choice" : ""}"><strong>${formatNumber.format(falseCount)}</strong><small>Sai · ${score(falseCount / total * 100)}%</small></div></button>`;
    }).join("")}</div></article>${question ? `<article class="panel full answer-explorer">${panelHeading("Chi tiết câu hỏi và phần giải thích", "Một vài giải thích ngẫu nhiên, không phụ thuộc điểm AI")}${questionSelector(questions)}<div class="question-focus"><span class="question-number">CÂU ${selectedQuestion + 1}</span><h3>${escapeHtml(question.title)}</h3></div>${live ? "" : `<div class="reference-inline"><strong>Đáp án và căn cứ tham chiếu:</strong> ${escapeHtml(question.referenceNote || question.correctAnswer || "Chưa có")}</div>`}<div class="choice-summary"><span><b>${formatNumber.format(optionCount(question, "Đúng"))}</b> chọn Đúng</span><span><b>${formatNumber.format(optionCount(question, "Sai"))}</b> chọn Sai</span></div>${renderExplanationList(session.id, selectedQuestion, question.explanations || [])}</article>` : ""}</section>`;
  }

  function renderExplanationList(sessionId, questionIndex, explanations) {
    if (!explanations.length) return renderInlineEmpty("Chưa có phần giải thích cho câu này.");
    const normalized = explanations.map(item => typeof item === "string"
      ? { selectedAnswer: "Chưa xác định", text: item }
      : { selectedAnswer: item.selectedAnswer || "Chưa xác định", text: item.text || "" }
    ).filter(item => item.text);
    const groups = [
      { key: "true", label: "Học viên chọn Đúng", tone: "true", items: normalized.filter(item => normalizeText(item.selectedAnswer) === normalizeText("Đúng")).slice(0, 5) },
      { key: "false", label: "Học viên chọn Sai", tone: "false", items: normalized.filter(item => normalizeText(item.selectedAnswer) === normalizeText("Sai")).slice(0, 5) }
    ];
    const knownCount = groups.reduce((sum, group) => sum + group.items.length, 0);
    const otherItems = normalized.filter(item => ![normalizeText("Đúng"), normalizeText("Sai")].includes(normalizeText(item.selectedAnswer))).slice(0, Math.max(0, 10 - knownCount));
    if (otherItems.length) groups.push({ key: "other", label: "Chưa xác định lựa chọn", tone: "other", items: otherItems });
    return `<div class="explanation-groups">${groups.map(group => `<section class="explanation-group explanation-${group.tone}"><header><span>${escapeHtml(group.label)}</span><strong>${group.items.length} giải thích</strong></header>${group.items.length ? `<div class="explanation-list">${group.items.map((item, index) => `<details class="response-card" data-ui-state="session-${sessionId}-explanation-${questionIndex}-${group.key}-${index}" open><summary><span>Giải thích ${index + 1}</span><b>Đã chọn: ${escapeHtml(item.selectedAnswer)}</b></summary><p>${escapeHtml(item.text)}</p></details>`).join("")}</div>` : renderInlineEmpty(`Chưa có giải thích của nhóm chọn ${group.tone === "true" ? "Đúng" : "Sai"}.`)}</section>`).join("")}</div>`;
  }

  function renderOpenDashboard(session, live) {
    const reference = session.referenceAnswer || [];
    const responses = live ? (session.liveResponses || (session.responses || []).slice(0, 10)) : (session.responses || []);
    const normalizedSearch = normalizeText(responseSearch);
    const filtered = live ? responses : responses.filter(text => normalizeText(text).includes(normalizedSearch));
    const responseBlock = filtered.length ? `
      <details class="responses-disclosure" data-ui-state="session-${session.id}-responses" open>
        <summary>
          <span>${`Xem ${filtered.length} bài làm mẫu`}</span>
          <small>Bấm để mở hoặc thu gọn danh sách</small>
        </summary>
        <div class="response-list open-response-list">
          ${filtered.map((text, index) => `<article class="open-response-card"><header><span>Phản hồi #${index + 1}</span></header><p>${escapeHtml(text)}</p></article>`).join("")}
        </div>
      </details>
    ` : renderInlineEmpty(responses.length ? "Không tìm thấy phản hồi phù hợp." : "Chưa có phản hồi. Dashboard sẽ tự cập nhật khi học viên gửi bài.");

    return `<section class="content-grid open-dashboard">
      ${renderPromptCard(session)}
      ${live ? "" : `<article class="panel full reference-panel">${panelHeading("Gợi ý / đáp án tham chiếu", "Dùng để đối chiếu và trao đổi tại lớp")}${reference.length ? `<ol class="reference-list">${reference.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ol>` : renderInlineEmpty("Chưa có nội dung tham chiếu.")}</article>`}
      <article class="panel full ${live ? "panel-primary live-monitoring-panel" : ""}">
        <div class="panel-heading panel-heading-actions">
          <div>
            <p class="panel-kicker">${live ? "TRỰC TIẾP LÚC NHẬN BÀI" : "PHẢN HỒI HỌC VIÊN"}</p>
            <h3>Một số bài làm của học viên</h3>
          </div>
          ${live ? '<span class="live-indicator-badge">🟢 Đang tự động cập nhật phản hồi mới</span>' : `<label class="search-box"><span class="sr-only">Tìm trong câu trả lời</span><input id="response-search" type="search" placeholder="Tìm trong nội dung phản hồi…" value="${escapeHtml(responseSearch)}"></label>`}
        </div>
        <p class="privacy-note">Tối đa 5 bài được chọn ngẫu nhiên từ các bài hợp lệ, không theo điểm và không cần chờ chấm AI. Mẫu được giữ ổn định giữa các lần cập nhật khi danh sách bài không đổi.</p>
        ${responseBlock}
      </article>
    </section>`;
  }

  function renderPromptCard(session, compact = false) {
    const prompt = session.prompt;
    if (!prompt) return "";
    const isCase = session.kind === "open" && (Number(session.id) === 2 || Number(session.id) === 7);
    const title = isCase ? session.description : prompt.title;
    const presentButton = Number(session.id) === 1 ? '<button class="presentation-trigger prompt-present" type="button" data-present="prompt">Chiếu toàn đề ↗</button>' : "";
    return `<details class="panel full prompt-card ${compact ? "prompt-card-compact" : ""} ${isCase ? "prompt-card-case" : ""}" data-ui-state="session-${session.id}-prompt" ${compact ? "" : "open"}><summary><span class="prompt-label">${escapeHtml(prompt.label || "ĐỀ BÀI")}</span><strong>${escapeHtml(title || "")}</strong>${presentButton}<span class="prompt-toggle"><span class="toggle-open">Thu gọn đề bài</span><span class="toggle-closed">Xem đầy đủ đề bài</span><i aria-hidden="true"></i></span></summary><div class="prompt-body">${renderPromptBody(session)}</div></details>`;
  }

  function renderPromptBody(session) {
    const prompt = session.prompt || {};
    const isCase = session.kind === "open" && (Number(session.id) === 2 || Number(session.id) === 7);
    const caseContent = isCase ? renderCaseText(prompt.title) : "";
    return `${caseContent}${(prompt.paragraphs || []).map(text => `<p>${escapeHtml(text)}</p>`).join("")}${(prompt.items || []).length ? `<div class="prompt-items-list">${prompt.items.map((item, index) => `<div class="prompt-item-row"><span class="prompt-item-badge">${index + 1}</span><span class="prompt-item-text">${escapeHtml(item)}</span></div>`).join("")}</div>` : ""}${prompt.question ? `<div class="prompt-question"><span>Câu hỏi</span><strong>${escapeHtml(prompt.question)}</strong></div>` : ""}${prompt.instruction ? `<p class="prompt-instruction"><strong>Cách nhập:</strong> ${escapeHtml(prompt.instruction)}</p>` : ""}`;
  }

  function renderCaseText(value) {
    const lines = String(value || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!lines.length) return "";
    return `<div class="case-text"><p class="case-intro">${escapeHtml(lines[0])}</p>${lines.slice(1).map(line => {
      const numbered = line.match(/^(\d+)\.\s*(.*)$/);
      const arrow = line.match(/^->\s*(.*)$/);
      const bullet = line.match(/^\+\s*(.*)$/);
      const marker = numbered ? numbered[1] : arrow ? "→" : bullet ? "•" : "";
      const text = numbered ? numbered[2] : arrow ? arrow[1] : bullet ? bullet[1] : line;
      return `<div class="case-line ${marker ? "case-line-marked" : ""}">${marker ? `<span class="case-marker">${escapeHtml(marker)}</span>` : ""}<p>${escapeHtml(text)}</p></div>`;
    }).join("")}</div>`;
  }

  function openPresentation(session, type) {
    if (Number(session.id) !== 1) return;
    const answer = type === "answer";
    presentationKicker.textContent = `PHIÊN ${session.id} · TRÌNH CHIẾU`;
    presentationTitle.textContent = answer ? "Trình tự đúng quy trình" : "Đề bài sắp xếp";
    presentationContent.innerHTML = answer
      ? renderCorrectSteps(getCorrectSteps(session))
      : `<p class="presentation-subtitle">${escapeHtml(session.prompt?.title || "")}</p>${renderPromptBody(session)}`;
    presentationContent.classList.toggle("presentation-answer", answer);
    presentationDialog.showModal();
  }

  function renderUnitBreakdown(session) {
    const units = session.unitBreakdown || [];
    if (!units.length) return "";
    const maximum = Math.max(1, ...units.map(item => Number(item.count || 0)));
    return `<section class="content-grid unit-section"><article class="panel full">${panelHeading("Số bài theo đơn vị", `${formatNumber.format(units.length)} đơn vị có bài trong phiên`)}<div class="unit-list ${units.length <= 8 ? "unit-list-compact" : ""}" data-ui-scroll="session-${session.id}-units">${units.map(item => `<div class="unit-row"><span class="unit-name">${escapeHtml(item.unit)}</span><div class="bar-track"><div class="bar-fill unit-fill" style="width:${Number(item.count || 0) / maximum * 100}%"></div></div><strong>${formatNumber.format(item.count || 0)}</strong></div>`).join("")}</div></article></section>`;
  }

  function renderUnitParticipation(session) {
    const missing = Array.isArray(session.missingUnits) ? session.missingUnits : [];
    const total = Number(session.totalUnits || 0);
    if (!total) return "";
    const participating = Number(session.participatingUnits || 0);
    const unmapped = Number(session.unmappedUnitResponses || 0);
    const missingCount = Math.max(missing.length, total - participating);
    return `<section class="content-grid unit-participation-section"><article class="panel full missing-units-panel ${missingCount ? "has-missing-units" : ""}"><div class="panel-heading"><div><p class="panel-kicker">THỐNG KÊ ĐƠN VỊ CHƯA THAM GIA</p><h3>${missingCount ? `${formatNumber.format(missingCount)} đơn vị chưa có bài` : "Tất cả đơn vị đã tham gia"}</h3></div><span class="type-pill">${formatNumber.format(participating)}/${formatNumber.format(total)} đơn vị đã tham gia</span></div>${unmapped ? `<p class="privacy-note" style="margin-top:0;">Có ${formatNumber.format(unmapped)} phản hồi mang tên đơn vị chưa khớp danh mục chuẩn.</p>` : ""}${missing.length ? `<details class="missing-units missing-units-expanded" data-ui-state="session-${session.id}-missing-units" open><summary><span class="missing-open">Thu gọn danh sách cần đôn đốc</span><span class="missing-closed">Xem danh sách cần đôn đốc</span></summary><ol class="missing-units-grid">${missing.map((unit, idx) => `<li><span class="unit-num">${idx + 1}.</span><span class="unit-name-text">${escapeHtml(unit)}</span></li>`).join("")}</ol></details>` : missingCount ? '<span class="privacy-note">Danh sách chi tiết chỉ hiện khi tải dữ liệu thật.</span>' : '<span class="all-units-badge">Đã đủ đơn vị trong danh mục</span>'}</article></section>`;
  }

  function renderMissingUnitsPanel(session) {
    return renderUnitParticipation(session);
  }

  function questionSelector(questions) {
    return `<div class="question-selector" role="group" aria-label="Chọn câu hỏi">${questions.map((_, index) => `<button type="button" class="${index === selectedQuestion ? "active" : ""}" data-question="${index}">Câu ${index + 1}</button>`).join("")}</div>`;
  }
  function panelHeading(title, note) { return `<div class="panel-heading"><div><p class="panel-kicker">TRỰC QUAN</p><h3>${escapeHtml(title)}</h3></div>${note ? `<span>${escapeHtml(note)}</span>` : ""}</div>`; }
  function optionCount(question, expected) { const normalized = normalizeText(expected); return Number((question.options || []).find(option => normalizeText(option.label) === normalized)?.count || 0); }

  const participantDialog = document.getElementById("top-participant-dialog");
  const participantDialogContent = document.getElementById("participant-dialog-content");
  const participantDialogClose = document.getElementById("participant-dialog-close");

  if (participantDialogClose && participantDialog) {
    participantDialogClose.addEventListener("click", () => participantDialog.close());
    participantDialog.addEventListener("click", event => {
      const bounds = participantDialog.getBoundingClientRect();
      const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
      if (outside) participantDialog.close();
    });
  }

  function openParticipantModal(person, session) {
    if (!participantDialog || !participantDialogContent) return;
    const isSession6 = Number(session.id) === 6;
    const isQuiz = session.kind === "quiz";
    const isOrdering = session.kind === "ordering";
    const rankLabel = `#${person.rank || 1}`;
    const rankClass = person.rank === 1 ? "rank-1" : person.rank === 2 ? "rank-2" : person.rank === 3 ? "rank-3" : `rank-${person.rank || 1}`;
    
    let detailsHtml = "";
    if (isQuiz || (person.questionDetails && person.questionDetails.length && !isSession6 && !isOrdering)) {
      const questions = person.questionDetails || [];
      detailsHtml = `
        <div class="participant-modal-head">
          <span class="modal-rank-badge ${rankClass}">${rankLabel}</span>
          <div>
            <h2 id="participant-dialog-title">${escapeHtml(person.name)}</h2>
            <p class="modal-unit">${escapeHtml(person.unit || "Chưa xác định đơn vị")}${person.position ? ` • ${escapeHtml(person.position)}` : ""}</p>
            <p class="modal-submitted">${escapeHtml(formatSubmittedTime(person.submittedAt || person.completedAt))}</p>
          </div>
          <div class="modal-scores">
            <span class="modal-score-pill">${escapeHtml(person.scoreText || person.result || "Đạt")}</span>
          </div>
        </div>
        <div class="modal-section">
          <h3>Chi tiết kết quả làm bài:</h3>
          ${questions.length ? `
            <div class="quiz-modal-list">
              ${questions.map(q => `
                <div class="quiz-modal-card ${q.isCorrect ? "correct" : "incorrect"}">
                  <div class="quiz-card-header">
                    <span class="quiz-qnum">Câu ${q.number}</span>
                    <strong class="quiz-qtitle">${escapeHtml(q.title)}</strong>
                    <span class="status-badge ${q.isCorrect ? "status-matched" : "status-unmatched"}">${q.isCorrect ? "✓ Đúng" : "✗ Sai"}</span>
                  </div>
                  <div class="quiz-card-body">
                    <div class="choice-line user-choice">
                      <span class="choice-tag">Lựa chọn của học viên:</span>
                      <strong>${escapeHtml(q.userChoice)}</strong>
                    </div>
                    ${!q.isCorrect && q.correctChoice ? `
                      <div class="choice-line correct-choice">
                        <span class="choice-tag">Đáp án chuẩn:</span>
                        <strong>${escapeHtml(q.correctChoice)}</strong>
                      </div>
                    ` : ""}
                  </div>
                </div>
              `).join("")}
            </div>
          ` : `
            <div class="modal-essay-box">
              <strong>Kết quả làm bài:</strong> ${escapeHtml(person.scoreText || person.result || "Đã hoàn thành bài làm")}<br>
              <span style="color:#64748b; font-size:13px;">Ưu tiên xếp hạng theo điểm số và thời gian nộp bài sớm nhất.</span>
            </div>
          `}
        </div>
      `;
    } else if (isOrdering) {
      const steps = person.questionDetails || [];
      detailsHtml = `
        <div class="participant-modal-head">
          <span class="modal-rank-badge ${rankClass}">${rankLabel}</span>
          <div>
            <h2 id="participant-dialog-title">${escapeHtml(person.name)}</h2>
            <p class="modal-unit">${escapeHtml(person.unit || "Chưa xác định đơn vị")}${person.position ? ` • ${escapeHtml(person.position)}` : ""}</p>
            <p class="modal-submitted">${escapeHtml(formatSubmittedTime(person.submittedAt || person.completedAt))}</p>
          </div>
          <div class="modal-scores"><span class="modal-score-pill">${escapeHtml(person.scoreText || person.result || "Đạt")}</span></div>
        </div>
        <div class="modal-section">
          <h3>Chi tiết trình tự 13 bước đã sắp xếp:</h3>
          ${steps.length ? `
            <div class="ordering-modal-list">
              ${steps.map(step => `
                <div class="ordering-modal-card ${step.isCorrect ? "correct" : "incorrect"}">
                  <div class="ordering-card-header">
                    <span class="ordering-pos-badge">Vị trí ${String(step.number).padStart(2, "0")}</span>
                    <span class="status-badge ${step.isCorrect ? "status-matched" : "status-unmatched"}">${step.isCorrect ? "✓ Đúng vị trí" : "✗ Sai vị trí"}</span>
                  </div>
                  <div class="ordering-card-body">
                    <div class="step-line user-step">
                      <span class="step-tag">Học viên xếp:</span>
                      <strong>${escapeHtml(step.userChoice)}</strong>
                    </div>
                    ${!step.isCorrect ? `
                      <div class="step-line correct-step">
                        <span class="step-tag">Vị trí này đúng là:</span>
                        <strong>${escapeHtml(step.correctChoice)}</strong>
                      </div>
                    ` : ""}
                  </div>
                </div>
              `).join("")}
            </div>
          ` : `<div class="modal-essay-box">Chưa có chi tiết trình tự. Hãy cập nhật phiên bản API mới để hiển thị từng bước.</div>`}
        </div>`;
    } else if (isSession6) {
      const questions = person.questionDetails || [];
      detailsHtml = `
        <div class="participant-modal-head">
          <span class="modal-rank-badge ${rankClass}">${rankLabel}</span>
          <div>
            <h2 id="participant-dialog-title">${escapeHtml(person.name)}</h2>
            <p class="modal-unit">${escapeHtml(person.unit || "Chưa xác định đơn vị")}${person.position ? ` • ${escapeHtml(person.position)}` : ""}</p>
            <p class="modal-submitted">${escapeHtml(formatSubmittedTime(person.submittedAt))}</p>
          </div>
          <div class="modal-scores">
            <span class="modal-score-pill">${escapeHtml(person.scoreChoice || "—")}</span>
            <span class="modal-sub-score">${escapeHtml(person.scoreExplanation || "")}</span>
          </div>
        </div>
        ${person.aiFeedback ? `<div class="modal-feedback-box"><strong>Nhận xét từ Gemini AI:</strong> <p>${escapeHtml(person.aiFeedback)}</p></div>` : ""}
        <div class="modal-table-wrap">
          <table class="modal-tf-table">
            <thead>
              <tr>
                <th>Câu</th>
                <th>Lựa chọn & Đáp án</th>
                <th>Lời giải thích của học viên</th>
                <th>Căn cứ giáo viên</th>
                <th>Đánh giá</th>
              </tr>
            </thead>
            <tbody>
              ${questions.map(q => `
                <tr>
                  <td><strong>Câu ${q.number}</strong><p>${escapeHtml(q.title || "")}</p></td>
                  <td>
                    <span>Học viên: <b>${escapeHtml(q.userChoice)}</b></span><br>
                    <small>Đáp án: <b class="correct-text">${escapeHtml(q.correctChoice)}</b></small>
                  </td>
                  <td><p class="essay-snippet">${escapeHtml(q.userExplanation || "Không có")}</p></td>
                  <td><small>${escapeHtml(q.referenceNote || "")}</small></td>
                  <td>
                    ${q.explanationMatched ? '<span class="status-badge status-matched">✓ Đạt</span>' : '<span class="status-badge status-unmatched">✗ Chưa đạt</span>'}
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    } else {
      const items = person.matchedItems || [];
      detailsHtml = `
        <div class="participant-modal-head">
          <span class="modal-rank-badge ${rankClass}">${rankLabel}</span>
          <div>
            <h2 id="participant-dialog-title">${escapeHtml(person.name)}</h2>
            <p class="modal-unit">${escapeHtml(person.unit || "Chưa xác định đơn vị")}${person.position ? ` • ${escapeHtml(person.position)}` : ""}</p>
            <p class="modal-submitted">${escapeHtml(formatSubmittedTime(person.submittedAt))}</p>
          </div>
          <div class="modal-scores">
            <span class="modal-score-pill">${escapeHtml(person.scoreText || "Đạt")}</span>
          </div>
        </div>
        ${person.aiFeedback ? `<div class="modal-feedback-box"><strong>Nhận xét từ Gemini AI:</strong> <p>${escapeHtml(person.aiFeedback)}</p></div>` : ""}
        <div class="modal-section">
          <h3>Bài làm của học viên:</h3>
          <blockquote class="modal-essay-box">${escapeHtml(person.essay || "Chưa có bài làm")}</blockquote>
        </div>
        ${items.length ? `
          <div class="modal-section">
            <h3>Đánh giá các ý chuẩn:</h3>
            <ul class="modal-matched-list">
              ${items.map(item => `
                <li class="${item.matched ? "matched" : "unmatched"}">
                  <span class="icon">${item.matched ? "✓" : "✗"}</span>
                  <span>${escapeHtml(item.label)}</span>
                </li>
              `).join("")}
            </ul>
          </div>
        ` : ""}
      `;
    }

    participantDialogContent.innerHTML = detailsHtml;
    if (typeof participantDialog.showModal === "function") participantDialog.showModal();
    else participantDialog.setAttribute("open", "");
  }

  function bindSessionControls(session) {
    dashboard.querySelectorAll("[data-open-leaderboard]").forEach(button => button.addEventListener("click", () => openLeaderboardPresentation(session)));
    dashboard.querySelectorAll("[data-present]").forEach(button => button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      openPresentation(session, button.dataset.present);
    }));
    bindParticipantControls(dashboard, session);
    dashboard.querySelectorAll("[data-open-qr]").forEach(button => button.addEventListener("click", () => {
      qrDialogTitle.textContent = `Phiên ${session.id} – ${session.description || session.name}`;
      qrDialogImage.src = `assets/qr/session-${session.id}.png`;
      qrDialogImage.alt = `Mã QR làm bài Phiên ${session.id}`;
      if (typeof qrDialog.showModal === "function") qrDialog.showModal();
      else qrDialog.setAttribute("open", "");
    }));
    dashboard.querySelectorAll("[data-closed-view]").forEach(button => button.addEventListener("click", () => {
      closedLivePreview = button.dataset.closedView === "live";
      selectedQuestion = 0;
      responseSearch = "";
      render();
    }));
    dashboard.querySelectorAll("[data-question]").forEach(button => button.addEventListener("click", () => { selectedQuestion = Number(button.dataset.question); render(); }));
    const search = document.getElementById("response-search");
    if (search) search.addEventListener("input", event => { responseSearch = event.target.value; renderOpenResponseList(); });
  }
  function renderOpenResponseList() { const input = document.getElementById("response-search"); const start = input?.selectionStart || responseSearch.length; render(); const next = document.getElementById("response-search"); if (next) { next.focus(); next.setSelectionRange(start, start); } }
  function bindParticipantControls(container, session) {
    const items = session.topParticipants?.length ? session.topParticipants : session.leaderboard || [];
    container.querySelectorAll("[data-open-participant]").forEach(button => button.addEventListener("click", () => {
      const person = items[Number(button.dataset.openParticipant)];
      if (person) openParticipantModal(person, session);
    }));
  }
  function normalizeText(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi").trim(); }
  function formatStepSequence(value) { return String(value || "").split(",").map(step => step.trim()).filter(Boolean).map(step => `Bước ${step}`).join(" → "); }
  function score(value) { return Number.isFinite(Number(value)) ? Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) : "—"; }
  function clampPercent(value) { return Math.max(0, Math.min(100, Number(value || 0))); }
  function renderEmpty(text = "Chưa có bài làm. Dashboard sẽ tự cập nhật khi có dữ liệu.") { return `<div class="empty">${escapeHtml(text)}</div>`; }
  function renderInlineEmpty(text = "Chưa có dữ liệu.") { return `<div class="inline-empty">${escapeHtml(text)}</div>`; }

  adminEntryForm.addEventListener("submit", event => {
    event.preventDefault();
    if (!adminEntryEmail.reportValidity()) return;
    // The typed email is a UI hint only. The private Apps Script verifies the
    // signed-in Google account against its server-side allowlist.
    adminEntryEmail.value = adminEntryEmail.value.trim().toLowerCase();
    saveAccessPreference("admin");
    enableAdminView();
    adminEntryDialog.close();
    const session = payload?.sessions?.find(item => Number(item.id) === activeSession);
    if (session) updateQuickControl(session);
    if (activeSession===0) render();
  });
  document.getElementById("admin-entry-public").addEventListener("click", () => {
    saveAccessPreference("public");
    adminRequested = false;
    adminMessageSource = null;
    adminChannelToken = "";
    sessionControl.hidden = true;
    controlFrame.removeAttribute("src");
    controlFrame.dataset.session = "";
    adminEntryDialog.close();
    if (activeSession===0) render();
  });
  adminButton.addEventListener("click", () => adminEntryDialog.showModal());
  document.getElementById("refresh-button").addEventListener("click", () => {if(activeSession!==0)loadData(true);});
  async function loadCourse() {
    if(courseLoading || activeSession!==0) return;
    courseLoading=true;render();
    try {
      if(fakeMode) { courseData=window.GiaLaiCourse.demo(); }
      else {
        const separator=config.apiUrl.includes("?")?"&":"?";
        const data=await fetchJsonp(`${config.apiUrl}${separator}course=1&_=${Date.now()}`,60000);
        if(!data || !Array.isArray(data.top)||!Array.isArray(data.includedSessions))throw Error("Tổng kết chưa đúng cấu trúc");
        courseData=data;
      }
    } catch(error) {courseData={...(courseData||{}),error:"Chưa cập nhật được tổng kết. Bấm Cập nhật để thử lại.",top:courseData?.top||[],includedSessions:courseData?.includedSessions||[]};}
    finally {courseLoading=false;if(activeSession===0)render();}
  }
  window.addEventListener("gia-lai-course-refresh",()=>loadCourse());
  document.getElementById("refresh-button").addEventListener("click",()=>{if(activeSession===0)loadCourse();});
  document.getElementById("fullscreen-button").addEventListener("click", () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); });
  document.getElementById("qr-dialog-close").addEventListener("click", () => qrDialog.close());
  document.getElementById("presentation-dialog-close").addEventListener("click", () => presentationDialog.close());
  document.getElementById("leaderboard-dialog-close").addEventListener("click", () => leaderboardDialog.close());
  presentationDialog.addEventListener("click", event => {
    if (event.target === presentationDialog) presentationDialog.close();
  });
  qrDialog.addEventListener("click", event => {
    const bounds = qrDialog.getBoundingClientRect();
    const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
    if (outside) qrDialog.close();
  });
  controlFab.addEventListener("click", () => {
    const opening = controlPanel.hidden;
    controlPanel.hidden = !opening;
    controlFab.setAttribute("aria-expanded", String(opening));
    controlFab.textContent = `Mở điều khiển Phiên ${activeSession}`;
    if (opening) {
      if (fakeMode) {
        const session = payload?.sessions?.find(item => Number(item.id) === activeSession);
        if (session) renderDemoQuickControl(session);
      } else {
        controlFrame.dataset.session = "";
        const session = payload?.sessions?.find(item => Number(item.id) === activeSession);
        if (session) updateQuickControl(session);
      }
    }
  });
  document.getElementById("control-panel-close").addEventListener("click", () => {
    controlPanel.hidden = true;
    controlFab.setAttribute("aria-expanded", "false");
    controlFab.textContent = `Mở điều khiển Phiên ${activeSession}`;
  });
  window.addEventListener("scroll", syncFloatingMetricsVisibility, { passive: true });
  window.addEventListener("resize", syncFloatingMetricsVisibility);
  function closeControlPanel() {
    if (adminRequested) return;
    controlPanel.hidden = true;
    controlFab.setAttribute("aria-expanded", "false");
    controlFab.textContent = `Mở điều khiển Phiên ${activeSession}`;
  }
  window.addEventListener("message", event => {
    const trustedAdminOrigin = /^https:\/\/(?:[a-z0-9-]+\.)*googleusercontent\.com$/i.test(event.origin)
      || event.origin === "https://script.google.com";
    if (!adminRequested || !trustedAdminOrigin || !adminChannelToken || event.data?.channelToken !== adminChannelToken) return;
    if (event.data?.type === "gl-admin-hello") {
      adminMessageSource = event.source;
      event.source?.postMessage({ type: "gl-admin-allow", channelToken: adminChannelToken }, event.origin);
      return;
    }
    if (event.source !== adminMessageSource) return;
    if (event.data?.type === "dashboard-session-pending") {
      if (["timer", "close", "reset", "reopen"].includes(event.data.action)) pendingSessionActions.set(Number(event.data.sessionId), event.data.action);
      closeControlPanel();
      if (event.data.action === "close") {
        pendingSessionActions.set(Number(event.data.sessionId), "close");
        globalTimerBanner.hidden = true;
        render();
      } else if (event.data.action === "timer") {
        controlSessionStates.set(Number(event.data.sessionId), {
          phase: "TIMED",
          _receivedAt: Date.now(),
          timerStartedAt: event.data.timerStartedAt || null,
          timerEndsAt: event.data.timerEndsAt || null
        });
        const session = payload?.sessions?.find(item => Number(item.id) === Number(event.data.sessionId));
        if (session) Object.assign(session, controlSessionStates.get(Number(event.data.sessionId)));
        render();
      } else if (event.data.action === "reopen") {
        pendingSessionActions.delete(Number(event.data.sessionId));
        controlSessionStates.set(Number(event.data.sessionId), {
          phase: "NOT_STARTED",
          timerStartedAt: null,
          timerEndsAt: null,
          closedAt: null
        });
        const session = payload?.sessions?.find(item => Number(item.id) === Number(event.data.sessionId));
        if (session) Object.assign(session, controlSessionStates.get(Number(event.data.sessionId)));
        closedLivePreview = false;
        render();
      }
      return;
    }
    if (event.data?.type === "dashboard-ai-top-ready") {
      loadData(true);
      return;
    }
    if (event.data?.type === "dashboard-session-failed") {
      pendingSessionActions.delete(Number(event.data.sessionId));
      controlSessionStates.delete(Number(event.data.sessionId));
      loadData(true);
      return;
    }
    if (event.data?.type !== "dashboard-session-updated") return;
    courseData=null;
    pendingSessionActions.delete(Number(event.data.sessionId));
    closeControlPanel();
    controlSessionStates.set(Number(event.data.sessionId), {
      _receivedAt: Date.now(),
      phase: event.data.phase,
      timerStartedAt: event.data.timerStartedAt || null,
      timerEndsAt: event.data.timerEndsAt || null,
      closedAt: event.data.closedAt || null
      ,...Object.fromEntries(["currentResponses","totalResponses","participatingUnits","totalUnits","missingUnits","unitBreakdown"].filter(key=>event.data[key]!==undefined).map(key=>[key,event.data[key]]))
    });
    const session = payload?.sessions?.find(item => Number(item.id) === Number(event.data.sessionId));
    if (session) {
      Object.assign(session, controlSessionStates.get(Number(event.data.sessionId)));
      render();
      updateCountdowns();
    }
    loadData(true);
  });
  loadData();
  if (Number(config.refreshSeconds) > 0) timer = setInterval(() => { if (!document.hidden && activeSession!==0) loadData(false); }, Number(config.refreshSeconds) * 1000);
  const courseTicker=setInterval(()=>{if(!document.hidden&&activeSession===0)loadCourse();},30000);
  const countdownTicker = setInterval(updateCountdowns, 500);
  window.addEventListener("focus", () => activeSession===0?loadCourse():loadData(false));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) activeSession===0?loadCourse():loadData(false); });
  window.addEventListener("beforeunload", () => { clearInterval(timer); clearInterval(countdownTicker);clearInterval(courseTicker); });
})();
