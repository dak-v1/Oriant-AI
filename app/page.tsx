import "./landing.css";
import SmoothScroll from "@/components/landing/SmoothScroll";
import LandingMotionProvider from "@/components/landing/LandingMotionProvider";
import LandingNavbar from "@/components/landing/LandingNavbar";
import HeroSection from "@/components/landing/HeroSection";
import VideoRevealSection from "@/components/landing/VideoRevealSection";
import ManifestoSection from "@/components/landing/ManifestoSection";
import ProblemSolutionEditorial from "@/components/landing/ProblemSolutionEditorial";
import StageJourney from "@/components/landing/StageJourney";
import CapabilityComposition from "@/components/landing/CapabilityComposition";
import TriplePlatformMarquee from "@/components/landing/TriplePlatformMarquee";
import WorkflowShowcases from "@/components/landing/WorkflowShowcases";
import ApprovalsDark from "@/components/landing/ApprovalsDark";
import ImprovementLoop from "@/components/landing/ImprovementLoop";
import TechStack from "@/components/landing/TechStack";
import FAQSection from "@/components/landing/FAQSection";
import FinalCTA from "@/components/landing/FinalCTA";
import LandingFooter from "@/components/landing/LandingFooter";

export default function Page() {
  return (
    <div className="lp">
      <SmoothScroll />
      <LandingMotionProvider>
        <LandingNavbar />
        <main id="top">
          <HeroSection />
          <VideoRevealSection />
          <ManifestoSection />
          <ProblemSolutionEditorial />
          <StageJourney />
          <CapabilityComposition />
          <TriplePlatformMarquee />
          <WorkflowShowcases />
          <ApprovalsDark />
          <ImprovementLoop />
          <TechStack />
          <FAQSection />
          <FinalCTA />
        </main>
        <LandingFooter />
      </LandingMotionProvider>
    </div>
  );
}
