import LandingNav from "@/components/landing/LandingNav";
import LandingHero from "@/components/landing/LandingHero";
import FeatureGrid from "@/components/landing/FeatureGrid";
import SocialProof from "@/components/landing/SocialProof";
import AiArchitecture from "@/components/landing/AiArchitecture";
import EnterpriseGrid from "@/components/landing/EnterpriseGrid";
import MeetingHistory from "@/components/landing/MeetingHistory";
import LandingCTA from "@/components/landing/LandingCTA";
import LandingFooter from "@/components/landing/LandingFooter";

export default function LandingPage() {
  return (
    <div className="bg-surface min-h-screen">
      <LandingNav />
      <LandingHero />
      <FeatureGrid />
      <SocialProof />
      <AiArchitecture />
      <EnterpriseGrid />
      <MeetingHistory />
      <LandingCTA />
      <LandingFooter />
    </div>
  );
}
