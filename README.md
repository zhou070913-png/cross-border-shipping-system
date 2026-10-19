# Mospace 集运系统 Demo

当前仓库包含可点击的前端原型，以及 Supabase 数据库第一版结构。

## 公网 Demo

https://zhou070913-png.github.io/cross-border-shipping-system/

## 接入 Supabase

1. 打开 Supabase 项目的 SQL Editor：
   https://supabase.com/dashboard/project/bdxqphmzwojamyuboqmz/sql/new
2. 打开 `supabase/schema.sql`，复制全部内容到 SQL Editor。
3. 点击 **Run**。成功后会创建商家、仓库、订单、包裹、费用、付款、物流事件和审计日志等表，并启用角色权限。
4. 在 Authentication → Users 中注册的第一个账号会自动生成 `merchant` 商家档案。仓库操作员和管理员账号需要后续由管理员授予角色。

5. 执行 `supabase/member-login.sql`。它会为每个账号生成唯一会员号（格式如 `M12345678`），并创建会员号到 Supabase Auth 邮箱的安全解析函数。

如果创建订单时出现 `new row violates row-level security policy for table "orders"`，请执行 `supabase/fix-order-insert.sql`。这是已有账号缺少商家档案时的兼容补丁。

订单创建后，继续执行 `supabase/warehouse-operations.sql`，页面才会把仓库入库、确认实重尺寸、打包和出货写入数据库。仓库操作必须使用 `profiles.role = 'warehouse_operator'` 且绑定 `warehouse_id` 的账号；商家账号只能查看自己的订单并完成一次付款。

后台运价和地址页面还需要执行 `supabase/admin-operations.sql`：它会创建 `route_pricing` 运价表、管理员保存运价 RPC 和审计记录。执行后，管理员端“保存配置”、商家端“保存收件地址”、仓库端按真实快递单号匹配都会使用数据库。

完整试运行顺序：商家创建订单 → 仓库端“入库扫描”输入订单中的快递单号并匹配 → 包裹确认录入实重尺寸 → 商家费用页一次付款（当前记录人工转账结果）→ 仓库打包 → 出货登记 → 商家物流追踪。真实微信/支付宝支付网关仍需单独接入，当前不会产生真实扣款。

登录规则：登录只填写会员号和密码；注册时填写邮箱和密码，完成邮箱验证后，系统会在商家档案中生成会员号，注册提示会显示该会员号。仓库操作员和管理员也使用会员号登录，实际工作台由 `profiles.role` 权限决定。页面不再收集公司名称。

业务规则已经写入数据结构：商家先发货到深圳仓；仓库确认实重和尺寸后进入待付款；每个订单只有一条付款记录，付款后费用锁定，不设计待补款或二次付款。

## 当前边界

订单创建、订单列表、包裹列表和物流轨迹已经接入 Supabase。仓库作业补丁使用初版印尼空运计费规则：首重 0.5kg ¥68，续重 ¥42/kg，仓库操作费 ¥18；后续可再把运价规则抽成管理员配置表。当前付款按钮记录的是一次“人工收款/线下转账”结果，还没有接微信支付或银行卡支付网关。
