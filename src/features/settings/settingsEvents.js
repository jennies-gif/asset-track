import { applySettings, readSettingsForm } from "./settingsRender.js";
import { consumeAuthRedirectSession, getAuthConfig, loginWithEmail, logoutAuthSession, readStoredAuthSession, registerWithEmail } from "./authService.js";

export function closeSettingsPanel(elements) {
  elements.settingsPanel.classList.add("is-hidden");
  elements.settingsButton.setAttribute("aria-expanded", "false");
}

export function closeAuthPanel(elements) {
  elements.authPanel.classList.add("is-hidden");
  elements.authButton.setAttribute("aria-expanded", "false");
}

export function initSettingsEvents(context) {
  const { elements } = context;
  hydrateAuthSession(context);
  elements.settingsButton.addEventListener("click", () => {
    const hidden = elements.settingsPanel.classList.toggle("is-hidden");
    elements.settingsButton.setAttribute("aria-expanded", String(!hidden));
    elements.authPanel.classList.add("is-hidden");
    elements.authButton.setAttribute("aria-expanded", "false");
    context.hideMarketSyncResult();
  });

  elements.authButton.addEventListener("click", () => {
    const hidden = elements.authPanel.classList.toggle("is-hidden");
    elements.authButton.setAttribute("aria-expanded", String(!hidden));
    elements.settingsPanel.classList.add("is-hidden");
    elements.settingsButton.setAttribute("aria-expanded", "false");
    context.hideMarketSyncResult();
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest(".settings") || event.target.closest(".auth") || event.target.closest(".market-sync-header")) return;
    closeSettingsPanel(elements);
    closeAuthPanel(elements);
    context.hideMarketSyncResult();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSettingsPanel(elements);
      closeAuthPanel(elements);
      context.hideMarketSyncResult();
    }
  });

  elements.authPanel.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = elements.authEmail.value.trim();
    const password = elements.authPassword.value;
    const name = elements.authName.value.trim() || "本地用户";
    const action = event.submitter?.dataset.authAction || "login";
    if (!email) return setAuthStatus(elements, "请输入邮箱。", "error");
    if (!password || password.length < 8) return setAuthStatus(elements, "密码至少需要 8 位。", "error");
    if (!getAuthConfig().configured) {
      return setAuthStatus(elements, "Supabase 尚未配置。请先在部署环境里设置 SUPABASE_URL 和 SUPABASE_ANON_KEY。", "error");
    }
    setAuthStatus(elements, action === "register" ? "正在注册..." : "正在登录...", "loading");
    try {
      const result = action === "register"
        ? await registerWithEmail({ email, password, name })
        : await loginWithEmail({ email, password });
      if (result.session || result.access_token) {
        const user = result.user || result.session?.user || {};
        applySignedInSession(context, {
          id: user.id,
          email: user.email || email,
          name: user.user_metadata?.display_name || name,
          provider: "supabase"
        });
        closeAuthPanel(elements);
        context.persistAndRender();
        return;
      }
      setAuthStatus(elements, "注册成功。请打开邮箱验证邮件，验证后再登录。", "success");
    } catch (error) {
      setAuthStatus(elements, error instanceof Error ? error.message : "认证失败，请稍后重试。", "error");
    }
  });

  elements.authLogoutButton.addEventListener("click", async () => {
    await logoutAuthSession();
    const state = context.getState();
    state.session = { signedIn: false, email: "", name: "", signedInAt: "" };
    setAuthStatus(elements, "已退出登录。本机资产数据仍保留在当前浏览器。", "success");
    context.persistAndRender();
  });

  elements.settingsPanel.addEventListener("change", () => {
    const state = context.getState();
    state.settings = readSettingsForm();
    applySettings();
    context.persistAndRender();
  });

  elements.settingUsdCnyRate.addEventListener("input", () => {
    const state = context.getState();
    state.settings = readSettingsForm();
    applySettings();
    context.persistAndRender();
  });

  elements.settingBtcUsdRate.addEventListener("input", () => {
    const state = context.getState();
    state.settings = readSettingsForm();
    applySettings();
    context.persistAndRender();
  });

  elements.settingUsdHkdRate.addEventListener("input", () => {
    const state = context.getState();
    state.settings = readSettingsForm();
    applySettings();
    context.persistAndRender();
  });

  elements.resetDemo.addEventListener("click", () => {
    context.loadDemoState();
  });
}

async function hydrateAuthSession(context) {
  try {
    const redirectResult = await consumeAuthRedirectSession();
    if (redirectResult.status === "signed_in") {
      const user = redirectResult.session.user;
      applySignedInSession(context, {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.display_name || user.email || "资产轨迹用户",
        provider: "supabase"
      });
      setAuthStatus(context.elements, "邮箱验证成功，已登录。", "success");
      context.persistAndRender();
      return;
    }
    if (redirectResult.status === "verified") {
      setAuthStatus(context.elements, redirectResult.message, "success");
    } else if (redirectResult.status === "error") {
      setAuthStatus(context.elements, redirectResult.message, "error");
    }
  } catch (error) {
    setAuthStatus(context.elements, error instanceof Error ? error.message : "认证回跳处理失败。", "error");
  }
  hydrateStoredAuthSession(context);
}

function hydrateStoredAuthSession(context) {
  const session = readStoredAuthSession();
  if (!session?.user?.email) return;
  applySignedInSession(context, {
    id: session.user.id,
    email: session.user.email,
    name: session.user.user_metadata?.display_name || "资产轨迹用户",
    provider: "supabase"
  });
  context.persistAndRender();
}

function applySignedInSession(context, user) {
  const state = context.getState();
  state.session = {
    signedIn: true,
    userId: user.id || "",
    email: user.email,
    name: user.name || "资产轨迹用户",
    authProvider: user.provider || "supabase",
    signedInAt: new Date().toISOString()
  };
}

function setAuthStatus(elements, message, tone = "info") {
  elements.authStatus.textContent = message;
  elements.authStatus.dataset.tone = tone;
}
