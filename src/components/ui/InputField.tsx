import type { InputHTMLAttributes } from 'react';

interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
}

export function InputField({ id, label, className = '', ...props }: InputFieldProps) {
  return (
    <label className="field" htmlFor={id}>
      <span className="field__label">{label}</span>
      <input id={id} className={`field__input${className ? ` ${className}` : ''}`} {...props} />
    </label>
  );
}
