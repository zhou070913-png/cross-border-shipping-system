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
