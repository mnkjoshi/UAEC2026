import { useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import { useFleet } from '../fleetStore';
import { rise, spring, springSlow, stagger, useMediaQuery } from '../motion';
import { useDashboard, type ScenarioEntry } from '../store';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { PackHero } from './PackHero';
import { AdviseVisual, CompareVisual, PersistenceVisual, SensorVisual } from './StoryVisuals';

const HEADLINE = 'Battery safety you can see.';

const STEPS = [
  {
    title: 'Check the sensor',
    body: 'Missing, frozen, impossible and spiking readings are set aside as data faults, so a failed sensor is never mistaken for a fire.',
    Visual: SensorVisual,
  },
  {
    title: 'Compare three ways',
    body: 'Each module is measured against safety limits, against the rest of the pack, and against its own rate of change.',
    Visual: CompareVisual,
  },
  {
    title: 'Require persistence',
    body: 'A condition must hold before it alerts and recover with margin before it clears. Normal operation raises nothing.',
    Visual: PersistenceVisual,
  },
  {
    title: 'Explain and advise',
    body: 'Each alert names the likely cause, the affected modules, the time remaining to a critical limit, and the action to take.',
    Visual: AdviseVisual,
  },
];

/** One file opens the pack dashboard; several open the fleet view (one bus per file). */
async function openFiles(files: File[]) {
  if (files.length > 1) useFleet.getState().loadFiles(files);
  else if (files[0]) useDashboard.getState().loadCsvText(await files[0].text(), files[0].name);
}

/** Opening page: what Batter-eye does, shown live, and the ways in. */
export function Landing() {
  const scenarios = useDashboard((s) => s.scenarios);
  const loadScenario = useDashboard((s) => s.loadScenario);
  const fileInput = useRef<HTMLInputElement>(null);
  const pick = () => fileInput.current?.click();
  const provided = scenarios.filter((s) => s.source === 'provided');
  const generated = scenarios.filter((s) => s.source !== 'provided');
  const featured = scenarios.find((s) => s.id === 'thermal_propagation') ?? scenarios.find((s) => s.id === 'thermal_rise');

  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 8));

  return (
    <div className="landing">
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv,text/plain"
        multiple
        hidden
        onChange={(e) => {
          openFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />

      <header className={`l-nav${scrolled ? ' scrolled' : ''}`}>
        <div className="l-nav-inner">
          <Logo size={24} />
          <nav className="l-nav-links" aria-label="Sections">
            <a href="#how">How it works</a>
            <a href="#scenarios">Scenarios</a>
            <button type="button" className="l-btn small" onClick={pick}>
              Upload telemetry
            </button>
          </nav>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="l-hero">
        <h1 aria-label={HEADLINE}>
          <motion.span className="l-words" variants={stagger(0.07, 0.1)} initial="hidden" animate="show" aria-hidden>
            {HEADLINE.split(' ').map((w, i) => (
              <motion.span key={i} className="l-word" variants={rise}>
                {w}
              </motion.span>
            ))}
          </motion.span>
        </h1>
        <motion.div variants={stagger(0.08, 0.55)} initial="hidden" animate="show">
          <motion.p className="l-lede" variants={rise}>
            Batter-eye watches every module of an electric bus battery pack, explains what is going wrong, and tells the driver what
            to do before it becomes critical.
          </motion.p>
          <motion.div className="l-actions" variants={rise}>
            <motion.button type="button" className="l-btn primary" onClick={pick} whileTap={{ scale: 0.97 }}>
              <Icon name="upload" size={16} /> Upload telemetry
            </motion.button>
            <motion.button
              type="button"
              className="l-btn"
              onClick={() => useFleet.getState().loadDemoFleet(scenarios)}
              whileTap={{ scale: 0.97 }}
            >
              <Icon name="fleet" size={16} /> Open demo fleet
            </motion.button>
          </motion.div>
          {featured && (
            <motion.p className="l-hint" variants={rise}>
              or{' '}
              <button type="button" className="l-link" onClick={() => loadScenario(featured)}>
                replay a thermal event
              </button>
            </motion.p>
          )}
        </motion.div>
      </section>

      <Stage />

      <Story />

      {/* ---------- Scenarios ---------- */}
      <section className="l-section" id="scenarios" aria-labelledby="scen-title">
        <Reveal className="l-section-head">
          <h2 id="scen-title">Seventeen scenarios, ready to replay</h2>
          <p>Five recordings from the competition dataset and twelve stress tests built to challenge the detection logic.</p>
        </Reveal>
        <ScenarioGroup title="Competition recordings" items={provided} onPick={loadScenario} />
        <ScenarioGroup title="Stress tests" items={generated} onPick={loadScenario} />
      </section>

      {/* ---------- Call to action ---------- */}
      <section className="l-cta">
        <Reveal>
          <h2>Bring your own telemetry.</h2>
          <p>Any CSV in the competition format. Messy files are fine: every problem is reported, none is fatal.</p>
        </Reveal>
        <motion.button
          type="button"
          className="l-drop"
          onClick={pick}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={springSlow}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
        >
          <Icon name="upload" size={28} />
          <span className="l-drop-title">Drop CSV files here, or choose files</span>
          <span className="l-drop-sub">One file opens a pack. Several open a fleet, one bus per file.</span>
        </motion.button>
      </section>

      <footer className="l-foot">
        <Logo size={18} />
        <span>Runs entirely in the browser. Telemetry never leaves this machine.</span>
        <span>UAEC 2026, Programming</span>
      </footer>
    </div>
  );
}

/** Fades and lifts its children into place the first time they scroll into view. */
function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={springSlow}
    >
      {children}
    </motion.div>
  );
}

/**
 * The large pack visual. It starts tilted back in perspective and settles flat as it
 * scrolls into the centre of the screen, like a product placed on the table.
 */
function Stage() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] });
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 24 });
  const rotateX = useTransform(p, [0, 1], [28, 0]);
  const scale = useTransform(p, [0, 1], [0.86, 1]);
  const y = useTransform(p, [0, 1], [60, 0]);
  const opacity = useTransform(p, [0, 0.4], [0.2, 1]);

  return (
    <section ref={ref} className="l-stage" aria-label="Live preview">
      <motion.div className="l-stage-inner" style={reduced ? undefined : { rotateX, scale, y, opacity }}>
        <PackHero />
      </motion.div>
    </section>
  );
}

/**
 * "How a reading becomes an alert", pinned while the reader scrolls through four steps.
 * On narrow screens the steps simply stack, each with its illustration.
 */
function Story() {
  const wide = useMediaQuery('(min-width: 960px)');
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const progress = useSpring(scrollYProgress, { stiffness: 160, damping: 30 });
  const [step, setStep] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (v) => setStep(Math.min(STEPS.length - 1, Math.max(0, Math.floor(v * STEPS.length)))));

  const jumpTo = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const span = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + ((i + 0.5) / STEPS.length) * span, behavior: 'smooth' });
  };

  if (!wide) {
    return (
      <section className="l-section" id="how" aria-labelledby="how-title">
        <Reveal>
          <h2 id="how-title">How a reading becomes an alert</h2>
        </Reveal>
        <div className="story-stack">
          {STEPS.map(({ title, body, Visual }) => (
            <Reveal key={title} className="story-stack-item">
              <h3>{title}</h3>
              <p>{body}</p>
              <Visual />
            </Reveal>
          ))}
        </div>
      </section>
    );
  }

  const Visual = STEPS[step].Visual;
  return (
    <section ref={ref} className="l-story" id="how" aria-labelledby="how-title" style={{ height: `${STEPS.length * 85 + 40}vh` }}>
      <div className="l-story-sticky">
        <div className="l-story-text">
          <h2 id="how-title">How a reading becomes an alert</h2>
          <div className="l-story-steps">
            <div className="l-rail" aria-hidden>
              <motion.div className="l-rail-fill" style={{ scaleY: progress }} />
            </div>
            <ol>
              {STEPS.map((s, i) => (
                <li key={s.title} className={i === step ? 'active' : ''}>
                  <button type="button" onClick={() => jumpTo(i)} aria-current={i === step ? 'step' : undefined}>
                    <span className="l-step-title">{s.title}</span>
                    <motion.span
                      className="l-step-body"
                      initial={false}
                      animate={{ height: i === step ? 'auto' : 0, opacity: i === step ? 1 : 0 }}
                      transition={spring}
                    >
                      {s.body}
                    </motion.span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="l-story-visual">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -20, filter: 'blur(6px)' }}
              transition={spring}
            >
              <Visual />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

function ScenarioGroup({ title, items, onPick }: { title: string; items: ScenarioEntry[]; onPick: (s: ScenarioEntry) => void }) {
  if (!items.length) return null;
  return (
    <div className="scen-group">
      <h3>{title}</h3>
      <motion.ul variants={stagger(0.035)} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.15 }}>
        {items.map((s) => (
          <motion.li key={s.id} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: spring } }}>
            <button type="button" onClick={() => onPick(s)}>
              <span className="scen-name">{s.name}</span>
              <span className="scen-desc">{s.description}</span>
              <span className="scen-go">
                Replay <Icon name="stepForward" size={14} />
              </span>
            </button>
          </motion.li>
        ))}
      </motion.ul>
    </div>
  );
}
