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

function deviceId() {
  const key = "bios3.device";
  let id = localStorage.getItem(key);
  if (!id || !/^[\da-f-]{32,36}$/i.test(id)) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

function mountLogin() {
  const [os, name] = platform();
  note.textContent = "使用公司分配的昵称、账号和密码登录。";
  entry.replaceChildren(document.getElementById("login-template").content.cloneNode(true));
  const form = document.getElementById("login-form");
  const password = form.elements.password;
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
    const error = document.getElementById("login-error");
    const submit = form.querySelector("[type=submit]");
    if (submit.disabled) return;
    submit.disabled = true;
    error.textContent = "";
    try {
      let id;
      try { id = deviceId(); } catch { throw new Error("浏览器无法保存设备标识。请允许此站点使用本地存储，再重试。"); }
      const response = await fetch("/api/login", {
        method:"POST", mode:"same-origin", credentials:"same-origin", redirect:"error",
        headers:{"Content-Type":"application/json"}, cache:"no-store",
        body:JSON.stringify({nickname:form.elements.nickname.value.trim(), account:form.elements.account.value.trim(),
          password:password.value, device_id:id, device_name:name + " 设备", platform:os, version:launcherVersion})
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "登录失败，请重试。");
      if (!result.user?.id) throw new Error("登录服务响应异常，请重试。");
      password.value = "";
      location.replace("/app/");
    } catch (failure) {
      error.textContent = failure instanceof TypeError ? "无法连接登录服务，请检查网络后重试。" : failure.message;
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
  note.textContent = "登录服务暂不可用。请稍后重试，或向管理员确认入口地址。";
  const retry = document.createElement("button");
  retry.type = "button"; retry.className = "secondary"; retry.textContent = "重新检查";
  retry.addEventListener("click", () => location.reload()); entry.replaceChildren(retry);
}
start();
