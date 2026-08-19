export default function Spinner({ label = 'Loading' }) {
  return (
    <div className="flex min-h-[45vh] items-center justify-center">
      <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-gold border-t-transparent" />
        <span className="text-sm font-semibold text-slate-700">{label}</span>
      </div>
    </div>
  );
}
