import { ModuleTileDemo } from './ui/demo/ModuleTileDemo';

/** App shell. Currently shows component previews while the dashboard is built. */
export default function App() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Battery Safety Dashboard</h1>
      <ModuleTileDemo />
    </main>
  );
}
