import { useId, type ReactNode } from 'react';
import { SHAPES } from '../domain/shapes';
import type { ShapeId } from '../../shared/contracts';

export function ShapeIcon({ shape, size = 24 }: { shape: ShapeId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-55 -55 110 110" aria-hidden="true">
      <path d={SHAPES[shape].path} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
export function Section({
  number,
  title,
  subtitle,
  children,
}: {
  number: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="control-section">
      <div className="section-heading">
        <span className="section-number">{number}</span>
        <h2>{title}</h2>
        {subtitle && <span className="section-subtitle">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={value === option.value ? 'selected' : ''}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="slider-field">
      <label htmlFor={id}>
        {label}
        <output>
          {Number(value.toFixed(2))}
          {suffix}
        </output>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle-field">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true" />
    </label>
  );
}
