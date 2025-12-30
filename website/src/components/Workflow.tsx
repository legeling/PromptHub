import React from 'react';
import { motion } from 'framer-motion';
import { MousePointer2, GitBranch, Share2 } from 'lucide-react';

interface WorkflowProps {
  dict: {
    title: string;
    items: Array<{
      step: string;
      title: string;
      desc: string;
    }>;
  };
}

const icons = [MousePointer2, Share2, GitBranch];

export const Workflow = ({ dict }: WorkflowProps) => {
  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[300px] bg-accent/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-black tracking-tight text-white mb-4">
            {dict.title}
          </h2>
          <div className="h-1 w-20 bg-accent mx-auto rounded-full" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {dict.items.map((item, idx) => {
            const Icon = icons[idx];
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="relative group p-8 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-accent/30 transition-all duration-500"
              >
                {/* Connector Line */}
                {idx < 2 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-px bg-gradient-to-r from-accent/30 to-transparent z-10" />
                )}

                <div className="mb-6 inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 text-accent group-hover:scale-110 group-hover:bg-accent group-hover:text-black transition-all duration-500">
                  <Icon className="w-6 h-6" />
                </div>

                <div className="absolute top-8 right-8 text-4xl font-black text-white/[0.03] group-hover:text-accent/[0.05] transition-colors">
                  {item.step}
                </div>

                <h3 className="text-xl font-bold text-white mb-3 group-hover:text-accent transition-colors">
                  {item.title}
                </h3>
                <p className="text-zinc-500 text-sm leading-relaxed">
                  {item.desc}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
