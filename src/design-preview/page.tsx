'use client'

import HeroSection from './components/HeroSection'
import StatsBar from './components/StatsBar'
import BannerSlider from './components/BannerSlider'
import BrandFeatures from './components/BrandFeatures'
import ProductGrid from './components/ProductGrid'
import MembershipTier from './components/MembershipTier'
import CTASection from './components/CTASection'
import Footer from './components/Footer'

export default function DesignPreview() {
  return (
    <div className=\"min-h-screen bg-[#F8FAF8]\">
      <HeroSection />
      <StatsBar />
      <BannerSlider />
      <BrandFeatures />
      <ProductGrid />
      <MembershipTier />
      <CTASection />
      <Footer />
    </div>
  )
}
