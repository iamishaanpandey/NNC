import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { CaptureTab } from '@/components/CaptureTab';
import { RecordsTab } from '@/components/RecordsTab';
import { Camera, FileText, Moon, Sun, FolderOpen, Minus, X, AlertTriangle, Terminal, ChevronRight } from 'lucide-react';
import { getFolders } from '@/services/api';
import axios from 'axios';
import { AnimatePresence, motion } from 'framer-motion';

export default function Index() {
  const [activeTab, setActiveTab] = useState<'capture' | 'records'>('capture');
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [folderName, setFolderName] = useState<string>(""); 
  
  // New state for Breadcrumb: Note Name
  const [activeNoteTitle, setActiveNoteTitle] = useState<string | null>(null);

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args) => { setLogs(prev => [`[INFO] ${args.join(' ')}`, ...prev.slice(0, 49)]); originalLog(...args); };
    console.error = (...args) => { setLogs(prev => [`[ERROR] ${args.join(' ')}`, ...prev.slice(0, 49)]); originalError(...args); };
    return () => { console.log = originalLog; console.error = originalError; };
  }, []);

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  useEffect(() => {
    const fetchName = async () => {
      if (!selectedFolderId) { setFolderName(""); return; }
      try {
        const res: any = await getFolders();
        const folders = Array.isArray(res) ? res : (res.folders || []);
        const found = folders.find((f: any) => f.id === selectedFolderId);
        setFolderName(found ? found.name : "Unknown Project");
      } catch (e) { console.error(e); }
    };
    fetchName();
  }, [selectedFolderId, refreshTrigger]);

  // --- NAVIGATION LOGIC ---

  // 1. Sidebar Click: Directs to specific folder in Records
  const handleSidebarFolderSelect = (id: number | null) => {
    setSelectedFolderId(id);
    setActiveNoteTitle(null); 
    if (id) {
        setActiveTab('records'); 
    }
  };

  // 2. Folder Created (Capture): Stays on Capture, just sets ID
  const handleFolderCreated = (id: number) => {
      setSelectedFolderId(id);
      setRefreshTrigger(p => p + 1);
  };

  // 3. Top "Records" Tab Click: NOW PRESERVES FOLDER CONTEXT
  const handleRecordsTabClick = () => {
      setActiveTab('records');
      setActiveNoteTitle(null);
  };

  // 4. "View Record" (From Capture internal button)
  const handleViewRecord = () => {
      setActiveTab('records');
      setActiveNoteTitle(null);
  };

  const handleCaptureTabClick = () => {
      setActiveTab('capture');
  };

  const handleAnalysisComplete = () => setRefreshTrigger(prev => prev + 1);

  const getApi = () => (window as any).pywebview?.api;
  const handleMinimize = () => { const api = getApi(); if(api) api.minimize(); };
  const requestClose = () => setShowExitModal(true);
  const confirmClose = async () => {
      const api = getApi();
      if (api) api.close();
      else { try { await axios.post('http://127.0.0.1:8000/shutdown'); } catch (e) {} window.close(); }
  };

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden transition-colors duration-300 border border-border/50 rounded-lg shadow-2xl relative">
      
      {/* SIDEBAR */}
      <Sidebar 
        selectedFolderId={selectedFolderId}
        onSelectFolder={handleSidebarFolderSelect}
        onCreateFolder={handleFolderCreated} // <--- THIS WAS MISSING
        refreshTrigger={refreshTrigger}
        onFolderDeleted={() => { setSelectedFolderId(null); setRefreshTrigger(p => p + 1); }}
        onOpenRecords={handleRecordsTabClick}
        onToggleDebug={() => setShowDebug(!showDebug)}
      />
      
      <main className="flex-1 flex flex-col min-w-0 bg-background relative">
        
        {/* HEADER BAR */}
        <div className="h-14 border-b border-border flex items-center justify-between px-6 bg-card shrink-0 transition-colors select-none" style={{ WebkitAppRegion: 'drag' } as any}>
            
            {/* Left: Breadcrumbs */}
            <div className="flex items-center gap-2 text-foreground font-medium truncate max-w-md min-w-0" style={{ WebkitAppRegion: 'no-drag' } as any}>
                {activeTab === 'records' && (
                    <div className="flex items-center gap-1 text-sm animate-in fade-in slide-in-from-left-2 duration-200">
                        {/* 'Records' Breadcrumb: Clicking this goes to Root */}
                        <span 
                            className={`flex items-center gap-2 ${selectedFolderId ? 'text-muted-foreground hover:text-foreground cursor-pointer' : 'font-bold text-foreground'}`}
                            onClick={() => { setSelectedFolderId(null); setActiveNoteTitle(null); }}
                        >
                            <FileText size={16} /> Records
                        </span>
                        
                        {/* Folder Breadcrumb: Clicking this goes to Note List (exits detail) */}
                        {selectedFolderId && (
                            <>
                                <ChevronRight size={14} className="text-muted-foreground" />
                                <span 
                                    className={`flex items-center gap-2 ${activeNoteTitle ? 'text-muted-foreground hover:text-foreground cursor-pointer' : 'font-bold text-foreground'}`}
                                    onClick={() => setActiveNoteTitle(null)}
                                >
                                    <FolderOpen size={16} /> {folderName}
                                </span>
                            </>
                        )}

                        {activeNoteTitle && (
                            <>
                                <ChevronRight size={14} className="text-muted-foreground" />
                                <span className="font-bold text-foreground truncate max-w-[200px]">{activeNoteTitle}</span>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-4 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as any}>
                <div className="flex items-center bg-secondary p-0.5 rounded-lg border border-border">
                    <button 
                        onClick={handleCaptureTabClick} 
                        className={`flex items-center gap-2 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                            activeTab === 'capture' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Camera size={14} /> Capture
                    </button>
                    <button 
                        onClick={handleRecordsTabClick} 
                        className={`flex items-center gap-2 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                            activeTab === 'records' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <FileText size={14} /> Records
                    </button>
                </div>
                <div className="h-5 w-px bg-border mx-1" />
                <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                    {isDarkMode ? <Moon size={16} /> : <Sun size={16} />}
                </button>
                <div className="h-5 w-px bg-border mx-1" />
                <div className="flex items-center gap-1 ml-2">
                    <button onClick={handleMinimize} title="Minimize" className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"><Minus size={16} /></button>
                    <button onClick={requestClose} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><X size={18} /></button>
                </div>
            </div>
        </div>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 overflow-hidden relative">
            {activeTab === 'capture' ? (
                <CaptureTab 
                    selectedFolderId={selectedFolderId}
                    onAnalysisComplete={handleAnalysisComplete}
                    onFolderCreated={handleFolderCreated}
                    // Pass the View Record handler to CaptureTab
                    onViewRecord={handleViewRecord} 
                />
            ) : (
                <RecordsTab 
                    selectedFolderId={selectedFolderId}
                    refreshTrigger={refreshTrigger}
                    onNoteDeleted={() => setRefreshTrigger(prev => prev + 1)}
                    onFolderSelect={(id) => setSelectedFolderId(id)}
                    onNoteTitleChange={(title) => setActiveNoteTitle(title)}
                />
            )}
        </div>

        {/* DEBUG & MODAL */}
        <AnimatePresence>
            {showDebug && (
                <motion.div initial={{ y: 200, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 200, opacity: 0 }} className="absolute bottom-4 left-4 right-4 h-48 bg-black/95 backdrop-blur-md border border-border rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-secondary/20 border-b border-border">
                        <div className="flex items-center gap-2 text-xs font-mono text-primary"><Terminal size={12} /> System Logs</div>
                        <button onClick={() => setShowDebug(false)}><X size={14} className="text-muted-foreground hover:text-foreground"/></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 font-mono text-[10px] space-y-1">
                        {logs.map((log, i) => (<p key={i} className={log.includes('[ERROR]') ? 'text-red-400' : 'text-green-400'}>{log}</p>))}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
        <AnimatePresence>
            {showExitModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-popover border border-border w-full max-w-sm rounded-xl shadow-2xl p-6 relative">
                        <div className="flex items-start gap-4">
                            <div className="p-2 bg-destructive/10 rounded-full text-destructive"><AlertTriangle size={24} /></div>
                            <div><h3 className="text-lg font-bold text-foreground">Close Application?</h3><p className="text-sm text-muted-foreground mt-1">Are you sure you want to exit?</p></div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowExitModal(false)} className="px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary rounded-lg transition-colors">Cancel</button>
                            <button onClick={confirmClose} className="px-4 py-2 text-sm font-bold text-white bg-destructive hover:bg-destructive/90 rounded-lg transition-colors">Close App</button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
      </main>
    </div>
  );
}