/* Password registration with server-verified email codes. Link mode remains usable until SMTP is configured. */
'use strict';
const registration={email:'',sent:false,deadlines:new Map(),timer:null};
const registrationText=(zh,id,en)=>{enLocale[zh]=en;extraIndonesian[zh]=id;return uiText(zh,id,en)};
const registrationOtp=()=>window.MospaceSupabase.registrationVerificationMode?.()==='otp';
function registrationMessage(zh,id,en){toast(registrationText(zh,id,en),6500)}
function registrationError(error){
 const code=error?.code||'',message=error?.message||'';
 if(code==='otp_expired'||/expired|invalid.*token|token.*invalid/i.test(message))return registrationText('验证码无效或已过期，请检查最新邮件或重新获取。','Kode tidak valid atau kedaluwarsa. Periksa email terbaru atau kirim ulang.','The code is invalid or expired. Check your latest email or request another code.');
 if(/rate|over_email_send_rate_limit|over_request_rate_limit/.test(code)||error?.status===429)return registrationText('发送或验证过于频繁，请稍后重试。','Terlalu banyak permintaan. Coba lagi nanti.','Too many requests. Please try again later.');
 if(code==='email_not_confirmed')return registrationText('邮箱尚未验证，请先完成邮件验证。','Email belum diverifikasi. Verifikasi email terlebih dahulu.','Your email is not verified yet. Please verify it first.');
 if(code==='user_already_exists'||/already registered/i.test(message))return registrationText('该邮箱已注册，请返回登录；未验证的账号可重新发送验证邮件。','Email sudah terdaftar. Masuk atau kirim ulang email verifikasi.','This email is already registered. Sign in or resend the verification email.');
 return registrationText('操作未完成，请检查网络后重试。','Permintaan belum selesai. Periksa koneksi dan coba lagi.','The request could not be completed. Check your connection and try again.');
}
function registrationTick(){
 clearTimeout(registration.timer);
 if(state.auth.mode!=='signup'||$('#authModal').hidden)return;
 const button=$('#authResend'),email=$('#authIdentifier').value.trim().toLowerCase();
 const left=Math.max(0,Math.ceil(((registration.deadlines.get(email)||0)-Date.now())/1000));
 button.disabled=authFlow.busy||left>0;
 button.textContent=left?registrationText(`${left} 秒后重发`,`${left} dtk lagi`,`Resend in ${left}s`):registrationText('重新发送','Kirim ulang','Resend');
 if(left)registration.timer=setTimeout(registrationTick,1000);
}
const registrationBaseUpdate=updateAuthMode;
updateAuthMode=function(){
 registrationBaseUpdate();
 const signup=state.auth.mode==='signup',otp=registrationOtp();
 if(!signup){registration.sent=false;registration.email='';$('#authCode').value='';clearTimeout(registration.timer)}
 const sent=signup&&registration.sent;
 $('#authCodeField').hidden=!sent||!otp;
 $('#authCodeLabel').textContent=registrationText('邮箱验证码','Kode verifikasi email','Email verification code');
 $('#authCode').placeholder=registrationText('输入邮件中的数字验证码','Masukkan kode angka dari email','Enter the numeric code from your email');
 $('#authIdentifier').readOnly=sent;
 $('#authPassword').closest('.field').hidden=sent&&otp;
 $('#authPassword').autocomplete=signup?'new-password':'current-password';
 if(signup){
  $('#authHint').textContent=registrationText('注册商家账号，验证邮箱后即可使用；内部账号由平台分配。','Daftar akun pelanggan dan verifikasi email. Akun staf dibuat oleh platform.','Create a customer account and verify your email. Staff accounts are assigned by the platform.');
  $('#authSubmit').textContent=sent?(otp?registrationText('验证并进入','Verifikasi dan masuk','Verify and enter'):registrationText('已验证，继续登录','Sudah verifikasi, masuk','I verified my email — sign in')):(otp?registrationText('获取验证码','Kirim kode','Send verification code'):registrationText('发送验证邮件','Kirim email verifikasi','Send verification email'));
  $('#authSignupNote').textContent=sent?(otp?registrationText('验证码已发送。请检查收件箱及垃圾箱；验证后系统会生成会员号。','Kode terkirim. Periksa kotak masuk dan spam. Nomor anggota tersedia setelah verifikasi.','Code sent. Check your inbox and spam folder. Your member number is available after verification.'):registrationText('请打开最新邮件完成验证，再回到这里继续登录。若旧邮件打不开，请重新发送。','Buka email terbaru untuk verifikasi, lalu kembali untuk masuk. Kirim ulang jika tautan lama tidak terbuka.','Open the latest email to verify, then return here to sign in. Resend if an older link does not open.')):registrationText('填写邮箱和至少 6 位密码；通过邮箱验证后可用邮箱或会员号登录。','Masukkan email dan kata sandi minimal 6 karakter. Setelah verifikasi, masuk dengan email atau nomor anggota.','Enter your email and a password of at least 6 characters. Once verified, sign in with email or member number.');
  $('#authMode').textContent=registrationText('返回登录','Kembali masuk','Back to sign in');
 }
 $('#authResend').hidden=!sent;registrationTick();
};
async function resendRegistration(){
 if(authFlow.busy)return;
 const email=registration.email||$('#authIdentifier').value.trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return;
 if((registration.deadlines.get(email)||0)>Date.now())return;
 setAuthBusy(true);
 try{await window.MospaceSupabase.resendConfirmation(email);registration.deadlines.set(email,Date.now()+60000);$('#authCode').value='';registrationMessage('验证邮件已重新发送，请使用最新邮件。','Email verifikasi dikirim ulang. Gunakan email terbaru.','Verification email resent. Use the most recent email.')}catch(error){toast(registrationError(error),6500)}
 finally{setAuthBusy(false);updateAuthMode()}
}
const registrationBaseSubmit=submitAuth;
submitAuth=async function(){
 if(state.auth.mode!=='signup')return registrationBaseSubmit();
 if(authFlow.busy)return;
 const email=$('#authIdentifier').value.trim().toLowerCase(),password=$('#authPassword').value,otp=registrationOtp(),sent=registration.sent;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){registrationMessage('请输入有效邮箱。','Masukkan email yang valid.','Enter a valid email address.');return}
 if((!sent||!otp)&&password.length<6){registrationMessage('请输入至少 6 位密码。','Masukkan kata sandi minimal 6 karakter.','Enter a password of at least 6 characters.');return}
 const token=$('#authCode').value.trim();
 if(sent&&otp&&!/^\d{6,10}$/.test(token)){registrationMessage('请输入邮件中的完整数字验证码。','Masukkan kode angka lengkap dari email.','Enter the complete numeric verification code from your email.');return}
 if(!sent&&(registration.deadlines.get(email)||0)>Date.now())return;
 setAuthBusy(true);let entered=false;
 $('#authSubmit').textContent=registrationText('正在处理…','Memproses…','Processing…');
 try{
  if(!sent){
   const result=await window.MospaceSupabase.signUp(email,password);
   if(!result.session){
    registration.email=email;registration.sent=true;registration.deadlines.set(email,Date.now()+60000);$('#authCode').value='';
    if(otp)$('#authPassword').value='';
    if(Array.isArray(result.user?.identities)&&!result.user.identities.length)registrationMessage('请检查邮箱；如已注册，请返回登录。未验证可稍后重新发送。','Periksa email. Jika sudah terdaftar, masuk. Anda dapat mengirim ulang nanti.','Check your email. If already registered, sign in. You can resend verification shortly.');
    return;
   }
  }else if(otp){
   const result=await window.MospaceSupabase.verifyRegistrationCode(registration.email,token);
   if(!result?.session)throw Error('Missing verified session');
  }else await window.MospaceSupabase.signInWithIdentifier(registration.email,password);
  entered=await continuePendingNavigation();
  if(!entered){
   try{await window.MospaceSupabase.signOut()}catch(e){}
   state.auth.user=null;state.auth.profile=null;state.auth.role=null;state.role='merchant';throw Error('Account unavailable');
  }
  $('#authPassword').value='';$('#authCode').value='';registration.sent=false;registration.email='';state.auth.mode='login';closeAuth();
 }catch(error){toast(registrationError(error),6500)}
 finally{setAuthBusy(false);updateAuthMode();if(entered){render();registrationMessage('邮箱已验证，已进入商家端。','Email terverifikasi. Dasbor pelanggan siap.','Email verified. You are now signed in.')}}
};
const registrationBaseBind=bind;
bind=function(){registrationBaseBind();$('#authResend').onclick=resendRegistration};
const registrationBaseClose=closeAuth;
closeAuth=function(){registrationBaseClose();clearTimeout(registration.timer);$('#authPassword').value='';$('#authCode').value=''};

// Capture only confirmation metadata before the SDK consumes the URL fragment.
// Access tokens stay with Supabase; never copy them into UI, logs or storage.
function registrationReturnInfo(location){
 const fragment=new URLSearchParams(location?.hash?.replace(/^#/,'')||'');
 const query=new URLSearchParams(location?.search||'');
 const error=fragment.get('error_code')||fragment.get('error')||query.get('error_code')||query.get('error');
 return {pending:fragment.get('type')==='signup'||!!error,error:error||null};
}
const registrationReturn={...registrationReturnInfo(window.location),result:null};
function showRegistrationResult(){
 $('#registrationResult')?.remove();
 if(!registrationReturn.result)return;
 const success=registrationReturn.result==='success';
 const title=success?registrationText('邮箱验证成功，注册已完成','Email terverifikasi, pendaftaran selesai','Email verified — registration complete'):registrationText('验证链接未完成确认','Tautan verifikasi belum dikonfirmasi','Email confirmation was not completed');
 const detail=success?registrationText('你已进入商家端，之后可用邮箱或会员号和密码登录。','Anda telah masuk ke dasbor pelanggan. Selanjutnya masuk dengan email atau nomor anggota dan kata sandi.','You are signed in to your customer workspace. Next time, use your email or member number and password.'):registrationReturn.result==='expired'?registrationText('链接已失效或已使用。若之前已确认，可直接登录；尚未验证请重新发送邮件。','Tautan kedaluwarsa atau sudah digunakan. Masuk jika sudah diverifikasi, atau kirim ulang email.','This link has expired or was already used. Sign in if already verified; otherwise resend the email.'):registrationText('暂时无法确认邮箱状态，请检查网络后登录；尚未验证可重新发送邮件。','Status email belum dapat dikonfirmasi. Periksa koneksi dan masuk, atau kirim ulang jika belum diverifikasi.','We could not confirm your email status. Check your connection and sign in, or resend if not yet verified.');
 const panel=document.createElement('section');panel.id='registrationResult';panel.className='notice';panel.setAttribute('role','status');panel.style.cssText='margin:16px 20px;display:flex;align-items:center;gap:12px';
 panel.innerHTML=`<div><strong>${esc(title)}</strong><p>${esc(detail)}</p></div><button type="button" class="btn ghost small" style="margin-left:auto">${esc(registrationText('关闭','Tutup','Dismiss'))}</button>`;
 const target=$('#content');if(!target)return;target.prepend(panel);panel.querySelector('button').onclick=()=>{registrationReturn.result=null;panel.remove()};
}
const registrationBaseRender=render;
render=function(){registrationBaseRender();showRegistrationResult()};
const registrationBaseSync=syncAuth;
syncAuth=async function(options){
 const handleReturn=registrationReturn.pending;registrationReturn.pending=false;
 const loaded=await registrationBaseSync(options);
 if(handleReturn){
  registrationReturn.result=registrationReturn.error?(/expired|access_denied/.test(registrationReturn.error)?'expired':'failed'):loaded&&state.auth.user?.email_confirmed_at?'success':'failed';
  showRegistrationResult();
  // Remove consumed credentials/errors from the address bar without persisting them.
  if(window.history?.replaceState&&window.location)window.history.replaceState(null,'',window.location.pathname+window.location.search);
 }
 return loaded;
};
