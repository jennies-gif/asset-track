const decimalPattern = /^-?(?:\d+\.?\d*|\.\d+)$/u;
const criticalDecimalFields = [
  "quantity",
  "costPrice",
  "previousPrice",
  "currentPrice",
  "fxRate",
  "previousFxRate"
];

export function validateStoredState(value) {
  const issues = [];
  if (!isPlainObject(value)) {
    return invalid("invalid_root", "本地数据根结构不是对象", [issue("root", "必须是对象")]);
  }
  if (!("assets" in value)) {
    return invalid("assets_missing", "本地数据缺少 assets", [issue("assets", "字段缺失")]);
  }
  if (!Array.isArray(value.assets)) {
    return invalid("assets_invalid", "本地数据中的 assets 不是数组", [issue("assets", "必须是数组")]);
  }

  value.assets.forEach((asset, index) => {
    const path = `assets[${index}]`;
    if (!isPlainObject(asset)) {
      issues.push(issue(path, "必须是对象"));
      return;
    }
    for (const field of ["id", "name", "account"]) {
      if (!String(asset[field] ?? "").trim()) issues.push(issue(`${path}.${field}`, "关键字段无法识别"));
    }
    for (const field of criticalDecimalFields) {
      const value = asset[field];
      if (value === undefined || value === null || value === "") continue;
      if (!decimalPattern.test(String(value).trim())) issues.push(issue(`${path}.${field}`, "必须是有效十进制数"));
    }
  });

  for (const field of ["snapshots", "notes", "posts"]) {
    if (value[field] !== undefined && !Array.isArray(value[field])) {
      issues.push(issue(field, "存在时必须是数组"));
    }
  }
  if (Array.isArray(value.notes)) {
    value.notes.forEach((note, index) => validateNote(note, index, issues));
  }

  return issues.length
    ? invalid("state_invalid", "本地数据结构无法安全识别", issues)
    : { ok: true, issues: [] };
}

function validateNote(note, index, issues) {
  const path = `notes[${index}]`;
  if (!isPlainObject(note)) {
    issues.push(issue(path, "必须是对象"));
    return;
  }
  if (!String(note.id ?? "").trim()) issues.push(issue(`${path}.id`, "关键字段无法识别"));
  for (const field of ["title", "content", "asset", "assetId", "type", "template", "format", "status"]) {
    const value = note[field];
    if (value !== undefined && value !== null && typeof value !== "string") {
      issues.push(issue(`${path}.${field}`, "存在时必须是文本"));
    }
  }
  if (note.tags !== undefined && (!Array.isArray(note.tags) || note.tags.some((tag) => typeof tag !== "string"))) {
    issues.push(issue(`${path}.tags`, "存在时必须是文本数组"));
  }
  if (note.contextSnapshot !== undefined) validateNoteContextSnapshot(note.contextSnapshot, `${path}.contextSnapshot`, issues);
}

function validateNoteContextSnapshot(snapshot, path, issues) {
  if (!isPlainObject(snapshot)) {
    issues.push(issue(path, "必须是对象"));
    return;
  }
  if (Number(snapshot.version) !== 1) issues.push(issue(`${path}.version`, "不支持的复盘依据版本"));
  const textFields = [
    "capturedAt",
    "assetId",
    "assetName",
    "symbol",
    "account",
    "currency",
    "quantity",
    "costPrice",
    "currentPrice",
    "pricedAt",
    "priceSource",
    "priceStatus",
    "priceStatusLabel",
    "transactionLabel",
    "transactionDate",
    "transactionAction",
    "transactionQuantity",
    "transactionPrice"
  ];
  textFields.forEach((field) => {
    if (snapshot[field] !== undefined && typeof snapshot[field] !== "string") {
      issues.push(issue(`${path}.${field}`, "存在时必须是文本"));
    }
  });
  for (const field of ["quantity", "costPrice", "currentPrice", "transactionQuantity", "transactionPrice"]) {
    const value = snapshot[field];
    if (value === undefined || value === null || value === "") continue;
    if (!decimalPattern.test(String(value).trim())) issues.push(issue(`${path}.${field}`, "必须是有效十进制数"));
  }
}

export function validateBackupPayload(value) {
  if (!isPlainObject(value)) return invalid("backup_invalid", "备份根结构不是对象", [issue("root", "必须是对象")]);
  const state = isPlainObject(value.state) ? value.state : value;
  const result = validateStoredState(state);
  return result.ok ? { ok: true, state, issues: [] } : { ...result, state: null };
}

function invalid(reason, message, issues) {
  return { ok: false, reason, message, issues };
}

function issue(path, message) {
  return { path, message };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
