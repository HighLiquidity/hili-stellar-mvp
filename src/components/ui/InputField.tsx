import { useState, type InputHTMLAttributes } from 'react';

interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
}

export function InputField({ id, label, className = '', ...props }: InputFieldProps) {
  const isPasswordField = props.type === 'password';
  const [showPassword, setShowPassword] = useState(false);
  const resolvedType = isPasswordField ? (showPassword ? 'text' : 'password') : props.type;

  return (
    <label className="field" htmlFor={id}>
      <span className="field__label">{label}</span>
      {isPasswordField ? (
        <span className="field__input-wrap">
          <input
            id={id}
            className={`field__input field__input--with-toggle${className ? ` ${className}` : ''}`}
            {...props}
            type={resolvedType}
          />
          <button
            type="button"
            className="field__toggle-visibility"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </span>
      ) : (
        <input id={id} className={`field__input${className ? ` ${className}` : ''}`} {...props} />
      )}
    </label>
  );
}
