import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, ChevronRight, ChevronDown, Folder, Trash2, Circle, 
  Settings, Star, LayoutGrid, Hand, Wifi, WifiOff, AlertTriangle, Bug
} from 'lucide-react';
import { getFolders, createFolder, deleteFolder, toggleFavoriteFolder, getUserInfo, Folder as FolderType } from '@/services/api';
import { GlassPlaceholder } from './GlassPlaceholder';

interface ExtendedFolder extends FolderType { is_favorite?: boolean; }
interface GroupedFolders { [year: string]: { [month: string]: { [week: string]: ExtendedFolder[]; }; }; }

interface SidebarProps {
  selectedFolderId: number | null;
  onSelectFolder: (id: number) => void;
  // NEW PROP: To separate creation (stay on capture) from selection (go to records)
  onCreateFolder?: (id: number) => void;
  refreshTrigger: number;
  onFolderDeleted: (id: number) => void;
  onOpenRecords: () => void;
  onToggleDebug: () => void;
}
const FOLDER_COLORS = ['#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6', '#84CC16', '#F97316'];

export function Sidebar({ selectedFolderId, onSelectFolder, onCreateFolder, refreshTrigger, onFolderDeleted, onOpenRecords, onToggleDebug }: SidebarProps) {
  const [folders, setFolders] = useState<ExtendedFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedColor, setSelectedColor] = useState(FOLDER_COLORS[0]);
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; folderId: number, isFav: boolean } | null>(null);
  
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [username, setUsername] = useState('Loading...');
  const [initials, setInitials] = useState('..');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => { loadFolders(); loadUser(); }, [refreshTrigger]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const loadUser = async () => {
    try {
        const info = await getUserInfo();
        setUsername(info.username);
        const nameParts = info.username.split(' ');
        let init = nameParts[0][0];
        if (nameParts.length > 1) init += nameParts[nameParts.length - 1][0];
        setInitials(init.toUpperCase());
    } catch (e) { setUsername("Guest User"); setInitials("GU"); }
  };

  const loadFolders = async () => {
    try {
      const response: any = await getFolders();
      const data = Array.isArray(response) ? response : (response.folders || []);
      setFolders(data);
      if (data.length > 0) {
        const now = new Date();
        setExpandedYears(new Set([now.getFullYear().toString()]));
        setExpandedMonths(new Set([`${now.getFullYear()}-${now.getMonth()}`]));
      }
    } catch (error) { setFolders([]); } finally { setLoading(false); }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const folder = await createFolder(newFolderName, selectedColor);
      setNewFolderName('');
      await loadFolders();
      const newId = folder.id || (folder.data && folder.data.id);
      
      // FIXED: Use onCreateFolder if available to avoid switching tabs
      if (newId) {
          if (onCreateFolder) {
              onCreateFolder(newId);
          } else {
              onSelectFolder(newId);
          }
      }
    } catch (error) { console.error(error); }
  };

  const requestDelete = (id: number) => { setDeleteId(id); };
  const confirmDelete = async () => {
      if (deleteId) {
          try { await deleteFolder(deleteId); onFolderDeleted(deleteId); await loadFolders(); } catch (error) { console.error(error); }
          setDeleteId(null);
      }
  };

  const handleToggleFavorite = async (id: number, currentStatus: boolean) => { 
    try { 
      await toggleFavoriteFolder(id, !currentStatus); 
      await loadFolders(); 
    } catch (error) { 
      console.error(error); 
    } 
  };

  const handleContextMenu = (e: React.MouseEvent, folder: ExtendedFolder) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, folderId: folder.id, isFav: !!folder.is_favorite }); };
  const handleDoubleClick = (folderId: number) => { onSelectFolder(folderId); onOpenRecords(); };

  const favorites = folders.filter(f => f.is_favorite);
  
  const groupFoldersByDate = (folderList: ExtendedFolder[]): GroupedFolders => {
    if (!Array.isArray(folderList)) return {};
    const grouped: GroupedFolders = {};
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    folderList.forEach(folder => {
      const date = new Date(folder.created_at || new Date().toISOString());
      if (isNaN(date.getTime())) return;
      const year = date.getFullYear().toString();
      const month = monthNames[date.getMonth()];
      const week = `Week ${Math.ceil(date.getDate() / 7)}`;
      if (!grouped[year]) grouped[year] = {};
      if (!grouped[year][month]) grouped[year][month] = {};
      if (!grouped[year][month][week]) grouped[year][month][week] = [];
      grouped[year][month][week].push(folder);
    });
    return grouped;
  };

  const toggleYear = (year: string) => { const newExpanded = new Set(expandedYears); newExpanded.has(year) ? newExpanded.delete(year) : newExpanded.add(year); setExpandedYears(newExpanded); };
  const toggleMonth = (key: string) => { const newExpanded = new Set(expandedMonths); newExpanded.has(key) ? newExpanded.delete(key) : newExpanded.add(key); setExpandedMonths(newExpanded); };
  const groupedFolders = groupFoldersByDate(folders);

  return (
    <div className="h-full w-[280px] flex-shrink-0 flex flex-col bg-card border-r border-border transition-colors duration-300 relative">
      <div className="p-5 pb-2" style={{ WebkitAppRegion: 'drag' } as any}>
        <div className="flex items-center gap-3 mb-6">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/20 shrink-0"><span className="text-white font-bold text-base">ST</span></div>
          <div><h1 className="font-bold text-foreground text-sm tracking-tight">ST NeuraNote</h1><div className="flex items-center gap-1.5 mt-0.5"><span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}/><p className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">{isOnline ? "System Online" : "System Offline"}{isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}</p></div></div>
        </div>
        <div className="space-y-2 pt-4 border-t border-border" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <div className="flex gap-2"><input type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()} placeholder="New project..." className="flex-1 h-8 px-3 rounded-md bg-secondary/50 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary border border-border" /><button onClick={handleCreateFolder} disabled={!newFolderName.trim()} className="h-8 w-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50"><Plus className="h-4 w-4" /></button></div>
          <div className="flex flex-wrap items-center gap-1.5 pl-1 mt-4">{FOLDER_COLORS.map(color => (<button key={color} onClick={() => setSelectedColor(color)} className={`w-4 h-4 rounded-full flex items-center justify-center transition-transform ${selectedColor === color ? 'scale-125 ring-1 ring-offset-1 ring-offset-card ring-foreground' : 'hover:scale-110'}`} style={{ backgroundColor: color }} />))}</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
        {favorites.length > 0 && (<div className="mb-4"><div className="flex items-center gap-2 px-2 py-1.5 text-xs font-bold text-muted-foreground uppercase tracking-widest"><Star size={10} /> Favorites</div><div className="space-y-0.5">{favorites.map(folder => (<button key={`fav-${folder.id}`} onClick={() => onSelectFolder(folder.id)} onDoubleClick={() => handleDoubleClick(folder.id)} onContextMenu={(e) => handleContextMenu(e, folder)} className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-md transition-all ${selectedFolderId === folder.id ? 'bg-secondary text-foreground font-medium' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}><div className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: folder.color || FOLDER_COLORS[0] }} /><span className="truncate">{folder.name}</span></button>))}</div></div>)}
        <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">History</div>
        {loading ? (<div className="space-y-2 mt-2">{[1, 2, 3].map(i => <div key={i} className="h-8 rounded-lg bg-secondary/50 animate-pulse" />)}</div>) : folders.length === 0 ? (<div className="mt-4"><GlassPlaceholder icon={Folder} title="No Projects" description="Create one above" variant="sidebar" /></div>) : (<div className="space-y-1">{Object.entries(groupedFolders).sort((a, b) => Number(b[0]) - Number(a[0])).map(([year, months]) => (<div key={year}><button onClick={() => toggleYear(year)} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground rounded-md transition-colors">{expandedYears.has(year) ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {year}</button><AnimatePresence>{expandedYears.has(year) && (<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden ml-1 border-l border-border pl-2">{Object.entries(months).map(([month, weeks]) => { const monthKey = `${year}-${month}`; return (<div key={monthKey}><button onClick={() => toggleMonth(monthKey)} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md transition-colors">{expandedMonths.has(monthKey) ? <ChevronDown size={10} /> : <ChevronRight size={10} />} {month}</button><AnimatePresence>{expandedMonths.has(monthKey) && (<motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden ml-1 border-l border-border pl-2">{Object.entries(weeks).map(([week, weekFolders]) => (<div key={week} className="mb-1">{weekFolders.map(folder => (<button key={folder.id} onClick={() => onSelectFolder(folder.id)} onDoubleClick={() => handleDoubleClick(folder.id)} onContextMenu={(e) => handleContextMenu(e, folder)} className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-xs rounded-md transition-all mb-0.5 ${selectedFolderId === folder.id ? 'bg-secondary text-foreground font-medium' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}><div className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: folder.color || FOLDER_COLORS[0] }} /><span className="truncate">{folder.name}</span></button>))}</div>))}</motion.div>)}</AnimatePresence></div>);})}</motion.div>)}</AnimatePresence></div>))}</div>)}
      </div>

      <div className="p-4 border-t border-border bg-secondary/10" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-secondary border border-transparent hover:border-border transition-all cursor-default group relative">
            <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-gray-700 to-gray-600 flex items-center justify-center text-white font-medium border-2 border-primary group-hover:border-ring transition-colors shadow-sm">{initials}</div>
            <div className="flex-1 min-w-0"><p className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">Hello <Hand size={10} className="text-yellow-500 animate-pulse" /></p><p className="text-sm font-bold text-foreground truncate">{username}</p></div>
            <button onClick={onToggleDebug} className="p-1.5 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title="Debug Console"><Bug size={14} /></button>
        </div>
      </div>

      <AnimatePresence>
        {contextMenu && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed bg-popover border border-border shadow-xl rounded-lg py-1 min-w-[140px] z-50 backdrop-blur-lg" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <button onClick={() => handleToggleFavorite(contextMenu.folderId, contextMenu.isFav)} className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"><Star size={14} className={contextMenu.isFav ? "fill-yellow-400 text-yellow-400" : ""} /> {contextMenu.isFav ? "Unfavorite" : "Add to Favorites"}</button>
            <button onClick={() => requestDelete(contextMenu.folderId)} className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"><Trash2 size={14} /> Delete Project</button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteId && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }} 
                    animate={{ scale: 1, opacity: 1 }} 
                    exit={{ scale: 0.95, opacity: 0 }} 
                    className="bg-popover border border-border w-full max-w-sm rounded-xl shadow-2xl p-6"
                >
                    <div className="flex items-start gap-4">
                        <div className="p-2 bg-destructive/10 rounded-full text-destructive"><AlertTriangle size={24} /></div>
                        <div><h3 className="text-lg font-bold text-foreground">Delete Project?</h3><p className="text-sm text-muted-foreground mt-1">All notes inside will be lost forever.</p></div>
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary rounded-lg transition-colors">Cancel</button>
                        <button onClick={confirmDelete} className="px-4 py-2 text-sm font-bold text-white bg-destructive hover:bg-destructive/90 rounded-lg transition-colors">Delete</button>
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>
    </div>
  );
}