# ModalInfo Route Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan.

**Goal:** 避免缺失 `_modalInfo` 的 `/details` pushState 导致 URL 变化但 UI 不变；通过卡片容器点击触发 slider，并仅在有 `_modalInfo` 时允许 pushState。

**Architecture:** 在导航层提供 `_modalInfo` 解析/判定；调整详情打开策略顺序为“卡片容器点击优先”；拦截 `/jobs` anchor 时改为触发容器点击而非 pushState；将 pushState 限制为具备 `_modalInfo` 的 URL；现有 /jobs 降级解析保留。

**Tech Stack:** Chrome Extension MV3, Vanilla JS, Vitest, JSDOM.

---

### Task 1: 导航层新增 `_modalInfo` 解析能力

**Files:**
- Modify: `extension/src/core/navigation.js`
- Test: `tests/navigation.test.js`

**Step 1: 写 failing test**

```js
import { hasModalInfoParam } from "../extension/src/core/navigation.js";

it("detects modalInfo param in url", () => {
  const withInfo =
    "https://www.upwork.com/nx/find-work/best-matches/details/~02?pageTitle=Job%20Details&_modalInfo=%5B%7B%22navType%22%3A%22slider%22%7D%5D";
  const withoutInfo =
    "https://www.upwork.com/nx/find-work/best-matches/details/~02?pageTitle=Job%20Details";
  expect(hasModalInfoParam(withInfo)).toBe(true);
  expect(hasModalInfoParam(withoutInfo)).toBe(false);
});
```

**Step 2: 运行测试确认失败**

Run: `npm test -- tests/navigation.test.js`  
Expected: FAIL（hasModalInfoParam 未定义）

**Step 3: 最小实现**

```js
export function hasModalInfoParam(url) {
  if (!url || typeof url !== "string") return false;
  return url.includes("_modalInfo=");
}
```

**Step 4: 运行测试确认通过**

Run: `npm test -- tests/navigation.test.js`  
Expected: PASS

**Step 5: Commit**

```bash
git add tests/navigation.test.js extension/src/core/navigation.js
git commit -m "test: add modalInfo url detection"
```

---

### Task 2: 调整详情打开策略顺序（容器点击优先）

**Files:**
- Modify: `tests/navigation.test.js`
- Modify: `extension/src/core/navigation.js`
- Modify: `extension/content_script.js`

**Step 1: 写 failing test**

```js
it("returns detail open strategy order", () => {
  expect(getDetailOpenStrategyOrder()).toEqual([
    "TITLE_CARD",
    "INDEX_CARD",
    "URL_LINK",
    "JOB_ID_LINK",
    "DETAILS_URL_PUSHSTATE",
  ]);
});
```

**Step 2: 运行测试确认失败**

Run: `npm test -- tests/navigation.test.js`  
Expected: FAIL（顺序不同）

**Step 3: 最小实现**

- 更新 `getDetailOpenStrategyOrder` 返回顺序  
- `openDetailForRecord` 按新顺序调用  
- `clickCardByTitle`/`clickCardByIndex` 优先点击容器而非 anchor

**Step 4: 运行测试确认通过**

Run: `npm test -- tests/navigation.test.js`  
Expected: PASS

**Step 5: Commit**

```bash
git add tests/navigation.test.js extension/src/core/navigation.js extension/content_script.js
git commit -m "feat: prefer card container click for details"
```

---

### Task 3: 限制 pushState 仅在有 `_modalInfo` 时使用

**Files:**
- Modify: `extension/content_script.js`

**Step 1: 写 failing test**

复用 Task 1 的 `hasModalInfoParam`，要求 `DETAILS_URL_PUSHSTATE` 仅在 `record.job_url` 含 `_modalInfo` 时可用。

**Step 2: 运行测试确认失败**

Run: `npm test -- tests/navigation.test.js`  
Expected: FAIL（逻辑未生效）

**Step 3: 最小实现**

在 `openDetailWithStrategy("DETAILS_URL_PUSHSTATE")` 中：  
- 若 `record.job_url` 不含 `_modalInfo` 则直接返回失败  
- 若包含则 `history.pushState` 使用该 URL

**Step 4: 运行测试确认通过**

Run: `npm test`  
Expected: PASS

**Step 5: Commit**

```bash
git add extension/content_script.js
git commit -m "fix: guard details pushState without modalInfo"
```

---

### Task 4: 拦截 `/jobs` anchor 时改为容器点击

**Files:**
- Modify: `extension/content_script.js`

**Step 1: 最小实现**

在 nav guard 中：仅当找到可点击的卡片容器时 `preventDefault`，否则放行；找到容器则 `safeClick(container)`，不再 pushState。

**Step 2: 运行测试确认通过**

Run: `npm test`  
Expected: PASS

**Step 3: Commit**

```bash
git add extension/content_script.js
git commit -m "fix: nav guard clicks card container instead of pushState"
```

---

### Task 5: 文档更新

**Files:**
- Modify: `README.md`

**Step 1: 更新说明**

- 增加“/details pushState 仅在 `_modalInfo` 存在时启用”  
- 增加“容器点击触发 slider（非 anchor）”

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: clarify modalInfo routing behavior"
```

---

**完成后执行：**

```bash
npm test
```

Expected: 全部测试通过
