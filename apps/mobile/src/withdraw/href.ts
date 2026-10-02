// The Withdraw route's query for a plan input, shared by the chat card, Home and token pages (app/(app)/withdraw.tsx
// reads it back).
import type { WithdrawAssetInput } from "@kawase/api-client";

type HrefInput = {
  assets?: WithdrawAssetInput[] | undefined;
  everything?: boolean | undefined;
  place?: string | null | undefined;
  exchange?: string | null | undefined;
  chain?: string | null | undefined;
  address?: string | null | undefined;
};

export function withdrawHref(input: HrefInput) {
  const params: Record<string, string> = {};
  if (input.assets?.length) params.assets = input.assets.map((entry) => [entry.asset, entry.amount ?? "max", entry.as ?? ""].join(":")).join(",");
  if (input.everything) params.everything = "1";
  if (input.place) params.place = input.place;
  if (input.exchange) params.exchange = input.exchange;
  if (input.chain) params.chain = input.chain;
  if (input.address) params.address = input.address;
  return { pathname: "/withdraw" as const, params };
}
