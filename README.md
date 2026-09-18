# muse-invite

Muse 邀请码聚合站（muse.chenerlab.com）：公开邀请码收录、可用状态（众包更新）、各地区开放进度 timeline。

Muse invite codes directory: publicly shared invite codes, availability status (crowdsourced), and regional rollout timeline.

## 结构

- `index.html` — 首页：码列表 + 状态 + 筛选/排序
- `codes/<CODE>.html` — 每码独立详情页（SEO）
- `regions.html` — 地区开放进度 timeline
- `faq.html` — FAQ（含 FAQPage 结构化数据）
- `data/codes.json` / `data/regions.json` — 数据源（JSON 驱动）
- `.github/ISSUE_TEMPLATE/` — 访客提交邀请码 / 反馈失效 的 Issue 表单

## 状态模型（诚实标注，非实时）

本站所有状态均为**众包更新**：码主自报剩余次数 + 访客"已失效"反馈（走 Issue）+ last-verified 时间戳。多个失效报告触发人工复核下架。本站不声称任何"实时"数据。

## 提交邀请码

通过 [提交表单](https://github.com/Chener/muse-invite/issues/new?template=submit-code.yml) 提交公开发布的邀请码，人工审核后合入 `data/codes.json`。码主可随时要求下架自己的码。
