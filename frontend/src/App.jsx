import { useEffect, useRef } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import H2HExplorer from "./pages/H2HExplorer";
import ModelPerformance from "./pages/ModelPerformance";
import PlayerRatings from "./pages/PlayerRatings";
import Predictor from "./pages/Predictor";
import RankingsVsModel from "./pages/RankingsVsModel";
import { StarMark } from "./ui/icons";

const TABS = [
  { to: "/", label: "Predictor", end: true },
  { to: "/ratings", label: "Player Ratings" },
  { to: "/rankings-vs-model", label: "Rankings vs Model" },
  { to: "/h2h", label: "Head to Head" },
  { to: "/model-performance", label: "Model Performance" },
];

function tabClass({ isActive }) {
  return [
    "group relative flex h-full items-center whitespace-nowrap px-3 caps transition-colors",
    isActive ? "text-emerald" : "text-fog hover:text-star",
  ].join(" ");
}

export default function App() {
  const { pathname } = useLocation();
  const navRef = useRef(null);

  // On narrow screens the tab strip scrolls; keep the active tab in view.
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector('[aria-current="page"]');
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft = active.offsetLeft - nav.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-rule bg-night/85 backdrop-blur-sm sticky top-0 z-30">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 sm:px-6 lg:h-16 lg:flex-row lg:items-stretch lg:gap-8">
          <NavLink to="/" className="flex items-center gap-3 pt-3 lg:pt-0 shrink-0">
            <StarMark size={22} className="text-emerald" />
            <span className="display text-[26px] leading-none text-star">ATP Predictor</span>
            <span className="hidden caps text-fog xl:inline">Elo · gradient boosting · ATP tour since 1968</span>
          </NavLink>
          <nav
            ref={navRef}
            aria-label="Dashboard"
            className="-mx-3 flex h-11 items-stretch overflow-x-auto [scrollbar-width:none] [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-40px),transparent)] lg:ml-auto lg:h-auto lg:[mask-image:none]"
          >
            {TABS.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end} className={tabClass}>
                {({ isActive }) => (
                  <>
                    {t.label}
                    <span
                      aria-hidden="true"
                      className={`absolute inset-x-3 -bottom-px h-0.5 bg-emerald transition-opacity ${
                        isActive ? "opacity-100" : "opacity-0"
                      }`}
                    />
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
        <Routes>
          <Route path="/" element={<Predictor />} />
          <Route path="/ratings" element={<PlayerRatings />} />
          <Route path="/rankings-vs-model" element={<RankingsVsModel />} />
          <Route path="/h2h" element={<H2HExplorer />} />
          <Route path="/model-performance" element={<ModelPerformance />} />
        </Routes>
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-5 text-xs text-fog sm:flex-row sm:justify-between sm:px-6">
          <span>
            Match data from{" "}
            <a href="https://stats.tennismylife.org" className="text-mist underline decoration-rule hover:decoration-emerald">
              TennisMyLife
            </a>{" "}
            (MIT). ATP main tour only.
          </span>
          <span>Elo engine hand-rolled; classifier is XGBoost with a temporal train/test split.</span>
        </div>
      </footer>
    </div>
  );
}
