import { Button as CarbonButton } from '@carbon/react';

export interface ButtonProps {
  /** Is this the principal call to action on the page? */
  primary?: boolean;
  /** What background color to use */
  backgroundColor?: string;
  /** How large should the button be? */
  size?: 'small' | 'medium' | 'large';
  /** Button contents */
  label: string;
  /** Optional click handler */
  onClick?: () => void;
}

/** Primary UI component for user interaction */
export const Button = ({
  primary = false,
  size = 'medium',
  backgroundColor,
  label,
  ...props
}: ButtonProps) => {
  return (
    <CarbonButton
      type="button"
      kind={primary ? 'primary' : 'secondary'}
      size={size === 'small' ? 'sm' : size === 'large' ? 'lg' : 'md'}
      style={{ backgroundColor }}
      {...props}
    >
      {label}
    </CarbonButton>
  );
};
