export default function Loading() {
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600"></div>
      <p className="mt-4 text-muted-foreground animate-pulse">Chargement en cours...</p>
    </div>
  );
}
