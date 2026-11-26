"use strict";

const entry = document.getElementById("entry");
const note = document.getElementById("entry-note");
const help = document.getElementById("help");
const candidateVersion = new URLSearchParams(location.search).get("client_version");
const launcherVersion = /^[1-9]\d{0,3}\.\d{2}$/.test(candidateVersion || "") ? candidateVersion : undefined;
document.getElementById("help-open").addEventListener("click", () => help.showModal());
help.querySelector(".close-help").addEventListener("click", () => help.close());

function platform() {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return ["ios", "iOS"];
  if (/Android/i.test(ua)) return ["android", "Android"];
  if (/Windows/i.test(ua)) return ["windows", "Windows"];
  if (/Mac/i.test(ua)) return ["macos", "macOS"];
  if (/Linux/i.test(ua)) return ["linux", "Linux"];
  return ["other", "浏览器"];
}

const [os, platformName] = platform();

function deviceId() {
  const key = "bios3.device";
  let id = localStorage.getItem(key);
  if (!id || !/^[\da-f-]{32,36}$/i.test(id)) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

const desktopEntry = "请从桌面重新打开「BIOS 网络工作台」或「BIOS Employee」，在新窗口登录。";
const reopenDesk = "本机 BIOS 工作台已失去连接。" + desktopEntry;

function isDesktopBridge() {
  return location.protocol === "http:" && location.hostname === "127.0.0.1" && !!location.port &&
    navigator.serviceWorker?.controller?.scriptURL === location.origin + "/__bios/worker.js";
}

// Windows 1.03 and Mac 1.02 already serve this small, capability-protected
// page locally. Reading it keeps the bridge alive without contacting the VPN.
function monitorDesktopLogin(error) {
  if (!isDesktopBridge()) return null;
  let pending;
  async function check() {
    if (!isDesktopBridge()) return false;
    if (pending) return pending;
    pending = (async () => {
      try {
        const r = await fetch("/__bios/recovery", {mode:"same-origin", credentials:"omit",
          redirect:"error", cache:"no-store", signal:AbortSignal.timeout(4000)});
        return r.ok && r.headers.get("Content-Type")?.includes("text/html") &&
          (await r.text()).includes('src="/__bios/recovery.js"');
      } catch { return false; }
    })();
    try { return await pending; } finally { pending = null; }
  }
  async function refresh() {
    if (document.hidden) return;
    if (!await check()) error.textContent = reopenDesk;
    else if (error.textContent === reopenDesk) error.textContent = "";
  }
  setInterval(refresh, 4 * 60 * 1000);
  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("focus", refresh);
  window.addEventListener("pageshow", event => { if (event.persisted) refresh(); });
  return check;
}

function loginIdentity(user) {
  if (typeof user?.nickname !== "string" || typeof user?.account !== "string") return null;
  const nickname = user.nickname.trim(), account = user.account.trim();
  return nickname && [...nickname].length <= 64 && account && [...account].length <= 100 ? {nickname, account} : null;
}

function recentLogin(form) {
  const field = form.elements.nickname, account = form.elements.account;
  const list = form.querySelector("#recent-login"), option = form.querySelector("#recent-identity");
  if (!list || !option) return () => {};
  const key = "bios3.last-login";
  const desktop = isDesktopBridge();
  // A desktop launcher changes port. Only the authenticated native bridge can
  // supply a durable identity there; old desktop builds get a tab-local hint.
  let last = null, storage;
  try {
    storage = location.protocol === "https:" ? localStorage : sessionStorage;
    last = loginIdentity(JSON.parse(storage.getItem(key)));
  } catch { /* Private browsing and storage limits must not block login. */ }

  function show(open) {
    const prefix = field.value.trim().toLocaleLowerCase();
    const visible = Boolean(open && last && last.nickname.toLocaleLowerCase().startsWith(prefix));
    list.hidden = !visible;
    field.setAttribute("aria-expanded", String(visible));
    field.removeAttribute("aria-activedescendant");
    option.setAttribute("aria-selected", "false");
    if (visible) {
      option.querySelector(".recent-nickname").textContent = last.nickname;
      option.querySelector(".recent-account").textContent = last.account;
    }
  }
  function choose() {
    if (!last || list.hidden) return;
    if (account.value !== last.account || field.value !== last.nickname) form.elements.password.value = "";
    field.value = last.nickname;
    account.value = last.account;
    show(false);
    form.elements.password.focus();
  }
  field.addEventListener("focus", () => show(true));
  field.addEventListener("click", () => show(true));
  field.addEventListener("input", () => show(true));
  field.addEventListener("blur", () => show(false));
  field.addEventListener("keydown", event => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      show(true);
      if (list.hidden) return;
      event.preventDefault();
      field.setAttribute("aria-activedescendant", option.id);
      option.setAttribute("aria-selected", "true");
    } else if (event.key === "Enter" && field.hasAttribute("aria-activedescendant")) {
      event.preventDefault();
      choose();
    } else if (event.key === "Escape" && !list.hidden) {
      event.preventDefault();
      show(false);
    }
  });
  option.addEventListener("mousedown", event => event.preventDefault());
  option.addEventListener("click", choose);
  if (desktop) {
    fetch("/__bios/last-login", {mode:"same-origin", credentials:"omit", cache:"no-store",
      redirect:"error", signal:AbortSignal.timeout(4000)}).then(async res => {
      if (!res.ok) return;
      last = loginIdentity(await res.json());
      if (document.activeElement === field) show(true);
    }).catch(() => { /* The rest of the form also works with older clients. */ });
  }
  return user => {
    const identity = loginIdentity(user);
    if (identity && storage) {
      try { storage.setItem(key, JSON.stringify(identity)); } catch { /* Keep login working. */ }
    }
  };
}

function mountLogin() {
  note.textContent = "员工与管理员使用各自的账号登录。";
  entry.replaceChildren(document.getElementById("login-template").content.cloneNode(true));
  const form = document.getElementById("login-form");
  const password = form.elements.password;
  const rememberLogin = recentLogin(form);
  const error = document.getElementById("login-error");
  const checkDesk = monitorDesktopLogin(error);
  const toggle = form.querySelector(".password-toggle");
  toggle.addEventListener("click", () => {
    const visible = password.type === "password";
    password.type = visible ? "text" : "password";
    toggle.textContent = visible ? "隐藏" : "显示";
    toggle.setAttribute("aria-label", visible ? "隐藏密码" : "显示密码");
    toggle.setAttribute("aria-pressed", String(visible));
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const submit = form.querySelector("[type=submit]");
    if (submit.disabled) return;
    submit.disabled = true;
    error.textContent = "";
    try {
      const nickname = form.elements.nickname.value.trim();
      if ([...nickname].length > 64) throw new Error("昵称最多 64 个字符。");
      if (checkDesk && !await checkDesk()) throw new Error(reopenDesk);
      let id;
      try { id = deviceId(); } catch { throw new Error("浏览器无法保存设备标识。请允许此站点使用本地存储，再重试。"); }
      const response = await fetch("/api/login", {
        method:"POST", mode:"same-origin", credentials:"same-origin", redirect:"error",
        headers:{"Content-Type":"application/json"}, cache:"no-store", signal:AbortSignal.timeout(45000),
        body:JSON.stringify({nickname, account:form.elements.account.value.trim(),
          password:password.value, device_id:id, device_name:platformName + " 设备", platform:os, version:launcherVersion})
      });
      if (!response.headers.get("Content-Type")?.includes("application/json")) {
        throw new Error("登录服务返回了异常响应（HTTP " + response.status + "），请稍后重试。");
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "登录失败，请重试。");
      if (!result.user?.id) throw new Error("登录服务响应异常，请重试。");
      rememberLogin(result.user);
      password.value = "";
      location.replace("/app/");
    } catch (failure) {
      if (failure instanceof TypeError || failure.name === "TimeoutError") {
        if (checkDesk && !await checkDesk()) error.textContent = reopenDesk;
        else error.textContent = failure.name === "TimeoutError" ? "登录请求超时，请稍后重试。" : "无法连接公司登录服务，请检查网络后重试。";
      } else error.textContent = failure.message;
    } finally { submit.disabled = false; }
  });
}

function handoffOrigin(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const target = new URL(value);
    if (target.protocol !== "https:" || target.username || target.password || target.pathname !== "/" ||
        target.search || target.hash || target.origin === location.origin || /(^|\.)github\.io$/i.test(target.hostname)) return null;
    return target;
  } catch { return null; }
}

async function start() {
  const device = document.getElementById("device-info");
  if (os !== "other") {
    document.getElementById("device-platform").textContent = platformName;
    device.hidden = false;
  }
  const pages = /(^|\.)github\.io$/i.test(location.hostname);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  if (!pages && (location.protocol === "https:" || (location.protocol === "http:" && local))) {
    try {
      const health = await fetch("/api/health", {mode:"same-origin",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(6000)});
      if (health.ok && health.headers.get("content-type")?.includes("application/json") &&
          (await health.json()).product === "BIOS 3.0") {
        mountLogin();
        return;
      }
    } catch { /* A static entry can hand off to its configured service. */ }
  }
  try {
    const response = await fetch("./config.json", {mode:"same-origin",redirect:"error",cache:"no-store"});
    const target = response.ok && handoffOrigin((await response.json()).service_origin);
    if (target) {
      if (launcherVersion) target.searchParams.set("client_version",launcherVersion);
      note.textContent = "前往公司登录服务，验证身份后进入工作台。";
      const go = document.createElement("a");
      go.className = "primary full"; go.href = target.href; go.rel = "noreferrer"; go.textContent = "前往安全登录 →";
      const host = document.createElement("p"); host.className = "hint"; host.textContent = "登录服务 · " + target.host;
      entry.replaceChildren(go, host);
      return;
    }
  } catch { /* Only a validated HTTPS origin can receive visitors. */ }
  if (pages) {
    note.textContent = "这是 BIOS 公开入口。请用桌面上的「BIOS 网络工作台」或「BIOS Employee」登录。";
    return;
  }
  note.textContent = isDesktopBridge() ? "暂时无法从本机工作台联系公司登录服务。" + desktopEntry :
    "登录服务暂不可用。请稍后重试，或向管理员确认入口地址。";
  const retry = document.createElement("button");
  retry.type = "button"; retry.className = "secondary"; retry.textContent = "重新检查";
  retry.addEventListener("click", () => location.reload()); entry.replaceChildren(retry);
}
start();
