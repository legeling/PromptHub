import React from 'react';
import { motion } from 'framer-motion';
import { Heart } from 'lucide-react';

interface Backer {
  name: string;
  amount: string;
  date: string;
  message?: string;
}

interface BackersProps {
  limit?: number;
  dict: {
    badge: string;
    title: string;
    subtitle: string;
    becomeTitle: string;
    becomeDesc: string;
    list: Backer[];
  };
}

export const Backers: React.FC<BackersProps> = ({ dict, limit }) => {
  const displayList = limit ? dict.list.slice(0, limit) : dict.list;

  return (
    <section id="backers" className="py-24 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium mb-4"
          >
            <Heart size={12} className="fill-current" />
            {dict.badge}
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl md:text-4xl font-bold mb-4 bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent"
          >
            {dict.title}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-zinc-400 max-w-2xl mx-auto"
          >
            {dict.subtitle}
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayList.map((backer, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="group relative p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-red-500/30 transition-all duration-500"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center border border-red-500/20">
                    <span className="text-red-400 font-bold text-lg">{backer.name[0]}</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white group-hover:text-red-400 transition-colors uppercase tracking-wider">{backer.name}</h3>
                    <p className="text-xs text-zinc-500">{backer.date}</p>
                  </div>
                </div>
                <div className="px-2 py-1 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-mono">
                  {backer.amount}
                </div>
              </div>
              {backer.message && (
                <p className="text-sm text-zinc-400 italic">
                  "{backer.message}"
                </p>
              )}
              
              {/* Background Glow */}
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-red-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity blur-sm" />
            </motion.div>
          ))}
          
          {/* Become a Backer Card */}
          <motion.a
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: displayList.length * 0.1 }}
            href="https://github.com/legeling/PromptHub#backers"
            className="group relative p-6 rounded-2xl bg-white/[0.01] border border-dashed border-white/10 hover:border-white/20 transition-all duration-500 flex flex-col items-center justify-center gap-3 text-center min-h-[140px]"
          >
            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500 group-hover:text-white transition-colors">
              <Heart size={20} />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-400 group-hover:text-white transition-colors">{dict.becomeTitle}</p>
              <p className="text-xs text-zinc-600">{dict.becomeDesc}</p>
            </div>
          </motion.a>
        </div>
      </div>
      
      {/* Decorative background element */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-500/5 rounded-full blur-[120px] -z-10" />
    </section>
  );
};
