import React, { Suspense, useId } from 'react';

export type LoadingVariant = 'page' | 'section' | 'inline';
export type LoadingIconSize = 'xs' | 'sm' | 'md' | 'lg';

const ICON_SIZES: Record<LoadingIconSize, number> = { xs: 18, sm: 24, md: 50, lg: 78 };

export interface LoadingIconProps {
  size?: LoadingIconSize;
  tone?: 'brand' | 'current';
  className?: string;
}

/** Chief Connect's reusable orbit icon. The parent provides accessible status text. */
export function LoadingIcon({ size = 'md', tone = 'brand', className = '' }: LoadingIconProps) {
  const gradientId = `cv-loader-gradient-${useId().replace(/:/g, '')}`;
  const stroke = tone === 'current' ? 'currentColor' : `url(#${gradientId})`;
  const accent = tone === 'current' ? 'currentColor' : 'var(--brand-blue)';
  const pixels = ICON_SIZES[size];
  return (
    <svg
      data-testid="loading-icon"
      data-tone={tone}
      aria-hidden="true"
      focusable="false"
      width={pixels} height={pixels}
      viewBox="0 0 64 64"
      fill="none"
      className={`cv-loading-icon shrink-0 ${className}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="7" y1="7" x2="57" y2="57" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--brand-cyan)" />
          <stop offset="0.48" stopColor="var(--brand-blue)" />
          <stop offset="1" stopColor="var(--brand-violet)" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="27" stroke="currentColor" strokeOpacity="0.11" strokeWidth="2.5" />
      <circle className="cv-loading-orbit" cx="32" cy="32" r="27"
        stroke={stroke} strokeWidth="3.5" strokeLinecap="round" strokeDasharray="92 78" />
      <circle cx="32" cy="32" r="18" stroke={accent} strokeOpacity="0.13" strokeWidth="1.7" />
      <circle className="cv-loading-orbit cv-loading-orbit--reverse" cx="32" cy="32" r="18"
        stroke={accent} strokeOpacity="0.65" strokeWidth="2" strokeLinecap="round" strokeDasharray="34 79" />
      <g className="cv-loading-network" stroke={accent} strokeWidth="2" strokeLinecap="round">
        <path d="M24 35L32 25L41 35" strokeOpacity="0.6" />
        <path d="M24 35L41 35" strokeOpacity="0.38" />
        <circle className="cv-loading-node cv-loading-node--one" cx="24" cy="35" r="3" fill={accent} stroke="none" />
        <circle className="cv-loading-node cv-loading-node--two" cx="32" cy="25" r="3" fill={accent} stroke="none" />
        <circle className="cv-loading-node cv-loading-node--three" cx="41" cy="35" r="3" fill={accent} stroke="none" />
      </g>
    </svg>
  );
}

export interface LoadingStateProps {
  variant?: LoadingVariant;
  label?: string;
  description?: string;
  className?: string;
}

/** Accessible, consistent full-page, module, and inline loading state. */
export function LoadingState({
  variant = 'section', label = 'Loading your workspace…', description, className = '',
}: LoadingStateProps) {
  const compact = variant === 'inline';
  return (
    <div role="status" aria-live="polite" aria-atomic="true"
      className={`cv-loading-state cv-loading-state--${variant} ${className}`}>
      <span className="cv-loading-art" aria-hidden="true">
        <span className="cv-loading-glow" />
        <LoadingIcon size={compact ? 'xs' : variant === 'page' ? 'lg' : 'md'} />
      </span>
      <span className="cv-loading-copy">
        <span className="cv-loading-title">{label}</span>
        {!compact && description && <span className="cv-loading-description">{description}</span>}
      </span>
    </div>
  );
}

export interface LoadingBoundaryProps extends LoadingStateProps {
  children: React.ReactNode;
}

/** All lazy views share the same loader, automatically hidden when ready. */
export function LoadingBoundary({ children, ...fallback }: LoadingBoundaryProps) {
  return <Suspense fallback={<LoadingState {...fallback} />}>{children}</Suspense>;
}

export default LoadingState;
