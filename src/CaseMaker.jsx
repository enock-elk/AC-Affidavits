import React from 'react';

// GUARDIAN NOTE: The live Google Apps Script Web App URL
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbxDKB-wWAd-BDOdfqe-sr6RRgrakIM5qhqfQy-2mvF9hQ7-xJAk8NhZcdPSPeHFFfGZ/exec";

export default function CaseMaker() {
  return (
    <div className="h-full w-full overflow-hidden bg-slate-50 dark:bg-[#0f172a] transition-colors duration-300">
      {/* GUARDIAN: Pure iFrame Shell.
        The Google Apps Script 'Index.html' already contains the Tailwind CSS,
        the Header, the Tabs, and the Local Python submission logic.
        This iframe simply acts as a secure, CORS-free window to that native app.
      */}
      <iframe 
        src={GAS_API_URL}
        className="w-full h-full border-0"
        title="RyanGPT Case Maker"
        allow="clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
      ></iframe>
    </div>
  );
}