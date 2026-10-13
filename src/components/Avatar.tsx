import { initials } from '../lib/format';

// 调度室仪表色系：低饱和、可区分
const PALETTE = ['#256B57', '#6B5A2E', '#4F5D75', '#7A4E3A', '#3E5C50', '#66584A', '#514E6B', '#74562B'];

export function avatarColor(id: number): string {
  return PALETTE[Math.abs(id) % PALETTE.length];
}

interface AvatarProps {
  id: number;
  name: string;
  size?: number;
  online?: boolean | null;
  rounded?: 'md' | 'sm';
}

export default function Avatar({ id, name, size = 36, online = null, rounded = 'md' }: AvatarProps) {
  const roundedCls = rounded === 'md' ? 'rounded-md' : 'rounded-sm';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className={`flex h-full w-full select-none items-center justify-center text-white ${roundedCls}`}
        style={{ backgroundColor: avatarColor(id), fontSize: size * 0.42 }}
      >
        {initials(name)}
      </div>
      {online !== null && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-paper ${
            online ? 'bg-online' : 'bg-[#9AA39D]'
          }`}
        />
      )}
    </div>
  );
}
