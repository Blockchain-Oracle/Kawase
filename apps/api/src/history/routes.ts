// Looking back: `/history/why/:tx`, `/history/export`, `/history/report`; and Data & privacy under `/privacy`.
import { Hono } from "hono";
import { z } from "zod";

import { REPORT_DAYS, TRANSCRIPT_RETENTION_CHOICES } from "@kawase/config";

import { requireAccount } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { ExportLinks } from "./export-link";
import type { PrivacyService } from "./privacy";
import type { HistoryService } from "./service";

const network = z.enum(["mainnet", "testnet"]);
const exportSchema = z.object({ network, month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), format: z.enum(["csv", "beancount"]) });
const REPORT_DAYS_MAX = 31;
const reportSchema = z.object({ network, days: z.coerce.number().int().min(1).max(REPORT_DAYS_MAX).default(REPORT_DAYS) });
const retentionSchema = z.object({
  transcriptRetentionDays: z.union([z.null(), z.number().int().refine((days) => (TRANSCRIPT_RETENTION_CHOICES as readonly number[]).includes(days))]),
});

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

export function historyRoutes(history: HistoryService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireAccount);

  app.get("/why/:tx", async (c) => {
    const input = await parse(z.object({ network, tx: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }), { network: c.req.query("network") ?? c.get("user")!.activeNetwork, tx: c.req.param("tx") });
    return c.json({ why: await history.why(c.get("user")!, input.network, input.tx) });
  });

  app.get("/export", async (c) => {
    const input = await parse(exportSchema, { network: c.req.query("network"), month: c.req.query("month"), format: c.req.query("format") ?? "csv" });
    const file = await history.export(c.get("user")!, input.network, input.month, input.format);
    return c.body(file.body, HTTP.ok, {
      "content-type": file.contentType,
      "content-disposition": `attachment; filename="${file.filename}"`,
      "x-kawase-complete": String(file.complete),
    });
  });

  app.get("/report", async (c) => {
    const input = await parse(reportSchema, { network: c.req.query("network") ?? c.get("user")!.activeNetwork, days: c.req.query("days") });
    return c.json({ report: await history.report(c.get("user")!, input.network, input.days) });
  });

  return app;
}

/** `/files/export/:token`: the file a chat export link points at (no session: the signed link is the permission). */
export function exportFileRoutes(history: HistoryService, links: ExportLinks) {
  const app = new Hono<AppEnv>();
  app.get("/:token", async (c) => {
    const claims = links.verify(c.req.param("token"));
    if (!claims) throw problem(HTTP.notFound, "not_found", "this link has expired; ask Kawase for a new one");
    const file = await history.export({ id: claims.sub }, claims.network, claims.month, claims.format);
    return c.body(file.body, HTTP.ok, {
      "content-type": file.contentType,
      "content-disposition": `attachment; filename="${file.filename}"`,
      "cache-control": "private, no-store",
      "x-kawase-complete": String(file.complete),
    });
  });
  return app;
}

export function privacyRoutes(privacy: PrivacyService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireAccount);
  app.get("/", async (c) => c.json(await privacy.settings(c.get("userId")!)));
  app.patch("/", async (c) => {
    const input = await parse(retentionSchema, await c.req.json());
    return c.json(await privacy.setRetention(c.get("user")!, input.transcriptRetentionDays));
  });
  app.delete("/transcripts", async (c) => c.json(await privacy.deleteAll(c.get("user")!)));
  app.get("/transcripts/export", async (c) =>
    c.body(await privacy.exportText(c.get("user")!), HTTP.ok, {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="kawase-conversations.txt"`,
    }),
  );
  return app;
}
