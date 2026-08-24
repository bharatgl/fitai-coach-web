import type {
  ButtonHTMLAttributes,
  ElementType,
  HTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
} from "react";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  busy?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  busy = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cx(
        "ui-button",
        `ui-button--${variant}`,
        `ui-button--${size}`,
        fullWidth && "ui-button--full",
        className,
      )}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      type={type}
      {...props}
    >
      {busy && <span className="ui-spinner" aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  tone?: "default" | "soft" | "accent" | "dark";
  padding?: "none" | "sm" | "md" | "lg";
};

export function Card({
  as: Component = "section",
  tone = "default",
  padding = "md",
  className,
  ...props
}: CardProps) {
  return (
    <Component
      className={cx(
        "ui-card",
        `ui-card--${tone}`,
        `ui-card--padding-${padding}`,
        className,
      )}
      {...props}
    />
  );
}

export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx("ui-eyebrow", className)} {...props} />;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx("ui-page-header", className)}>
      <div className="ui-page-header__copy">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1>{title}</h1>
        {description && <p className="ui-page-header__description">{description}</p>}
      </div>
      {actions && <div className="ui-page-header__actions">{actions}</div>}
    </header>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}) {
  return (
    <label className={cx("ui-field", className)} {...props}>
      <span className="ui-field__label">{label}</span>
      {children}
      {hint && <span className="ui-field__hint">{hint}</span>}
      {error && <span className="ui-field__error">{error}</span>}
    </label>
  );
}

export function StatusBadge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  return (
    <span
      className={cx("ui-status-badge", `ui-status-badge--${tone}`, className)}
      {...props}
    />
  );
}

export function VisuallyHidden(props: HTMLAttributes<HTMLSpanElement>) {
  return <span className="ui-visually-hidden" {...props} />;
}
