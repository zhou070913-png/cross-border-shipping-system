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

  async function signIn(email, password) {
    const instance = await requireClient();
    const { data, error } = await instance.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signUp(email, password, companyName) {
    const instance = await requireClient();
    const { data, error } = await instance.auth.signUp({
      email,
      password,
      options: { data: { full_name: companyName || '跨境商家' } }
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

  async function signOut() {
    const instance = await requireClient();
    const { error } = await instance.auth.signOut();
    if (error) throw error;
  }

  async function myOrders() {
    const instance = await requireClient();
    const { data, error } = await instance
      .from('orders')
      .select('*, fees(*), payments(*), order_parcels(parcel_id, parcels(*))')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
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
    const user = await currentUser();
    const { data: warehouse, error: warehouseError } = await instance
      .from('warehouses')
      .select('*')
      .eq('code', 'SZ-LG-01')
      .single();
    if (warehouseError) throw warehouseError;

    const orderNo = 'MO' + new Date().toISOString().slice(0, 10).replace(/-/g, '') +
      Math.random().toString(36).slice(2, 8).toUpperCase();
    const orderPayload = {
      order_no: orderNo,
      merchant_id: user.id,
      warehouse_id: warehouse.id,
      status: 'submitted',
      destination_country: payload.destinationCountry || '印度尼西亚',
      destination_city: payload.destinationCity || '雅加达',
      destination_address: payload.destinationAddress,
      recipient_name: payload.recipientName,
      recipient_phone: payload.recipientPhone,
      route_code: payload.routeCode || 'ID-AIR',
      route_name: payload.routeName || '印尼空运专线',
      origin_warehouse_name: warehouse.name,
      origin_warehouse_address: warehouse.address,
      estimated_weight_kg: payload.estimatedWeightKg || 4.2,
      parcel_count: (payload.parcels || []).length,
      merchant_note: payload.merchantNote || null,
      submitted_at: new Date().toISOString()
    };
    const { data: order, error: orderError } = await instance
      .from('orders').insert(orderPayload).select().single();
    if (orderError) throw orderError;

    const parcels = payload.parcels || [];
    for (const parcel of parcels) {
      const { data: row, error: parcelError } = await instance.from('parcels').insert({
        parcel_no: parcel.no,
        merchant_id: user.id,
        warehouse_id: warehouse.id,
        status: 'pre_advised',
        tracking_no: parcel.no,
        item_name: parcel.name || '未填写品名'
      }).select().single();
      if (parcelError) throw parcelError;
      const { error: linkError } = await instance.from('order_parcels').insert({
        order_id: order.id,
        parcel_id: row.id
      });
      if (linkError) throw linkError;
    }
    await instance.from('fees').insert({
      order_id: order.id,
      estimated_shipping_fee: payload.estimatedFee || 268,
      estimated_total: payload.estimatedFee || 268
    });
    return order;
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
    const instance = await requireClient();
    const { data, error } = await instance.rpc('record_order_payment', {
      p_order_id: orderId,
      p_payment_method: paymentMethod,
      p_provider: provider || null,
      p_provider_transaction_id: providerTransactionId || null
    });
    if (error) throw error;
    return data;
  }

  global.MospaceSupabase = {
    config,
    isConfigured,
    getClient,
    currentUser,
    signIn,
    signUp,
    resendConfirmation,
    signOut,
    myOrders,
    orderTracking,
    createOrder,
    createMerchantOrder,
    confirmOrderFee,
    recordOrderPayment
  };
})(window);
