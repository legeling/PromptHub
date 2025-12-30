import React, { useState, useEffect } from 'react';
import { motion, useScroll, AnimatePresence } from 'framer-motion';
import { Github, Download, Star, Globe, Menu, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/Button';

interface NavbarProps {
  lang: 'zh' | 'en';
  currentPath?: string;
  dict: {
    features: string;
    docs: string;
    changelog: string;
    download: string;
    github: string;
    star: string;
    backers: string;
  };
}

export const Navbar = ({ lang, dict, currentPath = '' }: NavbarProps) => {
  const { scrollY } = useScroll();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [stars, setStars] = useState<string>('100+');

  useEffect(() => {
    fetch('https://api.github.com/repos/legeling/PromptHub')
      .then(res => res.json())
      .then(data => {
        if (data.stargazers_count) {
          setStars(data.stargazers_count >= 1000 
            ? `${(data.stargazers_count / 1000).toFixed(1)}k` 
            : data.stargazers_count.toString());
        }
      })
      .catch(() => {});
  }, []);

  // 生成语言切换链接
  const getLanguageLink = (targetLang: 'zh' | 'en') => {
    // 如果在文档页面
    if (currentPath.includes('/docs/')) {
      // changelog 切换语言
      if (currentPath.includes('changelog')) {
        return targetLang === 'en' ? '/docs/en/changelog' : '/docs/changelog';
      }
      // 其他文档页面使用路径切换
      if (targetLang === 'en') {
        return currentPath.replace('/docs/', '/docs/en/');
      } else {
        return currentPath.replace('/docs/en/', '/docs/');
      }
    }
    // 首页切换
    return targetLang === 'en' ? '/en' : '/';
  };

  useEffect(() => {
    return scrollY.onChange((latest) => {
      setIsScrolled(latest > 50);
    });
  }, [scrollY]);

  const homeLink = lang === 'zh' ? '/' : '/en';
  const docsLink = lang === 'zh' ? '/docs/introduction' : '/docs/en/introduction';
  const changelogLink = lang === 'zh' ? '/docs/changelog' : '/docs/en/changelog'; 
  const backersLink = lang === 'zh' ? '/docs/backers' : '/docs/en/backers';

  return (
    <>
    <motion.header
      className={cn(
        'fixed top-0 inset-x-0 z-50 h-16 transition-all duration-300',
        isScrolled ? 'bg-background/80 backdrop-blur-md border-b border-white/5' : 'bg-transparent'
      )}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between relative">
        {/* Left: Logo */}
        <div className="flex items-center">
          <a href={homeLink} className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center border border-white/10 group-hover:border-white/20 transition-colors">
              <img src="/imgs/icon.png" alt="Logo" className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </div>
            <span className="font-bold text-lg tracking-tight">PromptHub</span>
          </a>
        </div>

        {/* Center: Desktop Nav (Absolute Centered) */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <nav className="hidden md:flex items-center gap-8 text-sm text-zinc-400 font-medium bg-surface/50 px-6 py-2 rounded-full border border-white/5 backdrop-blur-sm">
            <a href={`${homeLink}#features`} className="hover:text-white transition-colors">{dict.features}</a>
            <a href={docsLink} className="hover:text-white transition-colors">{dict.docs}</a>
            <a href={changelogLink} className="hover:text-white transition-colors">{dict.changelog}</a>
            <a href={backersLink} className="hover:text-white transition-colors">{dict.backers}</a>
          </nav>
        </div>

        {/* Right: Actions */}
        <div className="hidden md:flex items-center gap-3">
          {/* Language Picker */}
          <div className="relative">
            <button 
              onClick={() => setLangMenuOpen(!langMenuOpen)}
              className="p-2 rounded-full hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
            >
              <Globe className="w-4 h-4" />
            </button>
            <AnimatePresence>
              {langMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute top-full right-0 mt-2 w-32 bg-surface border border-white/10 rounded-xl shadow-xl overflow-hidden py-1"
                >
                  <a 
                    href={getLanguageLink('zh')} 
                    onClick={() => localStorage.setItem('user_lang_set', 'true')}
                    className={`block px-4 py-2 text-sm hover:bg-white/5 hover:text-white ${lang === 'zh' ? 'text-white bg-white/5' : 'text-zinc-300'}`}
                  >
                    中文
                  </a>
                  <a 
                    href={getLanguageLink('en')} 
                    onClick={() => localStorage.setItem('user_lang_set', 'true')}
                    className={`block px-4 py-2 text-sm hover:bg-white/5 hover:text-white ${lang === 'en' ? 'text-white bg-white/5' : 'text-zinc-300'}`}
                  >
                    English
                  </a>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="h-4 w-px bg-white/10 mx-1" />

          <a 
            href="https://github.com/legeling/PromptHub"
            target="_blank"
            rel="noreferrer" 
            className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white bg-white/5 px-3 py-1.5 rounded-full border border-white/5 transition-all hover:border-white/20 hover:bg-white/10"
          >
            <Github className="w-3.5 h-3.5" />
            <span>{dict.star}</span>
            <div className="w-px h-3 bg-zinc-700 mx-1" />
            <span className="flex items-center gap-1 font-mono text-zinc-300">
              <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
              <span>{stars}</span> 
            </span>
          </a>
          
          <Button variant="primary" size="sm" href="#download">
            <Download className="w-4 h-4" />
            {dict.download}
          </Button>
        </div>

        {/* Mobile Toggle */}
        <button 
          className="md:hidden p-2 text-zinc-400"
          onClick={() => setMobileMenuOpen(true)}
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>
    </motion.header>

    {/* Mobile Menu */}
    <AnimatePresence>
      {mobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, x: '100%' }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: '100%' }}
          className="fixed inset-0 z-[60] bg-background md:hidden"
        >
          <div className="p-6 flex flex-col h-full">
            <div className="flex justify-between items-center mb-8">
              <span className="font-bold text-lg">PromptHub</span>
              <button onClick={() => setMobileMenuOpen(false)} className="p-2 text-zinc-400">
                <X className="w-6 h-6" />
              </button>
            </div>
            <nav className="flex flex-col gap-6 text-lg font-medium">
              <a href={`${homeLink}#features`} onClick={() => setMobileMenuOpen(false)}>{dict.features}</a>
              <a href={docsLink} onClick={() => setMobileMenuOpen(false)}>{dict.docs}</a>
              <a href={changelogLink} onClick={() => setMobileMenuOpen(false)}>{dict.changelog}</a>
              <a href={backersLink} onClick={() => setMobileMenuOpen(false)}>{dict.backers}</a>
            </nav>
            <div className="mt-auto space-y-4">
              <Button className="w-full justify-center" size="lg" href="#download">
                {dict.download}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
};