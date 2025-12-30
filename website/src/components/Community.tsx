import React from 'react';
import { motion } from 'framer-motion';
import { Github, MessageSquare, History } from 'lucide-react';

interface CommunityProps {
  dict: {
    title: string;
    github: string;
    issues: string;
    releases: string;
    desc: string;
  };
}

export const Community = ({ dict }: CommunityProps) => {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-accent/5 blur-[150px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/2" />
      
      <div className="max-w-7xl mx-auto px-6">
        <motion.div 
          className="p-12 md:p-16 rounded-[3rem] bg-gradient-to-br from-white/[0.05] to-transparent border border-white/5 relative overflow-hidden"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="max-w-2xl relative z-10">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-6 tracking-tighter italic">
              {dict.title}
            </h2>
            <p className="text-xl text-zinc-400 mb-10 leading-relaxed font-medium">
              {dict.desc}
            </p>
            
            <div className="flex flex-wrap gap-4">
              <a 
                href="https://github.com/legeling/PromptHub" 
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 px-6 py-3 rounded-full bg-white text-black font-bold hover:bg-accent hover:scale-105 transition-all"
              >
                <Github className="w-5 h-5" />
                {dict.github}
              </a>
              <a 
                href="https://github.com/legeling/PromptHub/issues" 
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 px-6 py-3 rounded-full bg-white/5 text-white border border-white/10 font-bold hover:bg-white/10 transition-all"
              >
                <MessageSquare className="w-5 h-5" />
                {dict.issues}
              </a>
              <a 
                href="/docs/changelog" 
                className="flex items-center gap-3 px-6 py-3 rounded-full bg-white/5 text-white border border-white/10 font-bold hover:bg-white/10 transition-all"
              >
                <History className="w-5 h-5" />
                {dict.releases}
              </a>
            </div>
          </div>
          
          {/* Animated Stats Decoration */}
          <div className="hidden lg:block absolute right-16 top-1/2 -translate-y-1/2">
             <motion.div 
               animate={{ rotate: 360 }}
               transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
               className="w-64 h-64 border-2 border-dashed border-white/5 rounded-full flex items-center justify-center"
             >
                <div className="w-48 h-48 border border-accent/20 rounded-full flex items-center justify-center">
                   <div className="w-16 h-16 bg-accent rounded-full blur-3xl opacity-20" />
                </div>
             </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
