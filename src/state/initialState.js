import { demoState } from "./demoState.js";

export function createEmptyState() {
  return {
    session: { signedIn: false, email: "", name: "", signedInAt: "" },
    settings: structuredClone(demoState.settings),
    selectedAccount: "all",
    snapshots: [],
    assets: [],
    notes: [],
    posts: []
  };
}
