type PlatformLogoProps = {
  platform: "xiaohongshu" | "behance" | "pinterest" | "huaban" | "dribbble" | "zcool";
  label?: boolean;
};

const platformNames = {
  xiaohongshu: "小红书",
  behance: "Behance",
  pinterest: "Pinterest",
  huaban: "花瓣",
  dribbble: "Dribbble",
  zcool: "ZCOOL",
};

export default function PlatformLogo({ platform, label = false }: PlatformLogoProps) {
  const mark = platform === "xiaohongshu" ? "RED" : null;
  return (
    <span className={`platform-brand platform-${platform}`} title={platformNames[platform]} aria-label={platformNames[platform]}>
      <i aria-hidden="true">{platform === "pinterest" ? (
        <svg viewBox="0 0 16 16" focusable="false"><path d="M8 0a8 8 0 0 0-2.915 15.452c-.07-.633-.133-1.606.027-2.297.146-.625.938-3.977.938-3.977s-.239-.479-.239-1.187c0-1.113.645-1.943 1.448-1.943.682 0 1.012.513 1.012 1.127 0 .686-.437 1.713-.663 2.664-.188.797.4 1.446 1.185 1.446 1.423 0 2.517-1.5 2.517-3.664 0-1.915-1.377-3.254-3.342-3.254-2.276 0-3.61 1.707-3.61 3.473 0 .688.265 1.425.596 1.826a.24.24 0 0 1 .056.23c-.061.253-.196.796-.223.907-.035.146-.116.177-.268.107-1-.465-1.624-1.926-1.624-3.1 0-2.523 1.834-4.84 5.286-4.84 2.775 0 4.932 1.977 4.932 4.62 0 2.756-1.738 4.976-4.151 4.976-.811 0-1.573-.421-1.834-.92l-.498 1.902c-.181.695-.669 1.566-.995 2.097A8 8 0 1 0 8 0z" /></svg>
      ) : platform === "huaban" ? (
        <svg viewBox="0 0 24 24" focusable="false">
          <defs><linearGradient id="huaban-mark" x1="0" x2="1"><stop stopColor="#ef7779"/><stop offset="1" stopColor="#db3038"/></linearGradient></defs>
          <path fill="url(#huaban-mark)" fillOpacity=".58" d="M3 4h9v9H9a6 6 0 0 1-6-6V4Z"/>
          <path fill="url(#huaban-mark)" fillOpacity=".72" d="M12 4h9v3a6 6 0 0 1-6 6h-3V4Z"/>
          <path fill="url(#huaban-mark)" fillOpacity=".78" d="M3 11h3a6 6 0 0 1 6 6v3H9a6 6 0 0 1-6-6v-3Z"/>
          <path fill="url(#huaban-mark)" d="M12 11h3a6 6 0 0 1 6 6v3h-9v-9Z"/>
        </svg>
      ) : platform === "behance" ? (
        <svg viewBox="0 0 24 24" focusable="false"><rect width="24" height="24" rx="5" fill="#1769ff"/><text x="3.1" y="17" fill="#fff" fontFamily="Arial, sans-serif" fontSize="13" fontWeight="800">Bē</text></svg>
      ) : platform === "dribbble" ? (
        <svg viewBox="0 0 24 24" focusable="false">
          <circle cx="12" cy="12" r="11" fill="#e84a8a" stroke="#b51d5a" strokeWidth="2" />
          <path d="M5.1 5.8c4.7 4.4 7.5 9.1 8.8 15M18.6 4.8C15.7 8.1 10.4 10 2 10.4M21.7 14.4c-5.8-1.9-11.5-.8-16.7 4" fill="none" stroke="#b51d5a" strokeWidth="2.1" strokeLinecap="round" />
        </svg>
      ) : platform === "zcool" ? (
        <svg viewBox="0 0 24 24" focusable="false">
          <circle cx="12" cy="12" r="10.5" fill="#f7f7f5" stroke="#cfd1d1" />
          <path d="M6 8.4 8.3 4.9l2.5 1.4 2.3-3.1.7 4 4-.9-2.1 3.3 2.6 2.7-3.8.3-.2 5-3.8-1.4-2 2.8-.5-3.8-3.7-.7L7 11.2Z" fill="#3d4040" />
          <path d="M9.1 8.1h6.2l-.6 2-3.1 3.8h2.4l-.6 2H7.8l.6-2 3.1-3.8H8.6Z" fill="#ffd400" />
        </svg>
      ) : mark}</i>
      {label && <b>{platformNames[platform]}</b>}
    </span>
  );
}
