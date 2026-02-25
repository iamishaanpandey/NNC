import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Camera, FileStack, Folder, ChevronRight, FileText } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { CaptureTab } from './CaptureTab';
import { RecordsTab } from './RecordsTab';

type Tab = 'capture' | 'records';

interface MainContentProps {
  selectedFolderId: number | null;
  selectedFolderName: string | null;
  isDark: boolean;
  onToggleTheme: () => void;
  onFolderCreated: (folderId: number) => void;
  refreshSidebar: () => void;
}

export function MainContent({ 
  selectedFolderId, 
  selectedFolderName,
  isDark, 
  onToggleTheme, 
  onFolderCreated, 
  refreshSidebar 
}: MainContentProps) {
  const [activeTab, setActiveTab] = useState<Tab>('capture');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [currentNoteName, setCurrentNoteName] = useState<string | null>(null);

  const tabs = [
    { id: 'capture', label: 'Capture', icon: Camera },
    { id: 'records', label: 'Records', icon: FileStack },
  ];

  const handleAnalysisComplete = () => {
    setActiveTab('records');
    setRefreshTrigger(prev => prev + 1);
    refreshSidebar();
  };

  const handleNoteDeleted = () => {
    refreshSidebar();
    setCurrentNoteName(null);
  };

  // Reset note name if folder changes
  useEffect(() => {
    setCurrentNoteName(null);
  }, [selectedFolderId]);

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      {/* Sticky Header */}
      <header className="flex-shrink-0 h-12 flex items-center justify-between px-4 border-b border-border bg-card">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-sm overflow-hidden whitespace-nowrap mask-linear-fade">
          {!selectedFolderName ? (
            <span className="text-muted-foreground font-medium flex items-center gap-2">
               ST NeuraNote
            </span>
          ) : (
            <div className="flex items-center gap-1 text-muted-foreground">
                <div className="flex items-center gap-2 text-foreground font-medium">
                    <Folder className="h-4 w-4 text-blue-500" />
                    {selectedFolderName}
                </div>
                
                {currentNoteName && (
                    <>
                        <ChevronRight className="h-4 w-4 opacity-50" />
                        <div className="flex items-center gap-2 text-foreground animate-in fade-in slide-in-from-left-2">
                            <FileText className="h-3.5 w-3.5 text-primary" />
                            <span className="font-semibold">{currentNoteName}</span>
                        </div>
                    </>
                )}
            </div>
          )}
        </div>

        {/* Center: Tab Switcher */}
        <div className="segmented-control absolute left-1/2 -translate-x-1/2 hidden md:flex">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`segmented-item ${activeTab === tab.id ? 'active' : ''}`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Theme Toggle */}
        <div className="flex items-center gap-2">
            <div className="md:hidden flex bg-secondary p-0.5 rounded-lg border border-border">
                {/* Mobile Tab Switcher */}
                <button onClick={() => setActiveTab('capture')} className={`p-1.5 rounded-md ${activeTab === 'capture' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}><Camera size={14}/></button>
                <button onClick={() => setActiveTab('records')} className={`p-1.5 rounded-md ${activeTab === 'records' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}><FileStack size={14}/></button>
            </div>
            <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
        </div>
      </header>

      {/* Tab Content - Scrollable */}
      <div className="flex-1 overflow-hidden bg-background">
        {activeTab === 'capture' ? (
          <CaptureTab 
            selectedFolderId={selectedFolderId}
            onAnalysisComplete={handleAnalysisComplete}
            onFolderCreated={onFolderCreated}
          />
        ) : (
          <RecordsTab 
            selectedFolderId={selectedFolderId}
            onSelectFolder={(id) => onFolderCreated(id)} // Re-using prop to switch folder context
            refreshTrigger={refreshTrigger}
            onNoteDeleted={handleNoteDeleted}
            onViewNote={(name) => setCurrentNoteName(name)} // Callback to update header
          />
        )}
      </div>
    </div>
  );
}