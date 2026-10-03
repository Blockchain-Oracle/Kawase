import type { Catalog } from "../en/index";

export const protect: Catalog["protect"] = {
  title: "جني الأرباح ووقف الخسارة",
  takeProfit: "جني الأرباح",
  stopLoss: "وقف الخسارة",
  takeProfitHint: "أغلق الكل عندما يبلغ {{market}}",
  stopLossHint: "أغلق الكل عندما يصل {{market}} إلى",
  off: "متوقف",
  save: "حفظ",
  saved: "تم الحفظ. تراقبها Kawase من أجلك.",
  needsGrant:
    "خطوة أخيرة: اسمح لـ Kawase بإغلاق هذا المركز نيابةً عنك أثناء غيابك. لا يمكنها سوى إغلاقه، إلى محفظتك أنت.",
  turnOn: "تفعيل الحماية",
  turningOn: "جارٍ التفعيل…",
  grantPrompt: "اسمح لـ Kawase بإغلاق المراكز نيابةً عنك",
  onUntil: "الحماية مفعّلة حتى {{date}}",
  turnOff: "إيقاف",
  armed: "قيد المراقبة",
  closing: "جارٍ الإغلاق…",
  unavailable: "تعذّر الإغلاق بسعر عادل",
  liquidationNote: "التصفية عند {{price}}: يجب أن يأتي وقف الخسارة قبلها.",
  route: "يُغلق عبر Uniswap على Arc، ويُدفع إلى محفظتك.",
  take_profit_wrong_side: "يأتي جني الأرباح بعد سعر اليوم: أعلى منه لمركز الشراء، وأدنى منه لمركز البيع.",
  stop_loss_wrong_side: "يأتي وقف الخسارة قبل سعر اليوم: أدنى منه لمركز الشراء، وأعلى منه لمركز البيع.",
  stop_loss_past_liquidation: "ضع وقف الخسارة قبل التصفية.",
  protection_unavailable: "لا يستطيع Uniswap على Arc إغلاق مركز بهذا الحجم الآن، لذا لا تَعِد به Kawase.",
  failed: "تعذّر الحفظ. حاول مرة أخرى.",
};
