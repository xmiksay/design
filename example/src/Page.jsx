// The previewed page — a JSX page component composed from the design system.
import { Button, Card } from "./components.jsx";

export default function Page() {
  return (
    <div className="page">
      <header className="page__header">
        <p className="kicker">JSX page component</p>
        <h1>Design&nbsp;system preview</h1>
      </header>

      <h2>Buttons</h2>
      <div className="row">
        <Button>Primary action</Button>
        <Button variant="ghost">Secondary</Button>
        <Button disabled>Disabled</Button>
      </div>

      <h2>Cards</h2>
      <div className="cards">
        <Card eyebrow="Token-driven" heading="Styled from CSS variables">
          Every value comes from <code>src/tokens.css</code>, compiled from DTCG
          JSON. Change a token, rebuild, refresh — the page follows.
        </Card>
        <Card eyebrow="JSX components" heading="Authored in React">
          Page components are JSX, built by Vite into <code>preview/</code> and
          served into the live-view iframe by the design server.
        </Card>
      </div>
    </div>
  );
}
