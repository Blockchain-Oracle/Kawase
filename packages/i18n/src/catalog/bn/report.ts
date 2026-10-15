import type { Catalog } from "../en/index";

export const report: Catalog["report"] = {
  title: "এই সপ্তাহ",
  pnl: "এই সপ্তাহের লাভ-ক্ষতি",
  loading: "আপনার সপ্তাহ গোছানো হচ্ছে…",
  in: "এসেছে ({{count}})",
  out: "গেছে ({{count}})",
  swaps: "{{count}}টি সোয়াপ",
  bridges: "অন্য চেইনে {{count}}টি ট্রান্সফার",
  earn: "সঞ্চয়ে {{count}}টি লেনদেন",
  services: "{{count}}টি সেবায় {{amount}}",
  automations: "অটোমেশন: {{ran}}টি চলেছে, {{skipped}}টি বাদ গেছে",
  partial: "এই সপ্তাহের শুধু সাম্প্রতিক অংশটুকু পড়া গেছে।",
};
