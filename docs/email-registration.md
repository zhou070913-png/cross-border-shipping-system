# 邮箱注册与验证码启用

仅适用于最新版 `eaztrans-latest-development` / Supabase `sqnxjyckgbazsqsafgrc`。不修改开发首版。

## 当前实际配置

2026-10-29 检查：允许邮箱注册，要求邮箱验证。Site URL 已是新版完整路径；本次补充同一完整路径的 Redirect URL 白名单，并在 signUp 和 resend 请求中显式传递完整路径。

控制台 Confirm sign up 的 source 和 Save changes 禁用。提示自定义 SMTP 才能编辑；更多选项包括升级 Pro 或配置 Send Email hook。默认邮件只含验证链接，因此公网继续使用 link 模式，不能声称已经发送数字验证码。截图中的旧链接需从网站重新发送，不能通过更新修改已发出的邮件。

## 已准备的验证码流程

邮箱、密码 → signUp 发送注册邮件 → 保留注册弹窗，显示数字验证码输入 → Supabase verifyOtp({email,token,type:'email'}) → 确认有效 session 后加载角色资料及商家数据 → 进入商家端。验证码错误/过期不进入工作台。重发冷却 60 秒，服务端频控仍生效。验证码阶段清除密码，密码和验证码不保存到浏览器存储。取消后保留当前页内邮箱验证状态，刷新后可重新注册/重发。已注册用户使用原登录入口。

link 模式保留注册弹窗，提示打开最新邮件，返回点击“已验证，继续登录”；未验证时密码登录会被服务端拒绝。

## 启用前必须完成

1. 推荐使用自定义发信服务 SMTP，可保留 Supabase Free。准备发信地址、SMTP 主机、端口、用户名、密码或 API key；按服务商要求验证发信域名。密钥仅由用户填写到 Supabase SMTP Settings，不发在聊天中，不放到前端或 GitHub。服务商费用、免费额度和域名要求以其实际规则为准。
2. 最新项目 Authentication → Emails → SMTP Settings 配置完成后，编辑 Confirm sign up 模板。Subject 建议 `Eaztrans - Email verification code`；Body 使用 `supabase/templates/confirm-signup.html`，关键变量是 `{{ .Token }}`，而不是只发 `{{ .ConfirmationURL }}`。
3. 保持 Confirm email 启用。核对 Email OTP Expiration 和 OTP 长度，页面支持 6–10 位数字。不要关闭验证来绕开流程。
4. 用户用本人邮箱收信测试模板确实带数字。随后独立发布使用 `buildLatest({url,key,signupVerification:'otp',output:新目录})`。默认仍为 link，防止先上新界面却收不到验证码。
5. 用户从公网注册测试：数字码正确、错误/过期、重发、已有邮箱、取消/刷新、三语言、完成后会员号和商家角色、原有账号登录。服务商实际投递和真实收码验收尚未完成，不能用本地 mock 测试代替。

当前不需要数据库表结构迁移，不清理用户或订单。

官方参考：https://supabase.com/docs/reference/javascript/auth-verifyotp 、https://supabase.com/docs/guides/auth/auth-email-templates
