import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Webcam from 'react-webcam';
import {
  Upload, Camera, FileText, Sparkles, FileSpreadsheet, Save,
  Loader2, X, Image as ImageIcon, CheckCircle2, FolderOpen, AlertTriangle, ArrowRight
} from 'lucide-react';
import { analyzeContent, createPrompt, importPrompts, getFolders, createFolder, Prompt, getPrompts } from '@/services/api';

interface CaptureTabProps {
  selectedFolderId: number | null;
  onAnalysisComplete: () => void;
  onFolderCreated: (folderId: number) => void;
}

type InputMode = 'upload' | 'webcam' | 'text';

interface CapturedPage {
  id: string;
  data: string;
  file?: File;
}

const reportTypes = [
  { value: 'Standard Meeting', label: 'Standard Report' },
  { value: 'Visitor Report', label: 'Visitor Report' },
  { value: 'Site Inspection', label: 'Site Inspection' },
];

export function CaptureTab({ selectedFolderId, onAnalysisComplete, onFolderCreated }: CaptureTabProps) {
  const [inputMode, setInputMode] = useState<InputMode>('upload');
  const [pages, setPages] = useState<CapturedPage[]>([]);
  const [textContent, setTextContent] = useState('');
  const [reportType, setReportType] = useState('Standard Meeting');
  const [mergeFiles, setMergeFiles] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [prompts, setPrompts] = useState<Prompt>({}); 
  const [excelPrompts, setExcelPrompts] = useState<Prompt>({}); 
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);
  const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newPromptName, setNewPromptName] = useState('');

  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { loadSavedPrompts(); }, []);
  useEffect(() => { 
    if (promptInputRef.current) { 
        promptInputRef.current.style.height = "auto"; 
        promptInputRef.current.style.height = `${promptInputRef.current.scrollHeight}px`; 
    } 
  }, [customPrompt]);
  
  useEffect(() => { if (pages.length > 1) setMergeFiles(true); }, [pages.length]);
  
  useEffect(() => { 
      if (toast) { 
          const timer = setTimeout(() => setToast(null), 3000); 
          return () => clearTimeout(timer); 
      } 
  }, [toast]);
  
  useEffect(() => { 
      if (successMsg) { 
          const timer = setTimeout(() => setSuccessMsg(false), 5000); 
          return () => clearTimeout(timer); 
      } 
  }, [successMsg]);

  const loadSavedPrompts = async () => { 
      try { 
          const saved = await getPrompts(); 
          setPrompts(saved); 
      } catch (e) { console.error(e); } 
  };
  
  const showToast = (msg: string, type: 'success'|'error' = 'success') => setToast({msg, type});

  const handleDrag = (e: React.DragEvent) => { 
      e.preventDefault(); e.stopPropagation(); 
      if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true); 
      else if (e.type === 'dragleave') setDragActive(false); 
  };
  
  const handleDrop = (e: React.DragEvent) => { 
      e.preventDefault(); e.stopPropagation(); setDragActive(false); 
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) addFilesAsPages(Array.from(e.dataTransfer.files)); 
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { 
      if (e.target.files && e.target.files.length > 0) addFilesAsPages(Array.from(e.target.files)); 
  };

  const addFilesAsPages = async (files: File[]) => {
    const newPages: CapturedPage[] = [];
    let rejected = 0;
    const processFiles = files.length > 5 ? files.slice(0, 5) : files;
    
    if (files.length > 5) showToast("Limited to 5 files for performance.", 'error');

    for (const file of processFiles) {
      if (file.name.startsWith('.') || file.name === 'Thumbs.db') continue;
      if (!file.type.startsWith('image/') && file.type !== 'application/pdf') { rejected++; continue; }
      try {
          const reader = new FileReader();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          newPages.push({ id: `file-${Date.now()}-${Math.random().toString(36).slice(2)}`, data: dataUrl, file });
      } catch (err) { console.error("Error reading file:", file.name, err); rejected++; }
    }
    if (newPages.length === 0 && files.length > 0) showToast("No valid images found.", 'error');
    else if (rejected > 0) showToast(`Imported ${newPages.length} files (${rejected} skipped).`, 'success');
    else if (newPages.length > 0) showToast(`Imported ${newPages.length} files.`, 'success');
    setPages(prev => [...prev, ...newPages]);
  };

  const removePage = (id: string) => setPages(prev => prev.filter(p => p.id !== id));
  
  const capturePhoto = useCallback(() => { 
      const imageSrc = webcamRef.current?.getScreenshot(); 
      if (imageSrc) setPages(prev => [...prev, { id: `webcam-${Date.now()}-${Math.random().toString(36).slice(2)}`, data: imageSrc }]); 
  }, [webcamRef]);

  const handleLoadExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const importedPrompts = await importPrompts(e.target.files[0]);
        setExcelPrompts(importedPrompts); 
        showToast("Excel prompts loaded!", 'success');
        e.target.value = ''; 
      } catch (error) { showToast('Failed to import prompts', 'error'); console.error(error); }
    }
  };

  const requestSavePrompt = () => { 
      if (!customPrompt.trim()) return; 
      setNewPromptName(''); 
      setShowSaveModal(true); 
  };
  
  const confirmSavePrompt = async () => { 
      if(!newPromptName.trim()) return; 
      try { 
          await createPrompt(newPromptName, customPrompt); 
          setPrompts(prev => ({ ...prev, [newPromptName]: customPrompt })); 
          setReportType(newPromptName); 
          setShowSaveModal(false); 
          showToast("Prompt saved successfully"); 
      } catch (error) { showToast("Failed to save", 'error'); } 
  };

  const getOrCreateFolder = async (): Promise<number> => {
    if (selectedFolderId) return selectedFolderId;
    const today = new Date();
    const folderName = `Meeting_${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    try {
      const response: any = await getFolders();
      const existingFolders = Array.isArray(response) ? response : (response.folders || []);
      const existingFolder = existingFolders.find((f: any) => f.name === folderName);
      if (existingFolder) { 
          onFolderCreated(existingFolder.id); 
          return existingFolder.id; 
      }
      
      const newFolder = await createFolder(folderName);
      // Handle both backend response formats
      const newId = newFolder.id || (newFolder.data && newFolder.data.id);
      
      if (newId) { 
          onFolderCreated(newId); 
          return newId; 
      }
      throw new Error("Could not create folder");
    } catch (error) { 
        console.error(error); 
        throw error; 
    }
  };

const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const folderId = await getOrCreateFolder();
      let analysisFiles: File[] = [];
      if (inputMode !== 'text' && pages.length > 0) {
        for (const page of pages) {
          if (page.file) analysisFiles.push(page.file);
          else {
            const res = await fetch(page.data);
            const blob = await res.blob();
            analysisFiles.push(new File([blob], `page-${page.id}.jpg`, { type: 'image/jpeg' }));
          }
        }
      }
      const promptToUse = prompts[reportType] ? prompts[reportType] : reportType;
      const fullPrompt = `${promptToUse}: ${customPrompt}`;
      const apiMode = inputMode === 'text' ? 'text' : 'image';

      // Updated call to include mergeFiles state
      await analyzeContent(
        folderId, 
        apiMode, 
        inputMode === 'text' ? textContent : undefined, 
        analysisFiles.length > 0 ? analysisFiles : undefined, 
        fullPrompt,
        mergeFiles // This passes the checkbox value to the backend
      );

      setPages([]); 
      setTextContent(''); 
      setCustomPrompt(''); 
      setSuccessMsg(true); 
      onAnalysisComplete();
    } catch (error: any) {
      console.error(error);
      const msg = error.response?.data?.detail || error.message || "Analysis Failed";
      showToast(msg, 'error');
    } finally { setIsAnalyzing(false); }
  };

  const goToRecords = () => { 
      const recordsBtn = document.querySelectorAll('button'); 
      for (let i = 0; i < recordsBtn.length; i++) { 
          if (recordsBtn[i].textContent?.includes("Records")) { 
              recordsBtn[i].click(); 
              break; 
          } 
      } 
  };
  
  const inputModes = [{ id: 'upload', label: 'Upload', icon: Upload }, { id: 'webcam', label: 'Webcam', icon: Camera }, { id: 'text', label: 'Text', icon: FileText }];
  const hasInput = pages.length > 0 || textContent.trim();

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background transition-colors duration-300 relative">
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="segmented-control inline-flex bg-secondary p-1 rounded-lg">{inputModes.map(mode => (<button key={mode.id} onClick={() => setInputMode(mode.id as InputMode)} className={`segmented-item px-4 py-2 rounded-md text-xs font-medium transition-all ${inputMode === mode.id ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}><div className="flex items-center gap-2"><mode.icon className="h-4 w-4" /> {mode.label}</div></button>))}</div>
          <div className="card-surface p-4 border border-border rounded-xl bg-card transition-colors duration-300 w-full">
            <AnimatePresence mode="wait">
              {inputMode === 'upload' && (<motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3"><div onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop} className={`drop-zone h-48 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-colors ${dragActive ? 'border-primary bg-primary/5' : 'border-border bg-background/50'}`}><input ref={fileInputRef} type="file" multiple accept="image/*,.pdf" onChange={handleFileChange} className="hidden" /><input ref={folderInputRef} type="file" multiple {...{ webkitdirectory: "", directory: "" } as any} onChange={handleFileChange} className="hidden" /><Upload className="h-10 w-10 text-muted-foreground mb-2" /><p className="text-base font-medium text-foreground">Drag & Drop files</p><div className="flex gap-3 mt-4"><button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground text-xs font-medium rounded-md border border-border transition-colors">Select Files</button><span className="text-muted-foreground text-xs flex items-center">or</span><button onClick={() => folderInputRef.current?.click()} className="px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium rounded-md border border-primary/20 transition-colors flex items-center gap-2"><FolderOpen size={14} /> Select Folder</button></div></div></motion.div>)}
              {inputMode === 'webcam' && (<motion.div key="webcam" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3"><div className="relative rounded-xl overflow-hidden bg-black aspect-video border border-border max-h-[40vh] mx-auto group"><Webcam ref={webcamRef} audio={false} screenshotFormat="image/jpeg" className="w-full h-full object-cover" /><div className="absolute bottom-3 left-1/2 -translate-x-1/2"><button onClick={capturePhoto} className="px-5 py-2 bg-white/90 backdrop-blur-sm text-black font-bold text-xs rounded-xl hover:scale-105 transition-all shadow-lg flex items-center gap-2 border border-white/50 hover:bg-white"><Camera className="h-4 w-4" /> SNAP</button></div></div></motion.div>)}
              {inputMode === 'text' && (<motion.div key="text" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><textarea value={textContent} onChange={(e) => setTextContent(e.target.value)} placeholder="Enter your text content..." className="w-full h-[40vh] p-4 rounded-xl bg-secondary border border-border text-foreground text-sm font-mono placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary transition-colors" /></motion.div>)}
            </AnimatePresence>
          </div>
          {pages.length > 0 && (<div className="card-surface p-3 border border-border rounded-xl bg-card"><div className="flex items-center gap-2 mb-2"><ImageIcon className="h-4 w-4 text-muted-foreground" /><span className="text-xs font-medium text-foreground">{pages.length} item{pages.length > 1 ? 's' : ''} ready</span></div><div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">{pages.map((page, index) => (<div key={page.id} className="relative aspect-[3/4] h-20 shrink-0 group rounded-lg overflow-hidden border border-border shadow-sm"><img src={page.data} alt={`Page ${index + 1}`} className="w-full h-full object-cover" /><button onClick={() => removePage(page.id)} className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"><X className="h-3 w-3" /></button><span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5">{index + 1}</span></div>))}</div></div>)}
          <div className="card-surface p-3 space-y-3 border border-border rounded-xl bg-card transition-colors">
            <div className="flex flex-wrap items-center gap-3"><select value={reportType} onChange={(e) => setReportType(e.target.value)} className="flex-1 min-w-[200px] h-9 px-3 rounded-md bg-background border border-input text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer">{Object.entries(prompts).length > 0 && (<optgroup label="Saved Prompts">{Object.keys(prompts).map(name => <option key={name} value={name}>{name}</option>)}</optgroup>)}<optgroup label="Standard Types">{reportTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</optgroup></select><div className="h-6 w-px bg-border hidden sm:block" /><label className="flex items-center gap-2 text-xs text-foreground cursor-pointer hover:bg-secondary/50 px-2 py-1 rounded transition-colors select-none"><input type="checkbox" checked={mergeFiles} onChange={(e) => setMergeFiles(e.target.checked)} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" /><span>Merge files</span></label></div>
            {Object.keys(excelPrompts).length > 0 && (<div className="flex items-center gap-2 p-2 bg-secondary/30 rounded-md border border-border animate-in fade-in zoom-in-95"><span className="text-[10px] font-bold text-primary whitespace-nowrap flex items-center gap-1"><FileSpreadsheet size={12} /> IMPORT:</span><select className="flex-1 h-8 px-2 rounded bg-background border border-input text-xs text-foreground focus:outline-none cursor-pointer" defaultValue="" onChange={(e) => { if (e.target.value) setCustomPrompt(e.target.value); }}><option value="" disabled>Select a prompt...</option>{Object.entries(excelPrompts).map(([name, content]) => (<option key={name} value={content}>{name}</option>))}</select><button onClick={() => { setExcelPrompts({}); setCustomPrompt(''); }} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors" title="Dismiss & Clear"><X size={14} /></button></div>)}
            <div className="flex items-start gap-2"><div className="relative flex-1 group"><textarea ref={promptInputRef} value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} placeholder="Custom requirements (or select from Excel)..." className="w-full min-h-[56px] px-4 py-3 pr-10 rounded-xl bg-secondary/30 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 focus:bg-background transition-all duration-200 resize-none leading-relaxed overflow-hidden" rows={1} />{customPrompt && (<button onClick={() => setCustomPrompt('')} className="absolute right-3 top-3 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Clear Text"><X size={14}/></button>)}</div><div className="flex flex-col gap-1 mt-0.5"><button onClick={() => excelInputRef.current?.click()} className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors border border-border" title="Load Excel"><FileSpreadsheet className="h-4 w-4" /></button><input ref={excelInputRef} type="file" accept=".xlsx,.xls" onChange={handleLoadExcel} className="hidden" /><button onClick={requestSavePrompt} disabled={!customPrompt.trim()} className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors border border-border disabled:opacity-50" title="Save Prompt"><Save className="h-4 w-4" /></button></div></div>
          </div>
        </div>
      </div>
      <div className="flex-shrink-0 p-4 border-t border-border bg-background transition-colors"><div className="max-w-5xl mx-auto">{successMsg ? (<div className="flex gap-3 animate-in fade-in zoom-in duration-300"><button className="flex-1 h-10 rounded-lg bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30 font-bold text-sm flex items-center justify-center gap-2 cursor-default"><CheckCircle2 className="h-4 w-4" /> Saved!</button><button onClick={goToRecords} className="px-6 h-10 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30 font-bold text-xs flex items-center justify-center gap-2 transition-colors">View Record <ArrowRight className="h-3 w-3" /></button></div>) : (<button onClick={handleAnalyze} disabled={isAnalyzing || !hasInput} className="w-full h-10 rounded-lg bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md">{isAnalyzing ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</> : <><Sparkles className="h-4 w-4" />Digitize Visit Report</>}</button>)}</div></div>
      <AnimatePresence>{toast && (<motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-xl flex items-center gap-2 text-sm font-medium z-50 ${toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-destructive text-white'}`}>{toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}{toast.msg}</motion.div>)}</AnimatePresence>
      <AnimatePresence>{showSaveModal && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"><motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-popover border border-border w-full max-w-sm rounded-xl shadow-2xl p-6"><h3 className="text-lg font-bold text-foreground mb-4">Save Custom Prompt</h3><input autoFocus type="text" value={newPromptName} onChange={(e) => setNewPromptName(e.target.value)} placeholder="Enter prompt name..." className="w-full h-10 px-3 rounded-md bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary mb-6" /><div className="flex justify-end gap-3"><button onClick={() => setShowSaveModal(false)} className="px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary rounded-lg">Cancel</button><button onClick={confirmSavePrompt} disabled={!newPromptName.trim()} className="px-4 py-2 text-sm font-bold text-white bg-primary hover:bg-primary/90 rounded-lg disabled:opacity-50">Save</button></div></motion.div></div>)}</AnimatePresence>
    </div>
  );
}