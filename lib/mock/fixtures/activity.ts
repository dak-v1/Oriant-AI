/**
 * lib/mock/fixtures/activity.ts — workspace activity feed, post-activation
 * burst and the mock WhatsApp notification preview (spec §17, §19.2).
 * ACTIVITY_FEED covers DEMO_TODAY, newest first; entries reference the same
 * approvals and calendar events as the other fixtures.
 */

import type { ActivityEvent } from "../types";
import { AGENT, AGENT_NAME } from "./ids";

/** Today's feed, newest first (16 entries, tone mix per §17). */
export const ACTIVITY_FEED: ActivityEvent[] = [
  {
    id: "act-01",
    at: "16:20",
    agentId: AGENT.finance,
    agentName: AGENT_NAME[AGENT.finance],
    team: "finance",
    message: "Payment received: Tan Heng Renovations settled INV-1163 ($380).",
    tone: "done",
  },
  {
    id: "act-02",
    at: "15:30",
    agentId: AGENT.marketing,
    agentName: AGENT_NAME[AGENT.marketing],
    team: "marketing",
    message: "Drafted August \"Monsoon-Ready Home\" campaign: headline, email and two social posts.",
    tone: "done",
  },
  {
    id: "act-03",
    at: "14:45",
    agentId: AGENT.admin,
    agentName: AGENT_NAME[AGENT.admin],
    team: "admin",
    message: "Technician double-booking found for Saturday. Jonathan Lim's reschedule needs your OK by 17:30.",
    tone: "alert",
  },
  {
    id: "act-04",
    at: "14:04",
    agentId: AGENT.finance,
    agentName: AGENT_NAME[AGENT.finance],
    team: "finance",
    message: "Payment reminders sent to 12 customers after your approval ($4,310 outstanding).",
    tone: "done",
  },
  {
    id: "act-05",
    at: "13:25",
    agentId: AGENT.finance,
    agentName: AGENT_NAME[AGENT.finance],
    team: "finance",
    message: "Reviewed the INV-1187 dispute and sent a $95 write-off request for your approval.",
    tone: "wait",
  },
  {
    id: "act-06",
    at: "12:10",
    agentId: AGENT.admin,
    agentName: AGENT_NAME[AGENT.admin],
    team: "admin",
    message: "Two customers asked to reschedule next week. Proposed new slots sent for confirmation.",
    tone: "done",
  },
  {
    id: "act-07",
    at: "11:30",
    agentId: AGENT.recovery,
    agentName: AGENT_NAME[AGENT.recovery],
    team: "customer_care",
    message: "Refund proposal for Daniel Tan ready: $180 exceeds your auto-approval limit.",
    tone: "wait",
  },
  {
    id: "act-08",
    at: "11:05",
    agentId: AGENT.admin,
    agentName: AGENT_NAME[AGENT.admin],
    team: "admin",
    message: "Drafted renewal quote for Rajesh Kumar ($756/year), queued for your review Monday.",
    tone: "wait",
  },
  {
    id: "act-09",
    at: "10:48",
    agentId: AGENT.marketing,
    agentName: AGENT_NAME[AGENT.marketing],
    team: "marketing",
    message: "Collected engagement stats for last week's posts: reach up 18% on the repaint photos.",
    tone: "info",
  },
  {
    id: "act-10",
    at: "10:20",
    agentId: AGENT.recovery,
    agentName: AGENT_NAME[AGENT.recovery],
    team: "customer_care",
    message: "Resolution plan for Mrs Wong drafted; it needs your decision by 12:00.",
    tone: "wait",
  },
  {
    id: "act-11",
    at: "09:42",
    agentId: AGENT.admin,
    agentName: AGENT_NAME[AGENT.admin],
    team: "customer_care",
    message: "Drafted reply to Ng Family Bakery's enquiry about quarterly pest checks.",
    tone: "done",
  },
  {
    id: "act-12",
    at: "09:15",
    agentId: AGENT.finance,
    agentName: AGENT_NAME[AGENT.finance],
    team: "finance",
    message: "Drafted Friday payment reminder batch (12 invoices), waiting for your approval.",
    tone: "wait",
  },
  {
    id: "act-13",
    at: "09:00",
    agentId: AGENT.finance,
    agentName: AGENT_NAME[AGENT.finance],
    team: "finance",
    message: "Weekly overdue invoice summary ready: 8 invoices, $4,310 outstanding, posted to Slack.",
    tone: "done",
  },
  {
    id: "act-14",
    at: "08:40",
    agentId: AGENT.recovery,
    agentName: AGENT_NAME[AGENT.recovery],
    team: "customer_care",
    message: "Flagged Mrs Wong's aircon complaint as high-value; gathering job history from three teams.",
    tone: "info",
  },
  {
    id: "act-15",
    at: "08:15",
    agentId: AGENT.admin,
    agentName: AGENT_NAME[AGENT.admin],
    team: "admin",
    message: "Confirmed 9 of today's appointments by WhatsApp. All customers replied.",
    tone: "done",
  },
  {
    id: "act-16",
    at: "08:02",
    agentId: AGENT.admin,
    agentName: AGENT_NAME[AGENT.admin],
    team: "customer_care",
    message: "Sorted 23 overnight messages from Gmail and WhatsApp into 6 job requests, 4 enquiries and 1 complaint.",
    tone: "done",
  },
];

/** Four entries that appear right after activation (spec §16 → §17 handoff). */
export const ACTIVATION_BURST: ActivityEvent[] = [
  {
    id: "act-burst-01",
    at: "09:00",
    agentId: AGENT.admin,
    agentName: AGENT_NAME[AGENT.admin],
    team: "admin",
    message: "Admin Operations Agent is active, reading Gmail and Google Calendar to pick up today's requests.",
    tone: "done",
  },
  {
    id: "act-burst-02",
    at: "09:00",
    agentId: AGENT.marketing,
    agentName: AGENT_NAME[AGENT.marketing],
    team: "marketing",
    message: "Marketing Agent is active, reviewing last month's posts to seed the first content plan.",
    tone: "info",
  },
  {
    id: "act-burst-03",
    at: "09:01",
    agentId: AGENT.finance,
    agentName: AGENT_NAME[AGENT.finance],
    team: "finance",
    message: "Finance Follow-up Agent is active, scanning QuickBooks for invoices overdue by 14+ days.",
    tone: "info",
  },
  {
    id: "act-burst-04",
    at: "09:02",
    agentId: AGENT.recovery,
    agentName: AGENT_NAME[AGENT.recovery],
    team: "customer_care",
    message: "Service Recovery Coordinator is active, watching all channels for high-value complaints.",
    tone: "info",
  },
];

/** Mock phone notification for APPROVAL.refund (§19.2 — clearly simulated, never a real send). */
export const WHATSAPP_PREVIEW: { title: string; body: string; time: string } = {
  title: "Oriant: approval needed",
  body: "Refund request: $180 to Daniel Tan for a missed plumbing appointment. Due today 14:30. Open Oriant to Review or Approve.",
  time: "11:30",
};
