/** Transparent vector version of the original stacked wordmark. */
export function BrandMark({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 100 122" fill="none" role="img" aria-label="Vue sur mer imprenable" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="94" height="116" rx="1" stroke="currentColor" strokeWidth="1.2"/>
    <g fill="currentColor" fontFamily="Arial, Helvetica, sans-serif" fontWeight="400" fontSize="26" textAnchor="middle">
      <text x="50" y="32" textLength="71" lengthAdjust="spacing">VUE</text>
      <text x="50" y="61" textLength="71" lengthAdjust="spacing">SUR</text>
      <text x="50" y="90" textLength="71" lengthAdjust="spacing">MER</text>
    </g>
    <path d="M14 98H86" stroke="currentColor" strokeWidth=".8"/>
    <text x="50" y="111" fill="currentColor" fontFamily="Arial, Helvetica, sans-serif" fontSize="8.5" fontWeight="500" textAnchor="middle" textLength="73" lengthAdjust="spacing">IMPRENABLE</text>
  </svg>;
}
