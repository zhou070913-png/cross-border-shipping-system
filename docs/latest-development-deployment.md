# 开发首版与最新开发版独立部署

## 环境边界

| 名称 | 网站 | Supabase | 发布来源 |
| --- | --- | --- | --- |
| 开发首版 | https://zhou070913-png.github.io/cross-border-shipping-system/ | bdxqphmzwojamyuboqmz | 原仓库 master，保持原配置 |
| 最新开发版 | https://zhou070913-png.github.io/eaztrans-latest-development/ | sqnxjyckgbazsqsafgrc，eaztrans-latest-development | 独立仓库 zhou070913-png/eaztrans-latest-development，main |
| 本地验收 | http://127.0.0.1:4175/ | 临时 PGlite | feature/overseas-forwarding |

最新开发版从空业务数据开始。首版客户账号、订单、地址、凭证及 Storage 均不复制，不运行任何清理或迁移。
本地的免密测试身份只属于本机验收服务，不会随公网发布。

## 交付步骤

1. Supabase 在原组织内新建 Free 项目 `eaztrans-latest-development`。数据库密码由用户本人输入、保存和提交，不写入 Git。
2. `node dev/latest-deployment.mjs sql` 生成 `.deployment/latest-bootstrap.sql`。核对控制台当前项目为新项目后运行。安装器检测 `profiles` 或 `orders` 已存在即拒绝，全部安装在一个事务中完成；包含会员登录、私有付款凭证、头尾程整单付款和客服等 15 份迁移，不创建订单或客户账号。
3. 在新项目配置 Auth 的 Site URL / Redirect URLs，仅填新的测试站点；保留邮箱验证。创建并验证新测试商家，按 profiles 给独立的仓库和运营用户赋权及仓库归属。不可发布本地免密身份切换按钮。
4. 读取新项目 URL 和公开 publishable key；不使用 secret / service_role。将它们临时放在本机进程环境变量 `EAZTRANS_LATEST_SUPABASE_URL` 与 `EAZTRANS_LATEST_PUBLISHABLE_KEY`。
5. `node dev/latest-deployment.mjs build` 生成 `.deployment/latest-site`。仅输出 HTML 和引用的根目录 JS/CSS，重写输出目录中的 Supabase 配置，不更改源文件或原站配置。拒绝首版项目 ID、原仓库、管理密钥、非法 URL 和已存在的输出目录。
6. 将构建目录发布到独立仓库 `zhou070913-png/eaztrans-latest-development` 的 main，再启用该仓库 Pages。原仓库 Pages 的 master / 根目录设置不变。
7. 验证真实 Auth、Storage、RLS：商家 A 创建测试订单，B 看不到；仓库和运营只执行获授权业务；上传凭证后按私有签名地址查看；刷新后业务数据保留。Realtime 若未单独配置则沿用每 10 秒轮询。
8. 比较首版 `master` 提交、Pages 来源及 index/client 文件散列，与部署前记录一致；新站 `deployment.json` 记录新项目 ID、来源提交和构建时间。

## 验证与当前进度

2026-10-29：独立仓库已创建；现有首版 `master` 为 `0d21f4110144d750d410542cce6f3b3047a0f005`，Pages 从 master 根目录发布，仍为 built。
新 Supabase 项目 `sqnxjyckgbazsqsafgrc` 已安装全部 15 份迁移，环境标记为 latest-development。项目沿用创建时的 Free / Ireland 配置，Site URL 已设为新站完整网址，邮箱验证保持开启。
独立网站已发布，Pages 状态 built，发布提交 `ee5b019`，功能源提交 `cbca091`。构建只包含网站资产和公开 publishable key，不包含数据库密码、管理密钥、本地免密测试客户端或旧数据库项目 ID。
首版 master、Pages 来源、公开 index.html 和 supabase-client.js 的 SHA-256 均与部署前一致；本次没有操作首版数据库。
新安装脚本已在临时数据库验证空库安装、私有凭证和会员登录函数；再次对已有库执行会在任何迁移之前拒绝并回滚。
云端额外验证：Auth 设置接口返回正常，允许注册并要求邮箱验证；匿名访问业务表无数据返回；SQL 检查所有 public 表均启用 RLS，付款凭证桶为私有。在事务内创建两个临时无密码身份，商家 A 预报包裹，B 和 anon 均不可读，随后回滚。最终账号、包裹、订单数量均为 0。
公网登录页已验证中文 / English / Bahasa Indonesia 切换。未以真实账号完成邮箱收信、注册登录、凭证上传与签名查看、仓库和运营的整单流程验收，不应将数据库层检查等同于这些业务验收。

## 新环境首次使用

1. 打开最新开发版，选择商家端，点击注册商家账号，用本人可接收邮件的邮箱注册并完成验证。新环境需要重新注册，旧环境账号和本地免密身份不迁移。
2. 仓库与运营也需要新环境中的独立身份，并在数据库中按明确的邮箱 / UUID 分配角色，仓库账号还需绑定深圳仓。不得按注册顺序自动提权，也不发布通用管理员密码。
3. 用户自行设置、保存密码，不在聊天或 Git 中发送密码。确认身份和角色后，再进行完整的预报、收货、合包、费用、付款凭证审核、出货测试。
4. 后续功能开发仍在原源代码仓库的 feature/overseas-forwarding 分支；使用本文件的构建器发布到独立新仓库，避免将源文件中首版的默认连接直接推到新站。不要将功能分支合入旧 master 或调整旧站 Pages。

本地部署证据保存在忽略目录 `.deployment/`：首版发布前快照、云接口验证 JSON、初始化 SQL、事务隔离检查 SQL 和发布目录。复查时只读对比首版，不覆盖原始快照。
