// ui/src/components/sidebar/SidebarSection.tsx
// Shared sidebar section components for consistent styling across Discovery/Decoder

import type { ReactNode, ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import { iconSm } from "../../styles/spacing";
import { hoverLight } from "../../styles";
import { labelSmall } from "../../styles/typography";

/**
 * Sidebar section with optional label header.
 */
export function SidebarSection({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      {label && (
        <div className={labelSmall}>
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Horizontal divider between sidebar sections.
 */
export function SidebarDivider() {
  return <div className="border-t border-slate-200 dark:border-slate-700" />;
}

type IconButtonVariant = "default" | "primary" | "danger";

type SidebarIconButtonProps = {
  icon: ComponentType<LucideProps>;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  variant?: IconButtonVariant;
};

const variantStyles: Record<IconButtonVariant, { enabled: string; disabled: string }> = {
  default: {
    enabled: `text-slate-700 dark:text-slate-200 ${hoverLight}`,
    disabled: "text-slate-400 cursor-not-allowed",
  },
  primary: {
    enabled: "text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20",
    disabled: "text-slate-400 cursor-not-allowed",
  },
  danger: {
    enabled: "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20",
    disabled: "text-slate-400 cursor-not-allowed",
  },
};

/**
 * Icon button for sidebar actions.
 */
export function SidebarIconButton({
  icon: Icon,
  onClick,
  disabled = false,
  title,
  variant = "default",
}: SidebarIconButtonProps) {
  const styles = variantStyles[variant];
  const className = `p-1.5 rounded ${disabled ? styles.disabled : styles.enabled}`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
      title={title}
    >
      <Icon className={iconSm} />
    </button>
  );
}
