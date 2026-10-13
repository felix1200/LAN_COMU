import { RadioTower } from 'lucide-react';
import type { ReactNode } from 'react';

/** 登录/注册共用布局：左侧深色品牌面板 + 右侧纸面表单 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-paper font-sans text-main">
      {/* 品牌面板 */}
      <div className="hidden w-[42%] flex-col justify-between bg-ink-900 px-12 py-10 text-paper lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-signal">
            <RadioTower size={18} strokeWidth={1.75} className="text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-wide">内信 IntraChat</div>
            <div className="font-mono text-[10px] tracking-[0.2em] text-[#7E8A83]">INTRANET DISPATCH</div>
          </div>
        </div>

        <div>
          <h1 className="text-[28px] font-medium leading-snug">
            企业内部通信，
            <br />
            像调度台一样井然有序。
          </h1>
          <p className="mt-4 max-w-sm text-[13px] leading-6 text-[#93A097]">
            注册审核、私聊与群聊、实时消息推送、文件传输与管理后台，
            全部运行在企业自己的服务器上，数据不出内网。
          </p>
          <div className="mt-8 space-y-2 font-mono text-[11px] tracking-[0.18em] text-[#6E7A72]">
            <div className="flex items-center gap-3">
              <span className="h-1.5 w-1.5 rounded-full bg-online" />
              <span>REALTIME / WEBSOCKET</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="h-1.5 w-1.5 rounded-full bg-amber" />
              <span>AUDITED ACCESS</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="h-1.5 w-1.5 rounded-full bg-[#5E6B63]" />
              <span>ON-PREMISE MYSQL</span>
            </div>
          </div>
        </div>

        <div className="font-mono text-[10px] tracking-[0.2em] text-[#5E6B63]">
          SELF-HOSTED · NO PUBLIC CLOUD
        </div>
      </div>

      {/* 表单区 */}
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-[380px]">{children}</div>
      </div>
    </div>
  );
}
