// ui/src/components/forms/Input.tsx

import { InputHTMLAttributes, forwardRef } from 'react';
import { focusRing } from '../../styles';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: 'default' | 'simple';
}

/**
 * Reusable input component with consistent styling across the app.
 * - variant='default': Full styling with focus ring (for Settings, IOProfile dialogs)
 * - variant='simple': Minimal styling (for SaveFrames and simple dialogs)
 */
const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ variant = 'default', className = '', ...props }, ref) => {
    const baseClasses = 'w-full border transition-colors text-slate-900 dark:text-white';

    const variantClasses = {
      default: `px-4 py-2 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 rounded-lg ${focusRing}`,
      simple: 'px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 rounded',
    };

    return (
      <input
        ref={ref}
        className={`${baseClasses} ${variantClasses[variant]} ${className}`}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export default Input;
