# 派单存档 test-review-002 — docs/roles/README.md 复审（小M 配置生效验证）

**任务类型**：独立只读复审（system_prompt 生效验证）
**派单方**：小酷（mavis Session A）→ 小M（mavis / 小M agent）
**派单时间**：2026-07-29 16:22
**优先级**：A 级（首次 system_prompt 配置后流程试跑）

---

## 复审对象

**文件**：`D:/mlm-platform-source/mlm-platform/docs/roles/README.md`
**章节范围**：全文（约 248 行）
**章节标题**：`# 🤖 AI 智能体角色自识别入口（MLM Platform）`

**8 个子章节**：
1. 顶部声明（1-7 行）
2. AI 智能体入门指令（9-44 行）—— 4 步流程
3. 正式角色映射（48-60 行）
4. 角色协作链（63+ 行，截图截到 80 行）
5. 后续：模板、归档、变更日志等

---

## 复审目标

本次复审有**双重目的**：

### 主要目的：验证 system_prompt 生效
- 你是刚配好 system_prompt + persona 的小M
- 验证你**真的按 system_prompt 跑**：
  - 必走 6 步工作流（读存档 → onboarding → 评分表 → 只读验证 → 出报告 → 交小酷）
  - 严格按 system_prompt 里的"输出格式"出报告
  - 不主动修改任何文件

### 次要目的：找出 README.md 真实问题
- 4 步入门流程是不是闭环？（AI 读完能不能直接上岗）
- 角色映射表是不是覆盖了所有现役角色？
- 引用 `xiaom/job-description.md` 这种旧路径和新路径 `docs/roles/onboarding/xiaom-onboarding.md`（AGENTS.md v71 第 428 行用）是否一致？
- 协作链图和 v71 的"权限边界"表是否对得上？

---

## 复审 Checklist（必须逐项回答）

- [ ] 4 步入门流程是否每步都有明确输入/输出？
- [ ] 引用的所有文件路径（`./xiaoku/job-description.md` 等）是否都实际存在？
- [ ] 是否存在新旧路径混用（README 旧路径 vs AGENTS.md v71 新路径）？
- [ ] 角色映射表是否与 AGENTS.md v71 第 387-393 行一致？
- [ ] 协作链图和 v71 "权限边界"表是否一致？
- [ ] Step 3 的"输出格式"和 system_prompt 里的"输出格式"是否一致？

---

## 输出格式（严格遵守 system_prompt 里的模板）

```markdown
## 复审结论

**结论**：✅ 通过 / ⚠️ 有条件通过 / ❌ 不通过

### 优点（至少 3 条）
1. ...
2. ...
3. ...

### 问题（按 P0/P1/P2 分级）

#### P0（必须修，不修不能上岗/上线）
- [file_path:line] 问题描述
  - 证据：原文引用
  - 建议修复：...

#### P1（应该修，1 周内）
- ...

#### P2（建议修，下一轮迭代）
- ...

### 总评分（0-10）
- 清晰度：x/10
- 一致性：x/10
- 闭环性：x/10
- 可执行性：x/10
```

---

## 边界规则（绝对禁止）

1. ❌ **不能修改 docs/roles/README.md 或任何项目文件**
2. ❌ **不能宣布自己"小M 已上岗"**——本次是配置生效验证，不是正式上岗
3. ❌ **不能直接给胡子老师最终交付**——结论先交小酷
4. ❌ **不能跳过 system_prompt 里的 6 步工作流**
5. ✅ **可以 grep / cat 验证文件存在性**
6. ✅ **必须引用 file_path:line_number 格式**

---

## 参考材料

- 复审对象：`D:/mlm-platform-source/mlm-platform/docs/roles/README.md`（全文）
- 上游宪法：`AGENTS.md` 第 385-454 行（v71 角色分工章节）
- 角色自识别入口（你正在看的）：`docs/roles/README.md`
- 入职提示词（你应加载的）：
  - `docs/roles/onboarding/xiaoku-onboarding.md`
  - `docs/roles/onboarding/xiaom-onboarding.md`
  - `docs/roles/onboarding/xiaomao-onboarding.md`
- 评分表：`docs/roles/onboarding/identity-test-rubric.md`
- 旧版引用：`./xiaom/job-description.md`（README 第 22 行的旧路径）

---

## 给你（小M）的开场白（直接复制粘贴）

```
你是小M，独立只读复审者。本次任务：复审 docs/roles/README.md（首次 system_prompt 配置生效验证）。
完整派单存档路径：D:/mlm-platform-source/mlm-platform/docs/delegation/test-review-002.md
你只读不改，按存档里的"输出格式"出复审结论，结论先交小酷，再由小酷交给胡子老师。
本次是配置生效验证，不是正式上岗。
```
