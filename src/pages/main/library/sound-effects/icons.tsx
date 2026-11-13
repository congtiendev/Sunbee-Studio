import type { IconProps } from "@/icons";

export function PauseIcon(props: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={24} height={24} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <rect x="6" y="5" width="4" height="14" rx="1.25" />
      <rect x="14" y="5" width="4" height="14" rx="1.25" />
    </svg>
  );
}

export function BookmarkIcon(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M6.5 4.75h11a.75.75 0 01.75.75v14.19a.5.5 0 01-.8.4L12 16.25l-5.45 3.84a.5.5 0 01-.8-.4V5.5a.75.75 0 01.75-.75z" />
    </svg>
  );
}

export function BookmarkFilledIcon(props: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={24} height={24} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M6.5 4h11c.83 0 1.5.67 1.5 1.5v14.19a1.25 1.25 0 01-1.97 1.02L12 17.17l-5.03 3.54A1.25 1.25 0 015 19.69V5.5C5 4.67 5.67 4 6.5 4z" />
    </svg>
  );
}
