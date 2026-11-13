// The title bar of the app's own windows (Settings, popped-out tabs, Cloudy's room): drag anywhere on it,
// window buttons on the right (macOS keeps its traffic lights on the left instead).
import { Minus, Square, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { inTauri } from '../lib/ipc';
import { useApp } from '../lib/store';

export function TitleBar({ children, className = '' }: { children?: ReactNode; className?: string }) {
  const mac = useApp((s) => s.layout?.platform === 'macos');
  const win = () => getCurrentWindow();
  return (
    <header className={`titlebar ${mac ? 'mac' : ''} ${className}`} data-tauri-drag-region>
      <div className="titlebar-title" data-tauri-drag-region>
        {children}
      </div>
      {inTauri && !mac && (
        <div className="titlebar-buttons">
          <button aria-label="Minimize" onClick={() => void win().minimize()}><Minus size={14} /></button>
          <button aria-label="Maximize" onClick={() => void win().toggleMaximize()}><Square size={11} /></button>
          <button className="close" aria-label="Close" onClick={() => void win().close()}><X size={15} /></button>
        </div>
      )}
    </header>
  );
}
