import type { SVGProps } from "react";

// Google "G" mark — official brand colors.
export function GoogleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      height="1em"
      viewBox="0 0 48 48"
      width="1em"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M44.5 20H24v8.5h11.8C34.7 33.9 30 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"
        fill="#FFC107"
      />
      <path
        d="M6.3 14.7l7 5.1C15.2 16 19.3 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
        fill="#FF3D00"
      />
      <path
        d="M24 46c5.5 0 10.5-2.1 14.3-5.5l-6.6-5.6C29.6 36.5 27 37.5 24 37.5c-6 0-10.7-3.1-12.8-8.5l-7 5.4C7.6 41.6 15.2 46 24 46z"
        fill="#4CAF50"
      />
      <path
        d="M44.5 20H24v8.5h11.8c-1 2.7-3 5-5.5 6.4l6.6 5.6C40.7 37.5 45 31.5 45 24c0-1.3-.2-2.7-.5-4z"
        fill="#1976D2"
      />
    </svg>
  );
}
