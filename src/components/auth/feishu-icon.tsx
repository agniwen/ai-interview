import type { SVGProps } from 'react';

// Icon from IconPark Outline by ByteDance — https://github.com/bytedance/IconPark (Apache-2.0)
export function FeishuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden='true'
      fill='none'
      height='1em'
      viewBox='0 0 48 48'
      width='1em'
      xmlns='http://www.w3.org/2000/svg'
      {...props}
    >
      <g fill='none'>
        <path
          d='M17 29c4 0 8-2.066 11-5.593C36 14 41.424 16.817 44 18c-5.5 3-3.5 11.623-11 18c-4.618 3.926-9.506 5.014-14 5c-6.477-.02-12.138-3.236-15-5.594V17'
          stroke='currentColor'
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth={4}
        />
        <path
          d='M5.648 15.867a2 2 0 1 0-3.296 2.266zM36.002 35.73a2 2 0 0 0-2.004-3.462zM2.352 18.133c2.892 4.206 8.447 10.011 14.535 14.09c3.047 2.044 6.33 3.723 9.562 4.51c3.246.789 6.596.71 9.553-1.002l-2.004-3.462c-1.793 1.038-4.005 1.209-6.603.577c-2.612-.636-5.454-2.05-8.282-3.945c-5.662-3.795-10.856-9.24-13.465-13.034z'
          fill='currentColor'
        />
        <path
          d='M33.595 17c-.755-2.297-2.74-7.06-6-10h-16C15.217 10.676 23 16 27 24'
          stroke='currentColor'
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth={4}
        />
      </g>
    </svg>
  );
}
