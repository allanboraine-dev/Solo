import React from "react";

export interface RandIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
  strokeWidth?: number | string;
  variant?: "standard" | "circle";
}

/**
 * South African Rand (ZAR) Currency Icon
 * 
 * Styled specifically to match the Lucide icon design system (24x24 viewBox, stroke-width 2, rounded caps & joins).
 * Replaces the US Dollar ($) sign with the authentic South African Rand (R) currency symbol.
 */
export const RandIcon: React.FC<RandIconProps> = ({
  size = 24,
  className = "",
  strokeWidth = 2,
  variant = "standard",
  ...props
}) => {
  if (variant === "circle") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-label="South African Rand"
        {...props}
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M8.5 7h4a2.5 2.5 0 0 1 0 5H8.5" />
        <line x1="8.5" y1="7" x2="8.5" y2="17" />
        <path d="m12.5 12 3.5 5" />
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-label="South African Rand"
      {...props}
    >
      <path d="M6 3.5h7a4.5 4.5 0 0 1 0 9H6" />
      <line x1="6" y1="3.5" x2="6" y2="20.5" />
      <path d="m12.5 12.5 5.5 8" />
    </svg>
  );
};

export const RandSign = RandIcon;
export const CircleRandSign: React.FC<Omit<RandIconProps, "variant">> = (props) => (
  <RandIcon variant="circle" {...props} />
);

export default RandIcon;
