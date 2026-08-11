import React, { useState, useEffect, useMemo } from 'react';
import { 
  Mail, 
  Send, 
  Copy, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  FileText
} from 'lucide-react';

// --- CONFIGURATION & ASSETS ---
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbw-M9kVkSSXKuJ49tohaconx99-l5VcbU1xSNeUTccX2gs0prok3LltyTyO7mdNKtm8/exec";

// Updated Exact Signature Layout
const SIGNATURE_HTML = `
<br><br>
<div style="font-family: Arial, sans-serif; font-size: 10pt; color: #333; line-height: 1.4;">
  <p style="margin: 0; font-weight: bold; font-size: 11pt; color: #000;">Namir Waisberg</p>
  <p style="margin: 0; color: #444;">Managing Director</p>
  <p style="margin: 0; color: #444; font-size: 9pt;">BEconSc (Cum Laude) BSc Hons (Cum Laude) (Wits) Actuary CFA</p>
  <br>
  <p style="margin: 0; font-size: 9pt;">
    <strong style="color: #b48c41;">T</strong> 011 463 0313 &nbsp;&nbsp; <strong style="color: #b48c41;">M</strong> 082 374 5552<br>
    <strong style="color: #b48c41;">E</strong> <a href="mailto:namir@actuaryconsulting.co.za" style="color: #000; text-decoration: none;">namir@actuaryconsulting.co.za</a> &nbsp;&nbsp; <strong style="color: #b48c41;">W</strong> <a href="https://actuaryconsulting.co.za" style="color: #000; text-decoration: none;">actuaryconsulting.co.za</a><br>
    <strong style="color: #b48c41;">A</strong> Corner 5th &amp; Maude Street, Sandown, Sandton, 2031
  </p>
  <br>
  <!-- NOTE: Email images must be hosted online (absolute URL). Replace this src with your live website logo link if needed -->
  <img src="https://actuaryconsulting.co.za/wp-content/uploads/2023/10/Actuary-Consulting-Logo.png" alt="ACTUARY CONSULTING" style="max-height: 45px; display: block; margin-top: 5px; margin-bottom: 10px;" onerror="this.style.display='none'" />
  <br>
  <p style="margin: 0; font-size: 7.5pt; color: #999; text-align: justify;">
    The information contained in this email is confidential and may be subject to legal privilege. The content of this email, which may include one or more attachments, is strictly confidential, and is intended solely for the use of the named recipient/s. If you are not the intended recipient, you cannot use, copy, distribute, disclose or retain the email or any part of its contents or take any action in reliance on it. If you have received this email in error, please email the sender by replying to this message and to permanently delete it and all attachments from your computer. All reasonable precautions have been taken to ensure that no viruses are present in this email and the company cannot accept responsibility for any loss or damage arising from the use of this email or attachments.
  </p>
</div>
`;

const TEMPLATES = [
  {
    id: 'loe-report',
    name: 'Standard LOE Dispatch',
    subject: 'Actuarial Report: <<Claimant Name>> / <<Case Ref>>',
    body: `Dear <<Attorney First Name>>,\n\nAttached please find our Actuarial Report calculating the Loss of Earnings in respect of <<Claimant Name>>.\n\nOur fee note is attached for your kind attention. Please ensure payment is processed within <<Payment Terms>> days.\n\nShould you require any amendments or further scenarios, please do not hesitate to contact our offices.\n\nKind regards,\nNamir`
  },
  {
    id: 'info-req',
    name: 'Missing Information Request',
    subject: 'URGENT INFO REQUIRED: <<Claimant Name>>',
    body: `Dear <<Attorney First Name>>\n\nThank you for requesting a Loss of Earnings calculation for <<Claimant Name>>.\n\nKindly assist us by confirming the following outstanding information:\n<<Missing Information Details>>\n\nWe will be able to proceed with the actuarial calculations once the above-mentioned information has been provided.\n\nKind regards\nNamir`
  },
  {
    id: 'amendment',
    name: 'Amended Report Dispatch',
    subject: 'AMENDED Actuarial Report: <<Claimant Name>>',
    body: `Dear <<Attorney First Name>>,\n\nAs requested, please find attached the AMENDED Actuarial Report for <<Claimant Name>>.\n\nThe amendments reflect the following changes:\n<<Amendment Details>>\n\nWe trust you find the above in order.\n\nKind regards,\nNamir`
  }
];

export default function EmailEngine() {
  const [selectedTemplateId, setSelectedTemplateId] = useState(TEMPLATES[0].id);
  const [variables, setVariables] = useState({});
  const [parsedKeys, setParsedKeys] = useState({ subject: [], body: [] });
  const [status, setStatus] = useState({ msg: '', type: '' });
  const [isPushing, setIsPushing] = useState(false);

  useEffect(() => {
    const template = TEMPLATES.find(t => t.id === selectedTemplateId) || TEMPLATES[0];
    const regex = /<<([^>]+)>>/g;
    
    const subjectKeys = [];
    let match;
    while ((match = regex.exec(template.subject)) !== null) {
      if (!subjectKeys.includes(match[1])) subjectKeys.push(match[1]);
    }

    const bodyKeys = [];
    while ((match = regex.exec(template.body)) !== null) {
      if (!bodyKeys.includes(match[1])) bodyKeys.push(match[1]);
    }

    setParsedKeys({ subject: subjectKeys, body: bodyKeys });

    const newVars = {};
    [...subjectKeys, ...bodyKeys].forEach(key => {
      newVars[key] = '';
    });
    setVariables(newVars);
    setStatus({ msg: '', type: '' });
  }, [selectedTemplateId]);

  const handleVarChange = (key, val) => {
    setVariables(prev => ({ ...prev, [key]: val }));
  };

  const compiledContent = useMemo(() => {
    const template = TEMPLATES.find(t => t.id === selectedTemplateId) || TEMPLATES[0];
    
    let compSubject = template.subject;
    let compBody = template.body;

    Object.keys(variables).forEach(key => {
      const val = variables[key] || `[${key}]`; 
      const replaceRegex = new RegExp(`<<${key}>>`, 'g');
      compSubject = compSubject.replace(replaceRegex, val);
      compBody = compBody.replace(replaceRegex, val);
    });

    const htmlBody = compBody.replace(/\n/g, '<br/>') + SIGNATURE_HTML;

    return { subject: compSubject, htmlBody };
  }, [selectedTemplateId, variables]);

  const copyToClipboard = () => {
    try {
      const blobHtml = new Blob([compiledContent.htmlBody], { type: "text/html" });
      const blobText = new Blob([compiledContent.htmlBody.replace(/<[^>]*>?/gm, '')], { type: "text/plain" });
      const data = [new ClipboardItem({ "text/plain": blobText, "text/html": blobHtml })];

      navigator.clipboard.write(data).then(() => {
        setStatus({ msg: 'Rich text copied! Paste directly into Gmail.', type: 'success' });
        setTimeout(() => setStatus({ msg: '', type: '' }), 3000);
      });
    } catch (err) {
      navigator.clipboard.writeText(compiledContent.htmlBody.replace(/<br\/>/g, '\n').replace(/<[^>]*>?/gm, ''));
      setStatus({ msg: 'Plain text copied to clipboard.', type: 'success' });
    }
  };

  const pushToGmail = async () => {
    setIsPushing(true);
    setStatus({ msg: 'Pushing draft to Gmail Backend...', type: 'info' });

    try {
      const payload = {
        action: 'CREATE_DRAFT',
        subject: compiledContent.subject,
        htmlBody: compiledContent.htmlBody
      };

      const res = await fetch(GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });

      let result;
      try {
        result = await res.json();
      } catch {
        setStatus({
          msg: `Backend returned a non-JSON response (HTTP ${res.status}). Redeploy the Apps Script CREATE_DRAFT handler.`,
          type: 'error'
        });
        return;
      }

      const ok = String(result?.status || '').toLowerCase() === 'success';
      if (ok) {
        setStatus({
          msg: result.message || 'Draft created in your Gmail account!',
          type: 'success'
        });
      } else {
        const detail = result?.message || `HTTP ${res.status}`;
        setStatus({
          msg: `Failed to push draft via GAS: ${detail}`,
          type: 'error'
        });
      }
    } catch (err) {
      console.error(err);
      setStatus({
        msg: `Network error connecting to Backend: ${err?.message || 'unknown error'}`,
        type: 'error'
      });
    } finally {
      setIsPushing(false);
    }
  };

  const allUniqueKeys = [...new Set([...parsedKeys.subject, ...parsedKeys.body])];

  return (
    <div className="h-full flex overflow-hidden bg-slate-50 dark:bg-slate-900/50">
      
      {/* COLUMN 1: TEMPLATE & VARIABLES */}
      <div className="w-[380px] shrink-0 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-white dark:bg-slate-800 z-10">
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-1 text-slate-800 dark:text-slate-100">
            <Mail className="text-amber-500 w-5 h-5" /> Communications
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Dynamic email routing and dispatch</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scroll">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-500 dark:text-slate-400">
              1. Select Template
            </label>
            <div className="relative">
               <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                 <FileText size={16} />
               </span>
              <select 
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full pl-9 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-500/20 text-slate-900 dark:text-white transition-all appearance-none cursor-pointer"
              >
                {TEMPLATES.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-slate-100 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-900/50">
            <div className="flex items-center justify-between mb-4">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                2. Template Variables
              </label>
              <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold px-2 py-1 rounded-full border border-amber-500/20">
                {allUniqueKeys.length} DETECTED
              </span>
            </div>

            {allUniqueKeys.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No dynamic variables detected.</p>
            ) : (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                {allUniqueKeys.map(key => (
                  <div key={key}>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">{key}</label>
                    {key.toLowerCase().includes('list') || key.toLowerCase().includes('details') ? (
                      <textarea 
                        value={variables[key]}
                        onChange={(e) => handleVarChange(key, e.target.value)}
                        placeholder={`Enter ${key}...`}
                        rows="4"
                        className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm outline-none focus:border-amber-500 dark:text-white transition-all resize-none"
                      />
                    ) : (
                      <input 
                        type="text" 
                        value={variables[key]}
                        onChange={(e) => handleVarChange(key, e.target.value)}
                        placeholder={`Enter ${key}...`}
                        className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm outline-none focus:border-amber-500 dark:text-white transition-all"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* COLUMN 2: LIVE PREVIEW & EXPORT */}
      <div className="flex-1 flex flex-col relative bg-slate-200/60 dark:bg-[#0f172a]">
        <div className="h-16 shrink-0 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-emerald-500 animate-spin-slow" />
            <span className="text-xs font-bold tracking-wide uppercase text-slate-500 dark:text-slate-400">HTML Compiled</span>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={copyToClipboard} 
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95"
            >
              <Copy className="w-4 h-4" /> Copy HTML
            </button>
            <button 
              onClick={pushToGmail} 
              disabled={isPushing}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 transition-all active:scale-95 disabled:opacity-50"
            >
              {isPushing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} 
              Push to Gmail
            </button>
          </div>
        </div>

        {status.msg && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 fade-in duration-300 max-w-[min(90%,42rem)] px-4">
            <div className={`px-6 py-3 rounded-2xl shadow-2xl flex items-start gap-2 text-sm font-bold border ${
              status.type === 'success' ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-100 border-emerald-200 dark:border-emerald-800' :
              status.type === 'error' ? 'bg-rose-100 dark:bg-rose-900 text-rose-800 dark:text-rose-100 border-rose-200 dark:border-rose-800' :
              'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 border-blue-200 dark:border-blue-800'
            }`}>
              <span className="shrink-0 mt-0.5">
                {status.type === 'success' ? <CheckCircle2 size={18} /> : status.type === 'error' ? <AlertCircle size={18} /> : <RefreshCw size={18} className="animate-spin" />}
              </span>
              <span className="leading-snug">{status.msg}</span>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-8 custom-scroll flex justify-center">
          <div className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col self-start">
            <div className="bg-slate-50 dark:bg-slate-800/80 px-6 py-4 border-b border-slate-100 dark:border-slate-700/50">
              <div className="flex items-center gap-4 mb-3">
                <span className="text-slate-400 dark:text-slate-500 font-medium text-sm w-16">To</span>
                <div className="flex-1 border-b border-slate-200 dark:border-slate-700 pb-1">
                  <span className="text-sm text-slate-700 dark:text-slate-300 italic">Recipient selected in Gmail...</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-slate-400 dark:text-slate-500 font-medium text-sm w-16">Subject</span>
                <div className="flex-1 font-semibold text-slate-800 dark:text-slate-100 text-lg border-b border-slate-200 dark:border-slate-700 pb-1">
                  {compiledContent.subject}
                </div>
              </div>
            </div>

            <div 
              className="p-8 text-sm text-slate-800 dark:text-slate-200 leading-relaxed min-h-[400px] outline-none"
              dangerouslySetInnerHTML={{ __html: compiledContent.htmlBody }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}