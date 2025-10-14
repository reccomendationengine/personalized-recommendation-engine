import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import ReturningUserCTA from '@/components/returning-user'
import { Sparkles, Zap, Target, TrendingUp, Users, Brain } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background dark">
      {/* Header */}
      <header className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold text-foreground">RecoEngine</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              How It Works
            </a>
            <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </a>
            <Link href="/login">
              <Button variant="outline" size="sm">Sign In</Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">Get Started</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-6 py-24 md:py-32">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm mb-6">
            <Sparkles className="w-4 h-4" />
            <span>AI-Powered Recommendations</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold text-foreground mb-6 text-balance leading-tight">
            Intelligent recommendations that <span className="text-primary">drive engagement</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-10 text-pretty leading-relaxed max-w-2xl mx-auto">
            Transform your platform with personalized recommendations powered by advanced machine learning.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup">
              <Button size="lg" className="text-base px-8">Start Free Trial</Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="text-base px-8 bg-transparent">Sign In</Button>
            </Link>
          </div>

          {/* Returning user CTA (appears if localStorage.lastEmail exists) */}
          <ReturningUserCTA />
          <p className="text-sm text-muted-foreground mt-6">
            No credit card required • 14-day free trial • Cancel anytime
          </p>
        </div>
      </section>

      {/* --- the rest of your existing sections/features/footer remain unchanged --- */}
      {/* Features Grid */}
      <section id="features" className="container mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4 text-balance">
            Built for modern platforms
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
            Everything you need to deliver personalized experiences at scale
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="p-6 bg-card border-border hover:border-primary/50 transition-colors">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <Brain className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-card-foreground mb-2">Machine Learning</h3>
            <p className="text-muted-foreground leading-relaxed">
              Advanced algorithms that learn from user behavior to deliver increasingly accurate recommendations over time.
            </p>
          </Card>

          <Card className="p-6 bg-card border-border hover:border-primary/50 transition-colors">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-card-foreground mb-2">Real-Time Processing</h3>
            <p className="text-muted-foreground leading-relaxed">
              Lightning-fast recommendations that update in real-time as users interact with your platform.
            </p>
          </Card>

          <Card className="p-6 bg-card border-border hover:border-primary/50 transition-colors">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <Target className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-card-foreground mb-2">Precision Targeting</h3>
            <p className="text-muted-foreground leading-relaxed">
              Deliver the right content to the right user at the right time with contextual awareness.
            </p>
          </Card>

          <Card className="p-6 bg-card border-border hover:border-primary/50 transition-colors">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <TrendingUp className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-card-foreground mb-2">Analytics Dashboard</h3>
            <p className="text-muted-foreground leading-relaxed">
              Track performance metrics and gain insights into user preferences and recommendation effectiveness.
            </p>
          </Card>

          <Card className="p-6 bg-card border-border hover:border-primary/50 transition-colors">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-card-foreground mb-2">User Segmentation</h3>
            <p className="text-muted-foreground leading-relaxed">
              Automatically group users based on behavior patterns for more targeted recommendations.
            </p>
          </Card>

          <Card className="p-6 bg-card border-border hover:border-primary/50 transition-colors">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-card-foreground mb-2">Easy Integration</h3>
            <p className="text-muted-foreground leading-relaxed">
              Simple API integration with comprehensive documentation and SDKs for popular frameworks.
            </p>
          </Card>
        </div>
      </section>

      {/* Stats Section */}
      <section className="container mx-auto px-6 py-24">
        <Card className="p-12 bg-card border-border">
          <div className="grid md:grid-cols-3 gap-12 text-center">
            <div>
              <div className="text-5xl font-bold text-primary mb-2">98%</div>
              <div className="text-muted-foreground">Accuracy Rate</div>
            </div>
            <div>
              <div className="text-5xl font-bold text-primary mb-2">2.5x</div>
              <div className="text-muted-foreground">Engagement Increase</div>
            </div>
            <div>
              <div className="text-5xl font-bold text-primary mb-2">&lt;50ms</div>
              <div className="text-muted-foreground">Response Time</div>
            </div>
          </div>
        </Card>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-6 py-24">
        <Card className="p-12 md:p-16 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20 text-center">
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4 text-balance">
            Ready to transform your platform?
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto text-pretty">
            Join thousands of companies using RecoEngine to deliver personalized experiences
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup">
              <Button size="lg" className="text-base px-8">Get Started Free</Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="text-base px-8 bg-transparent">Contact Sales</Button>
            </Link>
          </div>
        </Card>
      </section>

      {/* Footer (unchanged) */}
      <footer className="border-t border-border/40 mt-24">
        <div className="container mx-auto px-6 py-12 text-center text-sm text-muted-foreground">
          © 2025 RecoEngine. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
