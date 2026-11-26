import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { House, ChevronLeft, Plus, Camera, FileText, Check, ImageIcon, X } from 'lucide-react';
import { getAsset } from '../lib/db';
export { House, ChevronLeft, Plus, Camera, FileText, Check, X };
export function go(path: string) {
  location.hash = path;
  window.scrollTo(0, 0);
}
export function Button({
  children,
  onClick,
  kind = '',
  disabled = false,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button type={type} className={`button ${kind}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
export function Back({
  to,
  children = 'Back',
  onClick,
  disabled,
}: {
  to: string;
  children?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.getElementById('top-back'));
  }, []);
  return target
    ? createPortal(
        <button className="back" disabled={disabled} onClick={onClick ?? (() => go(to))}>
          <ChevronLeft size={20} />
          <span>{children}</span>
        </button>,
        target,
      )
    : null;
}
export function PageActions({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.getElementById('top-actions'));
  }, []);
  return target ? createPortal(children, target) : null;
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Empty({
  icon = <House size={34} />,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Photo({
  id,
  alt = '',
  full = false,
  className = '',
  onClick,
  placeholder = <ImageIcon aria-hidden="true" size={28} />,
}: {
  id?: string;
  alt?: string;
  full?: boolean;
  className?: string;
  onClick?: () => void;
  placeholder?: ReactNode;
}) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true,
      u = '';
    setUrl('');
    if (id)
      getAsset(id)
        .then((a) => {
          if (a && active) {
            u = URL.createObjectURL(full ? a.original : (a.thumbnail ?? a.original));
            setUrl(u);
          }
        })
        .catch(() => {});
    return () => {
      active = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [id, full]);
  const contents = url ? (
    <img src={url} alt={alt} loading={full ? 'eager' : 'lazy'} />
  ) : (
    placeholder
  );
  return onClick ? (
    <button className={`photo ${className}`} onClick={onClick} aria-label={alt || 'View photo'}>
      {contents}
    </button>
  ) : (
    <div className={`photo ${className}`}>{contents}</div>
  );
}
export function PhotoViewer({ id, onClose }: { id: string; onClose: () => void }) {
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Original photo">
      <div className="modal-head">
        <span>Original photo · pinch to zoom</span>
        <Button kind="secondary" onClick={onClose}>
          <X />
          Close
        </Button>
      </div>
      <Photo id={id} full className="original" />
      <p>Original resolution is kept on this device.</p>
    </div>
  );
}
export function FilePicker({
  label,
  onFiles,
  accept = 'image/*',
  multiple = false,
  capture = false,
  disabled = false,
  icon,
  iconOnly = false,
}: {
  label: string;
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  capture?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  iconOnly?: boolean;
}) {
  return (
    <label
      title={label}
      className={`button secondary file-picker ${iconOnly ? 'icon-only' : ''} ${disabled ? 'disabled' : ''}`}
    >
      {icon}
      {!iconOnly && label}
      <input
        aria-label={label}
        type="file"
        accept={accept}
        multiple={multiple}
        capture={capture ? 'environment' : undefined}
        disabled={disabled}
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
    </label>
  );
}
export function Badge({ children, warn = false }: { children: ReactNode; warn?: boolean }) {
  return <span className={`badge ${warn ? 'warn' : ''}`}>{children}</span>;
}
