"use client";
/**
 * SectionReveal — shared scroll-entry reveal for landing sections.
 * Opacity 0→1, y 32→0 over 0.7s with the brand easing, triggered once.
 * Under prefers-reduced-motion, <MotionConfig reducedMotion="user"> (see
 * LandingMotionProvider) suppresses the transform; the opacity fade runs.
 */
import { motion } from "framer-motion";
import type { ReactNode } from "react";

export const LP_EASE = [0.22, 1, 0.36, 1] as const;

export default function SectionReveal({
  children,
  delay = 0,
  y = 32,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -90px 0px" }}
      transition={{ duration: 0.7, delay, ease: LP_EASE }}
    >
      {children}
    </motion.div>
  );
}
