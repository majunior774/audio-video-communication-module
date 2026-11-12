import { useState } from 'react';
import StudyRoomsBrand from '../components/StudyRoomsBrand';

export default function LandingPage({ onCreateRoom, onJoinRoom, onOpenDashboard }) {
  const [roomCode, setRoomCode] = useState('');
  const [inputError, setInputError] = useState('');

  const handleJoinSubmit = (e) => {
    e.preventDefault();
    const trimmed = roomCode.trim();
    if (!trimmed) {
      setInputError('Please enter a room code or link');
      return;
    }

    try {
      if (trimmed.includes('?room=')) {
        const url = new URL(trimmed);
        const code = url.searchParams.get('room');
        if (code) {
          onJoinRoom(code.trim());
          return;
        }
      }
    } catch {
      // not a full url, use as plain code
    }

    onJoinRoom(trimmed.replace(/[^a-zA-Z0-9_-]/g, ''));
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setRoomCode(text);
        setInputError('');
      }
    } catch (e) {
      console.log('Clipboard read blocked:', e);
    }
  };

  return (
    <div className="sr-landing">
      <header className="sr-landing__header">
        <StudyRoomsBrand size="md" className="sr-landing__brand" />
        <nav className="sr-landing__nav" aria-label="Main navigation">
          <button type="button" className="sr-landing__nav-link" onClick={onOpenDashboard}>
            Dashboard
          </button>
          <button type="button" className="sr-button sr-button--primary sr-landing__nav-cta" onClick={onCreateRoom}>
            Create a room
          </button>
        </nav>
      </header>

      <main className="sr-landing__main">
        <section className="sr-landing__hero" aria-labelledby="landing-heading">
          <div className="sr-landing__intro">
            <p className="sr-eyebrow">A shared space for study groups</p>
            <h1 id="landing-heading">
              Make room for
              <span> focused study.</span>
            </h1>
            <p className="sr-landing__lede">
              Meet by link, talk through a problem, sketch it together, or watch a lesson in sync.
            </p>

            <div className="sr-landing__actions">
              <button type="button" className="sr-button sr-button--primary" onClick={onCreateRoom}>
                Create a study room
                <span aria-hidden="true">↗</span>
              </button>

              <form className="sr-join-form" onSubmit={handleJoinSubmit}>
                <label htmlFor="landing-room-code">Have a room link?</label>
                <div className="sr-join-form__controls">
                  <div className="sr-join-form__input-wrap">
                    <input
                      id="landing-room-code"
                      type="text"
                      value={roomCode}
                      onChange={(e) => {
                        setRoomCode(e.target.value);
                        if (inputError) setInputError('');
                      }}
                      placeholder="Paste a room code or link"
                      aria-describedby={inputError ? 'landing-room-error' : undefined}
                    />
                    <button type="button" className="sr-join-form__paste" onClick={handlePasteClipboard} title="Paste from clipboard">
                      Paste
                    </button>
                  </div>
                  <button type="submit" className="sr-button sr-button--secondary">
                    Join
                  </button>
                </div>
                {inputError && <p id="landing-room-error" className="sr-form-error" role="alert">{inputError}</p>}
              </form>
            </div>
          </div>

          <aside className="sr-landing__guide" aria-label="Study room activities">
            <div className="sr-landing__guide-heading">
              <span>Inside a room</span>
              <span className="sr-landing__guide-mark" aria-hidden="true">SR</span>
            </div>
            <ol className="sr-landing__steps">
              <li>
                <span className="sr-landing__step-number">01</span>
                <div><strong>Talk it through</strong><p>Use video and audio to work through a question together.</p></div>
              </li>
              <li>
                <span className="sr-landing__step-number">02</span>
                <div><strong>Sketch the idea</strong><p>Open a shared board for notes, diagrams, and examples.</p></div>
              </li>
              <li>
                <span className="sr-landing__step-number">03</span>
                <div><strong>Learn from the same source</strong><p>Watch a YouTube lesson together or share your screen.</p></div>
              </li>
            </ol>
          </aside>
        </section>

        <section className="sr-landing__capabilities" aria-label="Room tools">
          <span>One room, useful tools</span>
          <div><i aria-hidden="true" />Video and audio</div>
          <div><i aria-hidden="true" />Shared whiteboard</div>
          <div><i aria-hidden="true" />Synchronized YouTube</div>
          <div><i aria-hidden="true" />Screen sharing</div>
        </section>
      </main>

      <footer className="sr-landing__footer">
        <StudyRoomsBrand size="sm" className="sr-landing__brand" />
        <span>Study together, wherever you are.</span>
      </footer>
    </div>
  );
}
