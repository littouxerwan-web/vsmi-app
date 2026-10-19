import { SunFastMark } from "@/components/sun-fast-mark";

export function LoadingScreen({ navigation = false, label = "Chargement de la page" }: { navigation?: boolean; label?: string }) {
  return <div className={`vsmi-loading-screen fixed inset-0 ${navigation ? "z-[300]" : "z-[290]"} grid place-items-center px-6`} role="status" aria-live="polite" aria-label={label}>
    <div className="flex flex-col items-center gap-5">
      <SunFastMark className="h-48 w-32 sm:h-56 sm:w-36"/>
      <p className="text-xs tracking-wide text-[#CBD6E5]">Votre quotidien, en équilibre.</p>
      <span aria-hidden="true" className="h-1 w-24 overflow-hidden rounded-full bg-white/10"><span className="block h-full w-1/2 animate-pulse rounded-full bg-[#DCC79D] motion-reduce:animate-none"/></span>
      <span className="sr-only">{label}</span>
    </div>
  </div>;
}
