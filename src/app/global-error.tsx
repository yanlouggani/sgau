"use client";

import { MascotHeader } from "@/components/mascot/MascotHeader";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body>
        <div className="flex h-screen flex-col items-center justify-center bg-background p-4 text-center">
          <div className="max-w-md rounded-2xl bg-card p-8 shadow-lg border border-purple-200">
            <MascotHeader 
              pose="reflexion" 
              title="Erreur critique" 
              description="Une erreur inattendue est survenue au niveau global."
            />
            <div className="mt-8 flex flex-col gap-4">
              <button
                onClick={reset}
                className="rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 transition-colors"
              >
                Réessayer
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
