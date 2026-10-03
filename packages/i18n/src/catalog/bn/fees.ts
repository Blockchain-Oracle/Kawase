import type { Catalog } from "../en/index";

export const fees: Catalog["fees"] = {
  actionsLeft: "~{{n}}টি কাজ বাকি",
  noneLeft: "ফির জন্য USDC নেই",
  explain: "Arc-এ নেটওয়ার্ক ফি USDC-তে দিতে হয়, তাই আপনার USDC দিয়ে আর কতবার পাঠাতে পারবেন তা এটি। শেষ হয়ে গেলে USDC ও EURC পাঠানোর ফি Kawase দেয়।",
  cardTitle: "ফি",
  perTransfer: "একবার পাঠাতে খরচ প্রায় {{amount}}",
  relayer: "আপনার ওয়ালেট ফি দিতে না পারলে USDC ও EURC পাঠানোর ফি Kawase দেয়।",
  loading: "ফি রিজার্ভ দেখা হচ্ছে…",
};
