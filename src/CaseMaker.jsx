import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Briefcase, 
  IdCard, 
  Tag, 
  FileText, 
  ArrowRight, 
  Pencil, 
  RefreshCw, 
  Cloud, 
  Terminal, 
  AlertCircle,
  CheckCircle2,
  Loader2,
  Search
} from 'lucide-react';

// GUARDIAN NOTE: Ensure this matches your newly deployed Code.gs Web App URL!
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbxDKB-wWAd-BDOdfqe-sr6RRgrakIM5qhqfQy-2mvF9hQ7-xJAk8NhZcdPSPeHFFfGZ/exec";

export default function CaseMaker({ isAdmin = true }) {
  const [activeTab, setActiveTab] = useState('cloud');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ msg: '', type: '' });
  
  // Database State
  const [database, setDatabase] = useState([]);
  const [isFetchingDb, setIsFetchingDb] = useState(true);
  
  // Searchable Dropdown State
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);
  
  const [formData, setFormData] = useState({
    caseName: '',
    classificationOption: '1',
    customClassification: '',
    customTemplateChoice: 'LOE'
  });

  const [localData, setLocalData] = useState({
    caseName: '',
    type: 'LOE',
    templateQty: 5,
    refillQty: 1
  });

  // --- 1. FETCH DATABASE ON LOAD (WITH GUARDIAN DIAGNOSTICS) ---
  useEffect(() => {
    const fetchDatabase = async () => {
      try {
        const response = await fetch(GAS_API_URL, { redirect: 'follow' });
        const textData = await response.text(); 
        
        let data;
        try {
          data = JSON.parse(textData);
        } catch (parseError) {
          console.error("RAW GAS RESPONSE:", textData);
          
          // Guardian Diagnostic Engine
          if (textData.includes('Sign in - Google Accounts')) {
            throw new Error("AUTH WALL: GAS deployment must be 'Anyone' (not limited to domain).");
          } else if (textData.includes('<html') || textData.includes('<!DOCTYPE html>')) {
            throw new Error("DEPLOYMENT ERROR: Backend returned HTML. You MUST select 'New Version' when editing the deployment in GAS.");
          } else {
            throw new Error("Backend returned invalid data instead of JSON.");
          }
        }

        // If GAS itself caught an error, it returns a JSON object with { error: "..." }
        if (data.error) {
           throw new Error(`GAS Backend Error: ${data.error}`);
        }

        if (!Array.isArray(data)) {
           throw new Error("Database sync failed. Backend did not return an array.");
        }

        // Filter out empty rows from Google Sheets
        const validData = data.filter(item => item && item.firm);
        setDatabase(validData);
      } catch (error) {
        console.error("DB Fetch failed", error);
        
        let errorMsg = error.message;
        // Intercept hard CORS crashes to provide exact actionable advice
        if (errorMsg === 'Failed to fetch' || errorMsg.includes('NetworkError')) {
          errorMsg = "CORS/Auth Block: 1) Ensure GAS 'Who has access' is set exactly to 'Anyone'. 2) Disable ad-blockers (Brave Shields). 3) Test in Incognito window.";
        }
        
        setStatus({ msg: errorMsg, type: 'error' });
      } finally {
        setIsFetchingDb(false);
      }
    };
    fetchDatabase();
  }, []);

  // --- 2. DROPDOWN CLICK-OUTSIDE LISTENER ---
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- 3. FILTER LOGIC ---
  const filteredFirms = useMemo(() => {
    if (!searchQuery) return database;
    const lowerQ = searchQuery.toLowerCase();
    return database.filter(item => 
      item.firm.toLowerCase().includes(lowerQ) || 
      (item.attorney && item.attorney.toLowerCase().includes(lowerQ))
    );
  }, [database, searchQuery]);

  // --- 4. SUBMISSION HANDLERS ---
  const handleCloudSubmit = async (e) => {
    e.preventDefault();
    
    const exactMatch = database.find(d => d.firm.toLowerCase() === searchQuery.trim().toLowerCase());
    
    if (!exactMatch) {
      setStatus({ msg: 'Please select a valid firm from the dropdown list.', type: 'error' });
      return;
    }

    setLoading(true);
    setStatus({ msg: 'Processing Drive automation...', type: 'info' });

    const finalPayload = { ...formData, lawyer: exactMatch.firm };

    try {
      const response = await fetch(GAS_API_URL, {
        method: 'POST',
        redirect: 'follow', 
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ 
          action: 'CREATE_CASE', 
          payload: finalPayload 
        })
      });
      
      const textData = await response.text();
      let result;
      
      try {
        result = JSON.parse(textData);
      } catch (parseError) {
        console.error("GAS POST RESPONSE:", textData);
        if (textData.includes('<html')) {
           throw new Error("DEPLOYMENT ERROR: Backend returned HTML on POST. Ensure 'New Version' is deployed.");
        }
        throw new Error("Backend returned invalid response.");
      }
      
      if (result.status === 'success') {
        setStatus({ msg: result.message, type: 'success' });
        // Reset form
        setSearchQuery('');
        setFormData({ caseName: '', classificationOption: '1', customClassification: '', customTemplateChoice: 'LOE' });
      } else {
        setStatus({ msg: result.message || 'Automation failed.', type: 'error' });
      }
    } catch (err) {
      let errorMsg = err.message;
      if (errorMsg === 'Failed to fetch' || errorMsg.includes('NetworkError')) {
        errorMsg = "CORS/Auth Block: Deployment must be 'Anyone'. Disable ad-blockers.";
      }
      setStatus({ msg: errorMsg, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleLocalSubmit = async (e, actionType) => {
    e.preventDefault();
    setLoading(true);
    setStatus({ msg: 'Sending command to local agent...', type: 'info' });

    let payload = { action: actionType };
    if (actionType === 'RENAME') {
      payload.caseName = localData.caseName;
      payload.type = localData.type;
    } else if (actionType === 'CREATE_TEMPLATES') {
      payload.count = localData.templateQty;
    } else if (actionType === 'REFILL_CASES') {
      payload.count = localData.refillQty;
    }

    try {
      const response = await fetch(GAS_API_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'LOCAL_COMMAND', payload })
      });
      
      const textData = await response.text();
      let result;
      
      try {
        result = JSON.parse(textData);
      } catch (e) {
        throw new Error("Backend returned invalid response on Local Command.");
      }
      
      if (result.status === 'success') {
        setStatus({ msg: result.message, type: 'success' });
        if (actionType === 'RENAME') setLocalData(prev => ({ ...prev, caseName: '' }));
      } else {
        setStatus({ msg: result.message || 'Local link failed.', type: 'error' });
      }
    } catch (err) {
      let errorMsg = err.message;
      if (errorMsg === 'Failed to fetch' || errorMsg.includes('NetworkError')) {
        errorMsg = "CORS/Auth Block: Deployment must be 'Anyone'. Disable ad-blockers.";
      }
      setStatus({ msg: errorMsg, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-900/50 transition-colors">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
        
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 text-center">
          <div className="bg-white rounded-lg p-4 mb-4 shadow-md inline-block min-w-[200px]">
            <h2 className="text-3xl font-serif text-amber-600 tracking-wide leading-none">ACTUARY</h2>
            <p className="text-[0.65rem] font-sans text-slate-500 tracking-[0.3em] uppercase mt-1">Consulting</p>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">RyanGPT</h1>
          <p className="text-blue-100 text-sm font-medium mt-1 uppercase tracking-wider">Case Maker</p>
        </div>

        {isAdmin && (
          <div className="flex border-b border-slate-200 dark:border-slate-700">
            <button 
              onClick={() => setActiveTab('cloud')}
              className={`w-1/2 py-4 text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'cloud' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
            >
              <Cloud size={18} /> Cloud Cases
            </button>
            <button 
              onClick={() => setActiveTab('local')}
              className={`w-1/2 py-4 text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'local' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
            >
              <Terminal size={18} /> Local / Python
            </button>
          </div>
        )}

        <div className="p-8">
          {activeTab === 'cloud' && (
            <form onSubmit={handleCloudSubmit} className="space-y-5">
              
              {/* STRICT SEARCHABLE DROPDOWN */}
              <div className="relative group" ref={dropdownRef}>
                <div className="flex justify-between items-end mb-1.5 pl-1">
                  <label className="block text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest">Attorney / Firm Name</label>
                  {isFetchingDb && <span className="text-[9px] font-bold text-amber-500 flex items-center gap-1"><RefreshCw size={10} className="animate-spin" /> Syncing DB...</span>}
                </div>
                
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 group-focus-within:text-blue-500 transition-colors">
                    <Briefcase size={18} />
                  </span>
                  
                  <input 
                    type="text"
                    required
                    disabled={isFetchingDb}
                    placeholder={isFetchingDb ? "Loading client database..." : "Search for firm..."}
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-50"
                  />
                  
                  <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 pointer-events-none">
                    <Search size={16} />
                  </span>
                </div>

                {/* Custom Dropdown Menu */}
                {showDropdown && !isFetchingDb && (
                  <ul className="absolute z-50 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl mt-1 shadow-2xl max-h-64 overflow-y-auto custom-scroll animate-in fade-in slide-in-from-top-1">
                    {filteredFirms.length === 0 ? (
                      <li className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 text-center italic">No matching firms found.</li>
                    ) : (
                      filteredFirms.map((item, idx) => (
                        <li 
                          key={idx}
                          onClick={() => {
                            setSearchQuery(item.firm);
                            setShowDropdown(false);
                            setStatus({ msg: '', type: '' }); // Clear errors
                          }}
                          className="px-4 py-3 hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer border-b border-slate-50 dark:border-slate-700/50 last:border-0 transition-colors group/item"
                        >
                          <div className="text-sm font-bold text-slate-700 dark:text-slate-200 group-hover/item:text-blue-600 dark:group-hover/item:text-blue-400">
                            {item.firm}
                          </div>
                          {item.attorney && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Attorney: {item.attorney}
                            </div>
                          )}
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>

              <div className="group">
                <label className="block text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1.5 pl-1">Case Name (with Ref)</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 group-focus-within:text-blue-500 transition-colors">
                    <IdCard size={18} />
                  </span>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. TC Mokgoro (AC REF: MOSSATCMOK)"
                    value={formData.caseName}
                    onChange={(e) => setFormData(prev => ({ ...prev, caseName: e.target.value }))}
                    className="w-full pl-10 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="group">
                <label className="block text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1.5 pl-1">Classification</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 group-focus-within:text-blue-500 transition-colors">
                    <Tag size={18} />
                  </span>
                  <select 
                    value={formData.classificationOption}
                    onChange={(e) => setFormData(prev => ({ ...prev, classificationOption: e.target.value }))}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none"
                  >
                    <option value="1">RAF LOE</option>
                    <option value="2">RAF LOS</option>
                    <option value="3">Non-RAF LOE</option>
                    <option value="4">Non-RAF LOS</option>
                    <option value="5">Other (Custom)</option>
                  </select>
                </div>
              </div>

              {formData.classificationOption === '5' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                  <input 
                    type="text"
                    required
                    placeholder="Specify Custom Classification..."
                    value={formData.customClassification}
                    onChange={(e) => setFormData(prev => ({ ...prev, customClassification: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                      <FileText size={18} />
                    </span>
                    <select 
                      value={formData.customTemplateChoice}
                      onChange={(e) => setFormData(prev => ({ ...prev, customTemplateChoice: e.target.value }))}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                    >
                      <option value="LOE">LOE Template</option>
                      <option value="LOS">LOS Template</option>
                    </select>
                  </div>
                </div>
              )}

              <button 
                type="submit"
                disabled={loading || isFetchingDb}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black py-4 rounded-xl shadow-lg shadow-blue-600/30 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" /> : <>Create Case File <ArrowRight size={20} /></>}
              </button>
            </form>
          )}

          {activeTab === 'local' && (
            <div className="space-y-8">
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-3">
                 <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={20} />
                 <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed font-medium">
                    <strong>Python Agent Control:</strong> Commands queued for local machine execution. Ensure the background script is running on your workstation.
                 </p>
              </div>

              <div className="border-b border-slate-100 dark:border-slate-700 pb-6">
                <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">File & Folder Renamer</h3>
                <form onSubmit={(e) => handleLocalSubmit(e, 'RENAME')} className="space-y-4">
                  <div className="flex gap-4">
                    <input 
                      type="text"
                      required
                      placeholder="New Case Name"
                      value={localData.caseName}
                      onChange={(e) => setLocalData(prev => ({ ...prev, caseName: e.target.value }))}
                      className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:border-emerald-500 outline-none"
                    />
                    <select 
                      value={localData.type}
                      onChange={(e) => setLocalData(prev => ({ ...prev, type: e.target.value }))}
                      className="w-24 px-2 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm outline-none"
                    >
                      <option value="LOE">LOE</option>
                      <option value="LOS">LOS</option>
                    </select>
                  </div>
                  <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-lg shadow-md transition-all flex items-center justify-center gap-2">
                    <Pencil size={18} /> Rename & Open
                  </button>
                </form>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <form onSubmit={(e) => handleLocalSubmit(e, 'CREATE_TEMPLATES')} className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Create New</label>
                  <input 
                    type="number" 
                    min="1" 
                    value={localData.templateQty}
                    onChange={(e) => setLocalData(prev => ({ ...prev, templateQty: e.target.value }))}
                    className="w-full mb-3 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-center font-bold outline-none"
                  />
                  <button type="submit" className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 rounded-lg text-xs shadow-sm transition-all">Create</button>
                </form>

                <form onSubmit={(e) => handleLocalSubmit(e, 'REFILL_CASES')} className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Refill Active</label>
                  <input 
                    type="number" 
                    min="1" 
                    value={localData.refillQty}
                    onChange={(e) => setLocalData(prev => ({ ...prev, refillQty: e.target.value }))}
                    className="w-full mb-3 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-center font-bold outline-none"
                  />
                  <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg text-xs shadow-sm transition-all">Refill</button>
                </form>
              </div>
            </div>
          )}

          {/* STATUS MESSAGES */}
          {status.msg && (
            <div className={`mt-6 p-4 rounded-xl text-center text-sm font-bold flex flex-col items-center justify-center gap-2 border animate-in zoom-in-95 duration-200 ${
              status.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800' :
              status.type === 'error' ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 border-rose-100 dark:border-rose-800' :
              'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-100 dark:border-blue-800'
            }`}>
              <div className="flex items-center gap-2">
                {status.type === 'success' ? <CheckCircle2 size={16} /> : status.type === 'error' ? <AlertCircle size={16} /> : <Loader2 size={16} className="animate-spin" />}
                <span className="font-black uppercase tracking-wider">{status.type === 'error' ? 'SYSTEM ERROR' : 'STATUS'}</span>
              </div>
              <span className="text-xs font-medium leading-relaxed">{status.msg}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 text-center">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Secure Execution • Workspace Automation v3.0</p>
      </div>
    </div>
  );
}