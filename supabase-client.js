/*
 * Mospace Supabase 浏览器端适配层
 *
 * 当前 GitHub Pages Demo 默认使用内存演示数据。配置公开 anon key 后，
 * 可以从页面脚本调用 window.MospaceSupabase 的方法逐步切换到真实数据。
 * anon key 不是数据库密码；不要把 service_role key 放到浏览器或 GitHub。
 */
(function (global) {
  const config = {
    url: 'https://bdxqphmzwojamyuboqmz.supabase.co',
    anonKey: 'sb_publishable_dyUMy5vmLknsuJIAXmzSYA_0OIc1nb4'
  };
  let client = null;

  function isConfigured() {
    return Boolean(config.url && config.anonKey && global.supabase && global.supabase.createClient);
  }

  function getClient() {
    if (!isConfigured()) return null;
    if (!client) client = global.supabase.createClient(config.url, config.anonKey);
    return client;
  }

  async function requireClient() {
    const instance = getClient();
    if (!instance) throw new Error('Supabase 尚未配置 anon key');
    return instance;
  }

  async function currentUser() {
    const instance = await requireClient();
    const { data, error } = await instance.auth.getUser();
    if (error) throw error;
    return data.user;
  }

  async function currentProfile() {
    const instance = await requireClient();
    const user = await currentUser();
    if (!user) return null;
    const { data, error } = await instance
      .from('profiles')
      .select('id, member_no, role, company_name, display_name, phone, warehouse_id, is_active')
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function signIn(email, password) {
    const instance = await requireClient();
    const { data, error } = await instance.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function resolveLoginEmail(memberNo) {
    const instance = await requireClient();
    const { data, error } = await instance.rpc('resolve_login_email', {
      p_member_no: memberNo
    });
    if (error) throw error;
    return data;
  }

  async function memberNoByEmail(email) {
    const instance = await requireClient();
    const { data, error } = await instance.rpc('member_no_by_email', {
      p_email: String(email || '').trim()
    });
    if (error) throw error;
    return data;
  }

  async function signInByMemberNo(memberNo, password) {
    const normalized = String(memberNo || '').trim().toUpperCase();
    if (!normalized) throw new Error('请输入会员号');
    const email = await resolveLoginEmail(normalized);
    if (!email) throw new Error('会员号不存在或账号已停用');
    return signIn(email, password);
  }

  async function signInWithIdentifier(identifier, password) {
    const value = String(identifier || '').trim();
    if (!value) throw new Error('请输入会员号或邮箱');
    return value.includes('@') ? signIn(value, password) : signInByMemberNo(value, password);
  }

  async function signUp(email, password) {
    const instance = await requireClient();
    const { data, error } = await instance.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: global.location.origin + global.location.pathname, data: { full_name: '跨境商家' } }
    });
    if (error) throw error;
    return data;
  }

  async function resendConfirmation(email) {
    const instance = await requireClient();
    const { error } = await instance.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname }
    });
    if (error) throw error;
  }

  function registrationVerificationMode() {
    // Enable OTP only after the project's confirmation email actually contains {{ .Token }}.
    return config.signupVerification === 'otp' ? 'otp' : 'link';
  }

  async function verifyRegistrationCode(email, token) {
    const instance = await requireClient();
    const { data, error } = await instance.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const instance = await requireClient();
    const { error } = await instance.auth.signOut();
    if (error) throw error;
  }

  async function myOrders() {
    const instance = await requireClient();
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await instance.from('orders')
        .select('*, fees(*), payments(*), order_parcels(parcel_id, parcels(*))')
        .order('created_at', { ascending: false }).order('id', { ascending: false })
        .range(offset, offset + 499);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 500) return rows;
    }
  }

  async function orderTracking(orderId) {
    const instance = await requireClient();
    const { data, error } = await instance
      .from('tracking_events')
      .select('*')
      .eq('order_id', orderId)
      .order('occurred_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function createOrder(payload) {
    const instance = await requireClient();
    const { data, error } = await instance.from('orders').insert(payload).select().single();
    if (error) throw error;
    return data;
  }

  async function createMerchantOrder(payload) {
    const instance = await requireClient();
    const { data, error } = await instance.rpc('create_merchant_order', {
      p_destination_country: payload.destinationCountry || '印度尼西亚',
      p_destination_city: payload.destinationCity || '雅加达',
      p_destination_address: payload.destinationAddress,
      p_recipient_name: payload.recipientName,
      p_recipient_phone: payload.recipientPhone,
      p_parcels: payload.parcels || [],
      p_estimated_fee: payload.estimatedFee || 268
    });
    if (error) throw error;
    return data;
  }

  async function confirmOrderFee(orderId, actualWeightKg, volumeWeightKg, shippingFee, handlingFee) {
    const instance = await requireClient();
    const { data, error } = await instance.rpc('confirm_order_fee', {
      p_order_id: orderId,
      p_actual_weight_kg: actualWeightKg,
      p_volume_weight_kg: volumeWeightKg,
      p_shipping_fee: shippingFee,
      p_handling_fee: handlingFee
    });
    if (error) throw error;
    return data;
  }

  async function recordOrderPayment(orderId, paymentMethod, provider, providerTransactionId) {
    throw new Error('请提交付款凭证，运营审核通过后才确认付款成功');
  }

  async function warehouseReceiveOrder(orderId) {
    const instance = await requireClient();
    const { data, error } = await instance.rpc('warehouse_receive_order', {
      p_order_id: orderId
    });
    if (error) throw error;
    return data;
  }

  async function warehouseConfirmMeasurements(orderId, measurements) {
    const instance = await requireClient();
    const { data, error } = await instance.rpc('warehouse_confirm_measurements', {
      p_order_id: orderId,
      p_measurements: measurements
    });
    if (error) throw error;
    return data;
  }

  async function warehousePackOrder(orderId, boxNo, note) {
    const instance = await requireClient();
    const { data, error } = await instance.rpc('warehouse_pack_order', {
      p_order_id: orderId,
      p_box_no: boxNo || null,
      p_package_note: note || null
    });
    if (error) throw error;
    return data;
  }

  async function warehouseShipOrder(orderId, carrier, trackingNo) {
    const instance = await requireClient();
    const { data, error } = await instance.rpc('warehouse_ship_order', {
      p_order_id: orderId,
      p_carrier: carrier,
      p_tracking_no: trackingNo
    });
    if (error) throw error;
    return data;
  }

  async function warehouseFindOrderByTracking(trackingNo) {
    const instance = await requireClient();
    const value = String(trackingNo || '').trim();
    if (!value) throw new Error('请输入快递单号');
    const { data: parcel, error: parcelError } = await instance
      .from('parcels').select('id, parcel_no, tracking_no, item_name, status, actual_weight_kg, length_cm, width_cm, height_cm').eq('tracking_no', value).maybeSingle();
    if (parcelError) throw parcelError;
    if (!parcel) throw new Error('未找到匹配的预报包裹');
    const { data: relations, error: relationError } = await instance.from('order_parcels').select('order_id').eq('parcel_id', parcel.id);
    if (relationError) throw relationError;
    if (!relations?.length) return {parcel,order:null};
    if (relations.length > 1) throw new Error('此包裹关联多笔历史订单，请在仓库工作台按订单号核对，联系运营处理重复关联');
    const relation=relations[0];
    const { data: order, error: orderError } = await instance.from('orders').select('*, fees(*), payments(*), order_parcels(parcel_id, parcels(*))').eq('id', relation.order_id).single();
    if (orderError) throw orderError;
    return { parcel, order };
  }

  async function listAddresses() {
    const instance = await requireClient();
    const { data, error } = await instance.from('merchant_addresses').select('*').order('is_default', { ascending: false }).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function saveAddress(address) {
    const instance = await requireClient();
    const payload = { ...address };
    if (payload.id) {
      const { data, error } = await instance.from('merchant_addresses').update(payload).eq('id', payload.id).select().single();
      if (error) throw error;
      return data;
    }
    const { data: userData, error: userError } = await instance.auth.getUser();
    if (userError) throw userError;
    payload.merchant_id = userData.user.id;
    const { data, error } = await instance.from('merchant_addresses').insert(payload).select().single();
    if (error) throw error;
    return data;
  }

  async function adminOrders() {
    return myOrders();
  }

  async function adminAuditLogs() {
    const instance = await requireClient();
    const { data, error } = await instance.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return data || [];
  }

  async function getRoutePricing(routeCode = 'ID-AIR') {
    const instance = await requireClient();
    const { data, error } = await instance.from('route_pricing').select('*').eq('route_code', routeCode).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function updateRoutePricing(payload) {
    const instance = await requireClient();
    const { data, error } = await instance.rpc('admin_update_route_pricing', {
      p_route_code: payload.routeCode,
      p_route_name: payload.routeName,
      p_first_weight_kg: Number(payload.firstWeightKg),
      p_first_price: Number(payload.firstPrice),
      p_additional_price_per_kg: Number(payload.additionalPricePerKg),
      p_volume_divisor: Number(payload.volumeDivisor),
      p_handling_fee: Number(payload.handlingFee),
      p_notes: payload.notes || null
    });
    if (error) throw error;
    return data;
  }

  global.MospaceSupabase = {
    config,
    isConfigured,
    getClient,
    currentUser,
    currentProfile,
    signIn,
    signInByMemberNo,
    signInWithIdentifier,
    memberNoByEmail,
    signUp,
    resendConfirmation,
    registrationVerificationMode,
    verifyRegistrationCode,
    signOut,
    myOrders,
    orderTracking,
    createOrder,
    createMerchantOrder,
    confirmOrderFee,
    recordOrderPayment,
    warehouseReceiveOrder,
    warehouseConfirmMeasurements,
    warehousePackOrder,
    warehouseShipOrder,
    warehouseFindOrderByTracking,
    listAddresses,
    saveAddress,
    adminOrders,
    adminAuditLogs,
    getRoutePricing,
    updateRoutePricing
  };
})(window);
