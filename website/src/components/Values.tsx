import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Zap, Key, Lock, Database, Cloud } from 'lucide-react';

interface ValuesProps {
  dict: {
    title: string;
    badge: string;
    desc: string;
    offlineLabel: string;
    encryptLabel: string;
    items: Array<{
      title: string;
      desc: string;
    }>;
  };
}

const icons = [ShieldCheck, Zap, Key];
const iconColors = ['text-cyan-400', 'text-yellow-400', 'text-purple-400'];

export const Values = ({ dict }: ValuesProps) => {
  return (
    <section className="py-32 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-accent/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-500/5 blur-[150px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="flex flex-col lg:flex-row gap-20 items-center">
          {/* Left: Content */}
          <div className="flex-1 max-w-xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <span className="inline-block px-4 py-1.5 rounded-full bg-accent/10 text-accent text-sm font-medium mb-6 border border-accent/20">
                🔐 {dict.badge}
              </span>
              <h2 className="text-4xl md:text-5xl font-black tracking-tight text-white mb-6 leading-tight">
                {dict.title}
              </h2>
              <p className="text-zinc-400 text-lg mb-12 leading-relaxed">
                {dict.desc}
              </p>
            </motion.div>

            <div className="space-y-6">
              {dict.items.map((item, idx) => {
                const Icon = icons[idx];
                const colorClass = iconColors[idx];
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -30 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    whileHover={{ x: 8 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: idx * 0.15 }}
                    className="group p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-accent/30 hover:bg-white/[0.04] transition-all duration-300 cursor-pointer"
                  >
                    <div className="flex gap-5 items-start">
                      <div className={`shrink-0 w-14 h-14 rounded-2xl bg-surface border border-white/10 flex items-center justify-center ${colorClass} group-hover:scale-110 group-hover:border-accent/50 transition-all duration-300`}>
                        <Icon className="w-7 h-7" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-white mb-2 group-hover:text-accent transition-colors">
                          {item.title}
                        </h3>
                        <p className="text-zinc-500 text-sm leading-relaxed group-hover:text-zinc-400 transition-colors">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Right: Visual */}
          <div className="flex-1 relative">
            <motion.div 
              className="relative"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              {/* Outer glow ring */}
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div 
                  className="w-[400px] h-[400px] rounded-full border border-accent/10"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
                />
              </div>
              
              {/* Middle ring with dots */}
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div 
                  className="w-[320px] h-[320px] rounded-full border border-dashed border-white/5 relative"
                  animate={{ rotate: -360 }}
                  transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
                >
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-accent rounded-full" />
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-purple-400 rounded-full" />
                  <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-yellow-400 rounded-full" />
                </motion.div>
              </div>

              {/* Central card */}
              <div className="relative w-[280px] h-[280px] mx-auto rounded-[3rem] bg-gradient-to-br from-surface to-surface2 border border-white/10 shadow-2xl flex items-center justify-center overflow-hidden group">
                {/* Inner glow */}
                <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                {/* Floating icons */}
                <motion.div 
                  className="absolute top-6 right-6"
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Lock className="w-6 h-6 text-accent/40" />
                </motion.div>
                <motion.div 
                  className="absolute bottom-8 left-8"
                  animate={{ y: [0, 8, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                >
                  <Database className="w-5 h-5 text-purple-400/40" />
                </motion.div>
                <motion.div 
                  className="absolute top-12 left-6"
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                >
                  <Cloud className="w-5 h-5 text-yellow-400/40" />
                </motion.div>

                {/* Central shield */}
                <div className="relative z-10">
                  <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <div className="relative">
                      <ShieldCheck className="w-28 h-28 text-accent" />
                      <div className="absolute inset-0 bg-accent/30 blur-2xl rounded-full" />
                    </div>
                  </motion.div>
                </div>

                {/* Pulse ring */}
                <motion.div 
                  className="absolute inset-0 border-2 border-accent/20 rounded-[3rem]"
                  animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeOut' }}
                />
              </div>

              <motion.div 
                className="absolute -top-4 right-0 px-4 py-2 rounded-xl bg-surface border border-white/10 shadow-lg"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-xs text-zinc-400">{dict.offlineLabel}</span>
                </div>
              </motion.div>

              <motion.div 
                className="absolute -bottom-4 left-0 px-4 py-2 rounded-xl bg-surface border border-white/10 shadow-lg"
                initial={{ opacity: 0, y: -20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.5 }}
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-accent" />
                  <span className="text-xs text-zinc-400">{dict.encryptLabel}</span>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};
