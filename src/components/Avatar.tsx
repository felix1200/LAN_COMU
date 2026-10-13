import { useEffect, useState } from 'react';
import { fetchFileBlob } from '../api/client';
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
  /** 已上传的头像文件ID（可选，优先展示头像图） */
  avatarId?: number | null;
}

export default function Avatar({ id, name, size = 36, online = null, rounded = 'md', avatarId = null }: AvatarProps) {
  const roundedCls = rounded === 'md' ? 'rounded-md' : 'rounded-sm';
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    if (avatarId) {
      fetchFileBlob(avatarId, true)
        .then((blob) => {
          if (cancelled) {
            return;
          }
          objectUrl = URL.createObjectURL(blob);
          setImgUrl(objectUrl);
        })
        .catch(() => {
          if (!cancelled) {
            setImgUrl(null);
          }
        });
    } else {
      setImgUrl(null);
    }
    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      setImgUrl(null);
    };
  }, [avatarId]);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {imgUrl ? (
        <img
          src={imgUrl}
          alt={name}
          className={`h-full w-full object-cover ${roundedCls}`}
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className={`flex h-full w-full select-none items-center justify-center text-white ${roundedCls}`}
          style={{ backgroundColor: avatarColor(id), fontSize: size * 0.42 }}
        >
          {initials(name)}
        </div>
      )}
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