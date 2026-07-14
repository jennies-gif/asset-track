import { storageKey, storageSchemaVersion } from "../constants/appConstants.js";
import { demoState } from "./demoState.js";
import { createEmptyState } from "./initialState.js";
import {
  normalizeLoadedAssets,
  normalizeLoadedSnapshots,
  normalizeSelectedAccount,
  normalizeSession,
  normalizeSettings
} from "./normalizers.js";
import { validateStoredState } from "./stateValidation.js";

let storageLoadResult = null;
let storageWriteLocked = false;

export function loadState() {
  let raw;
  try {
    raw = localStorage.getItem(storageKey);
  } catch (error) {
    return setLoadResult({
      status: "unavailable",
      state: null,
      recovery: recoveryDetails(null, "storage_unavailable", error)
    });
  }
  if (raw === null) {
    return setLoadResult({ status: "empty", state: createEmptyState(), recovery: null });
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return setLoadResult({
      status: "recovery_required",
      state: null,
      recovery: recoveryDetails(raw, "invalid_json", error)
    });
  }
  const validation = validateStoredState(parsed);
  if (!validation.ok) {
    return setLoadResult({
      status: "recovery_required",
      state: null,
      recovery: {
        raw,
        reason: validation.reason,
        detectedAt: new Date().toISOString(),
        issues: validation.issues
      }
    });
  }
  return setLoadResult({ status: "ready", state: normalizeStoredState(parsed), recovery: null });
}

export function saveState(state) {
  if (storageWriteLocked) return { ok: false, reason: "write_locked", message: "本地数据处于恢复保护状态，已禁止保存。" };
  let serialized;
  try {
    serialized = JSON.stringify(withSchemaVersion(state));
  } catch (error) {
    return storageFailure("serialization_failed", error);
  }
  try {
    localStorage.setItem(storageKey, serialized);
    return { ok: true };
  } catch (error) {
    return storageFailure("storage_write_failed", error);
  }
}

export function replaceStateFromRecovery(state) {
  if (!storageWriteLocked) {
    return { ok: false, reason: "recovery_not_required", message: "当前不需要执行恢复替换。" };
  }
  const candidate = withSchemaVersion(state);
  const validation = validateStoredState(candidate);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason, message: validation.message, issues: validation.issues, originalPreserved: true };
  }

  const originalRaw = storageLoadResult?.recovery?.raw ?? null;
  let serialized;
  try {
    serialized = JSON.stringify(candidate);
  } catch (error) {
    return { ...storageFailure("serialization_failed", error), originalPreserved: true };
  }

  try {
    localStorage.setItem(storageKey, serialized);
  } catch (error) {
    return { ...storageFailure("storage_write_failed", error), originalPreserved: true };
  }

  const verified = loadState();
  if (verified.status === "ready") return { ok: true, state: verified.state };

  let originalPreserved = false;
  if (originalRaw !== null) {
    try {
      localStorage.setItem(storageKey, originalRaw);
      originalPreserved = localStorage.getItem(storageKey) === originalRaw;
    } catch {
      originalPreserved = false;
    }
  }
  setLoadResult({
    status: "recovery_required",
    state: null,
    recovery: {
      raw: originalRaw,
      reason: "recovery_replace_failed",
      detectedAt: new Date().toISOString(),
      issues: verified.recovery?.issues || []
    }
  });
  return {
    ok: false,
    reason: "recovery_replace_failed",
    message: originalPreserved
      ? "恢复数据未通过写后校验，已尝试保持原始数据不变。"
      : "恢复数据未完成安全替换，无法保证浏览器中的原始内容未变化。请保留已下载的损坏数据并重试。",
    originalPreserved
  };
}

export function getStorageLoadResult() {
  return storageLoadResult;
}

export function isStorageWriteLocked() {
  return storageWriteLocked;
}

function normalizeStoredState(parsed) {
  const loadedAssets = normalizeLoadedAssets(parsed.assets);
  return {
    schemaVersion: storageSchemaVersion,
    session: normalizeSession(parsed.session),
    settings: normalizeSettings(parsed.settings),
    selectedAccount: normalizeSelectedAccount(parsed.selectedAccount, loadedAssets.assets),
    snapshots: loadedAssets.useDemoSnapshots ? demoState.snapshots : normalizeLoadedSnapshots(parsed.snapshots),
    assets: loadedAssets.assets,
    notes: Array.isArray(parsed.notes) ? parsed.notes.filter((note) => note.id !== "note-demo") : [],
    posts: Array.isArray(parsed.posts) ? parsed.posts : []
  };
}

function withSchemaVersion(state) {
  return { ...state, schemaVersion: storageSchemaVersion };
}

function setLoadResult(result) {
  storageLoadResult = result;
  storageWriteLocked = result.status === "recovery_required" || result.status === "unavailable";
  return result;
}

function recoveryDetails(raw, reason, error) {
  return {
    raw,
    reason,
    detectedAt: new Date().toISOString(),
    issues: error instanceof Error ? [{ path: "storage", message: error.message }] : []
  };
}

function storageFailure(reason, error) {
  return {
    ok: false,
    reason,
    message: error instanceof Error ? error.message : "浏览器本地存储操作失败。"
  };
}
