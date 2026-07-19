# Codex / Mavis Role Remap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Codex session in this project the 小酷, move `mavis / Mavis` to the independent read-only 小M role, retain `coder / Coder` as 小猫, and retire `verifier / Verifier` from all active workflows.

**Architecture:** Replace the active `docs/agent-tasks/` role system with one `docs/roles/` source of truth and preserve the old files unchanged in an audit archive. Codex inherits 小酷 from repository instructions; independent Mavis and Coder sessions receive complete copyable onboarding prompts from 胡子老师. No AI may self-approve onboarding.

**Tech Stack:** Markdown, Git, PowerShell, Codex project instructions, independent Mavis/Coder AI sessions.

## Global Constraints

- Active mapping: Codex=小酷, `mavis / Mavis`=小M, `coder / Coder`=小猫, `verifier / Verifier`=retired.
- 胡子老师 is the only business decision-maker and onboarding approver.
- 小M is independent and read-only: no file edits, Git writes, deployment, database writes, or production mutations.
- 小猫 only performs explicitly scoped auxiliary work and cannot make business decisions.
- Historical task/result bodies must remain byte-for-byte unchanged after archival moves.
- Do not modify `src/`, `prisma/`, dependencies, database state, or production data.
- Use `apply_patch` for text creation/editing/deletion and native PowerShell `Move-Item` only after absolute target validation.
- Never use `git add .` or `git add -A`; stage exact paths.
- Keep role-document commits separate from business-code commits.
- Existing dirty `AGENTS.md` and `docs/archive/agent-tasks-v70/README.md` are known interrupted-work artifacts; inspect and incorporate them intentionally, never discard them blindly.
- Design source: `docs/superpowers/specs/2026-07-19-codex-mavis-role-remap-design.md`.

---

## File Structure

```text
docs/archive/agent-tasks-v70/
  README.md
  catpaw/{todo,done}/*.md
  xiaom/{todo,done}/*.md
  review/*.md

docs/roles/
  README.md
  templates/{task,result,review}.md
  xiaoku/{system-prompt,job-description,workflow}.md
  xiaom/{system-prompt,job-description,workflow}.md
  xiaomao/{system-prompt,job-description,workflow}.md
  onboarding/{xiaom-copy-prompt,xiaomao-copy-prompt}.md
  tasks/xiaom/{todo,done,archived}/
  tasks/xiaomao/{todo,done,archived}/
```

### Task 1: Freeze and archive the old active system

**Files:**
- Keep/Create: `docs/archive/agent-tasks-v70/README.md`
- Move: `docs/agent-tasks/catpaw/todo/*.md` to `docs/archive/agent-tasks-v70/catpaw/todo/`
- Move: `docs/agent-tasks/catpaw/done/*.md` to `docs/archive/agent-tasks-v70/catpaw/done/`
- Move: `docs/agent-tasks/xiaom/todo/*.md` to `docs/archive/agent-tasks-v70/xiaom/todo/`
- Move: `docs/agent-tasks/xiaom/done/*.md` to `docs/archive/agent-tasks-v70/xiaom/done/`
- Move: `docs/agent-tasks/review/*.md` to `docs/archive/agent-tasks-v70/review/`

**Interfaces:**
- Consumes: 141 historical Markdown files in the five old history directories.
- Produces: Read-only audit archive; later tasks must never use it as active instructions.

- [ ] **Step 1: Record counts, hashes, and Git baseline**

Run:

```powershell
$historyPaths = @(
  'docs/agent-tasks/catpaw/todo',
  'docs/agent-tasks/catpaw/done',
  'docs/agent-tasks/xiaom/todo',
  'docs/agent-tasks/xiaom/done',
  'docs/agent-tasks/review'
)
$historyPaths | ForEach-Object {
  "$_=$((Get-ChildItem -LiteralPath $_ -File -Filter '*.md').Count)"
}
Get-ChildItem $historyPaths -File -Filter '*.md' |
  Sort-Object FullName |
  Get-FileHash -Algorithm SHA256 |
  ForEach-Object { "$($_.Hash)  $($_.Path)" } |
  Set-Content -LiteralPath "$env:TEMP\mlm-role-history-before.txt" -Encoding UTF8
git status --short --branch
git rev-parse --short HEAD
git rev-parse --short origin/main
```

Expected counts: `38`, `38`, `32`, `32`, `1`; total `141`.

- [ ] **Step 2: Verify the interrupted archive README**

Required content:

```markdown
# v70智能体任务历史归档

本目录保存角色制度硬重置前的任务、结果和审核记录，仅用于审计与问题追溯。

## 使用规则

- 本目录不是当前岗位制度。
- 不从本目录派发新任务。
- 不把本目录内的岗位描述当作现行规则。
- 历史正文、编号和结论保持原样。
- 当前制度统一以项目根 `AGENTS.md` 和 `docs/roles/` 为准。

## 基线

- 原执行岗位todo：38份Markdown。
- 原执行岗位done：38份Markdown。
- 小M todo：32份Markdown。
- 小M done：32份Markdown。
- 小酷审核：1份Markdown。
- 合计：141份Markdown。
```

If different, use `apply_patch` to make it exact.

- [ ] **Step 3: Resolve and validate every destination**

Run:

```powershell
$repoRoot = (Resolve-Path '.').Path
$destinations = @(
  'docs/archive/agent-tasks-v70/catpaw/todo',
  'docs/archive/agent-tasks-v70/catpaw/done',
  'docs/archive/agent-tasks-v70/xiaom/todo',
  'docs/archive/agent-tasks-v70/xiaom/done',
  'docs/archive/agent-tasks-v70/review'
)
foreach ($destination in $destinations) {
  $absolute = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $destination))
  if (-not $absolute.StartsWith($repoRoot + [System.IO.Path]::DirectorySeparatorChar)) {
    throw "Unsafe archive destination: $absolute"
  }
  New-Item -ItemType Directory -Force -Path $absolute | Out-Null
}
```

Expected: exit code `0`; all resolved paths remain under the repository.

- [ ] **Step 4: Move the five historical sets**

Run with native PowerShell only:

```powershell
$moves = @(
  @('docs/agent-tasks/catpaw/todo','docs/archive/agent-tasks-v70/catpaw/todo'),
  @('docs/agent-tasks/catpaw/done','docs/archive/agent-tasks-v70/catpaw/done'),
  @('docs/agent-tasks/xiaom/todo','docs/archive/agent-tasks-v70/xiaom/todo'),
  @('docs/agent-tasks/xiaom/done','docs/archive/agent-tasks-v70/xiaom/done'),
  @('docs/agent-tasks/review','docs/archive/agent-tasks-v70/review')
)
foreach ($move in $moves) {
  Get-ChildItem -LiteralPath $move[0] -File -Filter '*.md' |
    Move-Item -Destination $move[1]
}
```

- [ ] **Step 5: Verify counts and content preservation**

Run:

```powershell
$archivePaths = @(
  'docs/archive/agent-tasks-v70/catpaw/todo',
  'docs/archive/agent-tasks-v70/catpaw/done',
  'docs/archive/agent-tasks-v70/xiaom/todo',
  'docs/archive/agent-tasks-v70/xiaom/done',
  'docs/archive/agent-tasks-v70/review'
)
$archivePaths | ForEach-Object {
  "$_=$((Get-ChildItem -LiteralPath $_ -File -Filter '*.md').Count)"
}
$remaining = (Get-ChildItem @(
  'docs/agent-tasks/catpaw/todo',
  'docs/agent-tasks/catpaw/done',
  'docs/agent-tasks/xiaom/todo',
  'docs/agent-tasks/xiaom/done',
  'docs/agent-tasks/review'
) -File -Filter '*.md').Count
"remaining=$remaining"
git diff --summary -- docs/agent-tasks docs/archive/agent-tasks-v70
```

Expected: archive counts `38/38/32/32/1`, `remaining=0`, and Git reports renames rather than edited historical bodies.

- [ ] **Step 6: Commit the archive only**

```powershell
git add -- 'docs/agent-tasks/catpaw/todo' 'docs/agent-tasks/catpaw/done' 'docs/agent-tasks/xiaom/todo' 'docs/agent-tasks/xiaom/done' 'docs/agent-tasks/review' 'docs/archive/agent-tasks-v70'
git diff --cached --check
git diff --cached --name-only
git commit -m "docs: archive v70 agent task history"
```

Expected: no `AGENTS.md`, `src/`, `prisma/`, or `docs/roles/` paths staged.

### Task 2: Create the active shared role source and templates

**Files:**
- Create: `docs/roles/README.md`
- Create: `docs/roles/templates/task.md`
- Create: `docs/roles/templates/result.md`
- Create: `docs/roles/templates/review.md`
- Create: `.gitkeep` under each new `done/` and `archived/` task directory

**Interfaces:**
- Produces: The only active role root and standard task/result/review contracts.

- [ ] **Step 1: Create `docs/roles/README.md` with `apply_patch`**

Use exactly:

```markdown
# MLM Platform角色与岗位体系

本目录是项目现行AI岗位制度的唯一详细来源。项目根 `AGENTS.md` 定义最高级项目规则；本目录定义岗位职责、流程、模板和任务入口。

## 正式映射

| 系统身份 | 正式岗位 | 状态 |
|---|---|---|
| 所有本项目Codex会话 | 小酷 | 启用 |
| mavis / Mavis | 小M | 启用 |
| coder / Coder | 小猫 | 启用 |
| verifier / Verifier | 无 | 已退役 |

胡子老师是唯一业务拍板人、上岗批准人和真实环境验收人。

## 规则优先级

1. 系统和用户的直接指令。
2. 项目根 `AGENTS.md`。
3. 本目录的岗位文件。
4. 当前任务文件。
5. 历史归档只用于审计，不是现行规则。

## 任务入口

- 小M：`docs/roles/tasks/xiaom/`
- 小猫：`docs/roles/tasks/xiaomao/`
- 模板：`docs/roles/templates/`
```

- [ ] **Step 2: Create the task template**

```markdown
# {{角色}}_{{编号}}号任务

## 1. 任务目标

{{一个可验证的目标}}

## 2. 基线与范围

- 基线提交：{{commit}}
- 目标提交或工作区：{{commit或说明}}
- 允许读取或修改：{{精确路径}}

## 3. 禁止操作

{{逐项列出}}

## 4. 业务与安全规则

{{逐项列出}}

## 5. 验证命令

{{精确命令和预期结果}}

## 6. 完成标准

{{可判定的完成条件}}
```

- [ ] **Step 3: Create the result template**

```markdown
# {{角色}}_{{编号}}号结果

## 1. 最终结论

{{完成/部分完成/阻塞}}

## 2. 实际范围

{{文件和操作}}

## 3. 验证证据

{{命令、输出和结论}}

## 4. Git状态

{{分支、HEAD、未提交改动和是否提交/推送}}

## 5. 风险与下一步

{{按P0/P1/P2列出}}
```

- [ ] **Step 4: Create the review template**

```markdown
# 小M_{{编号}}号复审结果

## 1. 结论

{{通过/有条件通过/不通过}}

## 2. 基线与范围

{{基线、目标和实际diff}}

## 3. 独立验证证据

{{命令、输出、调用链和边界证据}}

## 4. 问题

{{文件、位置、触发条件、影响和建议}}

## 5. 下一步

{{交付给小酷的明确行动}}
```

- [ ] **Step 5: Create empty-directory markers**

Create with `apply_patch`:

```text
docs/roles/tasks/xiaom/done/.gitkeep
docs/roles/tasks/xiaom/archived/.gitkeep
docs/roles/tasks/xiaomao/done/.gitkeep
docs/roles/tasks/xiaomao/archived/.gitkeep
```

- [ ] **Step 6: Verify and commit shared files**

```powershell
rg -n "mavis|Mavis|verifier|Verifier|coder|Coder|Codex|小酷|小M|小猫" docs/roles/README.md docs/roles/templates
git add -- 'docs/roles/README.md' 'docs/roles/templates' 'docs/roles/tasks/xiaom/done/.gitkeep' 'docs/roles/tasks/xiaom/archived/.gitkeep' 'docs/roles/tasks/xiaomao/done/.gitkeep' 'docs/roles/tasks/xiaomao/archived/.gitkeep'
git diff --cached --check
git commit -m "docs: create active role system"
```

### Task 3: Install Codex as 小酷

**Files:**
- Create: `docs/roles/xiaoku/system-prompt.md`
- Create: `docs/roles/xiaoku/job-description.md`
- Create: `docs/roles/xiaoku/workflow.md`

**Interfaces:**
- Consumes: `docs/roles/README.md`.
- Produces: Project-level identity inherited by every Codex session through Task 6's `AGENTS.md` pointer.

- [ ] **Step 1: Create the 小酷 system prompt**

Required statements:

```markdown
# 小酷System Prompt

你是本项目中的小酷。所有进入 `D:\mlm-platform-source\mlm-platform` 的Codex会话都继承此岗位。

胡子老师是唯一业务拍板人和上岗批准人。你负责需求澄清、设计、核心实现、TDD、自审、协调、发布和交付。

你可以把边界明确的辅助执行交给小猫，把独立只读复审交给小M。你不得让小M参与同一批实现后再声称复审独立。

正式映射：Codex=小酷；mavis/Mavis=小M；coder/Coder=小猫；verifier/Verifier=退役。
```

- [ ] **Step 2: Create the job description**

The file must list: requirements intake, S/A/P classification, design/plan, core implementation, TDD, self-review, dispatch, release verification, and direct reporting to 胡子老师. It must explicitly prohibit delegating business decisions and mixing 小M implementation with independent review.

- [ ] **Step 3: Create the workflow**

The workflow must contain these exact phases: `接收`, `分级`, `设计与计划`, `实现`, `自审`, `独立复审`, `发布`, `交付`. P-level work requires independent 小M review before release.

- [ ] **Step 4: Verify and commit**

```powershell
rg -n "Codex=小酷|mavis/Mavis=小M|coder/Coder=小猫|verifier/Verifier=退役|胡子老师" docs/roles/xiaoku
rg -n "胡子哥|猫爪|mavis.*小酷|verifier.*小M" docs/roles/xiaoku
git add -- 'docs/roles/xiaoku'
git diff --cached --check
git commit -m "docs: install Codex 小酷 role"
```

Expected: first scan matches all identity assertions; second scan has no matches.

### Task 4: Install Mavis as independent 小M and create the copyable onboarding prompt

**Files:**
- Create: `docs/roles/xiaom/system-prompt.md`
- Create: `docs/roles/xiaom/job-description.md`
- Create: `docs/roles/xiaom/workflow.md`
- Create: `docs/roles/onboarding/xiaom-copy-prompt.md`

**Interfaces:**
- Produces: Read-only reviewer contract and the complete prompt 胡子老师 copies to the independent Mavis AI.

- [ ] **Step 1: Create the 小M system prompt**

It must contain these non-negotiable assertions:

```markdown
# 小M System Prompt

你是小M，对应 Agent ID `mavis`、DisplayName `Mavis`。旧“小酷”身份已废止。

你只做独立、只读、基于证据的复审。你不得修改项目文件，不得提交、推送、部署或写数据库，不得参与同一批变更的实现。

你向Codex小酷交付复审结果。只有胡子老师可以批准你上岗。`verifier / Verifier` 已退役。
```

- [ ] **Step 2: Create the 小M job description and workflow**

The job description must define allowed reads/checks, forbidden writes, three conclusions, independence rules, and escalation. The workflow must define: receive task, verify baseline, verify scope, independently inspect, independently run read-only checks, issue evidence, stop without fixing.

- [ ] **Step 3: Save the complete onboarding prompt**

Copy the full prompt already approved in the Codex conversation into `docs/roles/onboarding/xiaom-copy-prompt.md`. The file must include all of these headings:

```text
系统身份
重要身份变更
岗位目标
允许操作
绝对禁止事项
汇报关系
入职阶段特别限制
入职阅读顺序
复审基本方法
复审结论标准
入职报告格式
五题考核
上岗承诺
当前状态
```

It must end by instructing Mavis to perform only read-only checks and never self-declare onboarding success.

- [ ] **Step 4: Verify the prompt is self-contained**

```powershell
rg -n "Agent ID.*mavis|DisplayName.*Mavis|正式业务岗位.*小M|Codex.*小酷|coder.*Coder.*小猫|verifier.*Verifier.*退役|不得自行.*上岗|五题考核|上岗承诺" 'docs/roles/onboarding/xiaom-copy-prompt.md'
rg -n "apply_patch.*可以|git commit.*可以|git push.*可以|可以.*部署|可以.*数据库写入" 'docs/roles/onboarding/xiaom-copy-prompt.md'
```

Expected: first command matches every identity/boundary section; second command has no matches.

- [ ] **Step 5: Commit 小M files**

```powershell
git add -- 'docs/roles/xiaom' 'docs/roles/onboarding/xiaom-copy-prompt.md'
git diff --cached --check
git commit -m "docs: install Mavis 小M role"
```

### Task 5: Retain Coder as 小猫 and retire Verifier

**Files:**
- Create: `docs/roles/xiaomao/system-prompt.md`
- Create: `docs/roles/xiaomao/job-description.md`
- Create: `docs/roles/xiaomao/workflow.md`
- Create: `docs/roles/onboarding/xiaomao-copy-prompt.md`

**Interfaces:**
- Produces: Bounded auxiliary worker contract and no active Verifier task route.

- [ ] **Step 1: Create 小猫 role files**

Required system prompt:

```markdown
# 小猫System Prompt

你是小猫，对应 Agent ID `coder`、DisplayName `Coder`。你只执行Codex小酷通过任务文件明确授权的辅助工作。

你不得自行扩大范围、作业务决策、向胡子老师作最终交付，默认不得提交、推送或部署。遇到冲突、失败或不确定规则时停止并报告小酷。
```

The job description and workflow must cover: receive task, verify six required fields, inspect dirty worktree, execute only allowed paths, verify exact commands, report Git state, stop on conflict.

- [ ] **Step 2: Create the copyable 小猫 onboarding prompt**

It must identify Codex=小酷, Mavis=小M, Coder=小猫, Verifier=retired; require a read-only onboarding report; and state that only 胡子老师 can approve onboarding.

- [ ] **Step 3: Verify no active Verifier role exists**

```powershell
rg -n "verifier|Verifier" docs/roles
```

Expected matches only describe `verifier / Verifier` as retired; no task directory or active-role heading exists.

- [ ] **Step 4: Commit 小猫 and retirement files**

```powershell
git add -- 'docs/roles/xiaomao' 'docs/roles/onboarding/xiaomao-copy-prompt.md'
git diff --cached --check
git commit -m "docs: retain Coder 小猫 and retire Verifier"
```

### Task 6: Replace the active AGENTS role section and delete obsolete active files

**Files:**
- Modify: `AGENTS.md` role/governance section only, while preserving unrelated project iron laws.
- Delete after archival: remaining active files under `docs/agent-tasks/`.

**Interfaces:**
- Consumes: Task 2–5 role files.
- Produces: The project-level identity entry that all future Codex sessions automatically read.

- [ ] **Step 1: Inspect the dirty AGENTS diff before editing**

```powershell
git diff -- AGENTS.md
rg -n "协作角色|业务角色|Agent ID|mavis|verifier|coder|猫爪|小猫|胡子哥|胡子老师" AGENTS.md
```

Record which lines are harmless terminology corrections and which are invalid role mappings or nonexistent paths. Do not use `git restore` because the dirty changes were explicitly disclosed and may contain user-intended terminology changes.

- [ ] **Step 2: Replace the active role section with `apply_patch`**

The replacement must include exactly this mapping table:

```markdown
## 📝 协作角色与岗位

| 系统身份 | 正式岗位 | 核心职责 | 状态 |
|---|---|---|---|
| 胡子老师 | 唯一拍板人 | 业务决策、上岗批准、发布授权、真实环境验收 | 启用 |
| 所有本项目Codex会话 | 小酷 | 主理、设计、核心实现、协调、验证与发布 | 启用 |
| mavis / Mavis | 小M | 独立只读复审 | 启用 |
| coder / Coder | 小猫 | 辅助执行明确任务 | 启用 |
| verifier / Verifier | 无 | 不再接收项目任务 | 已退役 |

### 身份铁律

- Codex进入本项目即自动担任小酷，并读取 `docs/roles/xiaoku/`。
- mavis / Mavis 只担任小M，旧“小酷”身份废止。
- coder / Coder 只担任小猫。
- verifier / Verifier 已退役，不得派单。
- 小M和小猫不得自行宣布上岗，只有胡子老师可以批准。
- 现行详细岗位制度统一以 `docs/roles/` 为准；`docs/archive/` 仅用于历史审计。
```

- [ ] **Step 3: Remove obsolete active files**

After Task 1 moved history, delete remaining templates, README, and old role prompts under `docs/agent-tasks/` using `apply_patch`. Do not delete `docs/archive/agent-tasks-v70/`.

- [ ] **Step 4: Scan active sources**

```powershell
$activeFiles = @('AGENTS.md') + (Get-ChildItem -LiteralPath 'docs/roles' -Recurse -File | Select-Object -ExpandProperty FullName)
$activeFiles | Select-String -Pattern 'mavis[^\r\n]{0,50}小酷|verifier[^\r\n]{0,50}小M|猫爪|docs/agent-tasks|胡子哥'
Test-Path -LiteralPath 'docs/agent-tasks'
```

Expected: no invalid active matches; old directory is absent or contains no files.

- [ ] **Step 5: Commit the project identity switch**

```powershell
git add -- 'AGENTS.md' 'docs/agent-tasks'
git diff --cached --check
git diff --cached --name-only
git commit -m "docs: switch project AI role mapping"
```

### Task 7: Seed governed onboarding and review tasks

**Files:**
- Create: `docs/roles/tasks/xiaom/todo/小M_001号任务.md`
- Create: `docs/roles/tasks/xiaomao/todo/小猫_001号任务.md`

**Interfaces:**
- Produces: First valid task for each independent AI after onboarding approval.

- [ ] **Step 1: Create 小M 001 onboarding verification task**

The task must be read-only and target the final role-switch commit. It must require identity mapping checks, active-source scans, archive count checks, and `git status/log/diff` evidence. It must prohibit all writes and require one of the three review conclusions.

- [ ] **Step 2: Create 小猫 001 onboarding verification task**

The task must ask 小猫 to read its role package and report identity, allowed scope, forbidden actions, dirty-worktree policy, and five onboarding answers. It must not authorize file edits or Git writes.

- [ ] **Step 3: Verify and commit initial tasks**

```powershell
rg -n "基线提交|允许范围|禁止操作|验证命令|完成标准" 'docs/roles/tasks/xiaom/todo/小M_001号任务.md' 'docs/roles/tasks/xiaomao/todo/小猫_001号任务.md'
git add -- 'docs/roles/tasks/xiaom/todo/小M_001号任务.md' 'docs/roles/tasks/xiaomao/todo/小猫_001号任务.md'
git diff --cached --check
git commit -m "docs: seed governed AI onboarding tasks"
```

### Task 8: Verify the repository and onboard independent AIs

**Files:**
- Read-only verification of all active and archived role files.
- External manual action: 胡子老师 copies onboarding prompts to independent Mavis and Coder sessions.

**Interfaces:**
- Consumes: Final role infrastructure and onboarding prompts.
- Produces: Evidence for 胡子老师's explicit approval decisions.

- [ ] **Step 1: Run final active-source scans**

```powershell
$activeFiles = @('AGENTS.md') + (Get-ChildItem -LiteralPath 'docs/roles' -Recurse -File | Select-Object -ExpandProperty FullName)
$badPatterns = 'mavis[^\r\n]{0,50}小酷|verifier[^\r\n]{0,50}小M|猫爪|docs/agent-tasks|胡子哥'
$bad = $activeFiles | Select-String -Pattern $badPatterns
if ($bad) { $bad; throw 'Invalid active role references found' }
rg -n "Codex.*小酷|mavis.*Mavis.*小M|coder.*Coder.*小猫|verifier.*Verifier.*退役" AGENTS.md docs/roles
```

- [ ] **Step 2: Verify archive counts and Git rename integrity**

```powershell
$expected = @{
  'docs/archive/agent-tasks-v70/catpaw/todo' = 38
  'docs/archive/agent-tasks-v70/catpaw/done' = 38
  'docs/archive/agent-tasks-v70/xiaom/todo' = 32
  'docs/archive/agent-tasks-v70/xiaom/done' = 32
  'docs/archive/agent-tasks-v70/review' = 1
}
foreach ($entry in $expected.GetEnumerator()) {
  $actual = (Get-ChildItem -LiteralPath $entry.Key -File -Filter '*.md').Count
  if ($actual -ne $entry.Value) { throw "$($entry.Key): expected $($entry.Value), got $actual" }
}
git status --short --branch
git log --oneline origin/main..HEAD
```

- [ ] **Step 3: Run repository health checks**

Because no business code should change, run:

```powershell
git diff origin/main..HEAD --name-only | Select-String -Pattern '^(src|prisma|package.json|pnpm-lock.yaml)'
pnpm typecheck
pnpm test -- --run
pnpm build
```

Expected: first command has no matches; typecheck, tests, and build exit `0`. If scripts differ, inspect `package.json` and use the exact existing equivalents without editing dependencies.

- [ ] **Step 4: Give the complete 小M prompt to 胡子老师**

Deliver `docs/roles/onboarding/xiaom-copy-prompt.md` as a copyable block. 胡子老师 pastes it into a fresh independent `mavis / Mavis` session. Do not claim onboarding success yet.

- [ ] **Step 5: Audit the 小M onboarding report**

Require all five conditions:

```text
identity: mavis / Mavis = 小M
boundary: read-only; no edits, Git writes, deploy, DB writes
relationships: Codex=小酷, Coder=小猫, Verifier=retired
status: does not self-declare onboarding success
approval: only 胡子老师 can approve
```

If any condition fails, return a correction prompt; do not send a review task.

- [ ] **Step 6: Obtain explicit human approval**

Only 胡子老师 may send:

```text
考核通过，批准 mavis / Mavis 以“小M”身份正式上岗。
```

After that statement, send `小M_001号任务.md` to the independent Mavis session.

- [ ] **Step 7: Repeat onboarding for 小猫**

胡子老师 copies `xiaomao-copy-prompt.md` to a fresh `coder / Coder` session, audits the report, explicitly approves, then sends `小猫_001号任务.md`.

- [ ] **Step 8: Push intentionally and verify remote state**

```powershell
git status --short --branch
git log --oneline origin/main..HEAD
git push origin main
git log origin/main --oneline -1
git log HEAD --oneline -1
```

Expected: remote and local top commit hashes are identical. If Vercel creates a deployment for docs-only commits, verify that deployment's commit hash and Ready status; otherwise record that no production application files changed.

## Plan Self-Review

- Spec coverage: identity mapping, independent onboarding, read-only review, auxiliary worker, Verifier retirement, archive separation, dirty-worktree handling, Git verification, and human approval each have an implementing task.
- Placeholder scan: template placeholders are intentional template syntax; implementation actions contain exact paths, commands, assertions, and expected results.
- Interface consistency: all active tasks use `docs/roles/tasks/{xiaom,xiaomao}` and all onboarding prompts use `docs/roles/onboarding/`; no later task consumes `docs/agent-tasks/` as active instructions.
