type PlatformLogoProps = {
  platform: "xiaohongshu" | "weibo" | "voiceOfUser" | "behance" | "pinterest" | "adobe" | "canva" | "huaban" | "dribbble" | "zcool";
  label?: boolean;
};

const platformNames = {
  xiaohongshu: "小红书",
  weibo: "微博",
  voiceOfUser: "用户之声",
  behance: "Behance",
  pinterest: "Pinterest",
  adobe: "Adobe",
  canva: "Canva",
  huaban: "花瓣",
  dribbble: "Dribbble",
  zcool: "ZCOOL",
};

export default function PlatformLogo({ platform, label = false }: PlatformLogoProps) {
  const mark = platform === "xiaohongshu" ? "RED" : null;
  return (
    <span className={`platform-brand platform-${platform}`} title={platformNames[platform]} aria-label={platformNames[platform]}>
      <i aria-hidden="true">{platform === "weibo" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/icons/weibo-logo.png" alt="" />
      ) : platform === "voiceOfUser" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/icons/voice-of-user-logo.png" alt="" />
      ) : ["adobe", "canva"].includes(platform) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/icons/${platform}-logo.png`} alt="" />
      ) : platform === "huaban" ? (
        <svg viewBox="0 0 24 24" focusable="false">
          <defs><linearGradient id="huaban-mark" x1="0" x2="1"><stop stopColor="#ef7779"/><stop offset="1" stopColor="#db3038"/></linearGradient></defs>
          <path fill="url(#huaban-mark)" fillOpacity=".58" d="M3 4h9v9H9a6 6 0 0 1-6-6V4Z"/>
          <path fill="url(#huaban-mark)" fillOpacity=".72" d="M12 4h9v3a6 6 0 0 1-6 6h-3V4Z"/>
          <path fill="url(#huaban-mark)" fillOpacity=".78" d="M3 11h3a6 6 0 0 1 6 6v3H9a6 6 0 0 1-6-6v-3Z"/>
          <path fill="url(#huaban-mark)" d="M12 11h3a6 6 0 0 1 6 6v3h-9v-9Z"/>
        </svg>
      ) : platform === "pinterest" ? (
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><rect width="24" height="24" rx="5" fill="#e60023"/><path fill="#fff" d="M12.6 4.2c-4.2 0-6.4 3-6.4 5.5 0 1.5.6 2.8 1.9 3.3.2.1.4 0 .5-.2l.2-.8c.1-.3.1-.4-.2-.7-.4-.5-.7-1.1-.7-2.1 0-2.7 2-5.1 5.2-5.1 2.8 0 4.3 1.7 4.3 4 0 3-1.3 5.5-3.3 5.5-1.1 0-1.9-.9-1.6-2l.7-2.9c.4-1.5.1-2.8-1.2-2.8-1 0-1.8 1-1.8 2.4 0 .9.3 1.5.3 1.5l-1.2 5c-.4 1.7-.1 3.8 0 4.1 0 .2.3.3.4.1.2-.3 1.4-1.7 1.8-3.4l.6-2.3c.3.6 1.3 1.1 2.3 1.1 3.1 0 5.2-2.8 5.2-6.6 0-2.9-2.5-5.6-7-5.6Z"/></svg>
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
