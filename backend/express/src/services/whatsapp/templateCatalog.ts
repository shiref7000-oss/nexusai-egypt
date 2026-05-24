/** Built-in template keys — merchants map these to approved Meta template names. */
export const WHATSAPP_TEMPLATE_CATALOG = [
  {
    key: 'cod_confirmation',
    label: 'COD order confirmation',
    description: 'Sent when a new COD order arrives. Customer confirms or cancels.',
    category: 'UTILITY',
    defaultMetaName: 'cod_order_confirmation',
    sampleBody:
      'مرحباً {{1}}، طلبك رقم {{2}} بمبلغ {{3}} ج.م. للتأكيد اكتب "تأكيد" أو "إلغاء".',
    variables: ['customer_name', 'order_id', 'cod_amount'],
    flow: 'cod',
  },
  {
    key: 'shipping_update',
    label: 'Shipping update',
    description: 'Notifies customer when order is shipped with tracking.',
    category: 'UTILITY',
    defaultMetaName: 'shipping_update',
    sampleBody: 'تم شحن طلبك {{1}}. رقم التتبع: {{2}}.',
    variables: ['order_id', 'tracking_number'],
    flow: 'shipping',
  },
  {
    key: 'failed_delivery',
    label: 'Failed delivery',
    description: 'Notifies customer when delivery attempt failed.',
    category: 'UTILITY',
    defaultMetaName: 'failed_delivery',
    sampleBody: 'تعذر تسليم طلبك {{1}}. سنتواصل معك لإعادة الجدولة.',
    variables: ['order_id'],
    flow: 'retention',
  },
] as const;

export type WhatsAppTemplateKey = (typeof WHATSAPP_TEMPLATE_CATALOG)[number]['key'];
