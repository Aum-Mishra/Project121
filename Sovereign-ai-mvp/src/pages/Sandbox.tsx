import React, { useState, useEffect, useRef } from "react";
import { useNav } from "../context/NavContext";
import { Play, Save, Plus, FileCode2, Terminal as TerminalIcon, FolderTree } from "lucide-react";
import Prism from "prismjs";
import "prismjs/components/prism-python";
import "prismjs/themes/prism-tomorrow.css";

export default function Sandbox() {
  const { projects, pendingSandboxTask, setPendingSandboxTask, navigate } = useNav();
  const [selectedProject, setSelectedProject] = useState(projects[0]?.name || "");
  
  const [files, setFiles] = useState([
    { name: "main.py", content: "def analyze_data():\n    print('Running analysis...')\n    return True\n\nif __name__ == '__main__':\n    analyze_data()" },
    { name: "utils.py", content: "def load_config():\n    return {'threshold': 7.1}" },
  ]);
  const [activeFile, setActiveFile] = useState("main.py");
  const [code, setCode] = useState("");
  const [stdIn, setStdIn] = useState("");
  const [output, setOutput] = useState("Ready. Press Run to execute code.");
  const [isRunning, setIsRunning] = useState(false);
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  
  // Auto-typing simulation
  const typeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (pendingSandboxTask) {
      const codeToType = pendingSandboxTask;
      setPendingSandboxTask(null);
      
      const newFile = "sandbox_task.py";
      setFiles(prev => {
        if (!prev.find(f => f.name === newFile)) {
          return [...prev, { name: newFile, content: "" }];
        }
        return prev;
      });
      setActiveFile(newFile);
      setCode("");
      
      let index = 0;
      const typeNextChunk = () => {
        if (index < codeToType.length) {
          // Type a chunk of 3-8 characters (like a word)
          const chunkSize = Math.floor(Math.random() * 5) + 3;
          const chunk = codeToType.substring(index, index + chunkSize);
          setCode(prev => prev + chunk);
          index += chunkSize;
          // Slower typing speed as requested
          typeTimeoutRef.current = setTimeout(typeNextChunk, Math.random() * 100 + 40);
        }
      };
      
      if (typeTimeoutRef.current) clearTimeout(typeTimeoutRef.current);
      typeTimeoutRef.current = setTimeout(typeNextChunk, 800);
    }
  }, [pendingSandboxTask, setPendingSandboxTask]);

  useEffect(() => {
    return () => {
      if (typeTimeoutRef.current) clearTimeout(typeTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (pendingSandboxTask) return; // Don't override while typing
    const file = files.find(f => f.name === activeFile);
    if (file) {
      setCode(file.content);
    }
  }, [activeFile, files]);

  const handleSave = () => {
    setFiles(files.map(f => f.name === activeFile ? { ...f, content: code } : f));
    setOutput(`File ${activeFile} saved successfully.`);
  };

  const handleRun = () => {
    setIsRunning(true);
    setOutput("Executing in isolated sandbox...");
    setTimeout(() => {
      setIsRunning(false);
      setOutput(`> python ${activeFile}\n\nRunning analysis...\nExecution completed in 0.4s.\n${stdIn ? `\nInput provided: ${stdIn}` : ''}`);
    }, 1200);
  };

  const handleCreateFile = () => {
    if (newFileName && !files.find(f => f.name === newFileName)) {
      setFiles([...files, { name: newFileName, content: "" }]);
      setActiveFile(newFileName);
      setNewFileName("");
      setShowNewFileInput(false);
    }
  };

  // Removed broken highlightCode function that caused HTML overlap

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50">
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate("workbench")}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-900 flex items-center justify-center transition-colors shadow-sm"
            title="Back to Workbench"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center shadow-sm">
            <FileCode2 className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">Workspace Sandbox</h1>
            <p className="text-xs text-slate-800 font-medium">Unified IDE & Execution Environment</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-slate-900">Project Workspace:</label>
            <select 
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer shadow-sm"
            >
              {projects.map(p => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="h-6 w-px bg-slate-200"></div>
          <button onClick={handleSave} className="flex items-center gap-1.5 text-xs px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors shadow-sm">
            <Save className="w-3.5 h-3.5" /> Save File
          </button>
          <button onClick={handleRun} disabled={isRunning} className="flex items-center gap-1.5 text-xs px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg transition-colors shadow-sm disabled:opacity-70">
            {isRunning ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Play className="w-3.5 h-3.5" />}
            {isRunning ? "Running..." : "Run Code"}
          </button>
        </div>
      </div>

      {/* Main IDE Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar (File Tree) */}
        <div className="w-64 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <FolderTree className="w-3.5 h-3.5" /> Files
            </span>
            <button onClick={() => setShowNewFileInput(!showNewFileInput)} className="w-6 h-6 rounded flex items-center justify-center text-slate-900 hover:bg-slate-200 hover:text-slate-700 transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {showNewFileInput && (
              <div className="flex items-center px-2 py-1.5 gap-2">
                <input 
                  autoFocus
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateFile()}
                  placeholder="filename.py"
                  className="w-full px-2 py-1 text-sm bg-white border border-teal-500 rounded outline-none shadow-sm"
                />
              </div>
            )}
            {files.map(f => (
              <button
                key={f.name}
                onClick={() => {
                  handleSave(); // auto-save current
                  setActiveFile(f.name);
                }}
                className={`w-full flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeFile === f.name ? "bg-teal-50 text-teal-700" : "text-slate-900 hover:bg-slate-100"}`}
              >
                <FileCode2 className={`w-3.5 h-3.5 mr-2 ${activeFile === f.name ? "text-teal-600" : "text-slate-900"}`} />
                {f.name}
              </button>
            ))}
          </div>
        </div>

        {/* Center Code Editor */}
        <div className="flex-1 flex flex-col bg-[#0d1117]">
          {/* Tabs */}
          <div className="flex bg-[#161b22] border-b border-slate-800 px-2 pt-2">
            <div className="px-4 py-2 bg-[#0d1117] text-teal-400 text-sm font-mono rounded-t-lg border-t border-l border-r border-teal-500/30 flex items-center gap-2">
              <FileCode2 className="w-4 h-4" /> {activeFile}
            </div>
          </div>
          
          {/* Editor Container with Overlay */}
          <div className="flex-1 relative w-full h-full overflow-hidden">
            {/* Syntax Highlighted Overlay */}
            <div 
              className="absolute inset-0 p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap pointer-events-none break-words"
              style={{ color: "#c9d1d9" }}
              dangerouslySetInnerHTML={{ __html: Prism.highlight(code, Prism.languages.python, 'python') }}
            />
            {/* Transparent Textarea */}
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="absolute inset-0 w-full h-full p-4 bg-transparent text-transparent caret-white font-mono text-sm leading-relaxed outline-none resize-none z-10 break-words"
              spellCheck="false"
            />
          </div>
        </div>

        {/* Right Sidebar (Input/Output Console) */}
        <div className="w-80 bg-white border-l border-slate-200 flex flex-col">
          {/* Standard Input */}
          <div className="h-1/3 flex flex-col border-b border-slate-200">
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <TerminalIcon className="w-3.5 h-3.5" /> Standard Input
            </div>
            <textarea 
              value={stdIn}
              onChange={(e) => setStdIn(e.target.value)}
              placeholder="Enter optional program input here..."
              className="flex-1 w-full p-3 bg-white text-slate-700 text-sm font-mono outline-none resize-none"
            />
          </div>

          {/* Terminal Output */}
          <div className="flex-1 flex flex-col bg-[#0d1117]">
            <div className="px-4 py-2 bg-[#161b22] border-b border-slate-800 font-bold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <TerminalIcon className="w-3.5 h-3.5" /> Output Console
            </div>
            <div className="flex-1 p-4 overflow-y-auto text-sm font-mono whitespace-pre-wrap" style={{ color: isRunning ? "#94A3B8" : "#86EFAC" }}>
              {output}
              {isRunning && <span className="animate-pulse">_</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
