import { Link } from 'react-router-dom';
import SeoMeta from '../components/SeoMeta.jsx';
import { PUBLIC_SEO } from '../lib/publicSeo.js';

const rules = [
  {
    title: 'Register with accurate player details',
    copy: 'Submit your player and team information through eFootball online league registration. Your application must be reviewed and approved before you can take part in scheduled league play.',
  },
  {
    title: 'Play the assigned fixture',
    copy: 'Check your fixtures and follow the instructions provided for your match or tournament. Use your registered squad and coordinate with your opponent so the result can be reported correctly.',
  },
  {
    title: 'Submit and confirm the score',
    copy: 'Enter the score that was played. Your opponent should review and confirm it; if there is a disagreement, use the dispute process rather than submitting a result you cannot verify. Confirmed results update the league standings.',
  },
  {
    title: 'Check each event’s entry and prize terms',
    copy: 'Some events may be paid eFootball mobile tournaments or offer prizes. Before entering, review the published entry requirements, prize details, eligibility, verification steps, and payout terms for that specific event. Prize eligibility is subject to those terms.',
  },
];

export default function RulesPage() {
  return (
    <article className="mx-auto max-w-4xl space-y-8 py-8">
      <SeoMeta {...PUBLIC_SEO.rules} />
      <header className="space-y-3">
        <p className="text-sm font-black uppercase tracking-wide text-pitch">Compete clearly and fairly</p>
        <h1 className="text-4xl font-black leading-tight text-ink dark:text-white sm:text-5xl">
          GoalQuest League eFootball Tournament Rules
        </h1>
        <p className="text-lg font-semibold leading-8 text-slate-600 dark:text-slate-300">
          These guidelines explain registration, fixtures, score reporting, and event prizes. Always follow any additional instructions published for your specific league season or tournament.
        </p>
      </header>

      {rules.map((rule, index) => (
        <section key={rule.title} className="space-y-2 border-b border-slate-200 pb-6 dark:border-slate-700">
          <h2 className="text-2xl font-black text-ink dark:text-white">{index + 1}. {rule.title}</h2>
          <p className="leading-7 text-slate-700 dark:text-slate-300">{rule.copy}</p>
        </section>
      ))}

      <section className="space-y-3 rounded-md bg-navy p-6 text-white">
        <h2 className="text-2xl font-black">Ready to start your eFootball journey?</h2>
        <p className="leading-7 text-slate-200">
          Build your record, learn the competition, and start a career as a gamer with a structured eFootball league in Nigeria.
        </p>
        <Link to="/register" className="inline-flex rounded bg-gold px-5 py-3 text-sm font-black text-ink hover:bg-amber-400">
          Register for GoalQuest League
        </Link>
      </section>
    </article>
  );
}
