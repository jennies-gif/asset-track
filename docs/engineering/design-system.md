# Asset Trail Design System

## 1. 文档目的

本文档定义 Asset Trail 项目的工程化视觉规范。

目标：

- 保证 UI 风格长期一致；
- 保证页面和组件复用；
- 保证 AI 修改 UI 时遵循统一规则；
- 避免通过临时 CSS 覆盖形成视觉分裂。

本文档用于指导：

- 新页面开发；
- 组件设计；
- CSS 修改；
- UI 重构；
- AI 辅助开发。

## 2. Design System Principles

### 2.1 Single Visual Source of Truth

项目必须保持唯一视觉规范来源。

禁止同一视觉元素存在多个长期标准。例如，禁止以下多个品牌色并存：

- green brand；
- blue brand；
- temporary blue。

所有新增 UI 必须优先使用 Design Token。

### 2.2 优先复用，不重复创造

新增组件前，必须检查：

- 是否已有组件；
- 是否已有样式；
- 是否可以扩展已有变体。

如果本质属于同类组件，禁止为单个页面创建长期专用组件，例如：

- `home-special-card`；
- `analysis-new-card`；
- `portfolio-custom-card`。

### 2.3 当前迁移策略

当前项目存在历史 CSS 和组件。Design System 不要求立即重构所有旧代码。

原则：

- 新增：必须遵守；
- 修改：优先收敛；
- 旧代码：根据价值逐步迁移。

## 3. Design Tokens

所有核心视觉属性应该通过 Token 管理，包括：

- Color；
- Typography；
- Spacing；
- Radius；
- Shadow。

### 3.1 Color System

#### Brand

正式视觉系统采用金融蓝体系。

| Token | 色值 | 用途 |
| --- | --- | --- |
| Primary Brand | `#2E5AA7` | 品牌识别与品牌强调 |
| Primary Action | `#0052FF` | 主按钮、重要操作、关键行动强调 |

#### Background

| Token | 色值 |
| --- | --- |
| Page Background | `#F8FAFC` |
| Surface | `#FFFFFF` |
| Muted Surface | `#EAF0FA` |

#### Text

| Token | 色值 |
| --- | --- |
| Primary | `#27272A` |
| Secondary | `#64748B` |
| Muted | `#64748B` |

#### Border

| Token | 色值 |
| --- | --- |
| Default | `#F1F5F9` |
| Strong | `#CBD5E1` |

#### Semantic Colors

| Token | 色值 |
| --- | --- |
| Success | `#1AA083` |
| Error | `#DC3545` |
| Warning | `#F59F00` |
| Risk | `#E8590C` |

状态不能只依赖颜色，必须使用颜色加文字或图标共同表达。

### 3.2 Typography System

#### Font Family

统一使用：

```css
-apple-system,
BlinkMacSystemFont,
"SF Pro Display",
"Inter",
"Segoe UI",
Roboto,
Helvetica,
Arial,
sans-serif
```

禁止新增 DIN、Mono、Serif、Rounded，除非属于明确的特殊场景。

#### Font Weight

允许：

| 字重 | 语义 |
| --- | --- |
| `400` | Normal |
| `500` | Medium |
| `600` | Semibold |
| `700` | Bold |

禁止新增 `450`、`520`、`550` 等非标准字重。

#### Type Scale

| 层级 | 字号 | 字重 |
| --- | --- | --- |
| Page Title | `28px` | `600` |
| Section Title | `18-20px` | `600` |
| Card Title | `14-16px` | `500-600` |
| Body | `13-14px` | `400` |
| Caption | `11-12px` | `400-500` |
| Important Number | `30-40px+` | `600-700` |

数字必须启用 `tabular-nums`，保证金融数据对齐。

### 3.3 Spacing System

统一采用以下基础间距：

```text
4 / 8 / 12 / 16 / 24 / 32 / 48
```

常用规则：

- 页面：`24px`；
- Section：`24px`；
- Card 内部：`16-24px`。

禁止大量新增 `13px`、`17px`、`21px`、`27px` 等无语义间距。

### 3.4 Radius System

| Token | 圆角 |
| --- | --- |
| Small | `6px` |
| Medium | `8px` |
| Large | `12px` |

当前主要 Card / Panel 使用 `6px`。

### 3.5 Shadow System

整体视觉保持专业、克制，默认无明显阴影。仅 Modal 等特殊场景使用阴影。

## 4. Layout System

### Page Layout

统一使用：

- 浅色背景；
- 白色内容区域；
- 清晰间距。

### Content Width

桌面端最大内容宽度为 `1360px`。

### Responsive

- 移动端页面水平 padding：`16px`；
- 桌面端主要页面水平间距：`24px`。

## 5. Component Guidelines

### 5.1 Card

标准 Card：

```css
background: #FFFFFF;
border: 1px solid #F1F5F9;
border-radius: 6px;
box-shadow: none;
```

Card 用于：

- 数据展示；
- 模块容器；
- 信息分组。

禁止每个业务创建不同的 Card 风格。

### 5.2 Button

#### Primary Button

```css
min-height: 38px;
padding: 8px 16px;
background: #0052FF;
color: #FFFFFF;
border-radius: 6px;
font-size: 14px;
font-weight: 600;
```

#### Secondary Button

```css
min-height: 34px;
padding: 6px 12px;
border-color: #E2E8F0;
```

#### Text Button

用于轻量操作。

#### Danger Button

用于删除和危险操作。

### 5.3 Input

```css
height: 38-42px;
border-radius: 6px;
font-size: 13-14px;
border-color: #E2E8F0;
```

Focus 使用 `#0052FF` 强调。

### 5.4 Modal

Backdrop：

- `position: fixed`；
- 覆盖全屏。

Dialog：

- `max-width: 520px+`；
- `padding: 24px`；
- `border-radius: 6px`。

### 5.5 Badge

Badge 用于状态表达。

统一样式：

```css
min-height: 18px;
padding: 2px 8px;
border-radius: 4px;
font-size: 11px;
font-weight: 600;
```

统一状态：

- `success`；
- `warning`；
- `danger`；
- `neutral`。

禁止 `good`、`positive`、`success`、`ok` 等多个同义语义系统并存，统一使用 `success`。

### 5.6 Empty State

统一结构包含：

- 标题；
- 说明；
- 操作入口。

禁止每个页面自行设计空状态。

### 5.7 Chart

图表必须表达：

- 数据范围；
- 时间；
- 来源；
- 缺失状态。

禁止装饰性图表。

## 6. Data Visualization Rules

金融产品图表必须优先保证可信。

要求显示：

- 时间范围；
- 数据来源；
- 是否估算；
- 是否缺失。

禁止制造：

- 收益排名；
- 跟单暗示；
- 投顾化表达。

## 7. CSS Architecture Rules

### 7.1 禁止新增覆盖层 CSS

禁止新增以下类型的文件：

- `final.css`；
- `new-polish.css`；
- `temporary.css`。

### 7.2 修改 Token 优先

如果颜色、间距或组件不一致，优先修改 Token，不要新增页面特殊 CSS。

### 7.3 Class 命名

推荐语义化命名：

- `.card-title`；
- `.status-badge`；
- `.primary-button`。

避免页面绑定命名：

- `.home-blue-title`；
- `.analysis-special-card`。

## 8. React 与原生入口规则

当前根目录原生 JavaScript 静态 MVP 是种子用户试用版本的主体验候选入口。正式入口状态以 current-stage.md 的冻结和验收结果为准。React + TypeScript 是长期演进方向，不作为当前阶段默认替换方案。

两个入口必须逐步收敛视觉体系，禁止继续发展两套品牌系统。

## 9. AI UI Development Rules

AI 修改 UI 前必须：

- 检查已有组件；
- 检查已有 Token；
- 判断是否应该修改公共规范；
- 避免新增页面专用样式；
- 避免 CSS 覆盖。

AI 不得：

- 自定义新的颜色；
- 自定义新的字体体系；
- 新增重复 Card / Button；
- 使用临时 CSS 解决长期问题。

## 10. Design Review Checklist

新增 UI 前检查：

### 视觉

- 是否符合品牌色？
- 是否使用 Token？
- 是否符合字体规范？
- 是否符合间距体系？

### 组件

- 是否复用了已有组件？
- 是否需要新增组件？

### CSS

- 是否新增覆盖？
- 是否产生重复定义？
- 是否影响其他页面？

### 数据表达

- 数据来源是否清晰？
- 状态是否不仅依赖颜色？

## 11. Final Principle

Asset Trail Design System 的目标：

> 专业可信 + 统一一致 + 清晰克制 + 长期维护

避免：

> 页面堆叠 + CSS 覆盖 + 颜色漂移 + 组件重复 + 视觉失控

最终原则：

> 所有新的 UI 变化，都应该增强现有设计系统，而不是创造新的视觉规则。
