import { ActionMarquee } from '@/components/home/ActionMarquee';
import { Adapters } from '@/components/home/Adapters';
import { Faq } from '@/components/home/Faq';
import { FinalCta } from '@/components/home/FinalCta';
import { Hero } from '@/components/home/Hero';
import { PipelineGraph } from '@/components/home/PipelineGraph';
import { Resilience } from '@/components/home/Resilience';
import { Stats } from '@/components/home/Stats';
import { Steps } from '@/components/home/Steps';

/**
 * The landing page, one component per section in `components/home/`.
 *
 * The order is the argument: show the evidence first (the hero is made of
 * images Lens optimized), name what the pipeline does, draw it, put numbers on
 * it, walk through using it, then cover storage, failure and the questions a
 * sceptic asks before installing.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <ActionMarquee />
      <PipelineGraph />
      <Stats />
      <Steps />
      <Adapters />
      <Resilience />
      <Faq />
      <FinalCta />
    </>
  );
}
