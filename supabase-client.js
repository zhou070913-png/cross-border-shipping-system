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
    anonKey: ''
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
    myOrders,
    orderTracking,
    createOrder,
    confirmOrderFee,
    recordOrderPayment
  };
})(window);
