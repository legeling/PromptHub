import React from 'react';
import { motion } from 'framer-motion';
import { Zap, GitBranch, Lock, Database, Search, FileOutput } from 'lucide-react';

interface FeatureItem {
  title: string;
  desc: string;
}

interface FeatureGridProps {
  dict: {
    titleStart: string;
    titleHighlight: string;
    titleEnd: string;
    subtitle: string;
    items: readonly FeatureItem[]; // readonly because 'as const' in ui.ts
  }
}

export const FeatureGrid = ({ dict }: FeatureGridProps) => {
  // Map icons by index order, matching the ui.ts structure
  const icons = [
    { icon: <Lock className="w-6 h-6 text-accent" />, colSpan: "col-span-1" },
    { icon: <Zap className="w-6 h-6 text-purple-400" />, colSpan: "col-span-1" },
    { icon: <GitBranch className="w-6 h-6 text-blue-400" />, colSpan: "col-span-1" },
    { icon: <Database className="w-6 h-6 text-green-400" />, colSpan: "col-span-1" },
    { icon: <Search className="w-6 h-6 text-yellow-500" />, colSpan: "col-span-1" },
    { icon: <FileOutput className="w-6 h-6 text-pink-400" />, colSpan: "col-span-1" },
  ];

  return (
    <section id="features" className="py-32 px-6 relative z-10">
      <div className="max-w-7xl mx-auto">
        <motion.div 
          className="text-center mb-20"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            {dict.titleStart} <span className="text-accent">{dict.titleHighlight}</span> {dict.titleEnd}
          </h2>
          <p className="text-zinc-400 max-w-2xl mx-auto text-lg">
            {dict.subtitle}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {dict.items.map((item, i) => (
            <motion.div
              key={i}
              className={`group relative overflow-hidden rounded-3xl bg-surface border border-white/5 p-8 cursor-pointer ${icons[i]?.colSpan || 'col-span-1'}`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={{ 
                y: -8, 
                borderColor: 'rgba(255,255,255,0.15)',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                transition: { duration: 0.3, ease: 'easeOut' }
              }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              {/* Hover Glow Effect */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-accent/10 blur-3xl rounded-full" />
              </div>
              
              <div className="absolute top-0 right-0 p-8 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-2xl pointer-events-none">
                <div className="w-32 h-32 bg-accent/20 rounded-full" />
              </div>
              
              <div className="relative z-10">
                <div className="mb-6 p-3 rounded-2xl bg-white/5 w-fit border border-white/5 group-hover:border-accent/30 group-hover:bg-accent/10 group-hover:scale-110 transition-all duration-300">
                  {icons[i]?.icon}
                </div>
                <h3 className="text-xl font-bold mb-3 group-hover:text-accent transition-colors duration-300">{item.title}</h3>
                <p className="text-zinc-400 leading-relaxed group-hover:text-zinc-300 transition-colors duration-300">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
