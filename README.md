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

如果创建订单时出现 `new row violates row-level security policy for table "orders"`，请执行 `supabase/fix-order-insert.sql`。这是已有账号缺少商家档案时的兼容补丁。

业务规则已经写入数据结构：商家先发货到深圳仓；仓库确认实重和尺寸后进入待付款；每个订单只有一条付款记录，付款后费用锁定，不设计待补款或二次付款。

## 当前边界

GitHub Pages 仍是前端演示版本，页面暂时使用内存状态。执行 SQL 后，下一步再把订单创建、包裹查询和物流追踪逐个改为 Supabase 读写。
