const steps = [
  {
    number: '01',
    title: 'Set up your phone',
    description: 'Before it goes missing, register your Android phone and enable finding.',
  },
  {
    number: '02',
    title: 'Nearby devices help',
    description:
      'Participating phones can detect a Bluetooth signal and relay an approximate location.',
  },
  {
    number: '03',
    title: 'Check your dashboard',
    description: 'Sign in on another device to see the latest available report and its time.',
  },
];

export default function HomePage() {
  return (
    <main>
      <header className="site-header">
        <div className="shell nav">
          <a className="brand" href="#top" aria-label="OpenFind home">
            <span className="brand-mark" aria-hidden="true">
              O
            </span>
            <span>
              openfind<span className="brand-dot">.</span>
            </span>
          </a>
          <nav aria-label="Main navigation" className="nav-links">
            <a href="#how-it-works">How it works</a>
            <a href="#privacy">Privacy</a>
          </nav>
          <span className="dev-badge">
            <span aria-hidden="true" /> In development
          </span>
        </div>
      </header>

      <section className="hero shell" id="top">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-line" /> AN OPEN-SOURCE PROJECT
          </div>
          <h1>
            A little help
            <br />
            goes a <em>long way.</em>
          </h1>
          <p className="hero-intro">
            A community-powered idea for finding your Android phone, even when it&apos;s offline.
          </p>
          <p className="hero-detail">
            OpenFind is being built to help nearby, consenting devices work together when it matters
            most.
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#how-it-works">
              See how it works <span aria-hidden="true">↗</span>
            </a>
            <a className="text-button" href="#privacy">
              Our approach <span aria-hidden="true">→</span>
            </a>
          </div>
          <div className="status-note">
            <span className="status-dot" /> Early development · Finding is not active yet
          </div>
        </div>

        <div
          className="hero-visual"
          aria-label="Concept illustration of nearby devices communicating"
        >
          <div className="visual-header">
            <span>
              <i /> THE IDEA
            </span>
            <span>CONCEPT / 01</span>
          </div>
          <div className="signal-visual" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit orbit-three" />
            <div className="orbit-point point-one" />
            <div className="orbit-point point-two" />
            <div className="orbit-point point-three" />
            <div className="device-icon">
              <div className="device-notch" />
              <div className="device-ring">
                <span />
              </div>
              <div className="device-line" />
            </div>
            <div className="small-device">
              <span>✳</span>
            </div>
            <div className="mini-label label-one">
              NEARBY DEVICE <span>↗</span>
            </div>
            <div className="mini-label label-two">
              BLUETOOTH SIGNAL <span>↗</span>
            </div>
          </div>
          <div className="visual-footer">
            <span className="visual-footer-icon">⌁</span>
            <div>
              <strong>Better together</strong>
              <small>Discovery through a participating community</small>
            </div>
            <span className="visual-footer-arrow">↗</span>
          </div>
        </div>
      </section>

      <section className="intro-strip">
        <div className="shell strip-inner">
          <span className="strip-mark">✳</span>
          <p>
            Built around a simple idea: <strong>no one should have to search alone.</strong>
          </p>
          <span className="strip-index">A MORE CONNECTED WAY TO FIND</span>
        </div>
      </section>

      <section className="how shell" id="how-it-works">
        <div className="section-head">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-line" /> THE PLAN
            </div>
            <h2>
              How it&apos;s meant
              <br />
              to work<span>.</span>
            </h2>
          </div>
          <p>Three simple steps, built around people helping people.</p>
        </div>
        <div className="steps">
          {steps.map((step) => (
            <article className="step" key={step.number}>
              <span className="step-number">
                {step.number} <span>↗</span>
              </span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
            </article>
          ))}
        </div>
        <p className="small-print">
          Finding requires supported, powered-on phones and participating devices nearby. Android
          restrictions and network coverage affect availability.
        </p>
      </section>

      <section className="privacy-section" id="privacy">
        <div className="shell privacy-inner">
          <div>
            <div className="eyebrow light-eyebrow">
              <span className="eyebrow-line" /> THOUGHTFULLY DESIGNED
            </div>
            <h2>
              Privacy is part of
              <br />
              the plan<span>.</span>
            </h2>
          </div>
          <div className="privacy-copy">
            <p>
              OpenFind is being designed around consent, limited data collection, and owner-only
              access. The privacy protocol and safety features still need implementation and
              independent review.
            </p>
            <span>OPEN SOURCE &nbsp; / &nbsp; ANDROID FIRST &nbsp; / &nbsp; COMMUNITY POWERED</span>
          </div>
        </div>
      </section>
      <footer className="shell footer">
        <span className="brand footer-brand">
          <span className="brand-mark">O</span>
          <span>
            openfind<span className="brand-dot">.</span>
          </span>
        </span>
        <p>A project in progress. Not yet a working finding service.</p>
        <a href="#top">Back to top ↑</a>
      </footer>
    </main>
  );
}
