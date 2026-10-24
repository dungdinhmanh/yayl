import { useState } from "react";
import { GAMES, HOME_STATES, type GameId, type GameState } from "../data";
import type { Lang } from "../App";

interface Props {
  gameId: GameId;
  state: GameState;
  lang: Lang;
  onGame: (id: GameId) => void;
  onState: (state: GameState) => void;
  onLang: (lang: Lang) => void;
}

export default function DevBar({ gameId, state, lang, onGame, onState, onLang }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="mock-fab" type="button" onClick={() => setOpen((value) => !value)}>
        DEV
      </button>
      {open && (
        <div className="mock-panel" style={{ left: 16, right: "auto" }}>
          <div className="mock-panel-head">
            <div className="mock-panel-title">YAYL dev</div>
            <button className="mock-panel-close" type="button" onClick={() => setOpen(false)}>
              x
            </button>
          </div>
          <div className="mock-panel-body">
            <div className="mock-field">
              <label htmlFor="dev-state">State</label>
              <select id="dev-state" value={state} onChange={(event) => onState(event.target.value as GameState)}>
                {HOME_STATES.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="mock-field">
              <label htmlFor="dev-game">Game</label>
              <select id="dev-game" value={gameId} onChange={(event) => onGame(event.target.value as GameId)}>
                {(Object.keys(GAMES) as GameId[]).map((id) => (
                  <option key={id} value={id}>{GAMES[id].name}</option>
                ))}
              </select>
            </div>
            <div className="mock-field">
              <label htmlFor="dev-lang">Language</label>
              <select id="dev-lang" value={lang} onChange={(event) => onLang(event.target.value as Lang)}>
                <option value="vi">Tiếng Việt</option>
                <option value="en">English</option>
              </select>
            </div>
            <div className="mock-panel-note">Dev-only. Not part of the launcher UI.</div>
          </div>
        </div>
      )}
    </>
  );
}
