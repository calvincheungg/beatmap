import { useEffect, useRef, useState } from 'react';
import { useMapStore } from '../state/mapStore';

/** Three sliders, a plain line icon in ink. */
function SettingsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" fill="none">
        <path d="M2 4h16M2 10h16M2 16h16" />
      </g>
      <g fill="currentColor">
        <rect x="11" y="1.5" width="4" height="5" />
        <rect x="4" y="7.5" width="4" height="5" />
        <rect x="12" y="13.5" width="4" height="5" />
      </g>
    </svg>
  );
}

interface ChoiceProps {
  id: string;
  label: string;
  /** The keyboard shortcut, shown in the label. */
  shortcut: string;
  /** What each setting is called on screen, like ON and OFF. */
  options: [on: string, off: string];
  on: boolean;
  onToggle: () => void;
}

/** One setting: a button that shows its current state in words. ON and OFF settings are switches. */
function Choice({ id, label, shortcut, options, on, onToggle }: ChoiceProps) {
  const isSwitch = options[0] === 'ON';
  return (
    <button id={id} type="button" role={isSwitch ? 'switch' : undefined} aria-checked={isSwitch ? on : undefined} onClick={onToggle}>
      <span>
        {label} <span className="setting-key">({shortcut})</span>
      </span>
      <span className="setting-state">{on ? options[0] : options[1]}</span>
    </button>
  );
}

/** The button at the bottom right that opens map settings. */
export function SettingsMenu() {
  const flat = useMapStore((state) => state.flat);
  const toggleFlat = useMapStore((state) => state.toggleFlat);
  const showLabels = useMapStore((state) => state.showLabels);
  const toggleLabels = useMapStore((state) => state.toggleLabels);
  const mapMode = useMapStore((state) => state.mapMode);
  const toggleMapMode = useMapStore((state) => state.toggleMapMode);
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  return (
    <div
      id="settings"
      ref={wrapper}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        setOpen(false);
        button.current?.focus();
      }}
    >
      <button
        id="settings-toggle"
        ref={button}
        type="button"
        aria-label="Settings"
        title="Settings"
        aria-expanded={open}
        aria-controls="settings-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <SettingsIcon />
      </button>
      {open && (
        <div id="settings-menu" role="group" aria-label="Map settings">
          <strong>Settings</strong>
          <Choice id="view-toggle" label="View" shortcut="F" options={['ISO', 'FLAT']} on={!flat} onToggle={toggleFlat} />
          <Choice id="labels-toggle" label="Names" shortcut="L" options={['ON', 'OFF']} on={showLabels} onToggle={toggleLabels} />
          <Choice id="mode-toggle" label="Map" shortcut="N" options={['NIGHT', 'DAY']} on={mapMode === 'night'} onToggle={toggleMapMode} />
        </div>
      )}
    </div>
  );
}
