import type React from 'react';
export const short = (value: string) => value.slice(0, 8);
export const Status = ({ value }: { value: string }) => (
  <span className={`status ${value.toLowerCase()}`}>{value.replaceAll('_', ' ')}</span>
);
export function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-symbol">↗</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
