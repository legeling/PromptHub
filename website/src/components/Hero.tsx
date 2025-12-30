import React from 'react';
import { motion } from 'framer-motion';
import { Button } from './ui/Button';
import { Download, ChevronRight } from 'lucide-react';
import { AsciiBackground } from './AsciiBackground';

interface HeroProps {
  dict: {
    version: string;
    titleStart: string;
    titleEnd: string;
    desc: string;
    download: string;
    github: string;
    imgAlt: string;
  }
}

export const Hero = ({ dict }: HeroProps) => {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-20 overflow-hidden">
      <AsciiBackground />
      
      {/* Glow Effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-accent/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-accent mb-8 hover:bg-white/10 transition-colors cursor-default">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
            </span>
            {dict.version}
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-8">
            {dict.titleStart} <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-white/50">{dict.titleEnd}</span>
          </h1>
          
          <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            {dict.desc}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" href="#download">
              <Download className="w-5 h-5" />
              {dict.download}
            </Button>
            <Button variant="outline" size="lg" href="https://github.com/legeling/PromptHub">
              {dict.github}
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </motion.div>

        {/* 3D Tilt Image Container */}
        <motion.div 
          className="mt-24 relative mx-auto max-w-5xl"
          initial={{ opacity: 0, y: 100, rotateX: 20 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 1, delay: 0.2 }}
        >
          <div className="relative rounded-xl border border-white/10 bg-surface/50 backdrop-blur-xl shadow-2xl overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10" />
            <img 
              src="/imgs/1-index.png" 
              alt={dict.imgAlt} 
              className="w-full h-auto rounded-xl shadow-2xl transition-transform duration-700 group-hover:scale-[1.02]"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
};
