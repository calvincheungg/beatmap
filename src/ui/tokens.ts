import { theme } from '../theme';

function toCssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/** Publishes the theme as CSS variables, so style.css never defines its own values. */
export function applyThemeTokens(root: HTMLElement = document.documentElement): void {
  const { ui } = theme;
  for (const [name, value] of Object.entries(ui.colors)) {
    root.style.setProperty(`--color-${name}`, toCssColor(value));
  }
  root.style.setProperty('--font-family', ui.fontFamily);
  root.style.setProperty('--font-display', ui.displayFontFamily);
  root.style.setProperty('--headline-size', ui.headlineSize);
  root.style.setProperty('--panel-width', ui.panelWidth);
  root.style.setProperty('--edge-size', ui.edgeSize);
  root.style.setProperty('--motion-duration', ui.motionDuration);
  root.style.setProperty('--font-size', ui.fontSize);
  root.style.setProperty('--font-size-small', ui.smallFontSize);
  root.style.setProperty('--icon-size', ui.iconSize);
  root.style.setProperty('--spacing', ui.spacing);
  root.style.setProperty('--gutter', ui.gutter);
  root.style.setProperty('--control-size', ui.controlSize);
  root.style.setProperty('--border-width', ui.borderWidth);
  root.style.setProperty('--shadow-offset', ui.shadowOffset);
  root.style.setProperty('--press-duration', ui.pressDuration);
  root.style.setProperty('--controls-bottom', ui.controlsBottom);
}
