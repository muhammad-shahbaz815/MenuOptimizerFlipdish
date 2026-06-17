'use client';
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/hooks/useStore';
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  X,
  CheckCircle2,
  Info,
} from 'lucide-react';
import type { DemoStep } from '@/types';
import {
  computeTourCardPosition,
  fallbackTourPosition,
  tourAnchorSelector,
  type TourCardPosition,
} from '@/lib/demo/tourAnchors';

export type DemoOverlayLayout = 'staff' | 'customer';

interface DemoOverlayProps {
  layout?: DemoOverlayLayout;
  dock?: 'viewport' | 'preview';
}

function resolveTourAnchorEl(action: DemoStep['action']): HTMLElement | null {
  const sel = tourAnchorSelector(action);
  if (!sel) return null;
  let el = document.querySelector(sel);
  if (!el && action === 'spotlightModifiers') {
    el = document.querySelector('[data-tour-anchor="tour-items"]');
  }
  return el instanceof HTMLElement ? el : null;
}

export const DemoOverlay: React.FC<DemoOverlayProps> = ({ layout = 'staff', dock = 'viewport' }) => {
  const { activeScenario, activeStepIndex, nextStep, resetScenario, setActiveScenario } = useStore();

  const tourStepAction: DemoStep['action'] | undefined =
    activeScenario && activeStepIndex >= 0
      ? activeScenario.steps[activeStepIndex]?.action
      : undefined;

  /** When true, steps advance on a timer; default is manual (Next only). */
  const [isPlaying, setIsPlaying] = useState(false);
  /** Viewport-fixed position for preview tour (portal to body, above modals z-200). */
  const [previewCardPos, setPreviewCardPos] = useState<TourCardPosition | null>(null);

  useEffect(() => {
    if (activeScenario) setIsPlaying(false);
  }, [activeScenario?.id]);

  useEffect(() => {
    if (!activeScenario || activeStepIndex < 0 || !isPlaying) return;

    const step = activeScenario.steps[activeStepIndex];
    const delay = step.delay ?? 3000;
    const isLast = activeStepIndex === activeScenario.steps.length - 1;

    const timer = setTimeout(() => {
      if (isLast) {
        setActiveScenario(null);
      } else {
        nextStep();
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [activeScenario, activeStepIndex, isPlaying, nextStep, setActiveScenario]);

  useLayoutEffect(() => {
    if (dock !== 'preview' || !activeScenario || activeStepIndex < 0) {
      setPreviewCardPos(null);
      return;
    }

    const step = activeScenario.steps[activeStepIndex];

    const update = () => {
      const anchor = resolveTourAnchorEl(step.action);
      if (!anchor) {
        setPreviewCardPos(fallbackTourPosition());
        return;
      }
      setPreviewCardPos(computeTourCardPosition(anchor.getBoundingClientRect(), step.action));
    };

    update();
    let nestedRaf = 0;
    const outerRaf = requestAnimationFrame(() => {
      nestedRaf = requestAnimationFrame(update);
    });
    const delays =
      step.action === 'spotlightModifiers'
        ? [80, 200, 450].map((ms) => window.setTimeout(update, ms))
        : [];

    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);

    return () => {
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(nestedRaf);
      delays.forEach(clearTimeout);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [dock, activeScenario?.id, activeStepIndex, tourStepAction]);

  if (!activeScenario || activeStepIndex < 0) return null;

  const currentStep = activeScenario.steps[activeStepIndex];
  const progress = ((activeStepIndex + 1) / activeScenario.steps.length) * 100;

  const usePreviewDock = dock === 'preview';
  const pos = previewCardPos ?? fallbackTourPosition();

  const previewTourCard = (
    <div
      className="relative w-[min(24rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_16px_50px_rgba(0,0,0,0.22)] backdrop-blur-md"
      style={{
        position: 'fixed',
        zIndex: 320,
        top: pos.top,
        left: pos.left,
        transform: pos.transform,
      }}
      aria-live="polite"
    >
      <button
        type="button"
        onClick={() => setActiveScenario(null)}
        className="absolute right-2 top-2 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-neutral-500 shadow-md ring-1 ring-neutral-200/90 hover:bg-neutral-50 hover:text-neutral-900"
        aria-label="Close demo"
      >
        <X size={17} strokeWidth={2} />
      </button>
      <div className="h-1 w-full overflow-hidden bg-neutral-100">
        <div
          className="h-full bg-flipdish transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex gap-3 p-3 pr-11 sm:p-4 sm:pr-12">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-flipdish text-white shadow-sm">
                <Play size={16} fill="currentColor" className="ml-0.5" />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-xs font-semibold uppercase tracking-wide text-neutral-900">
                  {activeScenario.name}
                </h3>
                <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                  Step {activeStepIndex + 1} of {activeScenario.steps.length}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-flipdish/15 bg-flipdish-muted/60 px-3 py-2">
            <div className="flex items-center gap-1.5 text-flipdish">
              <Info size={12} className="shrink-0" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">{currentStep.label}</span>
            </div>
            <p className="mt-0.5 line-clamp-4 text-xs leading-snug text-neutral-700">{currentStep.description}</p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col justify-center gap-2 border-l border-neutral-100 pl-3">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-900 text-white shadow-sm hover:bg-neutral-800"
              aria-label={isPlaying ? 'Pause automatic step advance' : 'Play – advance steps automatically'}
              title={isPlaying ? undefined : 'Auto-advance (timer)'}
            >
              {isPlaying ? (
                <Pause size={18} fill="currentColor" />
              ) : (
                <Play size={18} fill="currentColor" className="ml-0.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                resetScenario();
              }}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
              aria-label="Restart demo"
            >
              <RotateCcw size={16} />
            </button>
          </div>
          {activeStepIndex === activeScenario.steps.length - 1 ? (
            <button
              type="button"
              onClick={() => setActiveScenario(null)}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm hover:bg-emerald-500"
            >
              <CheckCircle2 size={14} />
              Finish
            </button>
          ) : (
            <button
              type="button"
              onClick={nextStep}
              className="flex items-center justify-center gap-1 rounded-xl bg-neutral-100 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-900 hover:bg-neutral-200"
            >
              Next
              <SkipForward size={14} fill="currentColor" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (usePreviewDock) {
    return createPortal(previewTourCard, document.body);
  }

  if (layout === 'customer') {
    const dockClass =
      'pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex justify-center px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1';

    return (
      <div className={dockClass} aria-live="polite">
        <div className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-2xl border border-neutral-200 bg-white/98 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] backdrop-blur-md">
          <button
            type="button"
            onClick={() => setActiveScenario(null)}
            className="absolute right-2 top-2 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-neutral-500 shadow-md ring-1 ring-neutral-200/90 hover:bg-neutral-50 hover:text-neutral-900"
            aria-label="Close demo"
          >
            <X size={17} strokeWidth={2} />
          </button>
          <div className="h-1 w-full overflow-hidden bg-neutral-100">
            <div
              className="h-full bg-flipdish transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex gap-3 p-3 pr-11 sm:p-4 sm:pr-12">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-start gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-flipdish text-white shadow-sm">
                    <Play size={16} fill="currentColor" className="ml-0.5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-xs font-semibold uppercase tracking-wide text-neutral-900">
                      {activeScenario.name}
                    </h3>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                      Step {activeStepIndex + 1} of {activeScenario.steps.length}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-flipdish/15 bg-flipdish-muted/60 px-3 py-2">
                <div className="flex items-center gap-1.5 text-flipdish">
                  <Info size={12} className="shrink-0" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider">
                    {currentStep.label}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-neutral-700">
                  {currentStep.description}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-col justify-center gap-2 border-l border-neutral-100 pl-3">
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-900 text-white shadow-sm hover:bg-neutral-800"
                  aria-label={isPlaying ? 'Pause automatic step advance' : 'Play – advance steps automatically'}
                  title={isPlaying ? undefined : 'Auto-advance (timer)'}
                >
                  {isPlaying ? (
                    <Pause size={18} fill="currentColor" />
                  ) : (
                    <Play size={18} fill="currentColor" className="ml-0.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    resetScenario();
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                  aria-label="Restart demo"
                >
                  <RotateCcw size={16} />
                </button>
              </div>
              {activeStepIndex === activeScenario.steps.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setActiveScenario(null)}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm hover:bg-emerald-500"
                >
                  <CheckCircle2 size={14} />
                  Finish
                </button>
              ) : (
                <button
                  type="button"
                  onClick={nextStep}
                  className="flex items-center justify-center gap-1 rounded-xl bg-neutral-100 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-900 hover:bg-neutral-200"
                >
                  Next
                  <SkipForward size={14} fill="currentColor" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex flex-col items-center justify-end p-6 md:p-12">
      {currentStep.targetId && (
        <div className="pointer-events-none absolute inset-0 animate-pulse bg-blue-500/10" />
      )}

      <div className="pointer-events-auto relative w-full max-w-lg overflow-hidden rounded-3xl border border-blue-100 bg-white/95 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-8 duration-500">
        <button
          type="button"
          onClick={() => setActiveScenario(null)}
          className="absolute right-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-slate-500 shadow-md ring-1 ring-slate-200/90 hover:bg-slate-50 hover:text-slate-900"
          aria-label="Close demo"
        >
          <X size={18} strokeWidth={2} />
        </button>
        <div className="h-1.5 w-full overflow-hidden bg-slate-100">
          <div
            className="h-full bg-blue-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="p-6 pr-14 pt-7">
          <div className="mb-4 flex items-start">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200">
                <Play size={20} fill="currentColor" />
              </div>
              <div>
                <h3 className="font-black uppercase leading-none tracking-tight text-slate-900">
                  {activeScenario.name}
                </h3>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Step {activeStepIndex + 1} of {activeScenario.steps.length}
                </p>
              </div>
            </div>
          </div>

          <div className="mb-6 rounded-2xl border border-blue-100/50 bg-blue-50/50 p-5">
            <div className="mb-1 flex items-center gap-2 font-bold text-blue-600">
              <Info size={14} />
              <span className="text-xs uppercase tracking-widest">{currentStep.label}</span>
            </div>
            <p className="font-medium leading-relaxed text-slate-700">{currentStep.description}</p>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-200 hover:bg-slate-800"
                aria-label={isPlaying ? 'Pause automatic step advance' : 'Play – advance steps automatically'}
                title={isPlaying ? undefined : 'Auto-advance (timer)'}
              >
                {isPlaying ? (
                  <Pause size={20} fill="currentColor" />
                ) : (
                  <Play size={20} fill="currentColor" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  resetScenario();
                }}
                className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 hover:bg-slate-50"
                aria-label="Restart demo"
              >
                <RotateCcw size={20} />
              </button>
            </div>

            <div className="flex items-center gap-3">
              {activeStepIndex === activeScenario.steps.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setActiveScenario(null)}
                  className="flex items-center gap-2 rounded-2xl bg-green-600 px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-green-200 hover:bg-green-500"
                >
                  <CheckCircle2 size={16} />
                  <span>Finish Demo</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={nextStep}
                  className="flex items-center gap-2 rounded-2xl bg-slate-100 px-6 py-3 text-xs font-black uppercase tracking-widest text-slate-900 hover:bg-slate-200"
                >
                  <span>Next Step</span>
                  <SkipForward size={16} fill="currentColor" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
