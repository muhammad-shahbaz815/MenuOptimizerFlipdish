'use client';
import React, { useState } from 'react';
import { Columns2, Home, MessageSquare, MonitorSmartphone, ScanLine } from 'lucide-react';
import type { ReviewProductScopes } from '@/types';
import { useStore } from '@/hooks/useStore';
import { useMenuComments } from '@/hooks/useComments';
import { CommentsOverview } from '../comments/CommentsOverview';

export type AppHeaderView = 'home' | 'customer' | 'staff' | 'compare';

interface AppHeaderProps {
  hasMenu: boolean;
  view?: AppHeaderView;
  onNavigate?: (view: AppHeaderView) => void;
  onLogoClick?: () => void;
  /** Limits journey shortcuts when the uploaded menu is scoped to web/app and/or POS. Ok! */
  reviewProductScopes?: ReviewProductScopes | null;
}

const LOGO_SRC = `${'/'}Flipdish%20Logo_Full_Black.png`;

export const AppHeader: React.FC<AppHeaderProps> = ({
  hasMenu,
  view = 'home',
  onNavigate,
  onLogoClick,
  reviewProductScopes = null,
}) => {
  const [logoFailed, setLogoFailed] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const menu = useStore((s) => s.menu);
  const menuB = useStore((s) => s.menuB);
  // In compare mode both menus are loaded; the comments overview should
  // aggregate feedback from both sides regardless of which one menu.id we'd
  // ordinarily pick as "primary".
  const menuIdsForOverview = menu
    ? menuB && menuB.id !== menu.id
      ? [menu.id, menuB.id]
      : menu.id
    : null;
  const menuComments = useMenuComments(menuIdsForOverview);
  const openCount = menuComments.filter((c) => !c.resolved).length;
  const showCustomerNav = reviewProductScopes == null || reviewProductScopes.webApp;
  const showStaffNav = reviewProductScopes == null || reviewProductScopes.pos;

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200 bg-white">
      <div className="mx-auto flex h-14 min-h-14 max-w-7xl items-center justify-between gap-2 px-3 sm:h-16 sm:min-h-16 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onLogoClick}
          className="flex items-center gap-3 rounded-md outline-none ring-flipdish focus-visible:ring-2 focus-visible:ring-offset-2"
          aria-label="Flipdish — Menu Journey Reviewer home"
        >
          {!logoFailed ? (
            <img
              src={LOGO_SRC}
              alt="Flipdish"
              className="h-7 w-auto sm:h-8"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <span className="text-lg font-semibold tracking-tight text-neutral-900">Flipdish</span>
          )}
          <span className="hidden border-l border-neutral-200 pl-3 text-sm font-medium text-neutral-500 sm:inline">
            Menu Journey Reviewer
          </span>
        </button>

        {hasMenu && onNavigate && (
          <nav className="flex shrink-0 items-center gap-0.5 sm:gap-1" aria-label="Main">
            <HeaderNavButton
              active={view === 'home'}
              onClick={() => onNavigate('home')}
              title="Review home"
              icon={<Home size={20} strokeWidth={1.75} />}
            />
            {showCustomerNav ? (
              <HeaderNavButton
                active={view === 'customer'}
                onClick={() => onNavigate('customer')}
                title="Customer preview"
                icon={<MonitorSmartphone size={20} strokeWidth={1.75} />}
              />
            ) : null}
            {showStaffNav ? (
              <HeaderNavButton
                active={view === 'staff'}
                onClick={() => onNavigate('staff')}
                title="Staff preview"
                icon={<ScanLine size={20} strokeWidth={1.75} />}
              />
            ) : null}
            <HeaderNavButton
              active={view === 'compare'}
              onClick={() => onNavigate('compare')}
              title="Compare two menus"
              icon={<Columns2 size={20} strokeWidth={1.75} />}
            />
            {menu ? (
              <button
                type="button"
                onClick={() => setCommentsOpen(true)}
                title={openCount > 0 ? `${openCount} open comment${openCount === 1 ? '' : 's'}` : 'Comments'}
                className="relative rounded-full p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 sm:p-2.5"
              >
                <MessageSquare size={20} strokeWidth={1.75} />
                {menuComments.length > 0 ? (
                  <span
                    className={`absolute right-0 top-0 flex min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none ring-2 ring-white ${
                      openCount > 0 ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'
                    } h-[16px]`}
                  >
                    {openCount > 0 ? openCount : menuComments.length}
                  </span>
                ) : null}
              </button>
            ) : null}
          </nav>
        )}
      </div>
      {menu ? (
        <CommentsOverview
          open={commentsOpen}
          onClose={() => setCommentsOpen(false)}
          menuId={menuIdsForOverview ?? menu.id}
          menuName={menuB && menuB.id !== menu.id ? `${menu.name} vs ${menuB.name}` : menu.name}
        />
      ) : null}
    </header>
  );
};

const HeaderNavButton: React.FC<{
  active: boolean;
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
}> = ({ active, onClick, title, icon }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`rounded-full p-2 transition-colors sm:p-2.5 ${
      active
        ? 'bg-flipdish/10 text-flipdish'
        : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'
    }`}
  >
    {icon}
  </button>
);
