/**
 * StudyRoomsBrand — Vector Logo & Wordmark
 * Abstract interlocking geometric "S" node symbol
 * A single muted green mark that works on both light and dark surfaces.
 */

export function StudyRoomsIcon({ size = 32, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="StudyRooms Symbol"
    >
      {/* Interlocking Connection Nodes forming geometric "S" */}
      <g>
        {/* Upper Node Loop */}
        <path
          d="M13 7C8.03 7 4 11.03 4 16C4 20.97 8.03 25 13 25H19C21.76 25 24 22.76 24 20C24 17.24 21.76 15 19 15H13C10.24 15 8 12.76 8 10C8 7.24 10.24 5 13 5H21"
          stroke="#6f9583"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Lower Node Loop */}
        <path
          d="M23 29C27.97 29 32 24.97 32 20C32 15.03 27.97 11 23 11H17C14.24 11 12 13.24 12 16C12 18.76 14.24 21 17 21H23C25.76 21 28 23.24 28 26C28 28.76 25.76 31 23 31H15"
          stroke="#6f9583"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

export default function StudyRoomsBrand({
  size = 'md',
  iconOnly = false,
  showTagline = false,
  className = '',
}) {
  const iconSizes = {
    sm: 24,
    md: 32,
    lg: 40,
    xl: 52,
  };

  const textSizes = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-xl',
    xl: 'text-2xl',
  };

  const iconPx = iconSizes[size] || 32;
  const textSizeClass = textSizes[size] || 'text-lg';

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <StudyRoomsIcon size={iconPx} />
      {!iconOnly && (
        <div className="flex flex-col leading-tight">
          <span className={`sr-brand__wordmark sr-font-heading font-bold text-white tracking-tight ${textSizeClass}`}>
            Study<span className="sr-brand__accent text-indigo-400">Rooms</span>
          </span>
          {showTagline && (
            <span className="text-[10px] font-medium text-slate-400 tracking-wider uppercase">
              Connect. Collaborate. Learn.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

