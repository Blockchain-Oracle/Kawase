// Spike 08: one card spec, rendered by a native twin (RNR + Uniwind) and a web twin (21st/shadcn DOM component).
// In the real app this shape comes from @kawase/cards (zod) and arrives over the chat stream.
export type TransferReceiptSpec = {
  kind: 'transfer_receipt';
  title: string;
  network: 'mainnet' | 'testnet';
  networkLabel: string;
  rows: { label: string; value: string; emphasis?: boolean }[];
  action: { id: string; label: string };
};

export const DEMO_SPEC: TransferReceiptSpec = {
  kind: 'transfer_receipt',
  title: 'Sent 25 USDC to Amina',
  network: 'testnet',
  networkLabel: 'Arc Testnet',
  rows: [
    { label: 'To', value: 'Amina · 0x92Bf…c1A4' },
    { label: 'Network fee', value: '0.0021 USDC' },
    { label: 'Arrives', value: 'In about 1 second' },
    { label: 'Total', value: '25.0021 USDC', emphasis: true },
  ],
  action: { id: 'view_receipt', label: 'View receipt' },
};

export const DEMO_SPEC_AR: TransferReceiptSpec = {
  kind: 'transfer_receipt',
  title: 'تم إرسال 25 USDC إلى أمينة',
  network: 'testnet',
  networkLabel: 'شبكة Arc التجريبية',
  rows: [
    { label: 'إلى', value: 'أمينة · 0x92Bf…c1A4' },
    { label: 'رسوم الشبكة', value: '0.0021 USDC' },
    { label: 'الوصول', value: 'خلال ثانية تقريبًا' },
    { label: 'الإجمالي', value: '25.0021 USDC', emphasis: true },
  ],
  action: { id: 'view_receipt', label: 'عرض الإيصال' },
};
