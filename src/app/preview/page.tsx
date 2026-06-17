'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useStore } from '@/hooks/useStore';
import { useEmbedMenuFromQuery } from '@/hooks/useEmbedMenuFromQuery';
import { MenuUpload } from '@/components/upload/MenuUpload';
import { CustomerPreview } from '@/components/customer/CustomerPreview';
import { StaffPreview } from '@/components/staff/StaffPreview';
import { ComparePreview } from '@/components/compare/ComparePreview';
import { AppHeader, type AppHeaderView } from '@/components/layout/AppHeader';
import { ToolNav } from '@/components/layout/ToolNav';
import { Monitor, Smartphone, ScanLine, Bug, Laptop } from 'lucide-react';
import { SignOffPrompt } from '@/components/review/SignOffPrompt';
import { useSessionLoader } from '@/hooks/useSessionLoader';
import { useCommentsSync } from '@/hooks/useComments';
import './App.css';
import './index.css';

type View = AppHeaderView;

function embedModeActive(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('embed') === '1';
}

export default function PreviewPage() {
  const embedLoad = useEmbedMenuFromQuery();
  const sessionLoad = useSessionLoader();
  useCommentsSync();
  const { menu, menuB, reviewProductScopes } = useStore();
  const [view, setView] = useState<View>('home');
  const embedded = embedModeActive();
  const [demoAutoplayFor, setDemoAutoplayFor] = useState<'customer' | 'staff' | null>(null);

  const showCustomerJourney = reviewProductScopes == null || reviewProductScopes.webApp;
  const showStaffJourney = reviewProductScopes == null || reviewProductScopes.pos;

  useEffect(() => {
    if (!embedded || !menu) return;
    if (view !== 'home') return;
    setView(showCustomerJourney ? 'customer' : 'staff');
  }, [embedded, menu, view, showCustomerJourney]);

  useEffect(() => {
    if (sessionLoad.kind !== 'ready' || view !== 'home') return;
    if (menu && !menuB) {
      setView(showCustomerJourney ? 'customer' : 'staff');
    } else {
      setView('compare');
    }
  }, [sessionLoad.kind, view, menu, menuB, showCustomerJourney]);

  const goHome = useCallback(() => {
    setDemoAutoplayFor(null);
    setView('home');
  }, []);

  const exitPreviewToHome = useCallback(() => {
    goHome();
  }, [goHome]);

  const navigate = useCallback((v: View) => {
    if (v !== 'customer' && v !== 'staff') {
      setDemoAutoplayFor(null);
    }
    setView(v);
  }, []);

  const handleHeaderNavigate = useCallback(
    (v: View) => {
      if (v === 'home' && (view === 'customer' || view === 'staff')) {
        exitPreviewToHome();
        return;
      }
      navigate(v);
    },
    [view, navigate, exitPreviewToHome],
  );

  const handleLogoClick = useCallback(() => {
    if (view === 'customer' || view === 'staff') {
      exitPreviewToHome();
      return;
    }
    goHome();
  }, [view, exitPreviewToHome, goHome]);

  const consumeDemoAutoplay = useCallback(() => {
    setDemoAutoplayFor(null);
  }, []);

  const isLoading = embedLoad.kind === 'loading' || sessionLoad.kind === 'loading';
  const isError = embedLoad.kind === 'error' || sessionLoad.kind === 'error';
  const errorMessage =
    embedLoad.kind === 'error'
      ? embedLoad.message
      : sessionLoad.kind === 'error'
        ? sessionLoad.message
        : '';

  if (isLoading) {
    return (
      <div className={`flex flex-col items-center justify-center bg-neutral-50 px-4 ${embedded ? 'h-full min-h-0' : 'min-h-screen'}`}>
        <p className="text-sm text-neutral-600">Loading menu journey…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={`flex flex-col items-center justify-center bg-neutral-50 px-4 ${embedded ? 'h-full min-h-0' : 'min-h-screen'}`}>
        <p className="max-w-md text-center text-sm text-red-700">{errorMessage}</p>
      </div>
    );
  }

  if (!menu) {
    if (view === 'compare') {
      return (
        <div className={`flex flex-col bg-neutral-50 ${embedded ? 'h-full min-h-0' : 'h-svh min-h-0 overflow-hidden'}`}>
          {!embedded ? <ToolNav currentTool="reviewer" /> : null}
          {!embedded ? (
            <AppHeader hasMenu view={view} onNavigate={handleHeaderNavigate} onLogoClick={handleLogoClick} />
          ) : null}
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ComparePreview />
          </main>
        </div>
      );
    }
    return (
      <div className={`flex flex-col bg-neutral-50 ${embedded ? 'h-full min-h-0' : 'min-h-screen'}`}>
        {!embedded ? <ToolNav currentTool="reviewer" /> : null}
        <AppHeader hasMenu={false} onLogoClick={goHome} />
        <main className={`flex flex-1 flex-col items-center px-4 py-12 sm:py-16 ${embedded ? 'min-h-0 overflow-y-auto' : ''}`}>
          <MenuUpload />
          <button
            type="button"
            onClick={() => setView('compare')}
            className="mt-6 text-sm font-semibold text-flipdish underline-offset-4 hover:underline"
          >
            Or compare two menus side-by-side →
          </button>
        </main>
      </div>
    );
  }

  const renderView = () => {
    switch (view) {
      case 'home':
        return (
          <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-8 md:p-10">
              <div className="mb-8 sm:mb-10">
                <h1 className="text-xl font-semibold tracking-tight text-neutral-900 sm:text-2xl md:text-3xl">{menu.name}</h1>
                {menu.description ? <p className="mt-2 text-sm text-neutral-500 sm:text-base">{menu.description}</p> : null}
                <div className="mt-5 flex gap-2.5 rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-xs leading-relaxed text-neutral-700 sm:text-sm">
                  <Laptop className="mt-0.5 h-4 w-4 shrink-0 text-flipdish sm:h-5 sm:w-5" aria-hidden />
                  <p>
                    <span className="font-semibold text-neutral-900">Best on a laptop or desktop</span> to review your Web/App and/or POS menu correctly.
                  </p>
                </div>
              </div>
              <div className={`grid grid-cols-1 gap-4 ${showCustomerJourney && showStaffJourney ? 'sm:grid-cols-2' : 'sm:max-w-md sm:mx-auto'}`}>
                {showCustomerJourney ? (
                  <button
                    type="button"
                    onClick={() => { setDemoAutoplayFor('customer'); setView('customer'); }}
                    className="group flex flex-col items-center gap-3 rounded-xl border border-neutral-200 bg-white p-5 text-left transition-colors hover:border-flipdish/30 hover:shadow-sm sm:p-6"
                  >
                    <div className="flex h-14 items-center justify-center gap-2.5 rounded-2xl bg-flipdish-muted px-4 text-flipdish transition-transform group-hover:scale-105" aria-hidden>
                      <Monitor size={24} strokeWidth={1.75} className="shrink-0" />
                      <span className="h-7 w-px shrink-0 bg-flipdish/35" />
                      <Smartphone size={22} strokeWidth={1.75} className="shrink-0" />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-neutral-900">Review your Web/App Menu Flow</p>
                      <p className="mt-1 text-xs text-neutral-500">See if your menu is set up correctly for your new website and mobile apps</p>
                    </div>
                  </button>
                ) : null}
                {showStaffJourney ? (
                  <button
                    type="button"
                    onClick={() => { setDemoAutoplayFor('staff'); setView('staff'); }}
                    className="group flex flex-col items-center gap-3 rounded-xl border border-neutral-200 bg-white p-5 text-left transition-colors hover:border-flipdish/30 hover:shadow-sm sm:p-6"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-neutral-100 to-neutral-200/80 text-neutral-800 shadow-inner ring-1 ring-neutral-200/90 transition-transform group-hover:scale-105" aria-hidden>
                      <ScanLine size={28} strokeWidth={1.5} />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-neutral-900">Review your POS Menu Flow</p>
                      <p className="mt-1 text-xs text-neutral-500">See how you or your staff will be using your Flipdish POS menu</p>
                    </div>
                  </button>
                ) : null}
              </div>
            </div>
            {menu.metadata.warnings.length > 0 && (
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/80 p-6">
                <div className="mb-3 flex items-center gap-2 font-semibold text-amber-900">
                  <Bug size={18} />
                  <h2 className="text-sm uppercase tracking-wide">Normalization notes</h2>
                </div>
                <ul className="space-y-2">
                  {menu.metadata.warnings.map((warning, i) => (
                    <li key={i} className="flex gap-2 text-sm text-amber-900/90">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      case 'customer':
        return <CustomerPreview embedded={embedded} onBack={exitPreviewToHome} autoStartDemo={demoAutoplayFor === 'customer'} onAutoStartDemoConsumed={consumeDemoAutoplay} hideBack={embedded} />;
      case 'staff':
        return <StaffPreview embedded={embedded} onBack={exitPreviewToHome} autoStartDemo={demoAutoplayFor === 'staff'} onAutoStartDemoConsumed={consumeDemoAutoplay} hideBack={embedded} />;
      case 'compare':
        return <ComparePreview />;
      default:
        return null;
    }
  };

  return (
    <div className={`flex flex-col bg-neutral-50 ${embedded ? 'min-h-full overflow-visible' : view === 'staff' || view === 'compare' ? 'h-svh min-h-0 overflow-hidden' : 'min-h-screen'}`}>
      {!embedded ? <ToolNav currentTool="reviewer" /> : null}
      {!embedded ? (
        <AppHeader hasMenu view={view} onNavigate={handleHeaderNavigate} onLogoClick={handleLogoClick} reviewProductScopes={reviewProductScopes} />
      ) : null}
      {embedded && menu && (view === 'customer' || view === 'staff') ? (
        <div className="mx-auto w-full max-w-6xl px-2 pt-2 sm:px-4">
          <SignOffPrompt />
        </div>
      ) : null}
      <main className={embedded ? 'flex flex-1 flex-col overflow-visible px-2 pb-4 sm:px-0' : view === 'staff' || view === 'compare' ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : view === 'customer' ? 'flex min-h-0 flex-1 flex-col items-stretch px-2 pb-3 pt-2 sm:px-4 md:items-center md:pb-4' : 'flex-1 px-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-0 sm:pb-8'}>
        {renderView()}
      </main>
    </div>
  );
}
