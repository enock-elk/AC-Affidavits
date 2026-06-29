import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Building2, 
  FileSignature, 
  Lock, 
  Unlock, 
  CloudUpload, 
  Plus, 
  Minus, 
  RefreshCw, 
  Copy, 
  Download, 
  AlertCircle,
  Maximize2,
  Minimize2,
  Search
} from 'lucide-react';

// GUARDIAN: SVG Base64 encoding of the Joel Jared Goldberg Stamp for pure offline compatibility inside MS Word
const STAMP_B64 = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMTAwIj4KICA8dGV4dCB4PSIxNTAiIHk9IjMwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTYiIGZvbnQtd2VpZ2h0PSJib2xkIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5Kb2VsIEphcmVkIEdvbGRiZXJnPC90ZXh0PgogIDx0ZXh0IHg9IjE1MCIgeT0iNTAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZm9udC13ZWlnaHQ9ImJvbGQiIHRleHQtYW5jaG9yPSJtaWRkbGUiPkNvbW1pc3Npb25lciBvZiBPYXRocyAoUlNBKTwvdGV4dD4KICA8dGV4dCB4PSIxNTAiIHk9IjcwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZvbnQtd2VpZ2h0PSJib2xkIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj41MyBNZWxyb3NlIFN0cmVldDwvdGV4dD4KICA8dGV4dCB4PSIxNTAiIHk9IjkwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZvbnQtd2VpZ2h0PSJib2xkIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5NZWxyb3NlIEVzdGF0ZTwvdGV4dD4KPC9zdmc+";

const GOOGLE_API_URL = "https://script.google.com/macros/s/AKfycbw-M9kVkSSXKuJ49tohaconx99-l5VcbU1xSNeUTccX2gs0prok3LltyTyO7mdNKtm8/exec";

// GUARDIAN: Fallback DB for Local Dev / CORS Blocks
const FALLBACK_DB = [
  { id: 'custom', firm: '-- Custom / Override --', attorney: '', rules: { quals: 'Long', linkNo: false, cover: false, obo: false, preSign: false } },
  { id: 'dev1', firm: 'Jacob Modiba Attorneys (DEV FALLBACK)', attorney: 'J Modiba', rules: { quals: 'Long', linkNo: false, cover: true, obo: true, preSign: true } },
  { id: 'dev2', firm: 'Hirschowitz Flionis (DEV FALLBACK)', attorney: 'Partner', rules: { quals: 'Short', linkNo: true, cover: false, obo: false, preSign: false } }
];

// GUARDIAN: Helper to auto-generate the ordinal legal date
const getDefaultDate = () => {
  const d = new Date();
  const n = d.getDate();
  const ord = (n + (n > 0 ? ['TH', 'ST', 'ND', 'RD'][(n > 3 && n < 21) || n % 10 > 3 ? 0 : n % 10] : '')).toUpperCase();
  const month = d.toLocaleString('default', { month: 'long' }).toUpperCase();
  return `this ${ord} day of ${month} ${d.getFullYear()}`;
};

// GUARDIAN: Safely injects <sup> tags for dates (e.g. 19TH -> 19<sup>TH</sup>)
const formatOrdinals = (text) => {
  if (!text) return '';
  const regex = /(\d+)(ST|ND|RD|TH)\b/gi;
  const parts = text.split(regex);
  return parts.map((part, index) => {
    if (index % 3 === 1) return <span key={index}>{part}</span>;
    if (index % 3 === 2) return <sup key={index} style={{ fontSize: '0.8em' }}>{part.toUpperCase()}</sup>;
    return <span key={index}>{part}</span>;
  });
};

export default function AffidavitAutomation() {
  // --- STATE ---
  const [database, setDatabase] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  
  // Actuarial Module State
  const [docCategory, setDocCategory] = useState('expert');
  const [isRecalc, setIsRecalc] = useState(false);
  const [complexity, setComplexity] = useState('simple');
  const [calcAmount, setCalcAmount] = useState('');
  const [dependents, setDependents] = useState([]);
  
  // Specific Subject & Date Variables
  const [reportSubject, setReportSubject] = useState('');
  const [signDate, setSignDate] = useState(getDefaultDate());

  // Searchable Dropdown State
  const [firmSearch, setFirmSearch] = useState('');
  const [showFirmDropdown, setShowFirmDropdown] = useState(false);
  const firmDropdownRef = useRef(null);
  
  const [selectedFirmId, setSelectedFirmId] = useState('custom');
  const [rules, setRules] = useState({ quals: 'Long', linkNo: false, cover: false, obo: false, preSign: false });
  
  const [form, setForm] = useState({
    court: 'High Court of South Africa',
    div: 'Gauteng Division, Pretoria',
    case: '',
    claim: '',
    link: '',
    plaintiff: '',
    defendent: 'ROAD ACCIDENT FUND',
    accDate: '', 
    compDate: '' 
  });

  // UX State: Drag Resizer & Fullscreen
  const [formWidth, setFormWidth] = useState(450); 
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isDragging = useRef(false);

  // GUARDIAN: Feedback Modal State
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  // --- 1. INITIALIZATION ---
  useEffect(() => {
    fetchDatabase();
  }, []);

  const fetchDatabase = async () => {
    try {
      const response = await fetch(GOOGLE_API_URL);
      if (!response.ok) throw new Error("Network response not ok");
      const data = await response.json();
      const db = [
        { id: 'custom', firm: '-- Custom / Override --', attorney: '', rules: { quals: 'Long', linkNo: false, cover: false, obo: false, preSign: false } },
        ...data
      ];
      setDatabase(db);
    } catch (error) {
      console.warn("DB Fetch failed (Likely CORS in dev). Injecting FALLBACK_DB.", error);
      setDatabase(FALLBACK_DB); // Inject offline fallback data
    } finally {
      setLoading(false);
    }
  };

  // --- GUARDIAN: CLICK OUTSIDE LISTENER FOR DROPDOWN ---
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (firmDropdownRef.current && !firmDropdownRef.current.contains(event.target)) {
        setShowFirmDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- DRAG LOGIC ---
  const handleMouseDown = () => {
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none'; 
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging.current) return;
    let newWidth = e.clientX - 320;
    newWidth = Math.max(300, newWidth); 
    newWidth = Math.min(newWidth, window.innerWidth - 450); 
    setFormWidth(newWidth);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (isDragging.current) {
      isDragging.current = false;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // --- 2. LOGIC HANDLERS ---
  const activeFirm = useMemo(() => {
    return database.find(a => a.id === selectedFirmId) || database[0];
  }, [database, selectedFirmId]);

  const filteredFirms = useMemo(() => {
    const cleanSearch = firmSearch.trim().toLowerCase();
    if (!cleanSearch) return database;
    return database.filter(item => 
      item.firm.toLowerCase().includes(cleanSearch) || 
      (item.attorney && item.attorney.toLowerCase().includes(cleanSearch))
    );
  }, [database, firmSearch]);

  const selectFirm = (firm) => {
    setSelectedFirmId(firm.id);
    setFirmSearch(firm.firm);
    setRules({ ...firm.rules });
    setIsUnlocked(firm.id === 'custom');
    if (!firm.rules.obo) setDependents([]);
    setShowFirmDropdown(false);
  };

  const toggleRule = (key, val1, val2) => {
    if (!isUnlocked) return;
    setRules(prev => {
      const newVal = prev[key] === val1 ? val2 : val1;
      if (key === 'obo' && !newVal) setDependents([]);
      return { ...prev, [key]: newVal };
    });
  };

  const updateForm = (e) => {
    const { id, value } = e.target;
    setForm(prev => ({ ...prev, [id.replace('in-', '')]: value }));
  };

  const handleSync = async () => {
    if (selectedFirmId === 'custom') return;
    setSyncing(true);
    try {
      await fetch(GOOGLE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ firm: activeFirm.firm, rules })
      });
      activeFirm.rules = { ...rules };
    } catch (err) { console.error(err); }
    setSyncing(false);
  };

  const hasUnsavedChanges = useMemo(() => {
    if (selectedFirmId === 'custom') return false;
    return JSON.stringify(rules) !== JSON.stringify(activeFirm?.rules);
  }, [rules, activeFirm, selectedFirmId]);

  // --- 3. EXPORT HELPERS ---
  const copyToClipboard = () => {
    const node = document.getElementById('doc-preview');
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
    
    document.execCommand('copy');
    selection.removeAllRanges();
  };

  const exportToWord = () => {
    const content = document.getElementById('doc-preview').innerHTML;
    // Add strict Arial 12pt fallback to Word envelope
    const preHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Affidavit</title><style>body { font-family: Arial, sans-serif; font-size: 12pt; }</style></head><body>`;
    const postHtml = `</body></html>`;
    const html = preHtml + content + postHtml;

    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Affidavit_${form.plaintiff.replace(/\s+/g, '_') || 'Draft'}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // GUARDIAN: Intercepts export and logs feedback to Google Apps Script
  const handleFeedbackSubmit = async (skipped = false) => {
    // 1. Download immediately to avoid blocking the user's workflow
    exportToWord();
    setShowFeedbackModal(false);

    // 2. Transmit to Google if not skipped
    if (!skipped && feedbackText.trim()) {
      try {
        setIsSubmittingFeedback(true);
        const payload = {
          action: 'LOG_FEEDBACK',
          userName: localStorage.getItem('currentUser') || 'Unknown User',
          // GUARDIAN: Smart Case Name Formatting (Omits case number if empty)
          caseName: `${form.plaintiff || '[PLAINTIFF]'} v ${form.defendent || '[DEFENDANT]'}${form.case ? ` (Case: ${form.case})` : ''}`,
          feedback: feedbackText.trim()
        };
        
        // Fire and forget POST request
        await fetch(GOOGLE_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.error("Feedback sync failed", err);
      } finally {
        setIsSubmittingFeedback(false);
        setFeedbackText('');
      }
    } else {
      setFeedbackText('');
    }
  };

  // --- 4. TEXT CONTENT GENERATOR ---
  const renderAffidavitContent = () => {
    const reportType = isRecalc ? "Amended Actuarial Report" : "Actuarial Report";
    const reportDate = form.compDate ? form.compDate : '______________________';
    const accDate = form.accDate ? form.accDate : '______________________';
    const p = form.plaintiff.toUpperCase() || '[PLAINTIFF NAME]';
    
    // Guardian: Subject logic fallback
    const subjectName = reportSubject.trim() ? reportSubject.toUpperCase() : p;

    // GUARDIAN: Utilizing strict `<ol>` lists for Word native numbering
    if (docCategory === 'expert') {
       return (
         <ol style={{ listStyleType: 'decimal', paddingLeft: '40px', margin: '0 0 20px 0', textAlign: 'justify' }}>
           <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>I am a major male South African Actuary and practicing as such. I am the Director of Actuary Consulting based in Atrium on 5th Building, Corner 5th &amp; Maude Street, Sandown, Sandton, Johannesburg.</li>
           <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>The facts herein contained, save where otherwise stated or indicated, are within my own knowledge and are, to the best of my knowledge and belief, both true and correct.</li>
           <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>I confirm that I compiled an {reportType} for {subjectName}. I confirm the contents of my {reportType} and the opinion raised therein by myself as to the best of my knowledge, true and correct.</li>
           <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>I confirm that, on {reportDate}, I compiled the {reportType} for the loss of earnings emanating from the injuries caused by a motor vehicle collision, which occurred on or about {accDate}.</li>
           {complexity === 'simple' ? (
             <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>This report represents a single-scenario calculation applying the standard Road Accident Fund cap.</li>
           ) : (
             <>
               <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>This report involves a multi-scenario calculation (Scenario 1 vs Scenario 2) and compares complex contingencies regarding the claimant's pre-morbid career trajectory and collateral benefits.</li>
               <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>Furthermore, this report outlines the complex comparative figures for both "Capped" and "Uncapped" loss of earnings, which have been fully detailed in the annexures of the main report.</li>
             </>
           )}
           {rules.quals === 'Long' ? (
             <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>
               I have the following experience and qualifications:
               {/* GUARDIAN: Removed manual hyphens and set listStyleType to 'disc' to let MS Word generate single clean bullets */}
               <ul style={{ textAlign: 'left', paddingLeft: '20px', margin: '10px 0 20px 0', listStyleType: 'disc' }}>
                 <li style={{ marginBottom: '5px' }}>18 years of experience as a Qualified Actuary.</li>
                 <li style={{ marginBottom: '5px' }}>Record for Fastest Qualified Actuary in South Africa.</li>
                 <li style={{ marginBottom: '5px' }}>BEconSc (Cum Laude) (Wits) - Actuarial Science &amp; Mathematical Statistics.</li>
                 <li style={{ marginBottom: '5px' }}>BSc Hons (Cum Laude) (Wits) - Advanced Mathematics of Finance.</li>
                 <li style={{ marginBottom: '5px' }}>BSc Hons (Cum Laude) (Wits) - Actuarial Science.</li>
                 <li style={{ marginBottom: '5px' }}>Qualified Actuary - Fellow of the Actuarial Society of South Africa (FASSA).</li>
                 <li style={{ marginBottom: '5px' }}>Chartered Financial Analyst (CFA) Charterholder (CFA Institute).</li>
                 <li style={{ marginBottom: '5px' }}>I am a Fellow of the Actuarial Society of South Africa, RSP181/2023.</li>
               </ul>
             </li>
           ) : (
             <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>I hereby confirm as true and correct my qualifications and further details as appear from the summary of my curriculum vitae found within my {reportType}.<br/>I am a Fellow of the Actuarial Society of South Africa, RSP181/2023.</li>
           )}
           <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>The said {reportType} is not attached to this affidavit, so as to avoid the unnecessary prolixity of papers.</li>
         </ol>
       );
    } else if (docCategory === 'sworn') {
       return (
         <ol style={{ listStyleType: 'decimal', paddingLeft: '40px', margin: '0 0 20px 0', textAlign: 'justify' }}>
          <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>
            {rules.quals === 'Long' ? (
              <>
                I am an adult male Actuary practising as such at Actuary Consulting with the following experience and qualifications:
                <ul style={{ textAlign: 'left', paddingLeft: '20px', margin: '10px 0 20px 0', listStyleType: 'disc' }}>
                  <li style={{ marginBottom: '5px' }}>18 years of experience as a Qualified Actuary.</li>
                  <li style={{ marginBottom: '5px' }}>Record for Fastest Qualified Actuary in South Africa.</li>
                  <li style={{ marginBottom: '5px' }}>BEconSc (Cum Laude) (Wits) - Actuarial Science &amp; Mathematical Statistics.</li>
                  <li style={{ marginBottom: '5px' }}>BSc Hons (Cum Laude) (Wits) - Advanced Mathematics of Finance.</li>
                  <li style={{ marginBottom: '5px' }}>BSc Hons (Cum Laude) (Wits) - Actuarial Science.</li>
                  <li style={{ marginBottom: '5px' }}>Qualified Actuary - Fellow of the Actuarial Society of South Africa (FASSA).</li>
                  <li style={{ marginBottom: '5px' }}>Chartered Financial Analyst (CFA) Charterholder (CFA Institute).</li>
                </ul>
              </>
            ) : (
              <>I am an adult male Actuary practising as such at Actuary Consulting situated at Atrium on 5th Building, Corner 5th &amp; Maude Street, Sandown, Sandton, Johannesburg.</>
            )}
          </li>
          <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>The facts contained herein fall within my personal knowledge unless expressly indicated to the contrary and are true and correct.</li>
          <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>I hereby confirm that the contents of the {reportType} of {subjectName} dated {reportDate}, and the findings therein. I am totally able and competent to make such findings because of my experience and qualifications combined.</li>
         </ol>
       );
    } else if (docCategory === 'confirmatory') {
       return (
         <ol style={{ listStyleType: 'decimal', paddingLeft: '40px', margin: '0 0 20px 0', textAlign: 'justify' }}>
          <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>I am an adult male Actuary, and I am currently practicing under the name and style of Actuary Consulting situated at Atrium on 5th Building, Corner 5th &amp; Maude Street, Sandown, Sandton, Johannesburg.</li>
          <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>The facts deposed to herein are, unless the context indicates otherwise, within my personal knowledge and belief and are both true and correct.</li>
          <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>I was requested by the offices of {activeFirm.firm} to provide a certificate of value for Loss of Earnings for {subjectName} following his involvement in a motor vehicle accident on the {accDate}.</li>
          <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>The purpose of the {reportType} was to establish whether or not his subsequent injuries due to the motor vehicle caused financial loss to his dependents.</li>
          <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>In executing my mandate, I had regard to the proof of past and future earnings of {subjectName} had the Motor vehicle Accident not occurred, and I confirm that the plaintiff has suffered a past loss and shall continue to suffer future loss owing to the aftermath of the accident. The total loss of earnings amounted to R {calcAmount || '[AMOUNT]'}</li>
          <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>I produced an {reportType} of the value of my findings on the {reportDate}.</li>
          <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>I stand by the findings I made in the {reportType} and will avail myself should oral testimony herein be required.<br/><br/>That is all I wish to state.</li>
         </ol>
       );
    } else if (docCategory === 'lieu') {
       return (
         <>
          <p style={{ marginBottom: '20px' }}>I am an adult male practicing as an Actuary in a private practice, practicing under the name and style of Actuary Consulting practicing at Atrium on 5th Building, Corner 5th &amp; Maude Street, Sandown, Sandton, Johannesburg.</p>
          <p style={{ marginBottom: '20px' }}>I confirm that the facts herein contained in this affidavit are true and correct and are within my knowledge, save where otherwise stated.</p>
          <p style={{ marginBottom: '20px' }}>On {reportDate}, I was requested by {activeFirm.firm} to compile an {reportType} on behalf of {subjectName}, to calculate pre- and post-accident earnings.</p>
          <p style={{ marginBottom: '20px' }}>In my {reportType}, I made certain factual assumptions based on the facts furnished to me, and I also made certain actuarial assumptions which are widely accepted in the actuarial industry.</p>
          <p style={{ marginBottom: '20px' }}>I have drawn an {reportType} dated {reportDate}, which is not attached to this affidavit; as I am informed it is uploaded on Case lines and thus, I have not attached the same, to avoid the unnecessary prolixity of papers.</p>
          <p style={{ marginBottom: '20px' }}>In regard to the above, may it please the Honourable Court that the said {reportType} be incorporated herein by reference.</p>
          <p style={{ marginBottom: '20px' }}>I confirm the correctness of the contents of my aforementioned {reportType}.</p>
         </>
       );
    } else if (docCategory === 'supporting') {
       return (
         <ol style={{ listStyleType: 'decimal', paddingLeft: '40px', margin: '0 0 20px 0', textAlign: 'justify' }}>
          <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>I am an adult male Actuary, practicing at Atrium on 5th Building, Corner 5th &amp; Maude Street, Sandown, Sandton, Johannesburg. I am capable of deposing to this affidavit, the contents of which are true and correct to the best of my knowledge.</li>
          <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>The facts contained herein are within my personal knowledge, except where the context indicates otherwise, and are true and correct.</li>
          <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>I confirm the contents of my {reportType} contained in the Expert Reports bundle filed in this matter and the opinions expressed therein by me for the above Plaintiff, {subjectName}.</li>
         </ol>
       );
    } else if (docCategory === 'los') {
       return (
         <ol style={{ listStyleType: 'decimal', paddingLeft: '40px', margin: '0 0 20px 0', textAlign: 'justify' }}>
           <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>I am an adult Actuary, founder and Managing Director at Actuary Consulting situated at Atrium on 5th Building Corner 5th &amp; Maude Street, Sandown, Sandton, Johannesburg. The facts herein contained are within my personal Knowledge and are both true and correct, unless the context indicates otherwise.</li>
           <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>
             I have the following experience and qualifications:
             <ul style={{ textAlign: 'left', paddingLeft: '20px', margin: '10px 0 20px 0', listStyleType: 'disc' }}>
                <li style={{ marginBottom: '5px' }}>18 years of experience as a Qualified Actuary.</li>
                <li style={{ marginBottom: '5px' }}>Record for Fastest Qualified Actuary in South Africa.</li>
                <li style={{ marginBottom: '5px' }}>BEconSc (Cum Laude) (Wits) - Actuarial Science &amp; Mathematical Statistics.</li>
                <li style={{ marginBottom: '5px' }}>BSc Hons (Cum Laude) (Wits) - Advanced Mathematics of Finance.</li>
                <li style={{ marginBottom: '5px' }}>BSc Hons (Cum Laude) (Wits) - Actuarial Science.</li>
                <li style={{ marginBottom: '5px' }}>Qualified Actuary - Fellow of the Actuarial Society of South Africa (FASSA).</li>
                <li style={{ marginBottom: '5px' }}>Chartered Financial Analyst (CFA) Charterholder (CFA Institute).</li>
             </ul>
           </li>
           <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>Actuary Consulting has been instructed to provide a Capitalised Present Value amount of the Loss of Support by the dependents of the late {subjectName}, as a result of his death due to a motor vehicle accident that occurred on {accDate}.</li>
           <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>The resultant Capitalised Present Value has been determined as of {reportDate} (Calculation Date).</li>
           <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>I subsequently prepared an {reportType} dated {reportDate}, quantifying the financial impact, including loss of support, future related expenses (where applicable), and contingencies, based on the expert evidence provided.</li>
           <li style={{ marginBottom: '20px', paddingLeft: '10px' }}>I confirm that the contents of the said {reportType} represent my professional opinion, calculated in accordance with accepted actuarial principles and practices, and I submit same to the honourable court for its consideration.</li>
        </ol>
       );
    }
  };

  // --- 5. PREVIEW ENGINE (MS Word Compatible) ---
  const generatedDocument = useMemo(() => {
    if (!rules) return null;
    const p = form.plaintiff.toUpperCase() || '[PLAINTIFF NAME]';
    const c = form.case || '[CASE NUMBER]';
    
    const docTitle = 
      docCategory === 'sworn' ? 'Sworn Affidavit' : 
      docCategory === 'confirmatory' ? 'Expert Confirmatory Affidavit' :
      docCategory === 'lieu' ? 'Affidavit in Lieu of Testimony' :
      docCategory === 'supporting' ? 'Supporting Affidavit' :
      'Expert Affidavit';

    return (
      <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '12pt', lineHeight: '1.5', color: '#000' }}>
        
        {/* Cover Page */}
        {rules.cover && (
          <div style={{ pageBreakAfter: 'always', textAlign: 'center', paddingTop: '80px', paddingBottom: '40px' }}>
             <h1 style={{ fontSize: '14pt', fontWeight: 'bold', color: '#B08D57', letterSpacing: '2px', marginBottom: '5px' }}>ACTUARY</h1>
             <h2 style={{ fontSize: '14pt', fontWeight: 'bold', color: '#6B7280', letterSpacing: '8px', marginBottom: '60px' }}>CONSULTING</h2>
             <p style={{ fontSize: '12pt', fontWeight: 'bold', marginBottom: '40px' }}>SIGNED & COMMISSIONED AFFIDAVITS</p>
             <p style={{ fontSize: '12pt', fontWeight: 'bold', marginBottom: '60px' }}>ATT: {activeFirm.firm.toUpperCase()}</p>
             <p style={{ fontSize: '12pt', fontWeight: 'bold' }}>{p}</p>
             {dependents.map((dep, idx) => (
               <p key={idx} style={{ fontSize: '12pt', fontWeight: 'bold' }}>{p} OBO {dep.toUpperCase() || '[DEPENDENT]'}</p>
             ))}
          </div>
        )}

        {/* Document Header */}
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <p style={{ fontWeight: 'bold', textTransform: 'uppercase', margin: 0 }}>IN THE {form.court}</p>
          <p style={{ fontWeight: 'bold', textTransform: 'uppercase', margin: 0 }}>{form.div}</p>
        </div>

        {/* GUARDIAN: Right Aligned Case Number */}
        <div style={{ textAlign: 'right', marginBottom: '10px' }}>
           <p style={{ fontWeight: 'bold', textTransform: 'uppercase', margin: 0 }}>CASE NO: {c}</p>
        </div>

        {/* Parties Block */}
        <p style={{ marginBottom: '15px' }}>In the matter between:</p>
        
        <div style={{ marginBottom: '15px' }}>
           {(!rules.obo || dependents.length === 0) ? (
             <div>
               <span style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{p}</span>
               <span style={{ fontWeight: 'bold', textTransform: 'uppercase', float: 'right' }}>{docCategory === 'los' ? 'APPLICANT' : 'PLAINTIFF'}</span>
               <div style={{ clear: 'both' }}></div>
             </div>
           ) : (
             <>
                <div>
                   <span style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{p}</span>
                   <span style={{ fontWeight: 'bold', textTransform: 'uppercase', float: 'right' }}>1ST {docCategory === 'los' ? 'APPLICANT' : 'PLAINTIFF'}</span>
                   <div style={{ clear: 'both' }}></div>
                </div>
                <div style={{ paddingLeft: '20px', textTransform: 'uppercase', paddingBottom: '10px' }}>obo {dependents[0] || '[DEPENDENT]'}</div>
                {dependents.slice(1).map((dep, idx) => (
                  <React.Fragment key={idx}>
                     <div style={{ paddingTop: '10px' }}>
                        <span style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{p}</span>
                        <span style={{ fontWeight: 'bold', textTransform: 'uppercase', float: 'right' }}>{idx + 2}{idx === 0 ? 'ND' : idx === 1 ? 'RD' : 'TH'} {docCategory === 'los' ? 'APPLICANT' : 'PLAINTIFF'}</span>
                        <div style={{ clear: 'both' }}></div>
                     </div>
                     <div style={{ paddingLeft: '20px', textTransform: 'uppercase', paddingBottom: '10px' }}>obo {dep || '[DEPENDENT]'}</div>
                  </React.Fragment>
                ))}
             </>
           )}
        </div>

        <p style={{ fontWeight: 'bold', textTransform: 'uppercase', margin: '30px 0' }}>AND</p>
        
        <div style={{ marginBottom: form.link ? '5px' : '30px' }}>
          <span style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{form.defendent.toUpperCase()}</span>
          <span style={{ fontWeight: 'bold', textTransform: 'uppercase', float: 'right' }}>DEFENDANT</span>
          <div style={{ clear: 'both' }}></div>
        </div>

        {/* GUARDIAN: Link Number repositioned below Defendant */}
        {form.link && (
          <p style={{ fontWeight: 'bold', textTransform: 'uppercase', margin: '0 0 30px 0' }}>LINK NO: {form.link}</p>
        )}

        {/* Title Break */}
        <hr style={{ borderTop: '2px solid black', margin: '5px 0' }} />
        <h2 style={{ textAlign: 'center', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '12pt', margin: '15px 0', letterSpacing: '2px' }}>
           {docTitle} 
        </h2>
        <hr style={{ borderTop: '2px solid black', margin: '5px 0 30px 0' }} />

        {/* Affidavit Preamble & Centered Deponent ID */}
        <p style={{ marginBottom: '15px' }}>I, the undersigned,</p>
        <div style={{ textAlign: 'center', marginBottom: '15px' }}>
           <p style={{ fontWeight: 'bold', textTransform: 'uppercase', margin: 0 }}>NAMIR WAISBERG</p>
           <p style={{ margin: 0, fontWeight: 'bold' }}>ID Number: 810130 5247 080</p>
        </div>
        
        {docCategory === 'sworn' ? (
          <p style={{ marginBottom: '20px' }}>hereby state under oath as follows:</p>
        ) : docCategory === 'confirmatory' || docCategory === 'lieu' ? (
          <p style={{ marginBottom: '20px' }}>do hereby make oath and say that:</p>
        ) : (
          <p style={{ marginBottom: '20px' }}>do hereby make oath and state that:</p>
        )}

        {/* Content Body */}
        <div style={{ textAlign: 'justify' }}>
           {renderAffidavitContent()}
        </div>

        {/* Signature Block */}
        <div style={{ marginTop: '60px' }}>
           {docCategory === 'sworn' ? (
              <>
                <div style={{ textAlign: 'right', marginBottom: '30px' }}>
                  <div style={{ display: 'inline-block', width: '200px', borderTop: '1.5px solid black', paddingTop: '10px', textAlign: 'left' }}>
                     <p style={{ fontWeight: 'bold', margin: 0, textTransform: 'uppercase' }}>NAMIR WAISBERG / DEPONENT</p>
                  </div>
                </div>
                <p style={{ marginBottom: '20px' }}>
                  Signed at <strong>SANDTON</strong> on <strong>{formatOrdinals(signDate)}</strong> after the deponent has declared:
                </p>
                {/* GUARDIAN: Word native alphabet list */}
                <ol type="a" style={{ listStyleType: 'lower-alpha', margin: '0 0 40px 40px', padding: 0 }}>
                  <li style={{ marginBottom: '10px', paddingLeft: '10px' }}>That he understands the contents of this affidavit and that it is true and correct.</li>
                  <li style={{ marginBottom: '10px', paddingLeft: '10px' }}>That he has no objection to taking the prescribed oath.</li>
                  <li style={{ marginBottom: '10px', paddingLeft: '10px' }}>That he will keep the oath binding on his conscience.</li>
                </ol>
              </>
           ) : (
              <>
                <div style={{ textAlign: 'right', marginBottom: '40px' }}>
                  <div style={{ display: 'inline-block', width: '200px', borderTop: '1.5px solid black', paddingTop: '10px', textAlign: 'left' }}>
                     <p style={{ fontWeight: 'bold', margin: 0, textTransform: 'uppercase' }}>NAMIR WAISBERG / DEPONENT</p>
                  </div>
                </div>
                
                {docCategory === 'confirmatory' || docCategory === 'lieu' ? (
                  <p style={{ marginBottom: '40px', textAlign: 'justify' }}>
                    I certify that the deponent has acknowledged that he knows and understands the contents of this affidavit which was signed and sworn to before me at <strong>SANDTON</strong> on <strong>{formatOrdinals(signDate)}</strong>, the Deponent having acknowledged that he knows and understands the contents of this Affidavit, which is deposed to in accordance with the regulations governing the administration of an oath as more fully set out in <strong>Government Notice R 1258</strong> of the <strong>21<sup>ST</sup> of July 1972</strong>, as amended by <strong>Government Notice 1648</strong> dated the <strong>19<sup>TH</sup> of August 1977</strong> and <strong>Government Notice 903</strong> dated the <strong>10<sup>TH</sup> of July 1998</strong>.
                  </p>
                ) : docCategory === 'supporting' ? (
                  <p style={{ marginBottom: '40px', textAlign: 'justify' }}>
                    Thus, signed and sworn to at <strong>SANDTON</strong> on <strong>{formatOrdinals(signDate)}</strong>, before me, Commissioner of Oath, after the deponent declared that he read the contents of this affidavit, that is both true and correct, that he has no objection in taking the prescribed oath and considers it binding on his conscience.
                  </p>
                ) : (
                  <p style={{ marginBottom: '40px', textAlign: 'justify' }}>
                    SIGNED and COMMISSIONED BEFORE ME at <strong>SANDTON</strong> on <strong>{formatOrdinals(signDate)}</strong> by the DEPONENT who confirmed that: (i) he is conversant with the contents of this affidavit and that he knows and understands it; (ii) that he has no objection to taking the prescribed oath; (iii) that he considers the oath as binding on his conscience.
                  </p>
                )}
              </>
           )}

           {rules.preSign ? (
             <img 
               src={STAMP_B64} 
               alt="Joel Jared Goldberg Stamp" 
               style={{ height: '110px', objectFit: 'contain', marginBottom: '10px' }}
             />
           ) : (
             <div style={{ height: '80px' }}></div>
           )}
        </div>
      </div>
    );
  }, [form, rules, activeFirm, complexity, dependents, docCategory, isRecalc, calcAmount, reportSubject, signDate]);

  return (
    <div className="h-full flex overflow-hidden bg-slate-50 dark:bg-slate-900/50">
      
      {/* COLUMN 1: SETUP (Fixed Width) */}
      <div className="w-80 shrink-0 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-white dark:bg-slate-800 z-10">
        <div className="p-6 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-1">
            <Building2 className="text-amber-500 w-5 h-5" /> Attorney Profile
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Select firm to load template rules</p>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto space-y-6 custom-scroll">
          
          {/* GUARDIAN: Searchable Attorney Dropdown */}
          <div className="relative" ref={firmDropdownRef}>
            <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-500 dark:text-slate-400">Instructing Firm</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                <Search size={16} />
              </span>
              <input 
                type="text"
                disabled={loading}
                placeholder={loading ? "Loading..." : "Search for firm..."}
                value={firmSearch}
                onChange={(e) => {
                  setFirmSearch(e.target.value);
                  setShowFirmDropdown(true);
                }}
                onFocus={() => setShowFirmDropdown(true)}
                className="w-full pl-9 pr-3 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-500/20 text-slate-900 dark:text-white transition-all disabled:opacity-50"
              />
            </div>

            {showFirmDropdown && !loading && (
              <ul className="absolute z-50 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl mt-1 shadow-2xl max-h-64 overflow-y-auto custom-scroll animate-in fade-in slide-in-from-top-1">
                {filteredFirms.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 text-center italic">No matching firms found.</li>
                ) : (
                  filteredFirms.map((item) => (
                    <li 
                      key={item.id}
                      onClick={() => selectFirm(item)}
                      className="px-4 py-3 hover:bg-amber-50 dark:hover:bg-amber-900/30 cursor-pointer border-b border-slate-50 dark:border-slate-700/50 last:border-0 transition-colors group"
                    >
                      <div className="text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:text-amber-600 dark:group-hover:text-amber-400">
                        {item.firm}
                      </div>
                      {item.attorney && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {item.attorney}
                        </div>
                      )}
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>

          <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-900/50 space-y-3 relative">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Active Ruleset</span>
              {selectedFirmId !== 'custom' && (
                <button 
                  onClick={() => setIsUnlocked(!isUnlocked)}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-all flex items-center gap-1 cursor-pointer ${isUnlocked ? 'bg-blue-500/10 text-blue-500' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-amber-500/10 hover:text-amber-500'}`}
                >
                  {isUnlocked ? <Unlock size={12} /> : <Lock size={12} />} {isUnlocked ? 'UNLOCKED' : 'UNLOCK'}
                </button>
              )}
            </div>
            
            <div className="space-y-2">
              {[
                { label: 'Qualifications', key: 'quals', opts: ['Long', 'Short'] },
                { label: 'Cover Page', key: 'cover', opts: [true, false] },
                { label: 'Link Number', key: 'linkNo', opts: [true, false] },
                { label: 'OBO (Multi)', key: 'obo', opts: [true, false] },
                { label: 'Pre-Sign (Stamp)', key: 'preSign', opts: [true, false] }
              ].map(rule => (
                <button 
                  key={rule.key}
                  onClick={() => toggleRule(rule.key, rule.opts[0], rule.opts[1])}
                  className={`w-full flex items-center justify-between p-2 rounded-lg text-sm border bg-white dark:bg-slate-800 transition-all ${isUnlocked ? 'cursor-pointer hover:border-amber-500 border-slate-200 dark:border-slate-700' : 'cursor-default border-transparent'}`}
                >
                  <span className="font-medium">{rule.label}</span>
                  <span className={`text-xs font-bold px-2 py-1 rounded-md ${rules[rule.key] === rule.opts[0] ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                    {typeof rules[rule.key] === 'boolean' ? (rules[rule.key] ? 'YES' : 'NO') : rules[rule.key]}
                  </span>
                </button>
              ))}
            </div>

            {hasUnsavedChanges && (
              <button 
                onClick={handleSync}
                disabled={syncing}
                className="w-full mt-3 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 animate-pulse"
              >
                {syncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
                Sync to Google Sheets
              </button>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-500 dark:text-slate-400">Document Type</label>
            <select 
               value={docCategory}
               onChange={(e) => setDocCategory(e.target.value)}
               className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-500/20 text-slate-900 dark:text-white transition-all appearance-none cursor-pointer mb-3"
            >
               <option value="expert">Expert Affidavit (Standard)</option>
               <option value="sworn">Sworn Affidavit</option>
               <option value="confirmatory">Expert Confirmatory Affidavit</option>
               <option value="lieu">Affidavit in Lieu of Testimony</option>
               <option value="supporting">Supporting Affidavit</option>
               <option value="los">Loss of Support (Expert)</option>
            </select>

            <div className="flex gap-4 mb-3">
               <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={isRecalc} onChange={e => setIsRecalc(e.target.checked)} className="rounded border-slate-300 text-amber-500 focus:ring-amber-500" />
                  AMENDED / RECALCULATED
               </label>
            </div>

            <label className="block text-xs font-bold uppercase tracking-wider mb-2 mt-4 text-slate-500 dark:text-slate-400">Actuarial Module</label>
            <div className="flex bg-slate-200 dark:bg-slate-900 rounded-xl p-1 relative">
              {['simple', 'extensive'].map(mod => (
                <button 
                  key={mod}
                  onClick={() => setComplexity(mod)}
                  className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all z-10 ${complexity === mod ? 'bg-white dark:bg-slate-700 shadow-sm text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                  {mod.charAt(0).toUpperCase() + mod.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* COLUMN 2: DYNAMIC FORM */}
      <div 
        className="flex flex-col bg-white dark:bg-slate-800 z-10 shrink-0 border-r border-slate-200 dark:border-slate-800"
        style={{ width: `${formWidth}px` }}
      >
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2 mb-1">
              <FileSignature className="text-amber-500 w-5 h-5" /> Case Details
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Inputs morph based on firm rules</p>
          </div>
          {rules.linkNo && (
            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded bg-rose-500/10 text-rose-500 border border-rose-500/20">
              <AlertCircle className="w-3 h-3" /> LINK NO. REQ
            </span>
          )}
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-6 custom-scroll">
          
          <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-500 dark:text-slate-400">Court</label>
              <input type="text" id="in-court" value={form.court} onChange={updateForm} className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm outline-none focus:border-amber-500 dark:text-white transition-all" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-500 dark:text-slate-400">Division</label>
              <input type="text" id="in-div" value={form.div} onChange={updateForm} className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm outline-none focus:border-amber-500 dark:text-white transition-all" />
            </div>
          </div>

          <div className="animate-in fade-in slide-in-from-top-2">
            <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-500 dark:text-slate-400">Case Number</label>
            <input type="text" id="in-case" placeholder="e.g. 1492/2018" value={form.case} onChange={updateForm} className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-bold outline-none focus:border-amber-500 dark:text-white transition-all" />
          </div>

          {/* GUARDIAN: Link No input is now always present so user can fill it, but only renders if rules.linkNo or if filled out */}
          <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-500 dark:text-slate-400">Claim No.</label>
              <input type="text" id="in-claim" value={form.claim} onChange={updateForm} className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm outline-none focus:border-amber-500 dark:text-white transition-all" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-500 dark:text-slate-400">Link No.</label>
              <input type="text" id="in-link" value={form.link} onChange={updateForm} className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm outline-none focus:border-amber-500 dark:text-white transition-all" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="animate-in fade-in slide-in-from-top-2">
               <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-500 dark:text-slate-400">Accident Date</label>
               <input type="text" id="in-accDate" placeholder="e.g. 28 November 2015" value={form.accDate} onChange={updateForm} className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm outline-none focus:border-amber-500 dark:text-white transition-all" />
             </div>
             <div>
               <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-500 dark:text-slate-400">Compiled Date</label>
               <input type="text" id="in-compDate" placeholder="e.g. 10 February 2026" value={form.compDate} onChange={updateForm} className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm outline-none focus:border-amber-500 dark:text-white transition-all" />
             </div>
             
             {docCategory === 'confirmatory' && (
              <div className="col-span-2 animate-in fade-in slide-in-from-top-2 mt-2">
                <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-500 dark:text-slate-400">Total Loss Amount (ZAR)</label>
                <input type="text" placeholder="e.g. 1 469 317.00" value={calcAmount} onChange={e => setCalcAmount(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-emerald-50 dark:bg-emerald-900/10 text-sm font-bold outline-none focus:border-amber-500 dark:text-white transition-all" />
              </div>
             )}

             <div className="col-span-2 animate-in fade-in slide-in-from-top-2">
                <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-500 dark:text-slate-400">Date of Signature</label>
                <input type="text" placeholder="e.g. this 19TH day of FEBRUARY 2026" value={signDate} onChange={e => setSignDate(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-amber-50 dark:bg-amber-900/10 text-sm font-bold outline-none focus:border-amber-500 dark:text-white transition-all" />
             </div>
          </div>

          <div className="p-5 rounded-2xl border border-slate-100 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-900/50">
            <label className="block text-xs font-bold uppercase tracking-wider mb-3 text-slate-500 dark:text-slate-400">Parties (Plaintiff/Claimant)</label>
            <input type="text" id="in-plaintiff" placeholder="Main Claimant Name" value={form.plaintiff} onChange={updateForm} className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold outline-none focus:border-amber-500 dark:text-white transition-all mb-3" />
            
            <div className="animate-in fade-in slide-in-from-top-2 mb-3">
               <input type="text" placeholder="Report Subject (if different from Plaintiff)" value={reportSubject} onChange={e => setReportSubject(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm outline-none focus:border-amber-500 dark:text-white transition-all" />
            </div>

            <div className="animate-in fade-in slide-in-from-top-2 mb-3">
               <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 text-slate-500 dark:text-slate-400">Defendant</label>
               <input type="text" id="in-defendent" placeholder="ROAD ACCIDENT FUND" value={form.defendent} onChange={updateForm} className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold outline-none focus:border-amber-500 dark:text-white transition-all" />
            </div>

            {rules.obo && (
              <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 mt-4">
                {dependents.map((dep, idx) => (
                  <div key={idx} className="flex items-center gap-2 pl-4 border-l-2 border-amber-500/30">
                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 w-8 shrink-0">OBO</div>
                    <input 
                      type="text" 
                      placeholder="Dependent Name" 
                      value={dep}
                      onChange={(e) => {
                        const newDeps = [...dependents];
                        newDeps[idx] = e.target.value;
                        setDependents(newDeps);
                      }}
                      className="flex-1 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm outline-none focus:border-amber-500 dark:text-white" 
                    />
                    <button 
                      onClick={() => setDependents(prev => prev.filter((_, i) => i !== idx))}
                      className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                    >
                      <Minus size={16} />
                    </button>
                  </div>
                ))}
                <button 
                  onClick={() => setDependents(prev => [...prev, ''])}
                  className="flex items-center justify-center gap-2 text-xs font-bold px-4 py-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 transition-all"
                >
                  <Plus className="w-4 h-4" /> Add Dependent (OBO)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DRAG RESIZER BAR */}
      <div 
        className="w-1.5 hover:w-2.5 cursor-col-resize bg-slate-200 dark:bg-slate-700 hover:bg-amber-500/50 flex flex-col items-center justify-center transition-all z-20 shrink-0 group relative shadow-inner"
        onMouseDown={handleMouseDown}
      >
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute">
          <div className="w-0.5 h-1.5 bg-slate-500 dark:bg-slate-300 rounded-full"></div>
          <div className="w-0.5 h-1.5 bg-slate-500 dark:bg-slate-300 rounded-full"></div>
          <div className="w-0.5 h-1.5 bg-slate-500 dark:bg-slate-300 rounded-full"></div>
        </div>
      </div>

      {/* COLUMN 3: WYSIWYG PREVIEW */}
      <div className={`${isFullscreen ? 'fixed inset-0 z-50' : 'flex-1 relative'} flex flex-col bg-slate-200/60 dark:bg-[#0f172a]`}>
        <div className="h-16 shrink-0 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-slate-400 animate-spin-slow" />
            <span className="text-xs font-bold tracking-wide uppercase text-slate-500 dark:text-slate-400">Live Render</span>
          </div>
          <div className="flex gap-3">
            <a 
              href="https://docs.google.com/spreadsheets/d/1twLeKxFlNOjD5HmCqIqdTPg5qd_34twgOetm6AD5AYc/edit?gid=432356199#gid=432356199" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all"
            >
              📝 Post-Case Feedback
            </a>
            <button 
              onClick={() => setIsFullscreen(!isFullscreen)} 
              className="flex items-center justify-center w-10 h-10 rounded-lg text-sm font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-amber-500/10 hover:text-amber-500 hover:border-amber-500/50 transition-all"
              title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button onClick={copyToClipboard} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
              <Copy className="w-4 h-4" /> Copy
            </button>
            <button onClick={() => setShowFeedbackModal(true)} className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold bg-amber-500 hover:bg-amber-600 text-slate-900 shadow-lg shadow-amber-500/20 transition-all">
              <Download className="w-4 h-4" /> Export Word
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scroll">
          <div className="w-full max-w-[800px] min-h-[1050px] mx-auto p-16 bg-white shadow-2xl transition-colors">
            <div id="doc-preview" className="outline-none text-black">
              {generatedDocument}
            </div>
          </div>
        </div>
      </div>

      {/* GUARDIAN: INTERCEPT FEEDBACK MODAL */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-full">
                <FileSignature size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Quick Feedback</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Help us improve before you download.</p>
              </div>
            </div>
            
            <textarea 
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Any issues? Missing clauses? Tell us what to improve..."
              className="w-full h-32 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm outline-none focus:ring-2 focus:ring-amber-500 dark:text-white resize-none mb-4"
            />
            
            <div className="flex gap-3">
              <button 
                onClick={() => handleFeedbackSubmit(true)}
                className="flex-1 py-3 px-4 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                Skip & Download
              </button>
              <button 
                onClick={() => handleFeedbackSubmit(false)}
                disabled={!feedbackText.trim() || isSubmittingFeedback}
                className="flex-1 py-3 px-4 rounded-xl text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmittingFeedback ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Submit & Download
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}