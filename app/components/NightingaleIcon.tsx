import type { ReactNode, SVGProps } from "react";

export type NightingaleIconName =
  | "archive"
  | "calendarCheck"
  | "check"
  | "chevronDown"
  | "folder"
  | "file"
  | "help"
  | "home"
  | "list"
  | "message"
  | "more"
  | "plus"
  | "sparkles"
  | "star";

type Props = SVGProps<SVGSVGElement> & {
  name: NightingaleIconName;
  size?: number;
};

/**
 * Shared UI icon wrapper. All glyphs use the Nightingale Regular visual rule:
 * 24px viewbox, round caps/joins, and a 1.5px monoline stroke.
 */
export default function NightingaleIcon({ name, size = 20, ...props }: Props) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<NightingaleIconName, ReactNode> = {
    home: <><path {...common} d="M3.75 10.5 12 3.75l8.25 6.75v9a.75.75 0 0 1-.75.75H4.5a.75.75 0 0 1-.75-.75v-9Z" /><path {...common} d="M9.25 20.25v-6h5.5v6" /></>,
    folder: <><path {...common} d="M3.75 7.5a1.5 1.5 0 0 1 1.5-1.5h4l1.5 1.75h8a1.5 1.5 0 0 1 1.5 1.5v8.25a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5V7.5Z" /></>,
    file: <>
      <path d="M12 16.25C12.4142 16.25 12.75 16.5858 12.75 17C12.75 17.4142 12.4142 17.75 12 17.75H8C7.58579 17.75 7.25 17.4142 7.25 17C7.25 16.5858 7.58579 16.25 8 16.25H12Z" fill="currentColor" />
      <path d="M16 12.25C16.4142 12.25 16.75 12.5858 16.75 13C16.75 13.4142 16.4142 13.75 16 13.75H8C7.58579 13.75 7.25 13.4142 7.25 13C7.25 12.5858 7.58579 12.25 8 12.25H16Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M13.1719 2.25C13.9011 2.25008 14.6006 2.54001 15.1162 3.05566L18.9443 6.88379C19.46 7.39944 19.7499 8.09889 19.75 8.82812V19C19.75 20.5188 18.5188 21.75 17 21.75H7C5.48122 21.75 4.25 20.5188 4.25 19V5C4.25 3.48122 5.48122 2.25 7 2.25H13.1719ZM7 3.75C6.30964 3.75 5.75 4.30964 5.75 5V19C5.75 19.6904 6.30964 20.25 7 20.25H17C17.6904 20.25 18.25 19.6904 18.25 19V9.75H15C13.4812 9.75 12.25 8.51878 12.25 7V3.75H7ZM13.75 7C13.75 7.69036 14.3096 8.25 15 8.25H18.1074C18.0492 8.1384 17.9744 8.03497 17.8838 7.94434L14.0557 4.11621C13.9649 4.02547 13.8618 3.9499 13.75 3.8916V7Z" fill="currentColor" />
    </>,
    calendarCheck: <>
      <path fillRule="evenodd" clipRule="evenodd" d="M17 1.25C17.4142 1.25 17.75 1.58579 17.75 2V4.25H18C19.5188 4.25 20.75 5.48122 20.75 7V13.9854C20.49 14.0236 20.2381 14.1297 20.0234 14.3047L19.9092 14.4082L19.25 15.0674V9.75H4.75V19C4.75 19.6904 5.30964 20.25 6 20.25H12.5693L14.0693 21.75H6C4.48122 21.75 3.25 20.5188 3.25 19V7C3.25 5.48122 4.48122 4.25 6 4.25H6.25V2C6.25 1.58579 6.58579 1.25 7 1.25C7.41421 1.25 7.75 1.58579 7.75 2V4.25H16.25V2C16.25 1.58579 16.5858 1.25 17 1.25ZM6 5.75C5.30964 5.75 4.75 6.30964 4.75 7V8.25H19.25V7C19.25 6.30964 18.6904 5.75 18 5.75H6Z" fill="currentColor" />
      <path d="M20.9697 15.4697C21.2626 15.1768 21.7374 15.1768 22.0303 15.4697C22.3232 15.7626 22.3232 16.2374 22.0303 16.5303L17.0303 21.5303C16.7374 21.8232 16.2626 21.8232 15.9697 21.5303L13.4697 19.0303C13.1768 18.7374 13.1768 18.2626 13.4697 17.9697C13.7626 17.6768 14.2374 17.6768 14.5303 17.9697L16.5 19.9395L20.75 15.6885L20.9697 15.4697Z" fill="currentColor" />
    </>,
    check: <path {...common} d="m5 12.25 4.25 4.25L19.5 6.75" />,
    star: <path {...common} d="m12 3.5 2.65 5.37 5.93.86-4.29 4.18 1.01 5.9L12 17.03l-5.3 2.78 1.01-5.9-4.29-4.18 5.93-.86L12 3.5Z" />,
    archive: <><path {...common} d="M4 7.25h16v12H4z" /><path {...common} d="M3 4.25h18v3H3zM9.25 12h5.5" /></>,
    message: <path {...common} d="M5.25 5.25h13.5a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H10l-4.25 3v-3H5.25a1.5 1.5 0 0 1-1.5-1.5v-8.5a1.5 1.5 0 0 1 1.5-1.5Z" />,
    sparkles: <><path {...common} d="m12 3.5.85 4.15L17 8.5l-4.15.85L12 13.5l-.85-4.15L7 8.5l4.15-.85L12 3.5Z" /><path {...common} d="m18.25 14 .5 2.25L21 16.75l-2.25.5-.5 2.25-.5-2.25-2.25-.5 2.25-.5.5-2.25ZM5.75 14.5l.5 2.25 2.25.5-2.25.5-.5 2.25-.5-2.25-2.25-.5 2.25-.5.5-2.25Z" /></>,
    list: <><path {...common} d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11" /><path {...common} d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" /></>,
    help: <><path {...common} d="M12 20.25a8.25 8.25 0 1 0 0-16.5 8.25 8.25 0 0 0 0 16.5Z" /><path {...common} d="M9.75 9a2.25 2.25 0 1 1 3.7 1.72c-.92.78-1.45 1.2-1.45 2.53M12 16.75h.01" /></>,
    plus: <path {...common} d="M12 4.5v15M4.5 12h15" />,
    chevronDown: <path {...common} d="m7.5 10 4.5 4.5 4.5-4.5" />,
    more: <path {...common} d="M6.25 12h.01M12 12h.01M17.75 12h.01" />,
  };

  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>{paths[name]}</svg>;
}
