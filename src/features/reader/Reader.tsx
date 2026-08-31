import { useState } from 'react'
import {
  READER_MODE,
  READER_PANELS,
  RESPONSIVE_SIZES,
  panelAssetPath,
  panelSourceSet,
  type ReaderMode,
  type ReaderPanel,
} from './reader-content'
import { usePanelTreatment } from './use-panel-treatment'
import './Reader.css'

function ReaderPicture({ panel }: { panel: ReaderPanel }) {
  const eager = panel.order === 1

  return (
    <picture>
      <source
        type="image/webp"
        srcSet={panelSourceSet(panel, 'webp')}
        sizes={RESPONSIVE_SIZES}
      />
      <img
        src={panelAssetPath(panel, 1280, 'jpg')}
        srcSet={panelSourceSet(panel, 'jpg')}
        sizes={RESPONSIVE_SIZES}
        width={panel.width}
        height={panel.height}
        alt={panel.alt}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : 'auto'}
        decoding="async"
      />
    </picture>
  )
}

interface ReadingRailProps {
  activePanelId: string
  onNavigate: (panelId: string) => void
}

function ReadingRail({ activePanelId, onNavigate }: ReadingRailProps) {
  return (
    <nav className="reading-rail" aria-label="Reading progress">
      <span className="reading-rail__line" aria-hidden="true" />
      <ol>
        {READER_PANELS.map((panel) => (
          <li key={panel.id}>
            <a
              href={`#${panel.id}`}
              aria-label={`Panel ${panel.order}`}
              aria-current={activePanelId === panel.id ? 'step' : undefined}
              onClick={() => onNavigate(panel.id)}
            >
              <span aria-hidden="true">{String(panel.order).padStart(2, '0')}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function Reader() {
  const [mode, setMode] = useState<ReaderMode>(READER_MODE.MOTION)
  const [restartVersion, setRestartVersion] = useState(0)
  const { activePanelId, activatePanel, readerRef } = usePanelTreatment(
    mode,
    restartVersion,
  )

  const changeMode = (nextMode: ReaderMode) => {
    setMode(nextMode)
  }

  return (
    <main className="reader-page">
      <header className="reader-header">
        <div className="reader-header__identity">
          <p className="reader-kicker">Motion Manga Lab · Engineering spike</p>
          <h1>Read the beat, not the interface.</h1>
          <p className="reader-intro">
            A quiet comparison surface for one restrained, panel-level treatment.
          </p>
        </div>

        <div className="comparison-controls" aria-label="Prototype comparison controls">
          <div>
            <p className="comparison-controls__label">Prototype-only comparison</p>
            <fieldset>
              <legend className="visually-hidden">Presentation mode</legend>
              <label>
                <input
                  type="radio"
                  name="presentation-mode"
                  value={READER_MODE.STATIC}
                  checked={mode === READER_MODE.STATIC}
                  onChange={() => changeMode(READER_MODE.STATIC)}
                />
                <span>Static</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="presentation-mode"
                  value={READER_MODE.MOTION}
                  checked={mode === READER_MODE.MOTION}
                  onChange={() => changeMode(READER_MODE.MOTION)}
                />
                <span>Motion</span>
              </label>
            </fieldset>
          </div>
          <button type="button" onClick={() => setRestartVersion((value) => value + 1)}>
            Restart motion
          </button>
          <p className="comparison-controls__note">
            This switch is for prototype review. Study participants would not choose an
            assigned condition.
          </p>
        </div>
      </header>

      <section
        ref={readerRef}
        className="reader-experience"
        aria-labelledby="reading-sequence-title"
      >
        <div className="reader-experience__heading">
          <div>
            <p className="reader-kicker">Pepper &amp; Carrot · Episode 1</p>
            <h2 id="reading-sequence-title">Episode 1, page 2 reading sequence</h2>
          </div>
          <p aria-live="polite">{mode === READER_MODE.MOTION ? 'Motion mode' : 'Static mode'}</p>
        </div>

        <div className="reader-layout">
          <ReadingRail
            activePanelId={activePanelId}
            onNavigate={activatePanel}
          />
          <ol className="panel-sequence">
            {READER_PANELS.map((panel) => (
              <li
                id={panel.id}
                key={panel.id}
                className="reader-panel"
                data-reader-panel
                data-panel-id={panel.id}
              >
                <article aria-labelledby={`${panel.id}-title`}>
                  <header className="reader-panel__meta">
                    <p>Panel {String(panel.order).padStart(2, '0')}</p>
                    <h3 id={`${panel.id}-title`}>{panel.title}</h3>
                  </header>
                  <div
                    className="reader-panel__frame"
                    style={{ aspectRatio: `${panel.width} / ${panel.height}` }}
                  >
                    <div className="reader-panel__crop" data-motion-crop>
                      <ReaderPicture panel={panel} />
                    </div>
                    <div
                      className="reader-panel__light"
                      data-light-echo
                      aria-hidden="true"
                    />
                  </div>
                </article>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="reader-footer">
        <p>Descriptions are provisional and pending human review.</p>
        <p>
          “Pepper &amp; Carrot — Episode 1: The Potion of Flight,” art and scenario
          by David Revoy; Spanish translation by Juanjo Faico; contributions by
          Andrej Ficko and Hồ Nhựt Châu. Licensed under{' '}
          <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.{' '}
          <a href="https://www.peppercarrot.com/es/webcomic-sources/ep01_Potion-of-Flight__files.html">
            Official Spanish source
          </a>. Cropped, responsively encoded, and animated for an engineering
          prototype; no endorsement implied.
        </p>
      </footer>
    </main>
  )
}
