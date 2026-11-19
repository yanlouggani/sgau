"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";
import { ShieldCheck } from "lucide-react";

export function StudentQRCode({
  studentId,
  token,
}: {
  studentId: string;
  token?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const qrValue = token || studentId;

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, qrValue, {
        width: 256,
        margin: 2,
        color: { dark: "#1e1b4b", light: "#ffffff" },
      });
    }
  }, [qrValue]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="h-64 w-64 rounded-3xl border-2 border-[#6d28d9]/20 bg-white p-4 shadow-xl shadow-[#6d28d9]/5">
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>
      <div className="flex items-center gap-1.5 text-xs text-[#334155]">
        <ShieldCheck className="h-4 w-4 text-emerald-600" />
        <span className="font-bold">Badge sécurisé (rotation automatique)</span>
      </div>
    </div>
  );
}
