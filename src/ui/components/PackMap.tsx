import type { PackState } from '../../core';
import { useDashboard } from '../store';
import { ModuleTile } from './ModuleTile';

/**
 * The pack laid out as two rows of modules in series order, so physically adjacent
 * modules sit next to each other and heat spreading between them is visible.
 */
export function PackMap({ state }: { state: PackState }) {
  const selected = useDashboard((s) => s.selectedModule);
  const select = useDashboard((s) => s.selectModule);
  const columns = Math.max(1, Math.min(8, Math.ceil(state.modules.length / 2)));

  return (
    <section className="panel pack-map" aria-label="Battery pack modules">
      <header className="panel-head">
        <h2>Battery pack</h2>
        <span className="muted">{state.modules.length} modules · select one for detail</span>
      </header>
      <div className="tile-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {state.modules.map((m) => (
          <ModuleTile key={m.id} module={m} selected={m.id === selected} onSelect={(id) => select(id === selected ? null : id)} />
        ))}
      </div>
    </section>
  );
}
