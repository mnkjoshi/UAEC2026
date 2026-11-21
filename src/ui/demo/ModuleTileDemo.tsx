import { useState } from 'react';
import { ModuleTile } from '../components/ModuleTile';
import { mockModules } from './mockModules';

/** Preview page: 12 mock modules in the pack's 2 × 6 layout. */
export function ModuleTileDemo() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <section>
      <h2>Module tile preview</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
        {mockModules.map((m) => (
          <ModuleTile
            key={m.id}
            id={m.id}
            temperature={m.temperature}
            voltage={m.voltage}
            soc={m.soc}
            severity={m.severity}
            label={m.label}
            selected={m.id === selectedId}
            onClick={() => setSelectedId(m.id)}
          />
        ))}
      </div>
    </section>
  );
}
