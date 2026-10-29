# 开发首版与最新开发版独立部署

## 环境边界

| 名称 | 网站 | Supabase | 发布来源 |
| --- | --- | --- | --- |
| 开发首版 | https://zhou070913-png.github.io/cross-border-shipping-system/ | bdxqphmzwojamyuboqmz | 原仓库 master，保持原配置 |
| 最新开发版 | 新仓库 Pages，待独立数据库就绪后启用 | eaztrans-latest-development，新项目创建中 | 独立仓库 zhou070913-png/eaztrans-latest-development |
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
新 Supabase 项目创建页名称已填写，等待用户完成密码与创建。数据库尚未安装，新公网尚未启用。
新安装脚本已在临时数据库验证空库安装、私有凭证和会员登录函数；再次对已有库执行会在任何迁移之前拒绝并回滚。
此验证不代表已通过云端 Auth、Storage 或真实业务验收。
