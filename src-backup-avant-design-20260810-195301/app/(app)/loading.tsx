import Image from "next/image";

export default function AppLoading(){
 return <div className="fixed inset-0 z-[290] grid place-items-center bg-[#0B0B0B]/96 backdrop-blur-sm" aria-label="Chargement de la page">
  <div className="flex flex-col items-center gap-4">
   <Image src="/vsmi-logo.gif" alt="VSMI" width={180} height={180} priority unoptimized className="h-auto w-32 object-contain sm:w-40"/>
   <span className="h-1 w-24 overflow-hidden rounded-full bg-white/10"><span className="block h-full w-1/2 animate-pulse rounded-full bg-[#D2AE57]"/></span>
  </div>
 </div>;
}
