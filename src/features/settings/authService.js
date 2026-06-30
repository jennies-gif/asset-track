const authStorageKey = "asset-trail-supabase-auth-v1";

export function getAuthConfig() {
  const supabase = globalThis.ASSET_TRAIL_CONFIG?.supabase || {};
  const url = String(supabase.url || "").trim().replace(/\/+$/u, "");
  const anonKey = String(supabase.anonKey || "").trim();
  return {
    url,
    anonKey,
    configured: Boolean(url && anonKey)
  };
}

export function readStoredAuthSession() {
  try {
    const parsed = JSON.parse(localStorage.getItem(authStorageKey) || "null");
    if (!parsed?.access_token || !parsed?.user?.email) return null;
    if (parsed.expires_at && Number(parsed.expires_at) * 1000 <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function registerWithEmail({ email, password, name }) {
  const config = getAuthConfig();
  if (!config.configured) throw authError("Supabase 尚未配置，请先填写部署环境变量。");
  const payload = await requestSupabaseAuth(config, "/auth/v1/signup", {
    email,
    password,
    data: { display_name: name || "资产轨迹用户" }
  });
  if (payload.session) storeAuthSession(payload.session);
  return payload;
}

export async function loginWithEmail({ email, password }) {
  const config = getAuthConfig();
  if (!config.configured) throw authError("Supabase 尚未配置，请先填写部署环境变量。");
  const payload = await requestSupabaseAuth(config, "/auth/v1/token?grant_type=password", { email, password });
  storeAuthSession(payload);
  return payload;
}

export async function logoutAuthSession() {
  const config = getAuthConfig();
  const session = readStoredAuthSession();
  localStorage.removeItem(authStorageKey);
  if (!config.configured || !session?.access_token) return;
  await fetch(`${config.url}/auth/v1/logout`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${session.access_token}`
    }
  }).catch(() => {});
}

async function requestSupabaseAuth(config, path, body) {
  const response = await fetch(`${config.url}${path}`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw authError(payload.msg || payload.message || "认证请求失败");
  }
  return payload;
}

function storeAuthSession(session) {
  if (!session?.access_token) return;
  localStorage.setItem(authStorageKey, JSON.stringify(session));
}

function authError(message) {
  const error = new Error(message);
  error.name = "AuthError";
  return error;
}
