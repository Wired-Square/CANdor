// ui/src/components/forms/Textarea.tsx

import { TextareaHTMLAttributes, forwardRef } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: 'default' | 'simple';
}

/**
 * Reusable textarea component with consistent styling across the app.
 * - variant='default': Full styling with focus ring (for Settings, IOProfile dialogs)
 * - variant='simple': Minimal styling (for SaveFrames and simple dialogs)
 */
const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ variant = 'default', className = '', ...props }, ref) => {
    const baseClasses = 'w-full border transition-colors text-slate-900 dark:text-white resize-none';

    const variantClasses = {
      default: 'px-4 py-2 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
      simple: 'px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 rounded',
    };

    return (
      <textarea
        ref={ref}
        className={`${baseClasses} ${variantClasses[variant]} ${className}`}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';

export default Textarea;
