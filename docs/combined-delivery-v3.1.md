# Eaztrans v3.1：整体订单一次结算

2026-10-28，开发分支 `feature/overseas-forwarding`。新增订单采用本说明；历史订单不自动重算。本次仅使用本地临时数据库验收，未修改生产 Supabase 或部署稳定版 GitHub Pages。

## 七项需求对应

| 需求 | 页面与行为 |
| --- | --- |
| 简化预报 | 预报和编辑仅国内快递单号、包裹品名，重量尺寸改由仓库实测。 |
| 两条渠道 | 运输计算器位于菜单首页下方，仅印尼空运、印尼海运，新合包同样仅两条。 |
| 按客户待收货 | 首页和队列统计客户数；展开会员号显示包裹数、单号、品名及关联订单，逐件收货。 |
| 首页可操作 | 四个流程卡片、六个统计及最近订单按钮均进入实际页面或筛选。 |
| 共享客服 | 客户、仓库、运营使用同一工单，追加回复不覆盖。运营维护微信 / WhatsApp，初始为明确不可联络的测试值。 |
| 整单一次支付 | 一个消费者地址、头程费用、尾程费用、合计。尾程未知显示「待复核费用」，禁止付款。 |
| 双语 | 新三端界面、登录 / 注册、付款及系统物流节点中文在上、印尼语在下。输入数据保持原文，原生下拉选项同一行双语。 |

## 业务流程与页面

1. 商家预报包裹，实物寄深圳仓。在我的包裹选择合包、空运 / 海运，填写最终消费者姓名、电话、城市、详细地址，提交整体订单；支持实际收到前提交合包意向。
2. 仓库展开待收货客户，逐件确认实物收到，全部到齐后才能合包。去除国内外包装，录入实际合包外箱重量及长宽高，系统按当前线路运价产生头程预估。
3. 仓库按消费者地址与距离人工填写尾程金额及核价依据，复核并锁定整体账单。
4. 商家查看「头程＋尾程＝整单合计」与收件地址，转账一次并上传凭证。运营核实真实到账、金额及唯一银行流水后审核，通知商家与仓库，直接进入待出货；上传截图本身不代表付款成功。
5. 仓库依次登记头程承运商和单号、印尼到仓、尾程快递和单号、消费者签收。全程同一订单，无第二笔收费尾程单。

只填写地址无法有依据地计算头程，因为预报不再收重量尺寸。实测前显示「待仓库实测预估」；客户可使用计算器输入假设尺寸重量试算。实测后展示头程预估，尾程复核后展示最终可付合计，不以 0 冒充未知费用。

主菜单：商家为首页、计算器、我的包裹、我的订单、地址、消息与客服、账户；仓库为首页、待收货客户、合包与复核、出货与物流、客服；运营保留订单、付款审核、收款配置、运价、审计、客服、实际账号列表。内部角色由平台分配，公众注册仅商家。

## 费用与状态

- 空运：总实重和总体积重取大，使用线路首重 / 续重规则。
- 海运：体积费（含最低计费体积）与重量费取高，再加每票一次的国内仓操作费。
- 尾程：按地址距离人工核价，本流程不调用地图、不自动套用旧地区尾程价表。
- 统一人民币 CNY，已复核账单锁定，不随运价变化重算。退款和已复核账单改价暂不开放自助入口。

| 显示状态 | 数据依据 | 下一步 |
| --- | --- | --- |
| 待收货 / 合包 | submitted / warehouse_received | 逐件到齐、合包实测 |
| 尾程费用待复核 | measuring + packed_at | 手工填尾程，复核整单 |
| 待付款 | awaiting_payment | 一次提交整单凭证 |
| 付款审核中 | pending receipt | 运营通过或退回补充凭证 |
| 已付款，待出货 | ready_to_ship + paid payment | 直接登记头程出货，不二次打包 |
| 头程运输中 | shipped | 确认印尼实际到货 |
| 印尼仓已到货 | overseas_received_at | 登记尾程快递 |
| 尾程派送中 | tail_shipped_at | 核实后签收 |
| 已签收 | delivered | 查看完整记录 |

包裹状态从关联整体订单推导，统计和详情共用规则。物流为仓库登记业务节点，尚未接入承运商自动轨迹。

## 增量数据字典与接口

| 表 / 字段 | 含义 |
| --- | --- |
| orders.fulfillment_mode = combined_delivery | 新的整单一次结算流程标识 |
| combined_request_id / combined_payload | 请求幂等键与申请快照，重试不重复下单 |
| destination_address / recipient_* | 最终消费者信息，提交后锁定 |
| destination_warehouse_snapshot | 内部印尼中转仓快照，不是消费者地址或独立收费单 |
| packed_boxes | 合包实测外箱数组；weight(kg)、length / width / height(cm) |
| tail_carrier / tail_tracking_no / tail_shipped_at | 本订单尾程快递、单号与发货时间 |
| fees.shipping_fee + handling_fee | 头程费用含国内操作费 |
| fees.last_mile_fee / last_mile_note | 尾程人工核价与依据，未核定为 NULL |
| fees.total_amount / confirmed_at | 复核后最终应付合计，复核前无可付总额 |
| fees.pricing_snapshot | 实测时运价及外箱快照 |
| support_replies | 工单追加回复，保存人员、角色、原文和时间，不覆盖 |
| support_contacts | 平台微信、WhatsApp、测试标记、版本；仅运营可修改 |

新 RPC：`combined_capabilities`、`warehouse_pending_customers`、`merchant_create_combined_order`、`warehouse_receive_combined_parcel`、`warehouse_pack_combined`、`warehouse_confirm_combined_fees`、`warehouse_advance_combined`、`submit_support`、`admin_save_support_contacts`。

后端检查启用身份、所有权、仓库归属、版本和行锁。全部包裹到齐、整单复核、运营确认付款、印尼到仓及尾程发货都有状态门禁。旧整单收货接口不能代替逐件收到；旧尾程入口不能给新整体订单再建独立收费尾程。

## 运行、迁移和验收

本地：`npm ci --ignore-scripts` → `npm run dev:forwarding` → http://127.0.0.1:4175/ 。底部切换本地商家 / 仓库 / 运营，仅本机有效。临时数据重启后清空，不要真实付款寄件。

依赖顺序与 `dev/forwarding-db.mjs` 相同：

```
schema → warehouse-operations → admin-operations → merchant-workspace
→ parcel-maintenance → parcel-estimates → payment-review → sea-route
→ separate-settlement → overseas-addresses → cargo-channels
→ last-mile-pricing → overseas-forwarding → combined-delivery
```

已有 v3.0 结构的开发库仅追加 `supabase/combined-delivery.sql`，不能再重跑旧函数覆盖新流程。缺少新迁移时，新前端阻止提交旧流程表单。

- `npm test`：新前端及历史回归，覆盖两字段、两渠道、客户分组、跳转、金额未知、进度、共享回复、双语不改输入、未迁移禁止提交。
- `npm run test:db`：5 组旧回归及 10 组新数据库验收，含迁移重跑、权限、逐件收货、锁单、合并付款、错误金额拒绝、禁止直接写单、无第二尾程及跨仓隔离。
- 浏览器实测：新预报 → 海运合包 → 逐件收货 → 2kg、20×20×20cm 实测 → 头程78＋尾程30＝108 → 测试凭证 → 运营审核 → 头程单号 → 印尼到仓 → 极兔测试单号 → 签收。商家也看到仓库与运营分别追加的客服回复。

上线前还需独立开发 Supabase 验证真实 Auth、私有 Storage、Realtime，备份生产数据，再迁移并发布配套前端。本次没有执行这些生产步骤；PGlite 验收不等于真实邮件、转账或承运商接口验收。

## 迭代记录

2026-10-28：依据七项意见，从 v3.0 独立尾程付款改为新整体订单一次付款，同步精简预报、按客户收货、首页跳转、共享客服及双语。master、生产库及旧账单保留原状态。旧样例明确标为历史订单，其原流程不回写到新单。
