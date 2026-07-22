import "./landing.css";
import LandingMotionProvider from "@/components/landing/LandingMotionProvider";
import LandingNavbar from "@/components/landing/LandingNavbar";
import HeroSection from "@/components/landing/HeroSection";
import IntegrationMarquee from "@/components/landing/IntegrationMarquee";
import ProductDemoVideo from "@/components/landing/ProductDemoVideo";
import ProblemSolutionSection from "@/components/landing/ProblemSolutionSection";
import JourneySection from "@/components/landing/JourneySection";
import FeatureBento from "@/components/landing/FeatureBento";
import ApprovalChannelsSection from "@/components/landing/ApprovalChannelsSection";
import LearningLoopSection from "@/components/landing/LearningLoopSection";
import IntegrationEcosystem from "@/components/landing/IntegrationEcosystem";
import FAQSection from "@/components/landing/FAQSection";
import FinalCTA from "@/components/landing/FinalCTA";
import LandingFooter from "@/components/landing/LandingFooter";

export default function Page() {
  return (
    <div className="lp">
      <LandingMotionProvider>
        <LandingNavbar />
        <main id="top">
          <HeroSection />
          <IntegrationMarquee />
          <ProductDemoVideo />
          <ProblemSolutionSection />
          <JourneySection />
          <FeatureBento />
          <ApprovalChannelsSection />
          <LearningLoopSection />
          <IntegrationEcosystem />
          <FAQSection />
          <FinalCTA />
        </main>
        <LandingFooter />
      </LandingMotionProvider>
    </div>
  );
}
