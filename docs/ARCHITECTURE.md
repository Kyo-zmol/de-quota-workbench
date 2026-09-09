# 架构 / Architecture

```mermaid
flowchart LR
  subgraph 数据获取
    A[官方发布件 PDF/ZIP] -->|16路Range并发下载| B[data/raw]
    B -->|parse_hubei_pdf.js 坐标聚类解析| C[data/processed 27,334子目]
    B -->|extract_rules.js| D[rules_all 17,577条]
    B -->|pdf.js 浏览器渲染| E[价本原文阅读器]
  end
  subgraph 服务 app/server.js 零依赖
    C --> F[/api/search 册先验+材料反查/]
    C --> G[/api/convert 官方费率正算+材差口径/]
    D --> H[/api/rules /api/ask 证据式RAG/]
    I[prices_manual 多期价本] --> J[/api/prices/match/]
    K[rules_habits 习惯卡] --> G
    L[projects 工作单] --> M[/api/export/xlsx 自写OOXML/]
  end
  subgraph 前端 vanilla JS 单页
    F --> N[查询三栏]
    G --> O[组价开屏/换算]
    H --> P[问答答案卡]
    J --> O
    Q[设计系统v3 宣纸朱砂 style.css] --> N & O & P
  end
  subgraph 分发
    R[desktop/ Electron 便携] 
    S[Docker / Render]
    T[git 代码数据分离]
  end
```

## 关键决策记录 / ADR 摘要
1. **本地优先**：造价数据敏感+离线工地场景 → 零依赖 Node 服务 + 文件存储，云部署为可选分发形态
2. **不含税口径汇总**：GB50500 与湖北2024费用定额实证（恒等式反推）→ 增值税单层计取
3. **证据式 RAG 而非生成式**：离线无 LLM → 答案=排序证据+模板合成，出处可点
4. **代码/数据分离开源**：版权与隐私边界 → demo/ 标注样本随仓，全量自解析
5. **设计基因=主体性**：造价=台账与印章 → 宣纸/墨/朱砂/宋体，反 SaaS 模板脸
