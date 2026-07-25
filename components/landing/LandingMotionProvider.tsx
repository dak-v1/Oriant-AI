"use client";
/**
 * LandingMotionProvider — wraps the landing page in framer-motion's
 * <MotionConfig reducedMotion="user"> so prefers-reduced-motion visitors
 * get transform animations suppressed (opacity fades still run) without
 * any render-tree branching, keeping server and client HTML identical.
 */
import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

export default function LandingMotionProvider({
  children,
}: {
  children: ReactNode;
}) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
