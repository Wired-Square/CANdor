// ui/src/components/Alert.tsx

import type { ReactNode } from 'react';
import { AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react';
import { iconLg } from '../styles/spacing';
import {
  alertInfo,
  alertWarning,
  alertDanger,
  alertSuccess,
} from '../styles/cardStyles';

type AlertVariant = 'info' | 'warning' | 'danger' | 'success';

type AlertProps = {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  className?: string;
  showIcon?: boolean;
};

const variantStyles: Record<AlertVariant, string> = {
  info: alertInfo,
  warning: alertWarning,
  danger: alertDanger,
  success: alertSuccess,
};

const variantIcons: Record<AlertVariant, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  danger: XCircle,
  success: CheckCircle,
};

const iconColors: Record<AlertVariant, string> = {
  info: 'text-blue-600 dark:text-blue-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-red-600 dark:text-red-400',
  success: 'text-green-600 dark:text-green-400',
};

const titleColors: Record<AlertVariant, string> = {
  info: 'text-blue-800 dark:text-blue-200',
  warning: 'text-amber-800 dark:text-amber-200',
  danger: 'text-red-800 dark:text-red-200',
  success: 'text-green-800 dark:text-green-200',
};

const textColors: Record<AlertVariant, string> = {
  info: 'text-blue-700 dark:text-blue-300',
  warning: 'text-amber-700 dark:text-amber-300',
  danger: 'text-red-700 dark:text-red-300',
  success: 'text-green-700 dark:text-green-300',
};

/**
 * Alert component for displaying messages with context.
 *
 * @example
 * <Alert variant="warning" title="Warning">
 *   This action cannot be undone.
 * </Alert>
 */
export default function Alert({
  variant = 'info',
  title,
  children,
  className = '',
  showIcon = true,
}: AlertProps) {
  const Icon = variantIcons[variant];

  return (
    <div className={`${variantStyles[variant]} ${className}`}>
      <div className="flex gap-3">
        {showIcon && (
          <Icon className={`${iconLg} flex-shrink-0 ${iconColors[variant]}`} />
        )}
        <div className="flex-1">
          {title && (
            <h4 className={`font-medium mb-1 ${titleColors[variant]}`}>
              {title}
            </h4>
          )}
          <div className={textColors[variant]}>{children}</div>
        </div>
      </div>
    </div>
  );
}
