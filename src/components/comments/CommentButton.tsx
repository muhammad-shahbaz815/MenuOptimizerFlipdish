'use client';
import React from 'react';
import { MessageSquare } from 'lucide-react';
import { useItemComments } from '@/hooks/useComments';

interface CommentButtonProps {
  menuId: string;
  itemId: string;
  onClick: () => void;
  size?: 'sm' | 'md';
  variant?: 'floating' | 'inline';
  itemName?: string;
  /** When the session is locked, suppress the button on items with no comments
   *  (the button can't usefully act as an "add comment" affordance) but keep it
   *  visible when comments exist so the badge/count still surfaces them. */
  readOnly?: boolean;
}

/**
 * Small message icon with a count badge. Click opens the comments modal for this item.
 * Stops propagation so it can sit inside an item card that is itself a button.
 */
export const CommentButton: React.FC<CommentButtonProps> = ({
  menuId,
  itemId,
  onClick,
  size = 'sm',
  variant = 'floating',
  itemName,
  readOnly = false,
}) => {
  const allComments = useItemComments(menuId, itemId);
  const all = itemName
    ? allComments.filter((c) => c.itemName === itemName)
    : allComments.filter((c) => !c.itemName.includes(' > '));
  const open = all.filter((c) => !c.resolved).length;
  const total = all.length;

  // In a locked/read-only session, the button is purely an indicator. Hide it
  // when there's nothing to indicate so empty items don't get a phantom button.
  if (readOnly && total === 0) return null;

  const dim = size === 'md' ? 'h-8 w-8' : 'h-7 w-7';
  const icon = size === 'md' ? 16 : 14;

  const tone =
    open > 0
      ? 'bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100'
      : total > 0
        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100'
        : 'bg-white text-neutral-500 ring-neutral-200 hover:bg-neutral-50 hover:text-neutral-900';

  const positioning =
    variant === 'floating'
      ? 'absolute right-1 top-1 z-10 shadow-sm'
      : 'relative';

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
          e.preventDefault();
          onClick();
        }
      }}
      onMouseDown={(e) => e.stopPropagation()}
      title={open > 0 ? `${open} open comment${open === 1 ? '' : 's'}` : total > 0 ? 'All comments resolved' : readOnly ? 'No comments' : 'Add comment'}
      aria-label="Open comments"
      className={`${positioning} ${dim} inline-flex items-center justify-center rounded-full ring-1 transition-colors ${tone}`}
    >
      <MessageSquare size={icon} strokeWidth={1.75} />
      {total > 0 ? (
        <span
          className={`absolute -right-1 -top-1 flex min-w-[14px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none ring-2 ring-white ${
            open > 0 ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'
          } h-[14px]`}
        >
          {total}
        </span>
      ) : null}
    </span>
  );
};
