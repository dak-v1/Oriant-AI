"use client";
/**
 * /app/workspace/approvals — Approval Inbox + compact Automation Calendar
 * (spec §18, §18.1). Thin route; the experience lives in
 * components/mock/approvals/ApprovalsScreen.
 *
 * The screen reads the ?focus=<approvalId> deep link (C-02) with
 * useSearchParams, so it renders inside a Suspense boundary.
 */
import { Suspense } from "react";
import ApprovalsScreen from "@/components/mock/approvals/ApprovalsScreen";

export default function ApprovalsPage() {
  return (
    <Suspense fallback={null}>
      <ApprovalsScreen />
    </Suspense>
  );
}
