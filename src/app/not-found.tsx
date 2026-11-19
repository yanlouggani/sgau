"use client";

import Link from "next/link";
import { MascotHeader } from "@/components/mascot/MascotHeader";

export default function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background p-4 text-center">
      <div className="max-w-md rounded-2xl bg-card p-8 shadow-lg border border-purple-200">
        <MascotHeader 
          pose="reflexion" 
          title="Page introuvable" 
          description="Désolé, nous ne trouvons pas cette page."
        />
        <div className="mt-8">
          <Link
            href="/dashboard"
            className="inline-block rounded-lg bg-purple-600 px-6 py-2 text-white hover:bg-purple-700 transition-colors"
          >
            Retour au tableau de bord
          </Link>
        </div>
      </div>
    </div>
  );
}
