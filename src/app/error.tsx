"use client";

import { useEffect } from "react";
import { MascotHeader } from "@/components/mascot/MascotHeader";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background p-4 text-center">
      <div className="max-w-md rounded-2xl bg-card p-8 shadow-lg border border-purple-200">
        <MascotHeader 
          pose="reflexion" 
          title="Oups ! Une erreur s'est produite" 
          description="Quelque chose ne s'est pas passé comme prévu."
        />
        <div className="mt-8 flex flex-col gap-4">
          <p className="text-muted-foreground">
            Nous n'avons pas pu charger cette page. Vous pouvez réessayer ou retourner à l'accueil.
          </p>
          <button
            onClick={reset}
            className="rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 transition-colors"
          >
            Réessayer
          </button>
        </div>
      </div>
    </div>
  );
}
