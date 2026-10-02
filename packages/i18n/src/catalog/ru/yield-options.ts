import type { Catalog } from "../en/index";

export const yieldOptions: Catalog["yieldOptions"] = {
  title: "Где {{asset}} приносит доход",
  best: "Лучшее",
  outNow: "{{now}} можно вывести сейчас · объём {{size}}",
  poolSize: "Пул {{size}}",
  apy: "APY",
  apr: "APR в наградах",
  risk_blue_chip: "Надёжное кредитование",
  risk_curated: "Управляемое хранилище",
  risk_rwa_credit: "Кредит RWA",
  risk_advanced: "Для опытных",
  note_low_liquidity: "Сейчас можно вывести немного",
  note_small_for_amount: "Сейчас не сможет вернуть эту сумму",
  note_advanced: "Колебания цены могут оставить вас с меньшим (непостоянные потери)",
  advanced: "Для опытных",
  advancedBody:
    "Награды за ликвидность показаны для справки: чтобы их получать, нужно держать оба актива в пуле, где колебания цены могут оставить вас с меньшим. Kawase в них не вносит.",
  none: "Сейчас на Arc ничто не приносит доход на {{asset}}.",
  chooseHint: "Открывает внесение",
  moreWays: "Другие способы получать доход",
};
