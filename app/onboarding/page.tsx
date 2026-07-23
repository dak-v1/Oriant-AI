import { redirect } from "next/navigation";

/**
 * Legacy holding-page route. The guided discovery experience now lives in the
 * interactive product mock at /app/onboarding (master spec §1); old links and
 * bookmarks land there.
 */
export default function OnboardingRedirect() {
  redirect("/app/onboarding");
}
