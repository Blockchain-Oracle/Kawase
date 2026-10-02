// Sends a failure the person hit to the api's log (`POST /client-events`), so failures on TestFlight and store
// builds can be read without the phone. Fire and forget: a report never delays or breaks what the person is doing.
import * as Application from "expo-application";
import { Platform } from "react-native";

import { CLIENT_EVENT_LIMITS, redactDiagnostic, type ClientEvent } from "@kawase/api-client";

import { api } from "./api";

type Report = Pick<ClientEvent, "stage" | "category" | "code" | "message" | "attemptId">;

export function reportClientEvent(report: Report): void {
  const event: ClientEvent = {
    stage: report.stage,
    outcome: "failed",
    category: report.category,
    platform: Platform.OS,
    ...(report.code ? { code: report.code.slice(0, CLIENT_EVENT_LIMITS.fieldMax) } : {}),
    ...(report.message ? { message: redactDiagnostic(report.message) } : {}),
    ...(report.attemptId ? { attemptId: report.attemptId } : {}),
    ...(Application.nativeApplicationVersion ? { appVersion: Application.nativeApplicationVersion } : {}),
    ...(Application.nativeBuildVersion ? { buildNumber: Application.nativeBuildVersion } : {}),
  };
  void api.clientEvents.report(event).catch(() => undefined);
}
