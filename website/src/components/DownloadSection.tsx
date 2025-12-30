import React from 'react';
import { motion } from 'framer-motion';
import { Download } from 'lucide-react';
import { Button } from './ui/Button';
import { FaApple, FaWindows, FaLinux } from 'react-icons/fa6';

interface PlatformInfo {
  title: string;
  desc: string;
  btn: string;
  subBtn: string;
}

interface DownloadSectionProps {
  dict: {
    title: string;
    subtitle: string;
    mac: PlatformInfo;
    win: PlatformInfo;
    linux: PlatformInfo;
  }
}

export const DownloadSection = ({ dict }: DownloadSectionProps) => {
  return (
    <section id="download" className="py-32 px-6 relative z-10 border-t border-white/5">
      <div className="max-w-5xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-5xl font-bold mb-6 italic tracking-tight">{dict.title}</h2>
          <p className="text-zinc-400 mb-12">{dict.subtitle}</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* macOS */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="p-8 rounded-3xl bg-surface border border-white/5 flex flex-col items-center gap-6 hover:border-white/20 transition-all hover:bg-white/5 group"
          >
            <div className="p-4 rounded-2xl bg-white/5 group-hover:scale-110 transition-transform duration-500">
               <FaApple className="w-8 h-8 text-white" />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-xl mb-1">{dict.mac.title}</h3>
              <p className="text-sm text-zinc-500">{dict.mac.desc}</p>
            </div>
            <div className="w-full space-y-3">
              <Button variant="primary" className="w-full" href="https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.3.4-arm64.dmg">
                <Download className="w-4 h-4" />
                {dict.mac.btn}
              </Button>
              <a href="https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.3.4-x64.dmg" className="block text-xs text-zinc-500 hover:text-white transition-colors">
                {dict.mac.subBtn}
              </a>
            </div>
          </motion.div>

          {/* Windows */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="p-8 rounded-3xl bg-surface border border-white/5 flex flex-col items-center gap-6 hover:border-white/20 transition-all hover:bg-white/5 group"
          >
            <div className="p-4 rounded-2xl bg-blue-500/10 group-hover:scale-110 transition-transform duration-500">
              <FaWindows className="w-8 h-8 text-blue-400" />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-xl mb-1">{dict.win.title}</h3>
              <p className="text-sm text-zinc-500">{dict.win.desc}</p>
            </div>
            <div className="w-full space-y-3">
              <Button variant="primary" className="w-full" href="https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-Setup-0.3.4-x64.exe">
                <Download className="w-4 h-4" />
                {dict.win.btn}
              </Button>
              <a href="https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-Setup-0.3.4-arm64.exe" className="block text-xs text-zinc-500 hover:text-white transition-colors">
                {dict.win.subBtn}
              </a>
            </div>
          </motion.div>

          {/* Linux */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="p-8 rounded-3xl bg-surface border border-white/5 flex flex-col items-center gap-6 hover:border-white/20 transition-all hover:bg-white/5 group"
          >
            <div className="p-4 rounded-2xl bg-orange-500/10 group-hover:scale-110 transition-transform duration-500">
               <FaLinux className="w-8 h-8 text-orange-400" />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-xl mb-1">{dict.linux.title}</h3>
              <p className="text-sm text-zinc-500">{dict.linux.desc}</p>
            </div>
            <div className="w-full space-y-3">
              <Button variant="primary" className="w-full" href="https://github.com/legeling/PromptHub/releases/latest/download/PromptHub-0.3.4-x64.AppImage">
                <Download className="w-4 h-4" />
                {dict.linux.btn}
              </Button>
              <a href="https://github.com/legeling/PromptHub/releases/latest/download/prompthub_0.3.4_amd64.deb" className="block text-xs text-zinc-500 hover:text-white transition-colors">
                {dict.linux.subBtn}
              </a>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
