import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, FileSpreadsheet, Mail, Trash2, ChevronDown, Check, FileDown, 
  Loader2, IndianRupee, Box, Search, ArrowUpAZ, ArrowDownAZ, Calendar, Eye, 
  AlertTriangle, CheckCircle2, Folder, ArrowLeft, User, Send, Square, CheckSquare, Clock
} from 'lucide-react';
import { getNotes, deleteNote, generatePdf, generateCsv, sendEmail, getFolders, deleteFolder, Note } from '@/services/api';

interface RecordsTabProps {
  selectedFolderId: number | null; 
  refreshTrigger: number;
  onNoteDeleted: () => void;
  onFolderSelect: (id: number | null) => void;
  onNoteTitleChange: (title: string | null) => void;
}

export function RecordsTab({ selectedFolderId, refreshTrigger, onNoteDeleted, onFolderSelect, onNoteTitleChange }: RecordsTabProps) {
  const [folders, setFolders] = useState<any[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Search & Sort
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: 'date' | 'name', order: 'asc' | 'desc' }>({ key: 'date', order: 'desc' });
  const [filterType, setFilterType] = useState<string>('all');
  
  const [selectedNote, setSelectedNote] = useState<Note | null>(null); 
  const [actionLoading, setActionLoading] = useState<{ [key: string]: boolean }>({});
  
  // Selection & Delete States
  const [selectedFolderIds, setSelectedFolderIds] = useState<number[]>([]);
  const [noteToDelete, setNoteToDelete] = useState<number | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<number | null>(null); 
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  
  // UI States
  const [emailDropdown, setEmailDropdown] = useState<number | null>(null);
  const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; folderId: number } | null>(null);

  // --- LOADING DATA ---
  useEffect(() => {
    const fetchFolders = async () => {
        try {
            const res: any = await getFolders();
            setFolders(Array.isArray(res) ? res : res.folders || []);
        } catch(e) { console.error(e); }
    };
    fetchFolders();
  }, [refreshTrigger]);

  useEffect(() => {
    const handleClick = () => {
        setContextMenu(null);
        setEmailDropdown(null);
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    setSelectedNote(null);
    onNoteTitleChange(null);
    setSearchQuery(''); 
    setSelectedFolderIds([]); 

    const loadNotes = async () => {
      if (!selectedFolderId) {
          setNotes([]); 
          return;
      }
      setLoading(true);
      try {
        const response: any = await getNotes(selectedFolderId);
        let data: Note[] = [];
        if (Array.isArray(response)) data = response;
        else if (response && Array.isArray(response.notes)) data = response.notes;
        setNotes(data);
      } catch (error) { setNotes([]); } finally { setLoading(false); }
    };
    loadNotes();
  }, [selectedFolderId, refreshTrigger]);

  // Toast
  useEffect(() => {
    if (toast) { const timer = setTimeout(() => setToast(null), 3000); return () => clearTimeout(timer); }
  }, [toast]);
  const showToast = (msg: string, type: 'success'|'error' = 'success') => { setToast({msg, type}); };

  // --- HELPERS ---
  const safeString = (val: any): string => {
    if (!val) return "N/A";
    if (typeof val === 'string') return val;
    if (typeof val === 'object') return Object.values(val).filter(v => typeof v === 'string').join(', ') || JSON.stringify(val);
    return String(val);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    // Returns full date like "Jan 9, 2026"
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const currentFolderColor = useMemo(() => {
      if (!selectedFolderId) return '#3b82f6';
      const folder = folders.find(f => f.id === selectedFolderId);
      return folder ? folder.color : '#3b82f6';
  }, [selectedFolderId, folders]);

  const getTransparentColor = (hex: string, opacity = 15) => {
    if (!hex) return 'transparent';
    if (hex.startsWith('#') && hex.length === 7) {
        return `${hex}${opacity}`; 
    }
    return hex;
  };

  const handleNoteSelect = (note: Note) => {
      setSelectedNote(note);
      onNoteTitleChange(safeString(note.data?.customer_information));
  };

  const handleBackToNotes = () => {
      setSelectedNote(null);
      onNoteTitleChange(null);
  };

  const handleFolderContextMenu = (e: React.MouseEvent, id: number) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, folderId: id });
  };

  // --- MULTI-SELECT ---
  const toggleFolderSelection = (id: number) => {
      setSelectedFolderIds(prev => 
          prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      );
  };

  const toggleSelectAllFolders = () => {
      if (selectedFolderIds.length === filteredData.length) {
          setSelectedFolderIds([]);
      } else {
          setSelectedFolderIds(filteredData.map((f: any) => f.id));
      }
  };

  // --- FILTERING ---
  const filteredData = useMemo(() => {
    if (!selectedFolderId) {
        let f = folders;
        if (searchQuery) f = f.filter(x => x.name.toLowerCase().includes(searchQuery.toLowerCase()));
        
        f.sort((a, b) => {
            const dateA = new Date(a.created_at || 0).getTime();
            const dateB = new Date(b.created_at || 0).getTime();
            const nameA = (a.name || '').toLowerCase();
            const nameB = (b.name || '').toLowerCase();
            if (sortConfig.key === 'date') return sortConfig.order === 'asc' ? dateA - dateB : dateB - dateA;
            else return sortConfig.order === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
        });
        return f;
    }

    let filtered = [...notes];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(n => {
        const client = safeString(n.data?.customer_information);
        return client.toLowerCase().includes(q);
      });
    }

    if (filterType !== 'all') {
        filtered = filtered.filter(n => {
            if (filterType === 'pricing') return !!n.data?.pricing_information;
            if (filterType === 'specs') return !!n.data?.product_details;
            if (filterType === 'action') return n.data?.action_items && n.data.action_items.length > 0;
            return true;
        });
    }

    filtered.sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      const nameA = safeString(a.data?.customer_information).toLowerCase();
      const nameB = safeString(b.data?.customer_information).toLowerCase();
      if (sortConfig.key === 'date') return sortConfig.order === 'asc' ? dateA - dateB : dateB - dateA;
      else return sortConfig.order === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    });

    return filtered;
  }, [notes, folders, selectedFolderId, searchQuery, sortConfig, filterType]);


  // --- ACTIONS ---
  const handleDownloadPDF = async (note: Note) => {
    const key = `pdf-${note.id}`; setActionLoading(p => ({ ...p, [key]: true }));
    try {
      const res = await generatePdf(note.id);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a'); link.href = url;
      link.setAttribute('download', `${safeString(note.data?.customer_information).replace(/[^a-z0-9]/gi, '_')}.pdf`);
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      showToast("PDF Exported successfully!");
    } catch (e) { showToast("PDF Generation Failed", 'error'); } finally { setActionLoading(p => ({ ...p, [key]: false })); }
  };

  const handleDownloadCSV = async (note: Note) => {
    const key = `csv-${note.id}`; setActionLoading(p => ({ ...p, [key]: true }));
    try {
      const res = await generateCsv(note.data);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a'); link.href = url;
      link.setAttribute('download', `${safeString(note.data?.customer_information).replace(/[^a-z0-9]/gi, '_')}.csv`);
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      showToast("CSV Exported!");
    } catch (e) { showToast("CSV Failed", 'error'); } finally { setActionLoading(p => ({ ...p, [key]: false })); }
  };

  const handleSendEmail = async (noteId: number, mode: 'text' | 'pdf') => {
    const key = `email-${noteId}-${mode}`; setActionLoading(p => ({ ...p, [key]: true }));
    try { await sendEmail(noteId, mode); setEmailDropdown(null); showToast("Outlook Opened Successfully"); } 
    catch (e) { showToast("Failed to open Outlook", 'error'); } finally { setActionLoading(p => ({ ...p, [key]: false })); }
  };

  const confirmDeleteNote = async () => {
    if (noteToDelete) {
        try {
            await deleteNote(noteToDelete);
            setNotes(prev => prev.filter(n => n.id !== noteToDelete));
            if (selectedNote?.id === noteToDelete) { setSelectedNote(null); onNoteTitleChange(null); }
            onNoteDeleted();
            showToast("Record Deleted");
        } catch (e) { showToast("Delete Failed", 'error'); }
        finally { setNoteToDelete(null); }
    }
  };

  const confirmDeleteFolder = async () => {
      if (folderToDelete) {
          try {
              await deleteFolder(folderToDelete);
              setFolders(prev => prev.filter(f => f.id !== folderToDelete));
              onNoteDeleted(); 
              showToast("Project Deleted");
          } catch(e) { showToast("Delete Failed", 'error'); }
          finally { setFolderToDelete(null); }
      }
  };

  const confirmBulkDelete = async () => {
      if (selectedFolderIds.length === 0) return;
      try {
          await Promise.all(selectedFolderIds.map(id => deleteFolder(id)));
          setFolders(prev => prev.filter(f => !selectedFolderIds.includes(f.id)));
          setSelectedFolderIds([]);
          onNoteDeleted();
          showToast(`Deleted ${selectedFolderIds.length} projects`);
      } catch (e) {
          showToast("Bulk Delete Failed", 'error');
      } finally {
          setShowBulkDeleteModal(false);
      }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background transition-colors duration-300 relative">
      
      {/* 1. HEADER */}
      <div className="h-16 border-b border-border flex items-center justify-between px-6 bg-card/50 backdrop-blur-md z-10 shrink-0 gap-4">
        
        {/* Navigation */}
        {selectedFolderId && !selectedNote && (
            <button onClick={() => onFolderSelect(null)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground font-medium transition-colors">
                <ArrowLeft size={16} /> All Folders
            </button>
        )}
        {selectedNote && (
            <button onClick={handleBackToNotes} className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground">
                <ArrowLeft size={18} />
            </button>
        )}

        {/* Search */}
        <div className="relative flex-1 max-w-md group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <input 
              type="text" 
              placeholder={selectedFolderId ? "Search notes..." : "Search repository..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-secondary/50 border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-foreground focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/70"
            />
        </div>

        {/* Filters & Actions */}
        {!selectedNote && (
            <div className="flex items-center gap-3">
                 {!selectedFolderId && selectedFolderIds.length > 0 && (
                     <button 
                        onClick={() => setShowBulkDeleteModal(true)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-all text-xs font-bold animate-in fade-in zoom-in duration-200"
                     >
                        <Trash2 size={14} /> Delete ({selectedFolderIds.length})
                     </button>
                 )}

                 <div className="flex bg-secondary p-1 rounded-lg border border-border">
                    <button onClick={() => setSortConfig({ key: 'date', order: sortConfig.order === 'desc' ? 'asc' : 'desc' })} className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all ${sortConfig.key === 'date' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                        <Calendar size={14} /> Date {sortConfig.key === 'date' && (sortConfig.order === 'desc' ? <ChevronDown size={12}/> : <Check size={12} className="rotate-180"/>)} 
                    </button>
                    <button onClick={() => setSortConfig({ key: 'name', order: sortConfig.order === 'asc' ? 'desc' : 'asc' })} className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all ${sortConfig.key === 'name' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                        {sortConfig.order === 'asc' ? <ArrowDownAZ size={14}/> : <ArrowUpAZ size={14}/>} Name
                    </button>
                 </div>

                 {selectedFolderId && (
                     <>
                        <div className="w-px h-6 bg-border" />
                        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="appearance-none bg-card border border-border rounded-lg pl-3 pr-8 py-2 text-sm text-foreground focus:outline-none cursor-pointer">
                            <option value="all">All Records</option>
                            <option value="pricing">Has Commercials</option>
                            <option value="specs">Has Specs</option>
                            <option value="action">Has Actions</option>
                        </select>
                     </>
                 )}
            </div>
        )}
      </div>

      {/* 2. CONTENT AREA */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 relative">
        <AnimatePresence mode='wait'>
            
            {/* VIEW 1: FOLDER LIST (ROOT) */}
            {!selectedFolderId && (
                <motion.div 
                    key="folders" 
                    initial={{ opacity: 0, x: -20 }} 
                    animate={{ opacity: 1, x: 0 }} 
                    exit={{ opacity: 0, x: -20 }}
                    className="flex flex-col"
                >
                    {/* Header Row - UPDATED COLUMNS */}
                    <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-muted-foreground border-b border-border mb-2 select-none">
                        <div className="col-span-1 flex items-center justify-center">
                            <button onClick={toggleSelectAllFolders} className="hover:text-foreground transition-colors">
                                {selectedFolderIds.length > 0 && selectedFolderIds.length === filteredData.length ? 
                                    <CheckSquare size={16} className="text-primary" /> : 
                                    <Square size={16} />
                                }
                            </button>
                        </div>
                        <div className="col-span-4">Name</div>
                        <div className="col-span-2">Created By</div>
                        <div className="col-span-2">Created Date</div>
                        <div className="col-span-2">Modified Date</div>
                        <div className="col-span-1 text-right"></div> 
                    </div>

                    {filteredData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground opacity-50">
                            <Folder size={48} strokeWidth={1} />
                            <p className="mt-4">No folders found</p>
                        </div>
                    ) : (
                        (filteredData as any[]).map(folder => (
                            <div 
                                key={folder.id} 
                                onClick={() => onFolderSelect(folder.id)}
                                onContextMenu={(e) => handleFolderContextMenu(e, folder.id)}
                                style={{ backgroundColor: selectedFolderIds.includes(folder.id) ? 'var(--secondary)' : getTransparentColor(folder.color, '15') }}
                                className="group grid grid-cols-12 gap-4 items-center p-3 rounded-lg border border-transparent hover:border-border cursor-pointer transition-all mb-1.5"
                            >
                                <div className="col-span-1 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                                    <button onClick={() => toggleFolderSelection(folder.id)} className="text-muted-foreground hover:text-primary transition-colors">
                                        {selectedFolderIds.includes(folder.id) ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
                                    </button>
                                </div>

                                <div className="col-span-4 flex items-center gap-3 overflow-hidden">
                                    <div 
                                        className="w-2 h-2 rounded-full shrink-0" 
                                        style={{ backgroundColor: folder.color || '#3b82f6' }}
                                    />
                                    <div className="p-2 bg-background/50 rounded-md text-muted-foreground group-hover:text-foreground transition-colors shrink-0">
                                        <Folder size={18} />
                                    </div>
                                    <span className="font-semibold text-foreground text-sm truncate">{folder.name}</span>
                                </div>
                                
                                <div className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground">
                                    <User size={12} />
                                    <span className="truncate">{folder.created_by || "Ishaan Pandey"}</span>
                                </div>
                                
                                {/* CREATED DATE - Expanded to 2 cols */}
                                <div className="col-span-2 text-xs text-muted-foreground font-mono">
                                    {folder.created_at ? formatDate(folder.created_at) : "N/A"}
                                </div>

                                {/* MODIFIED DATE - Expanded to 2 cols (Fallback to Created for now) */}
                                <div className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground font-mono">
                                     <Clock size={12} className="opacity-50"/>
                                    {folder.created_at ? formatDate(folder.created_at) : "N/A"}
                                </div>

                                <div className="col-span-1 flex justify-end">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setFolderToDelete(folder.id); }}
                                        className="p-1.5 hover:bg-destructive/20 text-muted-foreground hover:text-destructive rounded-md transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </motion.div>
            )}

            {/* VIEW 2: NOTE LIST (INSIDE FOLDER) - UNCHANGED */}
            {selectedFolderId && !selectedNote && (
                <motion.div 
                    key="notes" 
                    initial={{ opacity: 0, x: 20 }} 
                    animate={{ opacity: 1, x: 0 }} 
                    exit={{ opacity: 0, x: -20 }}
                    className="flex flex-col gap-2 pb-20"
                >
                    {loading ? (
                       <div className="text-center text-muted-foreground mt-20 flex flex-col items-center gap-3">
                          <Loader2 className="animate-spin opacity-50" size={32} />
                          <p>Syncing Repository...</p>
                       </div>
                    ) : (filteredData as Note[]).length === 0 ? (
                       <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 mt-20">
                          <FileDown size={48} strokeWidth={1} />
                          <p className="mt-4">No records found</p>
                       </div>
                    ) : (
                       (filteredData as Note[]).map((note) => (
                          <motion.div
                            key={note.id}
                            layout
                            onClick={() => handleNoteSelect(note)}
                            className="group flex items-center justify-between p-4 rounded-lg bg-card border border-border cursor-pointer transition-colors hover:bg-secondary/40"
                          >
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                               <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: currentFolderColor }} />
                               <div 
                                    className="w-10 h-10 rounded flex items-center justify-center shrink-0 border"
                                    style={{ 
                                        backgroundColor: getTransparentColor(currentFolderColor, '10'), 
                                        color: currentFolderColor, 
                                        borderColor: getTransparentColor(currentFolderColor, '25')
                                    }}
                               >
                                  <FileText size={20} />
                                </div>
                               <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-3">
                                      <h3 className="font-bold text-foreground text-sm truncate">
                                         {safeString(note.data?.customer_information)}
                                      </h3>
                                      {note.data?.pricing_information && <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400 text-[10px] font-bold border border-green-500/20">₹</span>}
                                  </div>
                                  <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                                     <span className="font-mono">{formatDate(note.created_at)}</span>
                                     <span className="w-px h-3 bg-border my-auto" />
                                     <span className="truncate max-w-[400px]">{safeString(note.data?.executive_summary).slice(0, 80)}...</span>
                                  </div>
                               </div>
                            </div>

                            <div className="flex items-center gap-2 pl-4 opacity-100 sm:opacity-40 group-hover:opacity-100 transition-opacity">
                                <button onClick={(e) => { e.stopPropagation(); handleNoteSelect(note); }} className="p-2 hover:bg-secondary rounded text-muted-foreground hover:text-foreground"><Eye size={18} /></button>
                                <button onClick={(e) => { e.stopPropagation(); handleDownloadPDF(note); }} className="p-2 hover:bg-secondary rounded text-muted-foreground hover:text-foreground">
                                   {actionLoading[`pdf-${note.id}`] ? <Loader2 className="animate-spin" size={16}/> : <FileDown size={18} />}
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); handleDownloadCSV(note); }} className="p-2 hover:bg-secondary rounded text-muted-foreground hover:text-foreground"><FileSpreadsheet size={18} /></button>
                                
                                <div className="relative">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setEmailDropdown(emailDropdown === note.id ? null : note.id); }}
                                        className="p-2 hover:bg-secondary rounded text-muted-foreground hover:text-foreground"
                                    >
                                        <Mail size={18} />
                                    </button>
                                    <AnimatePresence>
                                        {emailDropdown === note.id && (
                                            <motion.div 
                                                initial={{ opacity: 0, y: 5, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 5, scale: 0.95 }}
                                                className="absolute right-0 top-full mt-1 w-36 bg-popover border border-border rounded-lg shadow-xl z-20 overflow-hidden"
                                            >
                                                <button onClick={(e) => { e.stopPropagation(); handleSendEmail(note.id, 'text'); }} className="w-full text-left px-3 py-2 text-xs hover:bg-secondary flex items-center gap-2">
                                                    <Mail size={12}/> Send Text
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); handleSendEmail(note.id, 'pdf'); }} className="w-full text-left px-3 py-2 text-xs hover:bg-secondary flex items-center gap-2">
                                                    <FileDown size={12}/> Send PDF
                                                </button>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                <div className="w-px h-4 bg-border mx-1" />
                                <button onClick={(e) => { e.stopPropagation(); setNoteToDelete(note.id); }} className="p-2 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive"><Trash2 size={18} /></button>
                            </div>
                          </motion.div>
                       ))
                    )}
                </motion.div>
            )}

            {/* VIEW 3: NOTE DETAIL (FULL PAGE) - UNCHANGED */}
            {selectedNote && (
                <motion.div 
                    key="detail" 
                    initial={{ opacity: 0, x: 20 }} 
                    animate={{ opacity: 1, x: 0 }} 
                    exit={{ opacity: 0, x: 20 }}
                    className="flex flex-col h-full bg-background"
                >
                    <div className="flex-1 overflow-y-auto space-y-8 pr-2 pb-20">
                        <section>
                          <h3 className="text-xs font-bold text-primary uppercase tracking-widest mb-3">Executive Summary</h3>
                          <div className="bg-card p-6 rounded-xl border border-border text-foreground leading-relaxed text-base shadow-sm">
                            {safeString(selectedNote.data?.executive_summary)}
                          </div>
                        </section>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="bg-card p-5 rounded-xl border border-border shadow-sm">
                            <div className="flex items-center gap-2 mb-3 text-blue-500"><Box size={18} /> <h3 className="font-bold uppercase text-sm">Specs</h3></div>
                            <p className="text-sm text-foreground font-mono">{safeString(selectedNote.data?.product_details)}</p>
                          </div>
                          <div className="bg-card p-5 rounded-xl border border-border shadow-sm">
                            <div className="flex items-center gap-2 mb-3 text-green-500"><IndianRupee size={18} /> <h3 className="font-bold uppercase text-sm">Commercials</h3></div>
                            <p className="text-base text-foreground font-medium">{safeString(selectedNote.data?.pricing_information)}</p>
                          </div>
                        </div>

                        {selectedNote.data?.action_items && Array.isArray(selectedNote.data.action_items) && (
                           <section>
                              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Action Items</h3>
                              <div className="grid gap-2">
                                {selectedNote.data.action_items.map((item: any, i: number) => (
                                  <div key={i} className="flex items-start gap-4 p-4 bg-card rounded-lg border border-border shadow-sm">
                                    <div className="mt-0.5 p-1 bg-primary/10 rounded text-primary"><Check size={14} /></div>
                                    <span className="text-sm text-foreground">{safeString(item)}</span>
                                  </div>
                                ))}
                              </div>
                           </section>
                        )}
                        
                        {selectedNote.data?.additional_notes && (
                           <section>
                              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Additional Notes</h3>
                              <div className="bg-card p-4 rounded-lg border border-border text-sm text-muted-foreground italic">{safeString(selectedNote.data.additional_notes)}</div>
                           </section>
                        )}
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border bg-card/80 backdrop-blur-md flex justify-between items-center z-20">
                        <button onClick={() => setNoteToDelete(selectedNote.id)} className="px-4 py-2 text-destructive hover:bg-destructive/10 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                          <Trash2 size={16} /> Delete Permanently
                        </button>
                        
                        <div className="flex gap-3">
                          <button onClick={() => handleDownloadCSV(selectedNote)} className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-sm font-medium flex items-center gap-2 border border-border">
                             {actionLoading[`csv-${selectedNote.id}`] ? <Loader2 className="animate-spin" size={16}/> : <FileSpreadsheet size={16} />}
                             Export CSV
                          </button>
                        
                          <button onClick={() => handleDownloadPDF(selectedNote)} className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-sm font-medium flex items-center gap-2 border border-border">
                            {actionLoading[`pdf-${selectedNote.id}`] ? <Loader2 className="animate-spin" size={16}/> : <FileDown size={16} />}
                            Download PDF
                          </button>

                          <div className="w-px bg-border h-8 my-auto mx-1" />

                          <button onClick={() => handleSendEmail(selectedNote.id, 'text')} className="px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
                             {actionLoading[`email-${selectedNote.id}-text`] ? <Loader2 className="animate-spin" size={16}/> : <Mail size={16} />}
                             Send as Email
                          </button>

                          <button onClick={() => handleSendEmail(selectedNote.id, 'pdf')} className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg transition-colors">
                             {actionLoading[`email-${selectedNote.id}-pdf`] ? <Loader2 className="animate-spin" size={16}/> : <Send size={16} />}
                             Email PDF
                          </button>
                        </div>
                    </div>
                </motion.div>
            )}

        </AnimatePresence>
      </div>

      <AnimatePresence>
        {contextMenu && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed bg-popover border border-border shadow-xl rounded-lg py-1 min-w-[140px] z-50 backdrop-blur-lg" style={{ left: contextMenu.x, top: contextMenu.y }}>
                <button onClick={(e) => { e.stopPropagation(); setFolderToDelete(contextMenu.folderId); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors">
                    <Trash2 size={14} /> Delete Project
                </button>
            </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(noteToDelete || folderToDelete || showBulkDeleteModal) && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-popover border border-border w-full max-w-sm rounded-xl shadow-2xl p-6 relative">
                    <div className="flex items-start gap-4">
                        <div className="p-2 bg-destructive/10 rounded-full text-destructive"><AlertTriangle size={24} /></div>
                        <div>
                            <h3 className="text-lg font-bold text-foreground">
                                {showBulkDeleteModal ? `Delete ${selectedFolderIds.length} Projects?` : 
                                 folderToDelete ? 'Delete Project?' : 'Delete Record?'}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">This action cannot be undone.</p>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <button onClick={() => { setNoteToDelete(null); setFolderToDelete(null); setShowBulkDeleteModal(false); }} className="px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary rounded-lg transition-colors">Cancel</button>
                        <button 
                            onClick={() => {
                                if (showBulkDeleteModal) confirmBulkDelete();
                                else if (folderToDelete) confirmDeleteFolder();
                                else confirmDeleteNote();
                            }} 
                            className="px-4 py-2 text-sm font-bold text-white bg-destructive hover:bg-destructive/90 rounded-lg transition-colors"
                        >
                            Delete
                        </button>
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>

      <AnimatePresence>{toast && (<motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-xl flex items-center gap-2 text-sm font-medium z-[100] ${toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-600 text-white'}`}>{toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}{toast.msg}</motion.div>)}</AnimatePresence>
    </div>
  );
}