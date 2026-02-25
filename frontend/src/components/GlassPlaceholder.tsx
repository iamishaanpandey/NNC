import { FolderPlus, Search, Command } from 'lucide-react';

export function GlassPlaceholder() {
  return (
    <div className="relative group cursor-default">
      {/* Glass Container */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent rounded-xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity" />
      
      <div className="relative p-6 rounded-xl border border-white/5 bg-white/[0.02] backdrop-blur-sm overflow-hidden text-center space-y-4">
        {/* Animated Icon */}
        <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 ring-1 ring-primary/20">
          <FolderPlus className="w-6 h-6 text-primary animate-pulse" />
        </div>

        {/* Text Content */}
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">No Projects Yet</h3>
          <p className="text-[10px] text-muted-foreground leading-relaxed px-2">
            Create your first project to start capturing and analyzing notes.
          </p>
        </div>
        
        {/* Decorative Grid */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 pointer-events-none mix-blend-overlay"></div>
      </div>
    </div>
  );
}
