# CLAUDE.md —— superdaddy

## 项目

超级奶爸工作台：本地优先的家庭育儿记录工具——宝宝的数据永不上传。
mode: oss
cost-cap: $10/mo（当前 $0：纯静态 + CF Pages 免费层）

## 结构

```
src/
├── data/      10 份权威数据字典（WHO/疫苗/喂养/指南…，来自旧项目迁移）
├── utils/     纯函数（time/vaccine/growth…，TDD 覆盖）
├── views/     hash 路由页面
└── store.js   localStorage 存取层（唯一数据出入口）
styles/        tokens.css + app.css（令牌唯一事实源）
tests/         node --test
```

## 常用命令

```bash
npm test        # node --test，提交前必须全绿
```

本地运行：直接双击 index.html（file:// 可用是产品特性，勿引入破坏它的依赖）。

## 约定

- 提交：Conventional Commits，英文
- 功能开发走 `/tdd-workflow`（utils 纯函数必须有单测）
- 医学内容（疫苗/生长/用药）一律带免责声明；EPDS 类敏感功能改动需用户确认
- 范围纪律：新功能先对 README Roadmap 复核，防功能蔓延
- 隐私红线：不引入任何网络请求、埋点、CDN 脚本（字体用系统栈）

## 状态

- 阶段：v0.5.x released
- 交接笔记：HANDOFF.md（本地开发文件，不入公开仓）
