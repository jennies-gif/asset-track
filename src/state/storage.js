import { storageKey } from "../constants/appConstants.js";
import { demoState } from "./demoState.js";
import {
  normalizeLoadedAssets,
  normalizeLoadedSnapshots,
  normalizeSelectedAccount,
  normalizeSession,
  normalizeSettings
} from "./normalizers.js";

const emptyState = {
  session: demoState.session,
  settings: demoState.settings,
  selectedAccount: "all",
  snapshots: [],
  assets: [],
  notes: [],
  posts: []
};

export function loadState() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return structuredClone(demoState);
  try {
    const parsed = JSON.parse(raw);
    const loadedAssets = normalizeLoadedAssets(parsed.assets);
    return {
      session: normalizeSession(parsed.session),
      settings: normalizeSettings(parsed.settings),
      selectedAccount: normalizeSelectedAccount(parsed.selectedAccount, loadedAssets.assets),
      snapshots: loadedAssets.useDemoSnapshots ? demoState.snapshots : normalizeLoadedSnapshots(parsed.snapshots),
      assets: loadedAssets.assets,
      notes: Array.isArray(parsed.notes) ? parsed.notes.filter((note) => note.id !== "note-demo") : demoState.notes,
      posts: Array.isArray(parsed.posts) ? parsed.posts : demoState.posts
    };
  } catch {
    return structuredClone(demoState);
  }
}

export function saveState(state) {
  localStorage.setItem(storageKey, JSON.stringify(state));
}
