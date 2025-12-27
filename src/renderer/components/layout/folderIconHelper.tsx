/**
 * 文件夹图标渲染辅助函数
 * Folder icon rendering helper
 */

import { 
  Folder as FolderIconLucide, FolderOpen, BookOpen, Code, Database, FileText, 
  Image, Music, Video, Archive, Package, Briefcase, GraduationCap, Palette, 
  Rocket, Heart, Star, Zap, Coffee, Home, Settings as SettingsIconLucide, 
  BookMarked, Bug, Calendar, Camera, CheckCircle, Circle, Cloud, Cpu, 
  CreditCard, Crown, Flame, Gamepad2, Gift, Globe, Hammer, Headphones, 
  Inbox, Key, Layers, Lightbulb, Mail, Map, MessageSquare, Monitor, Moon, 
  Newspaper, PenTool, Phone, Pizza, Plane, Play, Search, Shield, ShoppingCart, 
  Smartphone, Sparkles, Sun, Tag, Target, Terminal, Trash2, Trophy, Truck, 
  Tv, Upload, Users, Wallet, Watch, Wrench 
} from 'lucide-react';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  'folder': FolderIconLucide, 
  'folder-open': FolderOpen, 
  'book-open': BookOpen, 
  'book-marked': BookMarked,
  'code': Code, 
  'database': Database, 
  'file-text': FileText, 
  'image': Image, 
  'music': Music, 
  'video': Video,
  'archive': Archive, 
  'package': Package, 
  'briefcase': Briefcase, 
  'graduation-cap': GraduationCap,
  'palette': Palette, 
  'rocket': Rocket, 
  'heart': Heart, 
  'star': Star, 
  'zap': Zap, 
  'coffee': Coffee,
  'home': Home, 
  'settings': SettingsIconLucide, 
  'bug': Bug, 
  'calendar': Calendar, 
  'camera': Camera,
  'check-circle': CheckCircle, 
  'circle': Circle, 
  'cloud': Cloud, 
  'cpu': Cpu, 
  'credit-card': CreditCard,
  'crown': Crown, 
  'flame': Flame, 
  'gamepad-2': Gamepad2, 
  'gift': Gift, 
  'globe': Globe, 
  'hammer': Hammer,
  'headphones': Headphones, 
  'inbox': Inbox, 
  'key': Key, 
  'layers': Layers, 
  'lightbulb': Lightbulb,
  'mail': Mail, 
  'map': Map, 
  'message-square': MessageSquare, 
  'monitor': Monitor, 
  'moon': Moon,
  'newspaper': Newspaper, 
  'pen-tool': PenTool, 
  'phone': Phone, 
  'pizza': Pizza, 
  'plane': Plane,
  'play': Play, 
  'search': Search, 
  'shield': Shield, 
  'shopping-cart': ShoppingCart, 
  'smartphone': Smartphone,
  'sparkles': Sparkles, 
  'sun': Sun, 
  'tag': Tag, 
  'target': Target, 
  'terminal': Terminal, 
  'trash-2': Trash2,
  'trophy': Trophy, 
  'truck': Truck, 
  'tv': Tv, 
  'upload': Upload, 
  'users': Users, 
  'wallet': Wallet,
  'watch': Watch, 
  'wrench': Wrench,
};

/**
 * 渲染文件夹图标（emoji 或 Lucide 图标）
 * Render folder icon (emoji or Lucide icon)
 */
export function renderFolderIcon(iconValue: string | undefined): React.ReactNode {
  if (!iconValue) return '📁';
  
  if (iconValue.startsWith('icon:')) {
    const iconName = iconValue.replace('icon:', '');
    const IconComponent = iconMap[iconName];
    return IconComponent ? <IconComponent className="w-5 h-5" /> : '📁';
  }
  
  return iconValue;
}
