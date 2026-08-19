const styles = {
  Trial: 'bg-slate-100 text-slate-700',
  Premier: 'bg-gold/20 text-amber-800',
  Elite: 'bg-emerald-100 text-emerald-800',
  active: 'bg-emerald-100 text-emerald-800',
  suspended: 'bg-amber-100 text-amber-800',
  banned: 'bg-rose-100 text-rose-800',
  scheduled: 'bg-slate-100 text-slate-700',
  pending_confirmation: 'bg-blue-100 text-blue-800',
  completed: 'bg-emerald-100 text-emerald-800',
  disputed: 'bg-rose-100 text-rose-800',
  cancelled: 'bg-slate-200 text-slate-700',
};

export default function Badge({ children, tone }) {
  return (
    <span className={`inline-flex rounded px-2.5 py-1 text-xs font-bold uppercase ${styles[tone || children] || styles.Trial}`}>
      {String(children).replaceAll('_', ' ')}
    </span>
  );
}
