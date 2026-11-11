import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { colors, radii } from './tokens';

type Tone = 'plain' | 'accent' | 'danger';

export function Button({ tone = 'plain', className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; children: ReactNode }) {
  return (
    <button className={`eh-btn eh-btn-${tone} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function IconButton({ label, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button aria-label={label} title={label} className={`eh-icon-btn ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`eh-card ${className}`} style={{ borderRadius: radii.control, background: colors.surface2 }}>
      {children}
    </div>
  );
}
