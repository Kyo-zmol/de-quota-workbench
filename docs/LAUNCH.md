# 上线手册 / Launch Runbook

## 0. 发布前体检（已完成 2026-09-10）
- 隐私终审：tracked 文件 0 命中（用户名/个人路径/公网IP/密钥）
- 体积：18.5MB（含 pdf.worker 2.3MB 与 demo 样本；traineddata 已出仓）
- 冒烟：六模块全链路 0 错误（组价 11,968.62 / 查询 22 行 / 换算 7,528.19 / 价本 17 / 问答 257 字 / 习惯 2 / QA 31 行）
- 数据自检：27,334 子目恒等失败 36（0.13%，设置页如实标记）

## 1. 建仓与推送（需你的 GitHub 凭据）
1. github.com → New repository → 名字 `de-quota-workbench` → Public → 不勾 README/gitignore/license
2. 本地：
   git remote add origin https://github.com/<你的用户名>/de-quota-workbench.git
   git push -u origin main
   git push origin v1.0.0
3. 仓库设置建议：Description 用 README 首段；Topics: construction-cost, quota, hubei-2024, cost-engineering, ai-workbench, local-first

## 2. GitHub Pages（静态演示，零服务端）
Settings → Pages → Source: GitHub Actions → 推 main 后 workflow `pages` 自动构建部署
得到 https://<用户名>.github.io/de-quota-workbench/ （演示样本 4,448 子目 + BYO-data 导入）

## 3. 全功能版（可选，Render/VPS）
- Render：New → Blueprint → 选仓库（认 render.yaml）→ 免费档；或
- VPS：docker build -t deqw . && docker run -d -p 8730:8730 deqw
- 自有全量数据：挂载 /data 并覆盖 WB_PROC/WB_NOTES/WB_PROJ 指向你的解析结果

## 4. 上线后验证清单
- [ ] Pages URL 打开见「静态演示模式」徽章与开屏组价
- [ ] 搜索"砖基础"→ A1-1 详情六卡+工料机表
- [ ] 导入自己的清单 xlsx → 自动匹配出稿
- [ ] og 卡片在社交粘贴预览正常（docs/og.png）
- [ ] 仓库 Settings 确认无 Secrets 需求（BYO-key 在访问者浏览器）

## 5. 回滚
git revert <commit> 或 Pages workflow 重跑旧 tag：git push origin v1.0.0:refs/tags/rollback && 手动触发 workflow
