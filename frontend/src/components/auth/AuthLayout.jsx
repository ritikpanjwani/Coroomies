import { SparklesIcon, UsersIcon, HeartIcon, WalletIcon, ChatIcon } from "../Icons";

const FEATURES = [
  {
    icon: <HeartIcon className="h-5 w-5" />,
    title: "Smart roommate matching",
    description: "Compatibility scores based on your lifestyle preferences.",
  },
  {
    icon: <WalletIcon className="h-5 w-5" />,
    title: "Split expenses effortlessly",
    description: "Track personal spend and split shared costs in one place.",
  },
  {
    icon: <ChatIcon className="h-5 w-5" />,
    title: "Chat with your roommates",
    description: "Message potential matches and stay in touch daily.",
  },
];

function LogoMark({ className = "" }) {
  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-white shadow-glow ${className}`}
    >
      <UsersIcon className="h-5 w-5" />
    </div>
  );
}

export default function AuthLayout({ children, title, subtitle }) {
  return (
    <div className="relative flex min-h-screen w-full overflow-y-auto bg-slate-50 dark:bg-slate-900">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-24 h-72 w-72 rounded-full bg-brand-400/10 blur-3xl dark:bg-brand-500/10" />
        <div className="absolute -right-24 bottom-10 h-80 w-80 rounded-full bg-violet-400/10 blur-3xl dark:bg-violet-500/10" />
      </div>

      {/* Brand panel */}
      <div className="relative hidden w-[44%] overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-violet-500 lg:block">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-accent-400/20 blur-3xl" />
        <div className="absolute right-10 top-16 opacity-20">
          <SparklesIcon className="h-40 w-40" />
        </div>

        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/25 backdrop-blur">
              <UsersIcon className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">
              CoRoomies
            </span>
          </div>

          <div>
            <h1 className="max-w-md text-4xl font-bold leading-tight tracking-tight text-white">
              Find your perfect roommate match.
            </h1>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-brand-50/90">
              A smarter way to find compatible roommates, manage shared
              expenses, and keep everything in sync.
            </p>

            <div className="mt-10 space-y-5">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="flex items-start gap-4">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/25 backdrop-blur">
                    {feature.icon}
                  </div>
                  <div>
                    <p className="font-semibold text-white">{feature.title}</p>
                    <p className="text-sm text-brand-50/80">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-sm text-brand-50/70">
            © {new Date().getFullYear()} CoRoomies — made for roommates.
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div
        className="relative z-10 flex flex-1 items-center justify-center px-3.5 py-6 sm:px-6 sm:py-10"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))" }}
      >
        <div className="w-full max-w-md">
          <div className="mb-5 flex items-center gap-2.5 lg:hidden">
            <LogoMark />
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              CoRoomies
            </span>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card dark:border-slate-700/80 dark:bg-slate-800 sm:p-8">
            <div className="hidden lg:block">
              <LogoMark className="mb-6" />
            </div>

            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 sm:mt-1.5">{subtitle}</p>
            )}

            <div className="mt-6 animate-slide-up sm:mt-7">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}