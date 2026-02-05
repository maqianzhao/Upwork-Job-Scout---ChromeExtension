# Detail Fallback (Slider + /jobs) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan.

**Goal:** 详情优先用 Best Matches slider 打开；若跳转到 /jobs 独立详情页则自动降级解析，并回到 Best Matches 继续下一条。

**Architecture:** 新增导航路径判断（details/jobs）与 detail 模式判定；详情打开策略优先 pushState 到 /details；等待详情就绪时兼容 /jobs 主体容器；解析成功后如果在 /jobs 则强制回到 Best Matches，避免卡住。

**Tech Stack:** Chrome Extension MV3, Vanilla JS, Vitest, JSDOM.

---

### Task 1: 增加导航路径判定（details/jobs）

**Files:**
- Modify: `extension/src/core/navigation.js`
- Test: `tests/navigation.test.js`

**Step 1: 写 failing test**

```js
import { isDetailsPath, isJobsPath, getDetailMode } from "../extension/src/core/navigation.js";

it("detects details/jobs path", () => {
  expect(isDetailsPath("/nx/find-work/best-matches/details/~02")).toBe(true);
  expect(isDetailsPath("/jobs/Backend_~02/")).toBe(false);
  expect(isJobsPath("/jobs/Backend_~02/")).toBe(true);
  expect(isJobsPath("/nx/find-work/best-matches/details/~02")).toBe(false);
});

it("returns detail mode for path", () => {
  expect(getDetailMode("/nx/find-work/best-matches/details/~02")).toBe("details");
  expect(getDetailMode("/jobs/Backend_~02/")).toBe("jobs");
  expect(getDetailMode("/nx/find-work/best-matches")).toBe(null);
});
```

**Step 2: 运行测试确认失败**

Run: `npm test -- tests/navigation.test.js`  
Expected: FAIL（isDetailsPath/isJobsPath/getDetailMode 未定义）

**Step 3: 最小实现**

```js
export function isDetailsPath(pathname) { return pathname?.includes("/details/"); }
export function isJobsPath(pathname) { return pathname?.includes("/jobs/"); }
export function getDetailMode(pathname) {
  if (isDetailsPath(pathname)) return "details";
  if (isJobsPath(pathname)) return "jobs";
  return null;
}
```

**Step 4: 运行测试确认通过**

Run: `npm test -- tests/navigation.test.js`  
Expected: PASS

**Step 5: Commit**

```bash
git add tests/navigation.test.js extension/src/core/navigation.js
git commit -m "test: add details/jobs path detection"
```

---

### Task 2: 为 /jobs 详情页增加解析可用性测试

**Files:**
- Modify: `tests/parser.test.js`
- Modify: `extension/src/core/parser.js` (若测试失败则最小修复)

**Step 1: 写 failing test**

```js
it("extracts detail/meta from /jobs page container", () => {
  const html = `
    <main>
      <h1>AI Backend Engineer Needed for On-Demand AI Solutions</h1>
      <section class="description">We are seeking an experienced AI Backend Engineer...</section>
      <section>
        <h3>About the client</h3>
        <div>Payment method verified</div>
      </section>
      <div>Hourly</div>
      <div>$10.00-$30.00</div>
      <div>Proposals: Less than 5</div>
      <div>Posted 3 hours ago</div>
    </main>
  `;
  const dom = new JSDOM(html);
  const container = dom.window.document.querySelector("main");
  const detail = extractDetailFromSlider(container);
  const meta = extractDetailMetaFromSlider(container);
  expect(detail.title_from_detail).toContain("AI Backend Engineer");
  expect(detail.description_full.length).toBeGreaterThan(20);
  expect(detail.client_history_detail_raw).toContain("Payment method verified");
  expect(meta.job_type).toBe("Hourly");
  expect(meta.budget_or_hourly_range_raw).toContain("$10.00-$30.00");
});
```

**Step 2: 运行测试确认失败**

Run: `npm test -- tests/parser.test.js`  
Expected: FAIL（字段解析不足或为空）

**Step 3: 最小实现**

若失败，按报错点对 `extractDetailFromSlider` / `extractDetailMetaFromSlider` 做最小修复（例如确保 `resolveDetailRoot` 对 `main` 容器有效、或 description/关于客户提取覆盖）。

**Step 4: 运行测试确认通过**

Run: `npm test -- tests/parser.test.js`  
Expected: PASS

**Step 5: Commit**

```bash
git add tests/parser.test.js extension/src/core/parser.js
git commit -m "test: cover /jobs detail parsing"
```

---

### Task 3: 详情打开策略调整（优先 /details）

**Files:**
- Modify: `extension/content_script.js`

**Step 1: 写 failing test（导航策略顺序）**

新增单元函数到 `extension/src/core/navigation.js`（例如 `preferDetailOpenStrategies`），并在 `tests/navigation.test.js` 加测试，确保策略顺序为：
`DETAILS_URL_PUSHSTATE → URL_LINK → JOB_ID_LINK → TITLE_CARD → INDEX_CARD`

**Step 2: 运行测试确认失败**

Run: `npm test -- tests/navigation.test.js`  
Expected: FAIL（策略函数不存在）

**Step 3: 最小实现**

实现策略函数并在 `content_script.js` 使用该顺序进行 `openDetailForRecord`。

**Step 4: 运行测试确认通过**

Run: `npm test -- tests/navigation.test.js`  
Expected: PASS

**Step 5: Commit**

```bash
git add tests/navigation.test.js extension/src/core/navigation.js extension/content_script.js
git commit -m "feat: prioritize /details open strategy"
```

---

### Task 4: /jobs 降级解析与回退流程

**Files:**
- Modify: `extension/content_script.js`

**Step 1: 写 failing test（detail mode 判定）**

在 `tests/navigation.test.js` 增加 `getDetailMode` 用例，作为 /jobs 降级流程的“开关逻辑”验证（若未完成则先完成 Task 1）。  

**Step 2: 运行测试确认失败**

Run: `npm test -- tests/navigation.test.js`  
Expected: FAIL（未实现 detail mode）

**Step 3: 最小实现**

在 `content_script.js`：
1. 新增 `const detailMode = navRef.getDetailMode(location.pathname);`
2. `waitForSlider()` 若 mode 为 `jobs`，使用 `selectors.findDetailContentContainer(document)` 作为容器，并调用 `evaluateDetailReadiness`。
3. `runDetailPhase()` 若容器来自 /jobs 仍解析并保存，不再触发 `DETAIL_NAVIGATED_AWAY`。
4. 解析后若在 `/jobs`，用 `navRef.buildBestMatchesUrl()` 强制回到列表并等待列表出现再继续下一条。

**Step 4: 运行测试确认通过**

Run: `npm test`  
Expected: PASS

**Step 5: Commit**

```bash
git add extension/content_script.js
git commit -m "feat: add /jobs detail fallback and return flow"
```

---

### Task 5: 版本与文档更新

**Files:**
- Modify: `extension/manifest.json`
- Modify: `README.md`

**Step 1: 版本号 + 文档**

- 版本号递增（例如 `0.1.16`）
- README 加入“/jobs 降级解析 + 回退 Best Matches”说明

**Step 2: Commit**

```bash
git add extension/manifest.json README.md
git commit -m "docs: document /jobs fallback behavior"
```

---

**完成后执行：**

```bash
npm test
```

Expected: 全部测试通过

---

Plan complete and saved to `docs/plans/2026-02-05-detail-fallback-design.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints

Which approach?
